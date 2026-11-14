'use strict';
const assert=require('node:assert/strict');
const {routeAt,buildArenaCommands}=require('./route');
const {transitionSupport,standingPosition,firstAnchor,candidateSupports,durationToWalk}=require('./grounded');
const cfg={x:0,z:0,base:0,width:25,depth:20,height:300,bandHeight:15};
let rises=0;
for(let i=1;i<cfg.width*cfg.height;i++) {
  const prev=routeAt(i-1,cfg), next=routeAt(i,cfg);
  const support=transitionSupport(prev,next);
  if(next.y>prev.y){
    rises++;
    assert.equal(support.y,prev.y);
    assert.equal(Math.abs(prev.x-support.x)+Math.abs(prev.z-support.z),1);
  } else assert.equal(support,null);
  assert.equal(standingPosition(next).y,next.y+1);
}
assert.equal(rises,299);
const p=routeAt(0,cfg); assert.equal(firstAnchor(p).z,p.z+1.5);
const blocks=new Map([['0,-1,0',{name:'obsidian',position:{x:0,y:-1,z:0}}]]);
const refs=candidateSupports(p,v=>blocks.get(`${v.x},${v.y},${v.z}`));
assert.equal(refs.length,1);assert.equal(refs[0].face.y,1);
assert(durationToWalk(1.1,true)>durationToWalk(1.1,false));
const cmds=buildArenaCommands(cfg,true);
const firstAir=cmds.findIndex(c=>c.includes('minecraft:air'));
assert(firstAir>cmds.findLastIndex(c=>c.includes('minecraft:glass')),'glass shell is built before any clearing');
assert(cmds.some(c=>c.includes('replace minecraft:water')),'drains water');
console.log('PASS: 299 native-climb transitions, safe first anchor, support faces, glass shell sealed before water clearing');
