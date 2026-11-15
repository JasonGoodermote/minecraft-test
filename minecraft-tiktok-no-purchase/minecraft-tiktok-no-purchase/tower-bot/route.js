'use strict';
// Video-inspired: serpentine ribbons climb one block per elevation, while
// every 15th elevation widens into a large, player-built landing.
const MATERIALS = Object.freeze([
  'minecraft:oak_planks','minecraft:stone_bricks','minecraft:sandstone',
  'minecraft:bricks','minecraft:red_concrete','minecraft:orange_concrete',
  'minecraft:yellow_concrete','minecraft:lime_concrete','minecraft:green_concrete',
  'minecraft:cyan_concrete','minecraft:light_blue_concrete','minecraft:blue_concrete',
  'minecraft:purple_concrete','minecraft:magenta_concrete','minecraft:pink_concrete',
  'minecraft:quartz_block','minecraft:prismarine_bricks','minecraft:deepslate_bricks',
  'minecraft:gold_block','minecraft:diamond_block'
]);
function validateArena(c){
  for(const k of ['x','z','base','width','depth','height','bandHeight'])if(!Number.isInteger(c[k]))throw Error(k+' must be integer');
  if(c.width<6||c.width>40||c.depth<6||c.depth>40)throw Error('Tower interior requires 6–40 block sides');
  if(c.height<2||c.height>300||c.base < -62||c.base+c.height+2>319)throw Error('Tower outside standard Minecraft vertical build limit');
  if(c.bandHeight<2||c.height%c.bandHeight!==0)throw Error('Height must divide evenly into 15-block material bands');
}
function materialForHeight(h,b=15){return MATERIALS[Math.floor(h/b)%MATERIALS.length]}
function makePlan(c){
  validateArena(c);
  const result=[];let last=null;let lastZ=null;
  for(let h=0;h<c.height;h++){
    const band=Math.floor(h/c.bandHeight), t=h%c.bandHeight;
    const boundary=(band%2===0?0:c.depth-1);
    const toward=(boundary===0?1:-1);
    let z;
    if(h===0)z=boundary;
    else if(t===0)z=lastZ+toward;
    else z=lastZ===boundary?boundary+toward:boundary;
    // At the end of each material band, broaden to a long painted platform.
    const rows=t===c.bandHeight-1?
      Array.from({length: c.depth},(_,i)=>z+i*toward).filter(v=>v>=0&&v<c.depth):[z];
    for(const rz of rows){
      const forward=!last||last.x===c.x;
      for(let j=0;j<c.width;j++){
        const rx=c.x+(forward?j:c.width-1-j);
        const p={x:rx,y:c.base+h,z:c.z+rz,h,band,material:materialForHeight(h,c.bandHeight),landing:t===c.bandHeight-1};
        if(last){
          const dx=Math.abs(p.x-last.x),dz=Math.abs(p.z-last.z),dy=p.y-last.y;
          if(dx+dz!==1 || dy<0 || dy>1)throw Error(`Non-walkable plan transition at ${result.length}: ${JSON.stringify(last)} -> ${JSON.stringify(p)}`);
        }
        result.push(p);last=p;
      }
      lastZ=rz;
    }
  }
  return result;
}
function glassWallCommands(c,lo,hi){const {x,z,width:w,depth:d}=c;return [
`fill ${x-1} ${lo} ${z-1} ${x-1} ${hi} ${z+d} minecraft:glass`,
`fill ${x+w} ${lo} ${z-1} ${x+w} ${hi} ${z+d} minecraft:glass`,
`fill ${x-1} ${lo} ${z-1} ${x+w} ${hi} ${z-1} minecraft:glass`,
`fill ${x-1} ${lo} ${z+d} ${x+w} ${hi} ${z+d} minecraft:glass`];}
function buildArenaCommands(c,reset){validateArena(c);const {x,z,base,width:w,depth:d,height:h}=c;const commands=[];
// Shell before cleanup, all fill commands under Minecraft's fill volume cap.
const top=base+h+1;
for(let from=base;from<=top;from+=16){const to=Math.min(top,from+15);
commands.push(`fill ${x-2} ${from} ${z-2} ${x-2} ${to} ${z+d+1} minecraft:barrier`);
commands.push(`fill ${x+w+1} ${from} ${z-2} ${x+w+1} ${to} ${z+d+1} minecraft:barrier`);
commands.push(`fill ${x-2} ${from} ${z-2} ${x+w+1} ${to} ${z-2} minecraft:barrier`);
commands.push(`fill ${x-2} ${from} ${z+d+1} ${x+w+1} ${to} ${z+d+1} minecraft:barrier`);
commands.push(...glassWallCommands(c,from,to));}
commands.push(`fill ${x-2} ${base-1} ${z-2} ${x+w+1} ${base-1} ${z+d+1} minecraft:obsidian`);
commands.push(`fill ${x-1} ${base+h+2} ${z-1} ${x+w} ${base+h+2} ${z+d} minecraft:glass`);
if(reset){for(let top=h-1;top>=0;top-=24){let lo=Math.max(0,top-23);commands.push(`fill ${x} ${base+lo} ${z} ${x+w-1} ${base+top} ${z+d-1} minecraft:air`);}}
return commands;}
module.exports={MATERIALS,validateArena,materialForHeight,makePlan,buildArenaCommands,glassWallCommands};
