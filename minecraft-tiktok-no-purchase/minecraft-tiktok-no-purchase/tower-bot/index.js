'use strict';
/*
 * TikTok Build-up v6 – video-inspired broad landings with natural navigation.
 * Player locomotion and EVERY ROUTE BLOCK use actual Mineflayer controls.
 * RCON is only for world/arena management, initial spawn and emergency rescue.
 * Needs a dedicated, backed-up Minecraft Java/Paper 1.21.4 world.
 */
const mineflayer = require('mineflayer');
const {mineflayer: startViewer} = require('prismarine-viewer');
const {Rcon} = require('rcon-client');
const {Vec3} = require('vec3');
const {makePlan,validateArena,buildArenaCommands,glassWallCommands} = require('./route');
const {Navigation}=require('./navigation');
const {decide,STATES}=require('./brain');
const {
  isEmptyBlock,isLiquid,standingPosition,firstAnchor,transitionSupport,
  candidateSupports,durationToWalk,isFeetInsideSolid
} = require('./grounded');

const e=process.env;
const number=(key,def)=>e[key]===undefined||e[key]===''?def:Number(e[key]);
const flag=(key,def)=>e[key]===undefined?def:/^(true|yes|1)$/i.test(e[key]);
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const cfg={
  mcHost:e.MC_HOST||'minecraft.railway.internal',mcPort:number('MC_PORT',25565),
  botName:e.BOT_USERNAME||'TowerBot',botAuth:e.BOT_AUTH||'offline',
  rconHost:e.RCON_HOST||'minecraft.railway.internal',rconPort:number('RCON_PORT',25575),rconPassword:e.RCON_PASSWORD||'',
  x:number('TOWER_X',0),z:number('TOWER_Z',0),base:number('TOWER_Y',0),
  width:number('TOWER_WIDTH',25),depth:number('TOWER_DEPTH',20),height:number('TOWER_HEIGHT',300),
  bandHeight:number('MATERIAL_BAND_HEIGHT',15),
  stepMs:clamp(number('STEP_MS',420),160,3500),
  viewer:flag('ENABLE_VIEWER',true),firstPerson:flag('VIEWER_FIRST_PERSON',true),
  viewerPort:number('PORT',number('VIEWER_PORT',3000)),viewDistance:clamp(number('VIEW_DISTANCE',10),3,14),
  setupArena:flag('ARENA_SETUP',true),resetArena:flag('ARENA_RESET',false),
  winRestart:flag('RESET_AFTER_WIN',false),
  allowRescue:flag('ALLOW_EMERGENCY_TP',false),
  disableMobs:flag('DISABLE_MOBS',true),
  maxMoveFailures:Math.max(1,number('MAX_MOVE_FAILURES',3)),
  glanceEvery:Math.round(clamp(number('GLANCE_EVERY',24),0,500)),
  repairWindow:Math.round(clamp(number('REPAIR_LOOKBACK',100),10,300)),
  overlayUrl:e.OVERLAY_URL||'',overlayToken:e.ADMIN_TOKEN||''
};
validateArena(cfg);
const plan=makePlan(cfg);
const routeAt=(i)=>{if(i<0||i>=plan.length)throw new RangeError(`Invalid route index ${i}`);return plan[i]};
if(!cfg.rconPassword)throw new Error('Missing RCON_PASSWORD');
if(!/^[A-Za-z0-9_]{1,16}$/.test(cfg.botName))throw new Error('Invalid BOT_USERNAME');
if(!Number.isInteger(cfg.bandHeight)||cfg.bandHeight<1)throw new Error('Invalid MATERIAL_BAND_HEIGHT');
if(cfg.resetArena && e.ARENA_CLEAR_CONFIRM!=='YES_CLEAR_25X20X300')throw new Error('Destructive arena reset requires ARENA_CLEAR_CONFIRM=YES_CLEAR_25X20X300');

