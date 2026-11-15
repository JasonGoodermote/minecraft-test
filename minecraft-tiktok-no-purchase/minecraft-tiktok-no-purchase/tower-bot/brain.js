'use strict';
// Tier 2: tower-specific decision policy. Intentionally deterministic.
// Upgrade later with learned action scores from tagged gameplay outcomes,
// but do not let an LLM emit raw Mineflayer calls or RCON commands.
const STATES=Object.freeze({BUILD:'BUILD',WAIT_TNT:'WAIT_TNT',RECOVER:'RECOVER',REPLAN:'REPLAN',WIN:'WIN'});
function decide({step,maxSteps,blastUntil=0,now=Date.now(),routeDamaged=false,falling=false,navFailures=0}){
  if(blastUntil>now)return STATES.WAIT_TNT;
  if(routeDamaged||falling)return STATES.RECOVER;
  if(navFailures>=2)return STATES.REPLAN;
  if(step>=maxSteps)return STATES.WIN;
  return STATES.BUILD;
}
module.exports={STATES,decide};
