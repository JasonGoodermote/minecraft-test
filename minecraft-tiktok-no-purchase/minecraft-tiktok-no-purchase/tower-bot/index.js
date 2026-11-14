'use strict';
// A server-controlled Minecraft 'build up' bot. Requires a separate Paper server.
// It uses a genuine Minecraft protocol client (mineflayer) but RCON places the blocks
// and synchronizes the player's position for deterministic high-throughput operation.
const mineflayer = require('mineflayer');
const { mineflayer: mineflayerViewer } = require('prismarine-viewer');
const { Rcon } = require('rcon-client');
const fs = require('fs');
const path = require('path');

const env = process.env;
const cfg = {
  host:env.MC_HOST||'minecraft.railway.internal',port:Number(env.MC_PORT||25565),
  username:env.BOT_USERNAME||'TowerBot',auth:env.BOT_AUTH||'offline',
  rconHost:env.RCON_HOST||'minecraft.railway.internal',rconPort:Number(env.RCON_PORT||25575),
  rconPassword:env.RCON_PASSWORD||'',
  x:Number(env.TOWER_X||0),z:Number(env.TOWER_Z||0),base:Number(env.TOWER_Y||100),
  width:Math.min(16,Math.max(3,Number(env.TOWER_WIDTH||7))),
  height:Math.min(60,Math.max(2,Number(env.TOWER_HEIGHT||15))),
  stepMs:Math.max(400,Number(env.STEP_MS||850)),
  block:/^[a-z0-9_:]+$/.test(env.BUILD_BLOCK||'minecraft:diamond_block')?(env.BUILD_BLOCK||'minecraft:diamond_block'):'minecraft:diamond_block',
  overlay:env.OVERLAY_URL||'',token:env.ADMIN_TOKEN||'',
};
if(!cfg.rconPassword)throw new Error('Missing RCON_PASSWORD');
if(!/^[A-Za-z0-9_]{1,16}$/.test(cfg.username)) throw new Error('Invalid BOT_USERNAME');
let bot=null;let rcon=null;let running=false;let turn=0;let level=1;let index=0;let lastY=cfg.base;
const viewerEnabled = String(env.ENABLE_VIEWER || 'true').toLowerCase() === 'true';
const viewerPort = Number(env.PORT || env.VIEWER_PORT || 3000);
let viewerActive = false;
const wait = ms=>new Promise(r=>setTimeout(r,ms));
const escapeName = v=>v.replace(/[^\w]/g,'');
const name=escapeName(cfg.username);
async function command(cmd){
  for(let retry=0;retry<2;retry++){
    try{
      if(!rcon)rcon=await Rcon.connect({host:cfg.rconHost,port:cfg.rconPort,password:cfg.rconPassword,timeout:8000});
      return await rcon.send(cmd);
    } catch(e){console.error('RCON failed',e.message); try{rcon?.end()}catch(_){} rcon=null;if(retry)throw e;await wait(1000)}
  }
}
async function overlay(action,extra={}){
  if(!cfg.overlay||!cfg.token)return;
  try{
    const res=await fetch(cfg.overlay.replace(/\/$/,'')+'/api/control',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+cfg.token},body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(4500)});
    if(!res.ok)console.warn('Overlay response',res.status);
  }catch(e){console.warn('Overlay unavailable',e.message)}
}
function position(i){
  const w=cfg.width,per=w*w;
  const floor=Math.floor(i/per);
  const onFloor=i%per;
  const row=Math.floor(onFloor/w),col=onFloor%w;
  const dx=row%2===0?col:(w-1-col);
  return {x:cfg.x+dx,y:cfg.base+floor,z:cfg.z+row,floor};
}
async function setup(){
  // Spawn plane is protected and the build starts above it. TNT can damage the tower.
  const pad=cfg.width+3;
  await command(`fill ${cfg.x-2} ${cfg.base-2} ${cfg.z-2} ${cfg.x+pad} ${cfg.base-2} ${cfg.z+pad} minecraft:obsidian`);
  await command(`gamerule doImmediateRespawn true`);
  await command(`gamerule keepInventory true`);
  await command(`gamemode creative ${name}`);
  await command(`effect give ${name} minecraft:resistance 999999 4 true`);
  await command(`tp ${name} ${cfg.x+0.5} ${cfg.base+1} ${cfg.z+0.5} 0 70`);
  await overlay('level',{level});
}
async function nextStep(){
  const p=position(index), max=cfg.width*cfg.width*cfg.height;
  if(index>=max){
    level++;console.log('Completed tower, level',level);await overlay('win');
    // Delete the tower only after a completed round, then start a new one.
    await command(`fill ${cfg.x} ${cfg.base} ${cfg.z} ${cfg.x+cfg.width-1} ${cfg.base+cfg.height-1} ${cfg.z+cfg.width-1} minecraft:air`);
    index=0;await wait(1200);return;
  }
  // Distinctive camera follows the bot over each placement, moving across floors.
  // This is a block builder, not a parkour/pathfinding agent.
  await command(`setblock ${p.x} ${p.y} ${p.z} ${cfg.block}`);
  await command(`tp ${name} ${p.x+0.5} ${p.y+1} ${p.z+0.5} 0 75`);
  try{bot.swingArm('right')}catch(_){}
  if(p.y!==lastY){console.log('Reached height',p.y);lastY=p.y}
  index++;
}
async function loop(){
  if(running)return;running=true;
  try {
    await setup();
    while(bot&&bot._client?.state==='play'){
      try{await nextStep()}catch(e){console.error('Step failed:',e.message);await wait(2000)}
      await wait(cfg.stepMs);
    }
  }finally{running=false}
}
function connect(){
  const opts={host:cfg.host,port:cfg.port,username:cfg.username,auth:cfg.auth,hideErrors:false};
  // Microsoft-auth Minecraft accounts need a writable /data cache & one-time login.
  if(cfg.auth==='microsoft')opts.profilesFolder=env.MC_PROFILE_FOLDER||'/data/minecraft-auth';
  bot=mineflayer.createBot(opts);
  bot.on('spawn',()=>{
    console.log('Minecraft bot spawned');
    if (viewerEnabled && !viewerActive) {
      try {
        mineflayerViewer(bot, { port: viewerPort, firstPerson: true, viewDistance: 6 });
        viewerActive = true;
        console.log(`Browser Minecraft viewer listening on port ${viewerPort}`);
      } catch(e) { console.error('Unable to start browser viewer:', e.message); }
    }
    if(!running)void loop();
  });
  bot.on('kicked',reason=>console.error('Kicked:',reason));
  bot.on('error',e=>console.error('Minecraft:',e.message));
  bot.on('end',()=>{
    console.warn('Disconnected, reconnecting in 10s'); running=false;
    if (viewerActive) { try { bot.viewer?.close(); } catch(e) { console.warn('Viewer close issue:',e.message); } viewerActive=false; }
    setTimeout(connect,10000);
  });
}
connect();
