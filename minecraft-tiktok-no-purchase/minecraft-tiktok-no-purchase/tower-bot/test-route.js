'use strict';
const assert = require('node:assert/strict');
const {routeAt,materialForHeight,buildArenaCommands,validateArena,MATERIALS,rowForHeight}=require('./route');
const cfg={x:0,z:0,base:0,width:25,depth:20,height:300,bandHeight:15};
validateArena(cfg);
const path = Array.from({length: cfg.width * cfg.height},(_,i)=>routeAt(i,cfg));
assert.equal(path.length,7500);
assert.equal(path[0].y,0);
assert.equal(path.at(-1).y,299);
for(let i=0;i<path.length;i++) {
  const p=path[i];
  assert(p.x>=0 && p.x<25 && p.z>=0 && p.z<20 && p.y>=0 && p.y<300);
  assert.equal(p.material,MATERIALS[Math.floor(p.h/15)%20]);
  if (i>0) {
    const q=path[i-1];
    const horizontal=Math.abs(p.x-q.x)+Math.abs(p.z-q.z);
    const dy=p.y-q.y;
    assert(dy===0||dy===1,'never descends');
    assert(horizontal===1,'horizontal movement one tile at a time');
  }
}
for(let y=0;y<300;y++) {
  assert.equal(path[y*25].y,y);
  assert.equal(path[y*25].z,rowForHeight(y,20));
}
assert.notEqual(materialForHeight(14),materialForHeight(15));
assert.notEqual(materialForHeight(29),materialForHeight(30));
const arena=buildArenaCommands(cfg,true);
assert(arena.some(c=>c.includes('minecraft:glass')));
assert(arena.some(c=>c.includes('minecraft:barrier')));
assert(arena.some(c=>c.includes('minecraft:air')));
assert(arena.every(c=>!c.includes(' 320 ')));
assert.equal(buildArenaCommands(cfg,false).some(c=>c.includes('minecraft:air')),false);
assert.throws(()=>validateArena({...cfg,base:100}),/Y=319 block limit/);
console.log('PASS: 300 ascending levels, 7500 connected placements, 25x20 footprint, 15-level materials, glass arena and safe Y bounds');
