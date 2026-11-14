'use strict';
/*
 * TikTok Build-Up Bot v2: natural, moving first-person construction.
 * Uses Mineflayer's native lookAt, creative.flyTo and placeBlock APIs.
 * Falls back to RCON for impossible placements or broken blocks.
 * Runs on a private offline-mode Paper server. Do not expose the game port.
 */
const mineflayer = require('mineflayer');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const { Rcon } = require('rcon-client');
const { Vec3 } = require('vec3');
const makeItem = require('prismarine-item');

const env = process.env;
const numeric = (key, defaultValue) => Number.isFinite(Number(env[key])) && env[key] !== undefined && env[key] !== '' ? Number(env[key]) : defaultValue;
const yes = (key, defaultValue) => env[key] === undefined ? defaultValue : /^(1|true|yes)$/i.test(env[key]);
const between = (x, a, b) => Math.max(a, Math.min(b, x));
const random = (a, b) => a + Math.random() * (b - a);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const cfg = {
  host: env.MC_HOST || 'minecraft.railway.internal', port: numeric('MC_PORT', 25565),
  username: env.BOT_USERNAME || 'TowerBot', auth: env.BOT_AUTH || 'offline',
  rconHost: env.RCON_HOST || 'minecraft.railway.internal', rconPort: numeric('RCON_PORT', 25575),
  rconPassword: env.RCON_PASSWORD || '',
  x: Math.round(numeric('TOWER_X', 0)), z: Math.round(numeric('TOWER_Z', 0)),
  base: Math.round(between(numeric('TOWER_Y', 100), -48, 260)),
  width: Math.round(between(numeric('TOWER_WIDTH', 13), 5, 18)),
  height: Math.round(between(numeric('TOWER_HEIGHT', 15), 2, 40)),
  stepMs: between(numeric('STEP_MS', 850), 250, 3500),
  block: env.BUILD_BLOCK || 'minecraft:diamond_block',
  viewer: yes('ENABLE_VIEWER', true),
  firstPerson: yes('VIEWER_FIRST_PERSON', true),
  viewerPort: numeric('PORT', numeric('VIEWER_PORT', 3000)),
  viewDistance: Math.round(between(numeric('VIEW_DISTANCE', 8), 3, 12)),
  naturalPlace: yes('NATURAL_PLACEMENT', true),
  useWalking: yes('USE_WALKING', true),
  clearOnStart: yes('CLEAR_ON_START', true),
  surveyEvery: Math.round(between(numeric('SURVEY_EVERY', 21), 0, 500)),
  repairEvery: Math.round(between(numeric('REPAIR_EVERY', 12), 0, 500)),
  overlay: env.OVERLAY_URL || '', token: env.ADMIN_TOKEN || ''
};
if (!cfg.rconPassword) throw new Error('Missing RCON_PASSWORD');
if (!/^[A-Za-z0-9_]{1,16}$/.test(cfg.username)) throw new Error('Invalid BOT_USERNAME');
if (!/^minecraft:[a-z0-9_]+$/.test(cfg.block)) throw new Error('BUILD_BLOCK must be minecraft:block_name');
const player = cfg.username;
let bot, rcon, running = false, viewerActive = false, placingPrepared = false;
let index = 0, level = 1, recent = [], repairQueue = [], lastBlastAt = 0, reactionPending = false;
let nativePlacements = 0, fallbackPlacements = 0, moveFallbacks = 0;
let cancelled = false;

