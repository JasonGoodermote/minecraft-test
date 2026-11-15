const assert=require('node:assert/strict');
const {makePlan,materialForHeight,buildArenaCommands}=require('./route');
const c={x:0,z:0,base:0,width:25,depth:20,height:300,bandHeight:15};
const plan=makePlan(c);
assert.equal(plan.length,16525);
assert.equal(plan[0].y,0);assert.equal(plan.at(-1).y,299);
const unique=new Set(plan.map(p=>`${p.x}/${p.y}/${p.z}`));assert.equal(unique.size,plan.length);
let prev=null;
for(const p of plan){
 assert(p.x>=0&&p.x<25&&p.z>=0&&p.z<20&&p.y>=0&&p.y<300);
 assert.equal(p.material,materialForHeight(p.h));
 if(prev){assert.equal(Math.abs(prev.x-p.x)+Math.abs(prev.z-p.z),1);assert(p.y-prev.y===0||p.y-prev.y===1)}
 prev=p;
}
const landings=new Map();for(const p of plan)if(p.landing)landings.set(p.h,(landings.get(p.h)||0)+1);
assert.equal(landings.size,20);assert(landings.get(14)>=25*19);assert(landings.get(299)>=25*19);
const cmds=buildArenaCommands(c,true);assert(cmds.some(s=>s.includes('minecraft:air')));
console.log('PASS: 300 levels, 20 wide landings, all route transitions adjacent, materials and safety bounds');
