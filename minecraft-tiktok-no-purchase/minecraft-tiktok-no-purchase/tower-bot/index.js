'use strict';
/*
 * TikTok Glass Tower Builder v3
 * Private Minecraft/Paper + Mineflayer + Prismarine Viewer + RCON.
 * 25x20 interior, 300 blocks high, real ascent and 15-level material bands.
 * RCON builds arena and backs up block placement; Mineflayer controls camera
 * and tries natural walking / native block placement whenever possible.
 * Unverified against a live Railway deployment; test before livestreaming.
 */
const mineflayer = require('mineflayer');
const {mineflayer: viewerPlugin} = require('prismarine-viewer');
const {Rcon} = require('rcon-client');
const {Vec3} = require('vec3');
const createItem = require('prismarine-item');
const {validateArena,routeAt,buildArenaCommands,glassWallCommands} = require('./route');

const env = process.env;
const n = (key,defaultValue)=>env[key]===undefined || env[key]==='' ? defaultValue : Number(env[key]);
const b = (key,defaultValue)=>env[key]===undefined ? defaultValue : /^(1|true|yes)$/i.test(env[key]);
const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
const rand=(low,high)=>low+Math.random()*(high-low);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const cfg={
  mcHost:env.MC_HOST||'minecraft.railway.internal',mcPort:n('MC_PORT',25565),
  botName:env.BOT_USERNAME||'TowerBot', botAuth:env.BOT_AUTH||'offline',
  rconHost:env.RCON_HOST||'minecraft.railway.internal',rconPort:n('RCON_PORT',25575),rconPassword:env.RCON_PASSWORD||'',
  x:Math.round(n('TOWER_X',0)),z:Math.round(n('TOWER_Z',0)),
  base:Math.round(n('TOWER_Y',0)),width:Math.round(n('TOWER_WIDTH',25)),
  depth:Math.round(n('TOWER_DEPTH',20)),height:Math.round(n('TOWER_HEIGHT',300)),
  bandHeight:Math.round(n('MATERIAL_BAND_HEIGHT',15)),
  stepMs:clamp(n('STEP_MS',350),120,3000),
  viewer:b('ENABLE_VIEWER',true),
  firstPerson:b('VIEWER_FIRST_PERSON',true),
  viewerPort:n('PORT',n('VIEWER_PORT',3000)),
  viewDistance:Math.round(clamp(n('VIEW_DISTANCE',10),3,14)),
  setupArena:b('ARENA_SETUP',true),
  resetArena:b('ARENA_RESET',false),
  autoResetAfterWin:b('RESET_AFTER_WIN',true),
  nativePlacement:b('NATURAL_PLACEMENT',true),
  useWalking:b('USE_WALKING',true),
  glanceEvery:Math.round(clamp(n('GLANCE_EVERY',13),0,500)),
  repairWindow:Math.round(clamp(n('REPAIR_LOOKBACK',80),5,250)),
  repairGlass:b('REPAIR_GLASS',true),
  overlayUrl:env.OVERLAY_URL||'',overlayToken:env.ADMIN_TOKEN||''
};
validateArena(cfg);
if (!cfg.rconPassword) throw new Error('Missing RCON_PASSWORD');
if (!/^[A-Za-z0-9_]{1,16}$/.test(cfg.botName)) throw new Error('Invalid BOT_USERNAME');
if (!Number.isInteger(cfg.bandHeight) || cfg.bandHeight<1 || cfg.bandHeight>100) throw new Error('Invalid MATERIAL_BAND_HEIGHT');
if (cfg.resetArena && env.ARENA_CLEAR_CONFIRM !== 'YES_CLEAR_25X20X300') {
  throw new Error('ARENA_RESET=true clears every block inside 25x20x300. Set ARENA_CLEAR_CONFIRM=YES_CLEAR_25X20X300 to authorize the destructive reset.');
}

let bot=null,rcon=null,activeLoop=false,connected=false,viewerStarted=false;
let stepIndex=0,lastMaterial='',lastOverlayBand=-1,inventoryItem='',lastTntReaction=0,blastDue=0;
let nativeCount=0,commandCount=0,walkCount=0,flyCount=0;
const progressTotal=cfg.width*cfg.height;
function isConnected(){return Boolean(bot && connected && bot.entity && bot._client?.state==='play');}
function topOf(p) {return new Vec3(p.x+.5,p.y+1.06,p.z+.5);}
function blockVec(p) {return new Vec3(p.x,p.y,p.z);}