let bot=null,nav=null,connection=false,viewerStarted=false,workerRunning=false,rcon=null;
let step=0,loadedMaterial='',lastFillAt=-1,blastUntil=0,blastSeenAt=0,recoveryCount=0,placed=0,walked=0;
const maxSteps=plan.length;
let navFailures=0;let consecutiveFailedSteps=0;let lastFailedStep=-1;
const emit=(event,data={})=>{if(flag('TOWER_TELEMETRY',true))console.log(JSON.stringify({type:'tower_telemetry',event,time:new Date().toISOString(),step,level:step<maxSteps?plan[step].h:cfg.height,...data}));};
function active(){return !!(bot && connection && bot.entity && bot._client?.state==='play');}
function asVec(v){return new Vec3(v.x,v.y,v.z);}
function block(p){return bot.blockAt(asVec(p));}
function actualName(material){return material.split(':').at(-1);}
function isExpected(p){const v=block(p);return !!v && v.name===actualName(p.material);}
function pos(){return bot.entity.position;}
function distanceXZ(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
function standAt(p){return standingPosition(p);}
function say(s){console.log(`[Grounded v4] ${s}`);}
async function command(s){
  for(let attempt=0;attempt<2;attempt++){
    try{
      if(!rcon)rcon=await Rcon.connect({host:cfg.rconHost,port:cfg.rconPort,password:cfg.rconPassword,timeout:14000});
      const result=await rcon.send(s);
      if(/(unknown or incomplete command|too many blocks|outside of the world|permission denied)/i.test(result||''))throw new Error(result);
      return result;
    }catch(ex){
      try{rcon?.end();}catch(_){ }
      rcon=null;
      if(attempt===1)throw ex;
      await pause(350);
    }
  }
}
async function overlay(action,meta={}){
  if(!cfg.overlayUrl||!cfg.overlayToken)return;
  try{
    await fetch(cfg.overlayUrl.replace(/\/$/,'')+'/api/control',{
      method:'POST',headers:{Authorization:`Bearer ${cfg.overlayToken}`,'Content-Type':'application/json'},
      body:JSON.stringify({action,...meta}),signal:AbortSignal.timeout(2500)
    });
  }catch(ex){console.warn('Overlay:',ex.message);}
}
async function gameSetup(){
  const commands=[
    'gamerule keepInventory true','gamerule doDaylightCycle false',
    'gamerule doWeatherCycle false','gamerule doTileDrops false',
    'time set day','weather clear',`gamemode survival ${cfg.botName}`,
    'gamerule fallDamage false',
    `effect give ${cfg.botName} minecraft:resistance 999999 4 true`
  ];
  if(cfg.disableMobs){
    commands.unshift('gamerule doMobSpawning false','difficulty peaceful');
  }
  for(const c of commands){try{await command(c);}catch(ex){console.warn('Optional game setting:',c,ex.message);}}
  if(cfg.disableMobs) {
    // Peaceful removes hostile mobs; remove existing passive mobs without deleting
    // primed TNT, armor stands, item frames, blocks or player entities.
    const passive=['cow','sheep','pig','chicken','horse','donkey','mule','llama','rabbit','fox','wolf','cat','villager','wandering_trader','bat','squid','glow_squid','salmon','cod','tropical_fish','pufferfish','dolphin','turtle','frog','goat','bee','axolotl'];
    for(const type of passive)try{await command('kill @e[type=minecraft:'+type+']');}catch(ex){console.warn('Cleanup '+type+': '+ex.message);}  
  }
}
async function setupArena(reset){
  const cmds=buildArenaCommands(cfg,reset);
  say(`Building SEALED arena walls and floor FIRST. reset=${reset}, ${cmds.length} commands`);
  for(let i=0;i<cmds.length;i++){
    await command(cmds[i]);
    if((i+1)%10===0)say(`Arena ${i+1}/${cmds.length}`);
  }
  say('Arena sealed; interior cleared/drained if reset was enabled');
}
async function resetCamera(){
  if(!active())return;
  const p=pos();
  await bot.lookAt(new Vec3(p.x+2,p.y+1.6,p.z+2),false);
}
async function glance(){
  if(!active())return;
  const p=pos();
  const points=[
    new Vec3(cfg.x+cfg.width/2,Math.min(cfg.base+cfg.height,p.y+6),cfg.z+cfg.depth/2),
    new Vec3(p.x+(Math.random()-.5)*5,p.y+1.3,p.z+(Math.random()-.5)*5),
    new Vec3(p.x+.5,p.y+1.7,p.z+5)
  ];
  nav?.stop();
  await (nav?nav.lookAt(points[Math.floor(Math.random()*points.length)]):bot.lookAt(points[0],false));
  await pause(240+Math.random()*250);
}
async function setItem(material){
  // Real survival physics prevent a held jump from turning into Creative flight.
  // Inventory items are supplied by the server, but every placed block uses bot.placeBlock.
  const itemName=actualName(material);
  const data=require('minecraft-data')(bot.version);
  const definition=data.itemsByName[itemName];
  if(!definition)throw new Error(`Material ${material} is not an item in ${bot.version}`);
  if(loadedMaterial===material && bot.heldItem?.name===itemName && bot.heldItem.count>5)return;
  if(loadedMaterial!==material){
    await command(`clear ${cfg.botName}`); // New 15-level material band: remove old stacks.
    await pause(120);
  }
  let item=bot.inventory.items().find(i=>i.name===itemName && i.count>5);
  if(!item){
    await command(`give ${cfg.botName} minecraft:${itemName} 64`);
    for(let i=0;i<25;i++){
      await pause(100);
      item=bot.inventory.items().find(i=>i.name===itemName && i.count>0);
      if(item)break;
    }
  }
  if(!item)throw new Error(`Inventory supply failed for ${material}`);
  await bot.equip(item,'hand');
  for(let i=0;i<10 && bot.heldItem?.name!==itemName;i++)await pause(100);
  if(bot.heldItem?.name!==itemName)throw new Error(`Inventory equip failed for ${material}`);
  loadedMaterial=material;lastFillAt=step;
}
async function placeNatively(p){
  if(!active())throw new Error('Bot disconnected');
  let existing=block(p);
  if(!existing)throw new Error(`Unloaded block at ${p.x},${p.y},${p.z}`);
  if(isExpected(p))return;
  if(isLiquid(existing))throw new Error(`Water or lava occupies ${p.x},${p.y},${p.z}; reset/drain the arena first`);
  if(!isEmptyBlock(existing))throw new Error(`Unexpected ${existing.name} in route at ${p.x},${p.y},${p.z}; use a clean arena`);
  if(isFeetInsideSolid(pos(),q=>block(q)))throw new Error('Bot feet are inside a solid block—stopping placement');
  // Never issue RCON setblock for route progression. No fake construction.
  for(let attempt=0;attempt<3;attempt++){
    await setItem(p.material);
    const options=candidateSupports(p,q=>block(q));
    if(!options.length)throw new Error(`No adjacent supporting block for native placement at ${p.x},${p.y},${p.z}`);
    bot.setControlState('sneak',true);
    try{
      for(const {reference,face} of options){
        try{
          const faceVec=asVec(face);
          const aim=reference.position.plus(new Vec3(.5+face.x*.49,.5+face.y*.49,.5+face.z*.49));
          await bot.lookAt(aim,false);
          if(Math.random()<.22)await pause(70+Math.random()*75);
          await bot.placeBlock(reference,faceVec);
          await pause(75);
          if(isExpected(p)){
            placed++;
            if(placed%50===0)say(`${placed} native placements; level ${p.h+1}/${cfg.height}`);
            return;
          }
        }catch(ex){
          if(attempt===2)console.warn('Placement face failed:',ex.message);
        }
      }
    }finally{bot.setControlState('sneak',false);}
    await pause(150+attempt*120);
    if(isExpected(p))return;
  }
  throw new Error(`Native placement failed at ${p.x},${p.y},${p.z}; no command fallback used`);
}
async function walkToRoute(p){
  const dest=standAt(p);
  if(!nav)throw new Error('Navigation engine not initialized');
  // Pathfinder plans the route; its human movement controller executes it.
  // Route block placement continues to be native Mineflayer placeBlock.
  for(let attempt=0;attempt<2;attempt++){
    try{
      const start=pos().clone();
      emit('move_begin',{from:{x:start.x,y:start.y,z:start.z},to:dest,step:step,attempt});
      await nav.walkTo(dest,{timeout:16000});
      emit('move_end',{at:{x:pos().x,y:pos().y,z:pos().z},distanceToGoal:pos().distanceTo(asVec(dest)),step:step});
      navFailures=0;
      walked++;
      return;
    }catch(ex){
      navFailures++;
      nav.stop();
      const q=pos();
      say(`Pathfinder retry ${attempt+1} at (${q.x.toFixed(2)},${q.y.toFixed(2)},${q.z.toFixed(2)}) -> (${dest.x},${dest.y},${dest.z}): ${ex.message}`);
      emit('move_failed',{error:ex.message,position:{x:q.x,y:q.y,z:q.z},destination:dest,attempt});
      if(attempt===1)throw ex;
      await nav.lookAt(new Vec3(p.x+.5,p.y+.7,p.z+.5));
      await pause(280);
    }
  }
}
async function emergencyResume(previous,reason){
  // Explicitly exceptional; ordinary blocks/movement never use teleportation.
  if(!cfg.allowRescue)throw new Error(`Rescue disabled: ${reason}`);
  recoveryCount++;
  const safe=previous?standAt(previous):firstAnchor(routeAt(0));
  say(`EMERGENCY rescue #${recoveryCount}: ${reason}. Teleport ONLY for recovery, not normal movement`);
  emit('rescue',{reason,recoveryCount});
  nav?.stop();
  await command(`tp ${cfg.botName} ${safe.x.toFixed(2)} ${safe.y.toFixed(2)} ${safe.z.toFixed(2)}`);
  await pause(750);
  if(isFeetInsideSolid(pos(),q=>block(q)))throw new Error('Rescue arrived inside a solid block—arena reset required');
}
async function placeAndWalk(i){
  const p=routeAt(i),previous=i>0?routeAt(i-1):null;
  const climbBase=transitionSupport(previous,p);
  if(climbBase){
    // Riser lets the bot jump +1 block. Without it, the raised step has no
    // physical neighbor and native block placement fails.
    await placeNatively(climbBase);
  }
  await placeNatively(p);
  if(i===0) {
    const d=nav.diagnostics(standAt(p));
    say('First-step physics preflight: '+JSON.stringify(d));
    if(d.targetSupport==='air'||d.targetSupport==='unloaded') throw new Error('First target has no supporting block: '+JSON.stringify(d));
    if(d.targetFeet!=='air' && d.targetFeet!=='cave_air' && d.targetFeet!=='void_air') throw new Error('First target feet obstructed: '+JSON.stringify(d));
    if(d.targetHead!=='air' && d.targetHead!=='cave_air' && d.targetHead!=='void_air') throw new Error('First target head obstructed: '+JSON.stringify(d));
  }
  await walkToRoute(p);
  const band=Math.floor(p.h/cfg.bandHeight);
  if(i===0||p.h!==previous.h){
    if(i===0||p.h!==previous.h) say(`Elevation ${p.h+1}/${cfg.height}, band ${band+1}, ${p.material}`);
    await overlay('level',{level:band+1});
  }
  if(i%25===0)emit('build_progress',{x:p.x,y:p.y,z:p.z,material:p.material,placed,walked,landing:p.landing,progressPct:Math.round(i/maxSteps*100)});
  // No random camera glances during building: every look corresponds to placement or navigation.
}
async function repairGlassNear(){
  const y=Math.floor(pos()?.y||cfg.base);
  const lo=clamp(y-8,cfg.base,cfg.base+cfg.height);
  const hi=clamp(y+10,cfg.base,cfg.base+cfg.height+1);
  for(const c of glassWallCommands(cfg,lo,hi))await command(c);
}
async function inspectAfterTnt(){
  blastUntil=0;
  bot.clearControlStates();
  await pause(300);
  let missing=-1;
  for(let i=Math.max(0,step-cfg.repairWindow);i<step;i++){
    const p=routeAt(i);
    const v=block(p);
    if(v && isEmptyBlock(v)){missing=i;break;}
  }
  const currentY=Math.floor(pos().y),expectedY=step>0?routeAt(step-1).y+1:cfg.base;
  if(missing>=0||currentY<expectedY-3){
    emit('tnt_setback',{missing,oldStep:step});
    step=missing>=0?missing:0;
    const prev=step>0?routeAt(step-1):null;
    await emergencyResume(prev,`TNT setback / fall (to route step ${step})`);
  }
  await repairGlassNear();
  say(`Explosion resolved; next route step=${step}`);
  emit('tnt_recovered',{resumeStep:step});
}
async function performSetup(){
  await gameSetup();
  if(cfg.setupArena)await setupArena(cfg.resetArena);
  const first=routeAt(0),anchor=firstAnchor(first);
  bot.clearControlStates();
  // Single initial teleport to known dry position, never into a newly created block.
  await command(`tp ${cfg.botName} ${anchor.x.toFixed(2)} ${anchor.y.toFixed(2)} ${anchor.z.toFixed(2)} 0 10`);
  await pause(850);
  // Survival physics: jumping must never activate Creative flight.
  if (bot.game?.gameMode === 'creative' || bot.game?.gameMode === 1) {
    throw new Error('Game mode still Creative after setup; refusing to jump');
  }
  say(`Movement physics mode: ${String(bot.game?.gameMode)} (expected survival)`);
  step=0;loadedMaterial='';lastFillAt=-1;blastUntil=0;
  const feet=pos();
  if(isFeetInsideSolid(feet,q=>block(q)))throw new Error(`Initial spawn embedded in a block at ${feet.toString()}. Reset arena.`);
  const feetBlock=block(feet.floored());
  if(isLiquid(feetBlock))throw new Error('Spawn is under water. Stop: use a fresh flat world and one-time arena reset.');
  say(`Spawn on the foundation at ${feet.toString()}, native placement only`);
}
async function buildLoop(){
  while(active()){
    const last=step>0?routeAt(step-1):null;
    const fallen=!!(last && bot.entity && bot.entity.position.y < last.y-1.5);
    const current=decide({step,maxSteps,blastUntil,navFailures,falling:fallen});
    if(current===STATES.WAIT_TNT){nav?.stop();await pause(200);continue;}
    if(blastUntil){await inspectAfterTnt();navFailures=0;continue;}
    if(current===STATES.RECOVER){
      say('Detected fall below last completed block; scanning damage and recovering');
      blastUntil=Date.now()-1;
      await inspectAfterTnt();
      navFailures=0;
      continue;
    }
    if(current===STATES.REPLAN){
      nav?.stop();
      emit('replan',{navFailures});
      navFailures=0;
      await pause(300);
    }
    if(current===STATES.WIN){
      say('GOAL REACHED: 300 blocks high');
      emit('win',{placed,walked,recoveryCount});
      await overlay('win');
      await glance();
      if(!cfg.winRestart){say('Holding at goal (RESET_AFTER_WIN=false)');return;}
      await pause(3000);
      await setupArena(true);
      const p=routeAt(0),a=firstAnchor(p);
      await command(`tp ${cfg.botName} ${a.x} ${a.y} ${a.z}`);
      await pause(600);
      step=0;loadedMaterial='';lastFillAt=-1;continue;
    }
    try{
      await placeAndWalk(step);
      step++;consecutiveFailedSteps=0;lastFailedStep=-1;
      await pause(cfg.stepMs+Math.random()*100);
    }catch(ex){
      nav?.stop();
      console.error(`Route step ${step} FAILED: ${ex.stack||ex.message}`);
      if(lastFailedStep===step)consecutiveFailedSteps++; else {lastFailedStep=step;consecutiveFailedSteps=1;}
      emit('step_failed',{error:String(ex.message).slice(0,500),navFailures,consecutiveFailedSteps});
      if(consecutiveFailedSteps>=cfg.maxMoveFailures){
        throw new Error(`Stopped after ${consecutiveFailedSteps} failures at route step ${step}. Inspect move_failed / step_failed telemetry instead of looping or teleporting.`);
      }
      if(blastUntil){
        say('Build interrupted by TNT; waiting for explosion before assessing damage');
        continue;
      }
      if(/Water or lava|Unexpected .*in route|Initial spawn|No adjacent supporting block|Inventory item|survival inventory|Unloaded block|Native placement failed/.test(ex.message)){
        throw ex; // Explicitly stop instead of papering over a broken route.
      }
      const prev=step>0?routeAt(step-1):null;
      if(!cfg.allowRescue)throw new Error(`Move failed without teleport fallback at step ${step}: ${ex.message}`);
      await emergencyResume(prev,ex.message);
      await pause(500);
    }
  }
}
async function work(){
  if(workerRunning)return;
  workerRunning=true;
  try{await performSetup();await buildLoop();}
  catch(ex){console.error('Builder stopped (not silently falling back to commands):',ex.stack||ex.message);}
  finally{workerRunning=false;try{bot?.clearControlStates();}catch(_){}}
}
function connect(){
  connection=false;
  const opts={host:cfg.mcHost,port:cfg.mcPort,username:cfg.botName,auth:cfg.botAuth,hideErrors:false};
  if(cfg.botAuth==='microsoft')opts.profilesFolder=e.MC_PROFILE_FOLDER||'/data/minecraft-auth';
  bot=mineflayer.createBot(opts);
  nav=new Navigation(bot,{humanStyle:flag('HUMAN_MOVEMENT',false),seed:number('HUMAN_SEED',2026)});
  bot.on('spawn',()=>{
    connection=true;
    say('Bot spawned; video-inspired wide-platform route active');
    nav.initialize();
    if(cfg.viewer&&!viewerStarted){
      try{
        startViewer(bot,{port:cfg.viewerPort,firstPerson:cfg.firstPerson,viewDistance:cfg.viewDistance});
        viewerStarted=true;
        say(`Browser viewer listening on port ${cfg.viewerPort}`);
      }catch(ex){console.error('Viewer:',ex.message);}
    }
    void work();
  });
  bot.on('entitySpawn',entity=>{
    const name=String(entity?.name||entity?.displayName||'').toLowerCase();
    if(!name.includes('tnt')&&!name.includes('primed'))return;
    blastUntil=Math.max(blastUntil,Date.now()+5000);
    nav?.stop();
    emit('tnt_detected',{entity:name});
    if(Date.now()-blastSeenAt>1600){say('TNT detected—stopping and watching for damage');blastSeenAt=Date.now();bot.clearControlStates();}
  });
  bot.on('kicked',v=>console.error('Minecraft kicked bot:',v));
  bot.on('error',ex=>console.error('Minecraft connection:',ex.message));
  bot.on('end',()=>{
    say('Disconnected; reconnecting in 10 seconds');
    connection=false;workerRunning=false;
    try{nav?.stop();}catch(_){}
    try{bot?.viewer?.close();}catch(_){ }
    viewerStarted=false;
    try{rcon?.end();}catch(_){ }
    rcon=null;
    setTimeout(connect,10000);
  });
}
say(`Version 6.3 survival-physics jump fix, wide-platform ascent: glass ${cfg.width}x${cfg.depth}x${cfg.height}, ${maxSteps} native placements; landing every ${cfg.bandHeight} levels`);
say('Offline-mode Minecraft server and RCON MUST remain private. Use a separate, backed-up game world.');
connect();
