'use strict';
/*
 * Tier 1: proven Mineflayer path planning and optional human-style steering.
 * Does not place/dig blocks for navigation or use server teleportation.
 * `createHuman` is present in newer mineflayer-pathfinder releases; standard
 * Pathfinder is a documented fallback if the deployed version lacks it.
 */
const {pathfinder, Movements, goals, createHuman} = require('mineflayer-pathfinder');
const {Vec3} = require('vec3');

class Navigation {
  constructor(bot, options={}) {
    this.bot=bot;
    this.options=options;
    this.human=null;
    this.movement=null;
    this.initialized=false;
    bot.loadPlugin(pathfinder);
  }
  initialize() {
    if(this.initialized)return;
    this.initialized=true;
    this.movement=new Movements(this.bot);
    this.movement.canDig=false;
    this.movement.canOpenDoors=false;
    this.movement.allow1by1towers=false;
    this.movement.allowFreeMotion=false;
    this.movement.allowParkour=false;
    this.movement.allowSprinting=false;
    this.movement.canSwim=false;
    this.movement.canUseOneByOneTowers=false;
    this.bot.pathfinder.setMovements(this.movement);
    // Prefer stable, documented Pathfinder for a reliable test run.
    // Experimental human steering is opt-in once basic movement is confirmed.
    if (this.options.humanStyle===true && typeof createHuman==='function') {
      this.human=createHuman(this.bot,{
        seed:this.options.seed ?? 2026,
        movements:this.movement,
        setback:false,
        personality:{
          basePitch:0.12,
          sprints:false,
          jumpRate:0,
          glanceRate:0.035,
          strafe:0.12,
          lookAhead:1.05,
          stopRadius:0.23,
          reaction:0.12,
          turnTime:1.0
        }
      });
      console.log('[Navigator] Human-style walk and camera enabled');
    } else {
      console.log('[Navigator] Standard Pathfinder enabled (human-style API absent)');
    }
  }
  stop(){
    try{this.human?.stop();}catch(_){}
    try{this.bot.pathfinder.setGoal(null);}catch(_){}
    try{this.bot.clearControlStates();}catch(_){}
  }
  async walkTo(position,{timeout=20000}={}){
    const point=new Vec3(position.x,position.y,position.z);
    const start=this.bot.entity.position.clone();
    if (start.distanceTo(point)<0.35) return;
    // Do not let Pathfinder create towers, mine glass, or consume route blocks.
    const work=this.human ?
      this.human.walkTo(point,{radius:0.27,timeout}) :
      this.bot.pathfinder.goto(new goals.GoalNear(Math.floor(point.x),Math.floor(point.y),Math.floor(point.z),0));
    let timer;
    try{
      await Promise.race([work,new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Navigation timed out')),timeout+2000);
      })]);
    }catch(err){this.stop();throw err;}
    finally{clearTimeout(timer);}
    if(this.bot.entity.position.distanceTo(point)>1.1)throw new Error(`Navigation ended too far from goal: ${this.bot.entity.position.distanceTo(point).toFixed(2)} blocks`);
  }
  async lookAt(point){
    const target=new Vec3(point.x,point.y,point.z);
    if(this.human){
      try{return await this.human.lookAt(target,{settleMs:80});}
      catch(err){if(!String(err.message).includes('setback'))throw err;}
    }
    return this.bot.lookAt(target,false);
  }
}
module.exports={Navigation};
