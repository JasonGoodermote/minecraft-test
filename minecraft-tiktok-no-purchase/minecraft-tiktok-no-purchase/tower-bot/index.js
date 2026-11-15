'use strict';
// Glass Tower v7: platform rows, fast server-assisted burst placement, grounded camera.
// Each burst is genuinely issued by RCON (not native hand placement). Never claim otherwise.
const mineflayer=require('mineflayer');
const {mineflayer:startViewer}=require('prismarine-viewer');
const {pathfinder,Movements,goals}=require('mineflayer-pathfinder');
const {Rcon}=require('rcon-client');
const {Vec3}=require('vec3');
const {validate,layerMaterial,makeChunks,arenaShell,clearInterior}=require('./plan');
const E=process.env;
const num=(k,d)=>E[k]==null?d:Number(E[k]);
const bool=(k,d)=>E[k]==null?d:/^(true|1|yes)$/i.test(E[k]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const cfg={host:E.MC_HOST||'minecraft.railway.internal',port:num('MC_PORT',25565),name:E.BOT_USERNAME||'TowerBot',auth:E.BOT_AUTH||'offline',rconHost:E.RCON_HOST||'minecraft.railway.internal',rconPort:num('RCON_PORT',25575),password:E.RCON_PASSWORD||'',viewer:bool('ENABLE_VIEWER',true),viewerPort:num('PORT',num('VIEWER_PORT',3000)),firstPerson:bool('VIEWER_FIRST_PERSON',true),viewDistance:num('VIEW_DISTANCE',10),x:num('TOWER_X',0),y:num('TOWER_Y',12),z:num('TOWER_Z',0),width:num('TOWER_WIDTH',25),depth:num('TOWER_DEPTH',20),height:num('TOWER_HEIGHT',300),band:num('MATERIAL_BAND_HEIGHT',15),burst:num('BURST_BLOCKS',8),burstDelay:num('BURST_DELAY_MS',65),moveEvery:num('MOVE_EVERY_BURSTS',6),arena:bool('ARENA_SETUP',true),reset:bool('ARENA_RESET',false),restart:bool('RESET_AFTER_WIN',false),repair:bool('REPAIR_AFTER_TNT',true),repairLast:num('REPAIR_LAST_BURSTS',40),recoverTp:bool('ALLOW_EMERGENCY_TP',false),telemetry:bool('TOWER_TELEMETRY',true)};
validate(cfg);
if(!cfg.password)throw Error('Missing RCON_PASSWORD');
if(!Number.isInteger(cfg.burst)||cfg.burst<1||cfg.burst>12)throw Error('BURST_BLOCKS must be 1..12');
if(cfg.reset&&E.ARENA_CLEAR_CONFIRM!=='I_BACKED_UP_THIS_WORLD')throw Error('ARENA_RESET needs ARENA_CLEAR_CONFIRM=I_BACKED_UP_THIS_WORLD');
if(cfg.moveEvery<0||cfg.burstDelay<20)throw Error('Invalid speed settings');
let bot,rcon,started=false,viewerStarted=false,reconnectTimer=null,closing=false;
let currentLevel=0,currentChunk=0,building=false,tntAt=0,blastLast=0,lastChunks=[],count=0,navFail=0;
function log(s){console.log('[Tower v7] '+s)}
function track(evt,details={}){if(cfg.telemetry)console.log(JSON.stringify({type:'tower',event:evt,time:new Date().toISOString(),level:currentLevel,chunk:currentChunk,...details}));}
async function command(cmd){for(let n=0;n<2;n++){try{if(!rcon)rcon=await Rcon.connect({host:cfg.rconHost,port:cfg.rconPort,password:cfg.password,timeout:20000});const result=await rcon.send(cmd);if(/(unknown or incomplete command|too many blocks|outside of the world|permission denied|not loaded)/i.test(result||''))throw Error(result);return result;}catch(ex){try{rcon?.end();}catch(_){}rcon=null;if(n)throw ex;await wait(300);}}}
async function safeCmd(cmd){try{return await command(cmd)}catch(ex){log('Optional setting failed '+cmd+': '+ex.message)}}
function stateReady(){return bot?._client?.state==='play'&&!!bot.entity;}
function pointTo(b){return new Vec3(b.x1+(b.x2-b.x1)/2+.5,b.y+.4,b.z+.5)}
function blockName(x,y,z){return bot.blockAt(new Vec3(Math.floor(x),Math.floor(y),Math.floor(z)))?.name||'unloaded';}
async function moveToStance(chunk){if(!stateReady())return;const foot=bot.entity.position;
 // Stay on the already completed neighboring row; never path onto an unfinished row.
 const desired={x:Math.max(cfg.x+1,Math.min(cfg.x+cfg.width-2,Math.round((chunk.x1+chunk.x2)/2))),z:chunk.standZ,y:chunk.y+1};
 if(desired.z<cfg.z||desired.z>=cfg.z+cfg.depth)return;
 // The support position must be a completed solid block at the same level.
 const below=blockName(desired.x,desired.y-1,desired.z);
 if(['air','cave_air','void_air','water','unloaded'].includes(below)){track('stance_skip',{reason:'no supporting block',desired,below});return;}
 if(Math.hypot(foot.x-(desired.x+.5),foot.z-(desired.z+.5))<1.6)return;
 try{const g=new goals.GoalNear(desired.x,desired.y,desired.z,2);
   await Promise.race([bot.pathfinder.goto(g),new Promise((_,reject)=>setTimeout(()=>reject(new Error('movement timeout')),4200))]);
   navFail=0;
 }catch(ex){navFail++;bot.pathfinder.setGoal(null);bot.clearControlStates();track('movement_skip',{reason:ex.message,failures:navFail});
   if(navFail>=6)log('Movement repeatedly failed; remaining at safe position and continuing server-assisted construction');}
}
async function lookForPlacement(chunk){if(!stateReady())return;try{await bot.lookAt(pointTo(chunk),true);}catch(_){}}
async function setup(){await safeCmd('gamerule doMobSpawning false');await safeCmd('difficulty peaceful');await safeCmd('gamerule doWeatherCycle false');await safeCmd('weather clear');await safeCmd('time set day');await safeCmd('gamerule keepInventory true');await safeCmd('gamerule doTileDrops false');await safeCmd('gamerule fallDamage false');
 await command(`gamemode survival ${cfg.name}`);
 if(cfg.arena){log('Creating tower glass enclosure');const shell=arenaShell(cfg);for(let i=0;i<shell.length;i++){await command(shell[i]);if((i+1)%30===0)log(`Glass ${i+1}/${shell.length}`);}
 if(cfg.reset){log('DESTRUCTIVE one-time arena reset: clearing construction interior');for(const cmd of clearInterior(cfg))await command(cmd);}}
 // First layer staging row, spanning the interior x-axis.
 await command(`fill ${cfg.x} ${cfg.y} ${cfg.z} ${cfg.x+cfg.width-1} ${cfg.y} ${cfg.z} ${layerMaterial(cfg,0)}`);
 await command(`tp ${cfg.name} ${cfg.x+1.5} ${cfg.y+1} ${cfg.z+.5} 0 20`);
 await wait(600);if(!stateReady())throw Error('Minecraft bot disconnected during setup');
 if(bot.entity.position.y>cfg.y+3)throw Error('Bot spawned far above base; check world / TOWER_Y');
 log(`Prepared platform at Y=${cfg.y}; bot at ${bot.entity.position.toString()}`);
 const nearbyTerrain=blockName(cfg.x+cfg.width+5,cfg.y-1,cfg.z+cfg.depth+5);if(!['air','cave_air','void_air','unloaded'].includes(nearbyTerrain))log('WARNING: Exterior terrain near tower base; use fresh low-ground FLAT world for sky appearance');
}
function completeChunkCommand(c){return `fill ${Math.min(c.x1,c.x2)} ${c.y} ${c.z} ${Math.max(c.x1,c.x2)} ${c.y} ${c.z} ${c.material}`;}
async function repairAfterBlast(){if(!cfg.repair)return;const last=lastChunks.slice(-cfg.repairLast);let repaired=0;
 for(const c of last){if(!stateReady())break;const x=Math.floor((c.x1+c.x2)/2);const name=blockName(x,c.y,c.z);if(name==='air'||name==='cave_air'||name==='void_air'){await command(completeChunkCommand(c));repaired++;}}
 track('repair',{repaired,checked:last.length});}
async function ascend(nextLevel){
 const newY=cfg.y+nextLevel, mat=layerMaterial(cfg,nextLevel);
 // Place a single step at the corner, stand beside it on the LOWER floor,
 // climb one block, then complete the new level's staging row away from the bot.
 const start={x:cfg.x+1,y:newY,z:cfg.z+1};
 const target={x:cfg.x+.5,y:newY+1,z:cfg.z+1.5};
 try{
   await Promise.race([
     bot.pathfinder.goto(new goals.GoalNear(start.x,start.y,start.z,0)),
     new Promise((_,reject)=>setTimeout(()=>reject(Error('stair approach timed out')),9000))
   ]);
 }catch(ex){bot.pathfinder.setGoal(null);track('stair_approach_failed',{message:ex.message});}
 // Building a riser at x=0,z=1 never intersects the planned approach x=1,z=1.
 await command(`setblock ${cfg.x} ${newY} ${cfg.z+1} ${mat}`);
 let arrived=false;
 try{
   await Promise.race([
     bot.pathfinder.goto(new goals.GoalNear(cfg.x,newY+1,cfg.z+1,0)),
     new Promise((_,reject)=>setTimeout(()=>reject(Error('stair jump timed out')),8000))
   ]);
   const p=bot.entity.position;
   arrived=Math.abs(p.y-target.y)<.7&&Math.hypot(p.x-target.x,p.z-target.z)<1.1;
 }catch(ex){bot.pathfinder.setGoal(null);track('stair_jump_failed',{reason:ex.message});}
 if(!arrived){
   if(!cfg.recoverTp)throw Error(`Could not naturally ascend to level ${nextLevel+1}. Set ALLOW_EMERGENCY_TP=true for explicit assisted transitions.`);
   await command(`tp ${cfg.name} ${target.x} ${target.y} ${target.z} 0 15`);
   await wait(450);track('assisted_lift',{level:nextLevel+1,to:target});
 }
 // New staging row sits next to the bot (z=0); avoids embedding player in new blocks.
 await command(`fill ${cfg.x} ${newY} ${cfg.z} ${cfg.x+cfg.width-1} ${newY} ${cfg.z} ${mat}`);
}

async function run(){if(building)return;building=true;try{await setup();
 while(stateReady()&&currentLevel<cfg.height){const mat=layerMaterial(cfg,currentLevel);const pieces=makeChunks(cfg,currentLevel);log(`Level ${currentLevel+1}/${cfg.height} material=${mat} chunks=${pieces.length}`);
 while(stateReady()&&currentChunk<pieces.length){const p=pieces[currentChunk];
   if(tntAt){const when=tntAt;tntAt=0;await wait(Math.max(0,Math.min(2300,blastLast+2200-Date.now())));await repairAfterBlast();track('tnt_handled',{triggerTime:when});}
   if(cfg.moveEvery>0&&currentChunk%cfg.moveEvery===0)await moveToStance(p);
   await lookForPlacement(p);
   await command(completeChunkCommand(p));
   lastChunks.push(p);if(lastChunks.length>500)lastChunks.shift();count+=p.cells;currentChunk++;
   if(currentChunk%20===0)track('progress',{filled:count,material:mat,position:bot.entity.position.toString()});
   await wait(cfg.burstDelay);
 }
 if(!stateReady())break;
 currentLevel++;currentChunk=0;track('level_complete',{level:currentLevel,filled:count});
 if(currentLevel<cfg.height)await ascend(currentLevel);
 }
 if(currentLevel>=cfg.height){log('WIN — REACHED 300-LEVEL TARGET');track('win',{filled:count});if(cfg.restart)log('RESET_AFTER_WIN requested; restarting requires a new arena reset. Stopping to protect world.');}
 }catch(ex){console.error('[Tower v7] STOPPED:',ex.stack||ex.message);track('halt',{error:ex.message});}finally{building=false;try{bot?.clearControlStates();}catch(_){}}}
function connect(){const b=mineflayer.createBot({host:cfg.host,port:cfg.port,username:cfg.name,auth:cfg.auth});bot=b;b.loadPlugin(pathfinder);
 b.once('spawn',()=>{if(bot!==b)return;started=true;log('Minecraft bot spawned; platform-filling mode');const mv=new Movements(b);mv.canDig=false;mv.allow1by1towers=false;mv.allowParkour=false;mv.canOpenDoors=false;mv.allowSprinting=false;b.pathfinder.setMovements(mv);
 if(cfg.viewer&&!viewerStarted){try{startViewer(b,{port:cfg.viewerPort,firstPerson:cfg.firstPerson,viewDistance:cfg.viewDistance});viewerStarted=true;log(`Viewer on port ${cfg.viewerPort}`)}catch(ex){console.error('Viewer:',ex.message)}}void run();});
 b.on('entitySpawn',entity=>{if(!/tnt|primed/i.test(String(entity.name||entity.displayName||'')))return;tntAt=Date.now();blastLast=tntAt;track('tnt_detected');});
 b.on('kicked',reason=>console.error('Minecraft kicked:',reason));b.on('error',ex=>console.error('Minecraft error:',ex.message));
 b.once('end',()=>{if(bot!==b)return;started=false;building=false;viewerStarted=false;try{rcon?.end();}catch(_){}rcon=null;log('Disconnected; reconnect in 12 seconds');if(!closing){clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,12000)}});
}
log(`v7 platform-fill: ${cfg.width}x${cfg.depth}x${cfg.height}, ${cfg.burst} blocks/burst, ${cfg.burstDelay}ms delay`);
log('Fast placement is server-assisted /fill, not Mineflayer hand placement. Minecraft/RCON remain on private Railway network.');
connect();
