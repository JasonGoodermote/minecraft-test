'use strict';
/* v6.2 movement: direct physics control for adjacent blocks, pathfinder only for distance. */
const {pathfinder, Movements, goals} = require('mineflayer-pathfinder');
const {Vec3} = require('vec3');
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const horizontalDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const shortStep=(from,to)=>horizontalDistance(from,to)<=1.65&&Math.abs(from.y-to.y)<=1.4;

class Navigation {
  constructor(bot) {
    this.bot=bot;
    this.initialized=false;
    this.cancelled=false;
    bot.loadPlugin(pathfinder);
  }
  initialize() {
    if(this.initialized)return;
    this.initialized=true;
    const m=new Movements(this.bot);
    m.canDig=false;m.allow1by1towers=false;m.allowParkour=false;
    m.allowSprinting=false;m.canOpenDoors=false;
    m.canSwim=false;
    this.bot.pathfinder.setMovements(m);
    console.log('[Navigator] v6.3: pulsed adjacent jump, Pathfinder for distant destinations');
  }
  stop() {
    this.cancelled=true;
    try{this.bot.pathfinder.setGoal(null);}catch(_){}
    try{this.bot.clearControlStates();}catch(_){}
  }
  diagnostics(dest) {
    const p=this.bot.entity.position;
    const get=(x,y,z)=>{const b=this.bot.blockAt(new Vec3(Math.floor(x),Math.floor(y),Math.floor(z)));return b?b.name:'unloaded'};
    return {
      position:{x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)},
      destination:dest,onGround:!!this.bot.entity.onGround,
      feet:get(p.x,p.y,p.z),underFeet:get(p.x,p.y-1,p.z),
      targetFeet:get(dest.x,dest.y,dest.z),
      targetHead:get(dest.x,dest.y+1,dest.z),
      targetSupport:get(dest.x,dest.y-1,dest.z)
    };
  }
  async walkAdjacent(dest,{timeout=9000}={}) {
    const bot=this.bot;
    const goal=new Vec3(dest.x,dest.y,dest.z);
    this.cancelled=false;
    const start=bot.entity.position.clone();
    let jumpReleasedAt=0, jumpingUntil=0, lastLog=0;
    const started=Date.now();
    // Never hold jump continually: in Creative it causes vertical flight, and
    // even in Survival repeated jumps look mechanical and can overshoot.
    try {
      while(Date.now()-started<timeout) {
        if(this.cancelled||bot._client?.state!=='play')throw new Error('Movement interrupted/disconnected');
        const p=bot.entity.position;
        const horizontal=horizontalDistance(p,goal);
        const dy=goal.y-p.y;
        if(p.y>Math.max(start.y,goal.y)+2.0) {
          throw new Error('Unexpected upward movement (flight/levitation): '+JSON.stringify(this.diagnostics(dest)));
        }
        if(p.y<Math.min(start.y,goal.y)-2.0) {
          throw new Error('Fell below route: '+JSON.stringify(this.diagnostics(dest)));
        }
        if(horizontal<0.32 && Math.abs(dy)<0.36 && bot.entity.onGround)return;
        const now=Date.now();
        // Face target at current eye height: this drives only horizontal forward movement.
        await bot.lookAt(new Vec3(goal.x,p.y+1.55,goal.z),true);
        bot.setControlState('forward',horizontal>0.22);
        bot.setControlState('sprint',false);
        const needsRise=goal.y-start.y>0.42;
        if(needsRise && bot.entity.onGround && horizontal<1.28 &&
           now-jumpReleasedAt>650 && now>jumpingUntil) {
          jumpingUntil=now+145; // short jump pulse, not continuous held jump
        }
        if(jumpingUntil && now>=jumpingUntil){
          bot.setControlState('jump',false);
          jumpingUntil=0;
          jumpReleasedAt=now;
        } else {
          bot.setControlState('jump',jumpingUntil>now);
        }
        if(now-lastLog>1500){
          console.log('[Navigator] adjacent_step',JSON.stringify(this.diagnostics(dest)));
          lastLog=now;
        }
        await sleep(50);
      }
      throw new Error('Adjacent walk/jump timed out: '+JSON.stringify(this.diagnostics(dest)));
    } finally {bot.clearControlStates();}
  }
  async walkTo(dest,{timeout=16000}={}) {
    const position=new Vec3(dest.x,dest.y,dest.z);
    const start=this.bot.entity.position;
    if(start.distanceTo(position)<0.34)return;
    // Most placements are a single horizontal block apart, including raised stairs.
    if(shortStep(start,position))return this.walkAdjacent(dest,{timeout:Math.min(12000,timeout)});
    this.cancelled=false;
    const action=this.bot.pathfinder.goto(new goals.GoalNear(Math.floor(dest.x),Math.floor(dest.y),Math.floor(dest.z),0));
    let timer;
    try {
      await Promise.race([action,new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Pathfinder timeout: '+JSON.stringify(this.diagnostics(dest)))),timeout))]);
    } catch(err){this.stop();throw err;} finally {clearTimeout(timer);}
    if(this.bot.entity.position.distanceTo(position)>1.1)throw new Error('Pathfinder ended far from goal: '+JSON.stringify(this.diagnostics(dest)));
  }
  lookAt(point){return this.bot.lookAt(new Vec3(point.x,point.y,point.z),true);}
}
module.exports={Navigation,shortStep,horizontalDistance};