async function command(cmd) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!rcon) rcon = await Rcon.connect({host:cfg.rconHost,port:cfg.rconPort,password:cfg.rconPassword,timeout:8000});
      return await rcon.send(cmd);
    } catch (e) {
      console.warn('RCON error:', e.message);
      try { rcon?.end(); } catch (_) {}
      rcon = null;
      if (attempt === 1) throw e;
      await wait(700);
    }
  }
}
async function overlay(action, extra = {}) {
  if (!cfg.overlay || !cfg.token) return;
  try {
    await fetch(cfg.overlay.replace(/\/$/, '')+'/api/control', {
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.token},
      body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(4000)
    });
  } catch (e) { console.warn('Overlay:',e.message); }
}
function position(i) {
  const per = cfg.width*cfg.width;
  const floor = Math.floor(i/per);
  // Reverse the previous floor's route on alternating layers, making every
  // transition vertical and adjacent for both odd and even stage widths.
  const n = floor % 2 === 0 ? i % per : (per-1 - i % per);
  const row = Math.floor(n/cfg.width), col = n % cfg.width;
  const dx = row % 2 === 1 ? cfg.width-1-col : col;
  return {x:cfg.x+dx, y:cfg.base+floor, z:cfg.z+row, floor};
}
function center(p, height = 1.12) { return new Vec3(p.x+.5,p.y+height,p.z+.5); }
function targetBlock(p) { return new Vec3(p.x,p.y,p.z); }
function active() { return Boolean(bot && !cancelled && bot._client?.state === 'play'); }
function aliveBlock(p) {
  const block = bot?.blockAt(targetBlock(p));
  return block && block.name !== 'air' && block.name !== 'cave_air' && block.name !== 'void_air';
}
async function smoothLook(where) {
  if (!active()) return;
  try { await bot.lookAt(where, false); } catch(e) { console.warn('Look:',e.message); }
}
async function wanderLook(p) {
  const dx = random(-5,5), dz = random(-5,5);
  await smoothLook(new Vec3(p.x+dx,p.y+random(.9,5),p.z+dz));
  await wait(random(200,520));
}
async function flyTo(pos) {
  if (!active()) return;
  // Mineflayer's flyTo sends incremental position updates, unlike /tp.
  try { await bot.creative.flyTo(pos); }
  catch (e) {
    moveFallbacks++;
    console.warn('Movement fallback',moveFallbacks,e.message);
    await command(`tp ${player} ${pos.x} ${pos.y} ${pos.z}`);
    await wait(350);
  }
}
async function moveToTile(p, previous) {
  const destination = center(p, 1.03);
  const current = bot?.entity?.position;
  const adjacent = previous && previous.y===p.y &&
    Math.abs(previous.x-p.x)+Math.abs(previous.z-p.z)===1;
  // Grounded, simulated key presses for the main build path. Falls back to
  // Mineflayer's smooth flight if TNT broke the walkway or physics deviates.
  if (cfg.useWalking && adjacent && current &&
      current.distanceTo(destination) < 1.8 && Date.now()-lastBlastAt > 5000) {
    let walked=false;
    try {
      await smoothLook(new Vec3(destination.x, current.y+1.4,destination.z));
      bot.creative.stopFlying();
      bot.setControlState('forward', true);
      if (Math.random() < .14) bot.setControlState('sprint',true);
      const deadline=Date.now()+1500;
      while(active() && Date.now()<deadline) {
        const dx=bot.entity.position.x-destination.x, dz=bot.entity.position.z-destination.z;
        if (Math.hypot(dx,dz)<.27) {walked=true;break;}
        await wait(45);
      }
    } catch(e) { console.warn('Walk fallback:',e.message); }
    finally {
      bot.clearControlStates();
      bot.creative.startFlying();
    }
    const deviation=bot.entity.position.distanceTo(destination);
    if (!walked || deviation>.44) await flyTo(destination);
  } else {
    await flyTo(destination);
  }
}
async function prepareInventory() {
  if (!cfg.naturalPlace || placingPrepared || !active()) return;
  try {
    const Item = makeItem(bot.version);
    const registry = require('minecraft-data')(bot.version);
    const itemName = cfg.block.split(':')[1];
    const type = registry.itemsByName[itemName];
    if (!type) throw new Error('Unknown item '+itemName+' in '+bot.version);
    await bot.creative.setInventorySlot(36, new Item(type.id, 64));
    bot.setQuickBarSlot(0);
    placingPrepared = true;
    console.log('Natural placement item loaded:',itemName);
  } catch(e) {
    console.warn('Natural placement unavailable; continuing with RCON:',e.message);
    placingPrepared = false;
  }
}
function neighbors(p) {
  return [
    {o:new Vec3(-1,0,0),f:new Vec3(1,0,0)},
    {o:new Vec3(1,0,0),f:new Vec3(-1,0,0)},
    {o:new Vec3(0,0,-1),f:new Vec3(0,0,1)},
    {o:new Vec3(0,0,1),f:new Vec3(0,0,-1)},
    {o:new Vec3(0,-1,0),f:new Vec3(0,1,0)}
  ];
}
async function putBlock(p, repair = false) {
  if (!active()) return;
  if (aliveBlock(p)) return;
  await smoothLook(new Vec3(p.x+.5, p.y+.55, p.z+.5));
  let native = false;
  if (cfg.naturalPlace && placingPrepared) {
    try {
      for (const {o,f} of neighbors(p)) {
        const reference = bot.blockAt(targetBlock(p).plus(o));
        if (!reference || reference.name === 'air' || reference.name === 'cave_air') continue;
        // Place against a real neighboring block. If TNT destroyed the reference,
        // skip to another neighbor or fall back to RCON below.
        await bot.placeBlock(reference,f);
        native = true;
        nativePlacements++;
        break;
      }
    } catch (e) {
      if (fallbackPlacements % 25 === 0) console.warn('Native placement failed:',e.message);
    }
  }
  if (!native) {
    await command(`setblock ${p.x} ${p.y} ${p.z} ${cfg.block}`);
    fallbackPlacements++;
  }
  try { bot.swingArm('right'); } catch (_) {}
  if (!repair && (nativePlacements+fallbackPlacements)%50===0) {
    console.log('Built blocks:',nativePlacements+fallbackPlacements,'native',nativePlacements,'fallback',fallbackPlacements);
  }
}
async function repairDamaged() {
  if (!active()) return;
  // Look through recently finished blocks, including nearby lower layers.
  const toCheck = [...recent].reverse().slice(0,Math.min(150,recent.length));
  for (const p of toCheck) {
    if (!aliveBlock(p) && !repairQueue.some(q=>q.x===p.x&&q.y===p.y&&q.z===p.z)) repairQueue.push(p);
    if (repairQueue.length>=12) break;
  }
  if (!repairQueue.length) return;
  console.log('Repairing damaged blocks:',repairQueue.length);
  const toFix=repairQueue.splice(0,Math.min(5,repairQueue.length));
  for (const p of toFix) {
    if (!active()) return;
    await flyTo(center(p,1.7));
    await putBlock(p,true);
    await wait(random(220,380));
  }
}
async function lookAround() {
  if (!active()) return;
  const here = bot.entity.position.clone();
  const mid = new Vec3(cfg.x+cfg.width/2,Math.max(cfg.base,Math.floor(here.y))+2,cfg.z+cfg.width/2);
  // Pull back for a genuine camera flyby, then return to the worksite.
  console.log('Surveying the tower');
  await smoothLook(mid);
  const orbit = new Vec3(
    between(mid.x+random(-5,5),cfg.x-7,cfg.x+cfg.width+7),
    here.y+random(2,4),
    between(mid.z+random(-5,5),cfg.z-7,cfg.z+cfg.width+7)
  );
  await flyTo(orbit);
  await smoothLook(mid);
  await wait(random(550,1100));
  await flyTo(here);
}
async function reactToTnt() {
  if (!reactionPending || !active()) return;
  reactionPending = false;
  console.log('TNT detected: reacting');
  const here = bot.entity.position.clone();
  await wanderLook({x:here.x,y:here.y,z:here.z});
  await wait(random(650,1100));
  // Short backwards flight creates a real on-camera flinch.
  const retreat = here.plus(new Vec3(random(-1.5,1.5),1.1,random(-1.5,1.5)));
  await flyTo(retreat);
  await wait(550);
  await repairDamaged();
}
async function setup() {
  const outer=cfg.width+6;
  // Large floating stage, rather than a cramped 7x7 cage.
  await command(`fill ${cfg.x-6} ${cfg.base-2} ${cfg.z-6} ${cfg.x+outer} ${cfg.base-2} ${cfg.z+outer} minecraft:obsidian`);
  await command('gamerule keepInventory true');
  await command('gamerule doImmediateRespawn true');
  await command('time set day');
  await command('weather clear');
  await command(`gamemode creative ${player}`);
  await command(`effect give ${player} minecraft:resistance 999999 4 true`);
  if (cfg.clearOnStart) {
    // Destructively clear only this project's build rectangle (not the entire world).
    await command(`fill ${cfg.x} ${cfg.base} ${cfg.z} ${cfg.x+cfg.width-1} ${cfg.base+cfg.height-1} ${cfg.z+cfg.width-1} minecraft:air`);
    console.log('Cleared build area for fresh run');
  }
  const first=position(0);
  await command(`setblock ${first.x} ${first.y} ${first.z} ${cfg.block}`);
  await command(`tp ${player} ${first.x+.5} ${first.y+1.12} ${first.z+.5} 0 62`);
  await wait(800);
  bot.creative.startFlying();
  await prepareInventory();
  await overlay('level',{level});
}
async function nextStep() {
  const max=cfg.width*cfg.width*cfg.height;
  if (index>=max) {
    console.log('Tower completed: level',++level);
    await overlay('win');
    await lookAround();
    await command(`fill ${cfg.x} ${cfg.base} ${cfg.z} ${cfg.x+cfg.width-1} ${cfg.base+cfg.height-1} ${cfg.z+cfg.width-1} minecraft:air`);
    index=0;recent=[];repairQueue=[];
    const first=position(0);
    await command(`setblock ${first.x} ${first.y} ${first.z} ${cfg.block}`);
    await flyTo(center(first));
    await wait(700);
    return;
  }
  const p=position(index);
  // Ensure a new level begins with a stable foothold.
  if (index% (cfg.width*cfg.width)===0 && index>0) {
    await lookAround();
    // Rise first: placing the block while inside its volume would be rejected.
    await flyTo(center(p,1.35));
    console.log('Ascending to construction floor',p.floor+1);
  }
  if (reactionPending) await reactToTnt();
  if (cfg.repairEvery > 0 && index > 0 && index%cfg.repairEvery===0) await repairDamaged();
  // On every tile: orient head -> place -> visibly move to the new position.
  await putBlock(p);
  await moveToTile(p,index>0?position(index-1):null);
  recent.push(p);
  if(recent.length>cfg.width*cfg.width*3) recent.shift();
  if(index%7===0 && index>0 && Math.random()<.7) await wanderLook(p);
  if(cfg.surveyEvery>0 && index>0 && index%cfg.surveyEvery===0) await lookAround();
  index++;
}
async function loop() {
  if(running) return;
  running=true;
  try {
    await setup();
    while(active()) {
      try { await nextStep(); } catch(e) { console.error('Step failed:',e.stack||e.message); await wait(1800); }
      await wait(cfg.stepMs+random(-100,150));
    }
  } catch(e) { console.error('Setup failed:',e.stack||e.message); }
  finally { running=false; }
}
function connect() {
  cancelled=false;
  placingPrepared=false;
  const opts={host:cfg.host,port:cfg.port,username:cfg.username,auth:cfg.auth,hideErrors:false};
  if(cfg.auth==='microsoft') opts.profilesFolder=env.MC_PROFILE_FOLDER||'/data/minecraft-auth';
  bot=mineflayer.createBot(opts);
  bot.on('spawn',()=>{
    console.log('Minecraft bot spawned (natural builder v2)');
    if(cfg.viewer&&!viewerActive) {
      try {
        mineflayerViewer(bot,{port:cfg.viewerPort,firstPerson:cfg.firstPerson,viewDistance:cfg.viewDistance});
        viewerActive=true;
        console.log(`Browser Minecraft viewer listening on port ${cfg.viewerPort}`);
      } catch(e) { console.error('Viewer:',e.message); }
    }
    if(!running) void loop();
  });
  bot.on('entitySpawn', entity=>{
    const kind=String(entity?.name||entity?.displayName||'').toLowerCase();
    if((kind.includes('tnt')||kind.includes('primed')) && Date.now()-lastBlastAt>6500) {
      lastBlastAt=Date.now(); reactionPending=true;
    }
  });
  bot.on('kicked',reason=>console.error('Kicked:',reason));
  bot.on('error',e=>console.error('Minecraft error:',e.message));
  bot.on('end',()=>{
    cancelled=true;running=false;
    console.warn('Disconnected; retrying in 10s');
    if(viewerActive) { try { bot.viewer?.close(); } catch (_) {} viewerActive=false; }
    setTimeout(connect,10000);
  });
}
console.log(`Starting natural builder v2: ${cfg.width}x${cfg.width}x${cfg.height}, viewer=${cfg.viewer}`);
connect();