async function rconCommand(cmd){
  for (let tries=0;tries<2;tries++){
    try{
      if(!rcon)rcon=await Rcon.connect({host:cfg.rconHost,port:cfg.rconPort,password:cfg.rconPassword,timeout:12000});
      const result=await rcon.send(cmd);
      // Minecraft commonly returns localized errors as plain text rather than throwing.
      if(/(unknown or incomplete command|too many blocks|outside of the world|cannot place blocks|expected whitespace|permission denied)/i.test(result||''))
        throw new Error(`Command ${cmd.slice(0,100)} failed: ${result}`);
      return result;
    }catch(e){
      try{rcon?.end();}catch(_){ } rcon=null;
      if(tries===1)throw e;
      await delay(450);
    }
  }
}
async function overlay(action, extra={}){
  if(!cfg.overlayUrl || !cfg.overlayToken)return;
  try{
    await fetch(cfg.overlayUrl.replace(/\/$/,'')+'/api/control',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+cfg.overlayToken},
      body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(3500)
    });
  }catch(e){console.warn('Overlay event failed:',e.message);}
}
async function arenaInit(reset){
  console.log(`Arena setup: interior=${cfg.width}x${cfg.depth}, height=${cfg.height}, base Y=${cfg.base}, clear=${reset}`);
  const setup = buildArenaCommands(cfg,reset);
  for(const [i,cmd] of setup.entries()) {
    await rconCommand(cmd);
    if ((i+1)%8===0) console.log('Arena commands:',i+1,'/',setup.length);
  }
  console.log('Glass tower walls, barrier reinforcement, floor and roof ready');
}
async function safeGameSetup(){
  for(const cmd of [
    'gamerule keepInventory true',
    'gamerule doDaylightCycle false',
    'gamerule doWeatherCycle false',
    'gamerule doTileDrops false',
    'time set day',
    'weather clear',
    `gamemode creative ${cfg.botName}`,
    `effect give ${cfg.botName} minecraft:resistance 999999 4 true`
  ]) {
    try { await rconCommand(cmd); } catch(e) { console.warn('Noncritical game command:',e.message); }
  }
}
async function camera(target) {
  if(!isConnected())return;
  try{await bot.lookAt(target,false);}catch(e){console.warn('Camera:',e.message);}
}
async function lookAround(){
  if(!isConnected())return;
  const pos=bot.entity.position.clone();
  const targets=[
    new Vec3(cfg.x+cfg.width/2,clamp(pos.y+rand(7,22),cfg.base+2,cfg.base+cfg.height),cfg.z+cfg.depth/2),
    new Vec3(clamp(pos.x+rand(-6,6),cfg.x+1,cfg.x+cfg.width-2),clamp(pos.y+rand(-4,4),cfg.base+1,cfg.base+cfg.height),clamp(pos.z+rand(-5,5),cfg.z+1,cfg.z+cfg.depth-2))
  ];
  await camera(targets[Math.random()<.7?0:1]);
  await delay(rand(220,480));
}
async function flyShortTo(destination){
  if(!isConnected())return;
  try {
    const original=bot.entity.position.clone();
    const delta=destination.minus(original);
    const dist=delta.norm();
    // API documents that each flying leg should be less than two blocks.
    const parts=Math.max(1,Math.ceil(dist/1.35));
    for(let i=1;i<=parts;i++){
      if(!isConnected())return;
      const p=original.plus(delta.scaled(i/parts));
      await bot.creative.flyTo(p);
    }
    flyCount++;
  }catch(e){
    console.warn('Walking/flying recovery via tp:',e.message);
    await rconCommand(`tp ${cfg.botName} ${destination.x.toFixed(2)} ${destination.y.toFixed(2)} ${destination.z.toFixed(2)}`);
    await delay(150);
  }
}
async function tryWalkTo(p){
  if(!cfg.useWalking||!isConnected())return false;
  const dest=topOf(p), now=bot.entity.position.clone();
  const horizontal=Math.hypot(now.x-dest.x,now.z-dest.z);
  if(horizontal<.1)return true;
  if(horizontal>1.65||Math.abs(now.y-dest.y)>.45)return false;
  try{
    bot.creative.stopFlying();
    await camera(new Vec3(dest.x,now.y+1.4,dest.z));
    const deadline=Date.now()+1450;
    bot.setControlState('forward',true);
    while(isConnected() && Date.now()<deadline){
      if(Math.hypot(bot.entity.position.x-dest.x,bot.entity.position.z-dest.z)<.30){
        walkCount++;return true;
      }
      await delay(45);
    }
    return false;
  }catch(e){console.warn('Walking:',e.message);return false;}
  finally {try{bot.clearControlStates();bot.creative.startFlying();}catch(_){}}
}
async function moveTo(p,previous){
  if(!isConnected())return;
  // Walk the full, level path; fly only for stair climbs or damaged route recovery.
  const walkable=previous && previous.y===p.y &&
    Math.abs(previous.x-p.x)+Math.abs(previous.z-p.z)===1 && Date.now()>blastDue;
  if(walkable && await tryWalkTo(p))return;
  const dest=topOf(p);
  await camera(new Vec3(dest.x, dest.y+1.5, dest.z));
  await flyShortTo(dest);
}
function nearbyBlock(p) {
  const v=bot?.blockAt(blockVec(p));
  return v || null;
}
function isAir(b){return b && ['air','cave_air','void_air'].includes(b.name);}
async function prepareMaterial(material){
  if(!isConnected() || !cfg.nativePlacement || inventoryItem===material)return;
  try{
    const itemName=material.split(':')[1];
    const db=require('minecraft-data')(bot.version);
    const data=db.itemsByName[itemName];
    if(!data)throw new Error(`No item data for ${itemName} on ${bot.version}`);
    const Item=createItem(bot.version);
    await bot.creative.setInventorySlot(36,new Item(data.id,64));
    bot.setQuickBarSlot(0);
    inventoryItem=material;
    console.log('Block switched to:',material);
  }catch(e){
    inventoryItem='';
    console.warn('Inventory placement unavailable; RCON placement remains functional:',e.message);
  }
}
async function placeStep(p){
  if(!isConnected())return;
  if(nearbyBlock(p) && !isAir(nearbyBlock(p)))return;
  await prepareMaterial(p.material);
  await camera(new Vec3(p.x+.5,p.y+.52,p.z+.5));
  await delay(rand(90,170));
  let placed=false;
  if(cfg.nativePlacement && inventoryItem===p.material){
    for(const offset of [new Vec3(0,-1,0),new Vec3(-1,0,0),new Vec3(1,0,0),new Vec3(0,0,-1),new Vec3(0,0,1)]){
      const ref=bot.blockAt(blockVec(p).plus(offset));
      if(!ref || isAir(ref))continue;
      try{
        await bot.placeBlock(ref,offset.scaled(-1));
        const resulting=nearbyBlock(p);
        placed=Boolean(resulting && !isAir(resulting));
        if(placed){nativeCount++;break;}
      }catch(_){ /* Unsupported viewpoint/support — reliable command fallback. */ }
    }
  }
  if(!placed){await rconCommand(`setblock ${p.x} ${p.y} ${p.z} ${p.material}`);commandCount++;}
  try{bot.swingArm('right');}catch(_){ }
}
async function checkForSetback(){
  if(!isConnected() || stepIndex===0)return;
  // Rewind only to OBSERVED destroyed blocks. A gift is never a fake forced loss.
  const start=Math.max(0,stepIndex-cfg.repairWindow);
  let firstDestroyed=-1,checked=0;
  for(let i=start;i<stepIndex;i++) {
    const p=routeAt(i,cfg),worldBlock=nearbyBlock(p);
    if(!worldBlock)continue; // Chunk not loaded: do not assume broken.
    checked++;
    if(isAir(worldBlock)) {firstDestroyed=i;break;}
  }
  if(firstDestroyed!==-1) {
    console.log('TNT broke the climb: rewind from step',stepIndex,'to',firstDestroyed,'(',Math.floor(firstDestroyed/cfg.width),'blocks high )');
    stepIndex=firstDestroyed;
  } else console.log('TNT settled; no broken blocks observed in',checked,'loaded recent steps');
}
async function repairGlassNearHeight(){
  if(!cfg.repairGlass)return;
  const current=Math.floor(stepIndex/cfg.width);
  const low=Math.max(cfg.base,cfg.base+current-6);
  const high=Math.min(cfg.base+cfg.height+1,cfg.base+current+7);
  for(const c of glassWallCommands(cfg,low,high)) await rconCommand(c);
}
async function reactToExplosion(){
  if(!blastDue || Date.now()<blastDue)return false;
  blastDue=0;
  console.log('Explosion aftermath: inspecting route and glass walls');
  await camera(new Vec3(cfg.x+cfg.width/2,Math.min(cfg.base+cfg.height,bot.entity.position.y+12),cfg.z+cfg.depth/2));
  await delay(450);
  await checkForSetback();
  await repairGlassNearHeight();
  return true;
}
async function setup(){
  await safeGameSetup();
  if(cfg.setupArena)await arenaInit(cfg.resetArena);
  const start=routeAt(0,cfg);
  await rconCommand(`tp ${cfg.botName} ${start.x+.5} ${start.y+2.4} ${start.z+.5} 0 72`);
  await delay(550);
  bot.creative.startFlying();
  lastMaterial='';inventoryItem='';stepIndex=0;lastOverlayBand=-1;
  if(!cfg.resetArena)console.log('ARENA_RESET=false: pre-existing construction remains inside the arena. Use ARENA_RESET=true with confirmation to clear it.');
  await overlay('level',{level:1});
}
async function progressLoop(){
  while(isConnected()){
    try{
      if(blastDue){
        if(Date.now()<blastDue){await delay(150);continue;}
        await reactToExplosion();
      }
      if(stepIndex>=progressTotal){
        console.log('WIN! Reached the top of 300-block glass tower');
        await overlay('win');
        await lookAround();
        await delay(3200);
        if(!cfg.autoResetAfterWin){console.log('RESET_AFTER_WIN=false; holding at goal');return;}
        // Do not rebuild the walls on each win, just clear interior 25x20x300.
        const resetCommands=buildArenaCommands(cfg,true).filter(c=>c.includes('minecraft:air'));
        for(const c of resetCommands)await rconCommand(c);
        stepIndex=0;inventoryItem='';lastOverlayBand=-1;
        const start=routeAt(0,cfg);
        // Once the run is complete, return instantly rather than flying down 300 blocks.
        await rconCommand(`tp ${cfg.botName} ${start.x+.5} ${start.y+2.4} ${start.z+.5} 0 72`);
        await overlay('level',{level:1});
        continue;
      }
      const p=routeAt(stepIndex,cfg),previous=stepIndex?routeAt(stepIndex-1,cfg):null;
      const band=Math.floor(p.h/cfg.bandHeight);
      if(band!==lastOverlayBand){
        console.log(`Elevation ${p.h}/${cfg.height} blocks — stage ${band+1}, material ${p.material}`);
        lastOverlayBand=band;
        await overlay('level',{level:band+1});
      }
      await placeStep(p);
      await moveTo(p,previous);
      stepIndex++;
      if(cfg.glanceEvery>0 && stepIndex%cfg.glanceEvery===0 && Math.random()<.65) await lookAround();
      if(stepIndex%100===0)console.log(`Progress ${Math.floor(stepIndex/cfg.width)}/${cfg.height} blocks high, placed=${nativeCount} native/${commandCount} RCON, walked=${walkCount}, flew=${flyCount}`);
      await delay(cfg.stepMs+rand(-45,90));
    }catch(e){
      console.error('Build step error:',e.stack||e.message);
      await delay(1800);
    }
  }
}
async function run(){
  if(activeLoop)return;
  activeLoop=true;
  try{await setup();await progressLoop();}
  catch(e){console.error('Setup failed:',e.stack||e.message);}
  finally{activeLoop=false;}
}
function connect(){
  connected=false;
  const opts={host:cfg.mcHost,port:cfg.mcPort,username:cfg.botName,auth:cfg.botAuth,hideErrors:false};
  if(cfg.botAuth==='microsoft')opts.profilesFolder=env.MC_PROFILE_FOLDER||'/data/minecraft-auth';
  bot=mineflayer.createBot(opts);
  bot.on('spawn',()=>{
    connected=true;
    console.log('Minecraft bot spawned (Glass Tower v3)');
    if(cfg.viewer && !viewerStarted){
      try{
        viewerPlugin(bot,{port:cfg.viewerPort,firstPerson:cfg.firstPerson,viewDistance:cfg.viewDistance});
        viewerStarted=true;
        console.log(`Browser Minecraft viewer listening on port ${cfg.viewerPort}`);
      }catch(e){console.error('Viewer:',e.message);}
    }
    void run();
  });
  bot.on('entitySpawn',entity=>{
    const name=String(entity?.name||entity?.displayName||'').toLowerCase();
    if(!name.includes('tnt')&&!name.includes('primed'))return;
    const now=Date.now();
    if(now-lastTntReaction>2200){
      console.log('TNT spotted! Pausing building for blast');
      lastTntReaction=now;
      void lookAround();
    }
    blastDue=Math.max(blastDue,now+4800);
  });
  bot.on('kicked',reason=>console.error('Minecraft kicked the bot:',reason));
  bot.on('error',e=>console.error('Minecraft connection:',e.message));
  bot.on('end',()=>{
    console.warn('Minecraft connection ended; retry in 10 seconds');
    connected=false;activeLoop=false;
    try{bot.viewer?.close();}catch(_){ }
    viewerStarted=false;
    try{rcon?.end();}catch(_){ } rcon=null;
    setTimeout(connect,10000);
  });
}
console.log(`Glass Tower v3: inside ${cfg.width}x${cfg.depth}, height ${cfg.height}, Y=${cfg.base}, 15-block material bands, viewer=${cfg.viewer}`);
console.log('No external Minecraft game client required. Never expose the offline-mode server or RCON publicly.');
connect();
