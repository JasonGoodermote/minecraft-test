'use strict';

function isEmptyBlock(b) {
  return !!b && ['air','cave_air','void_air'].includes(b.name);
}
function isLiquid(b) {
  return !!b && (b.name === 'water' || b.name === 'lava' || b.name === 'bubble_column');
}
function standingPosition(p) {return {x:p.x+.5, y:p.y+1, z:p.z+.5};}
function firstAnchor(p) {
  // Place the first block from the adjacent empty square, standing on the
  // obsidian foundation (at TOWER_Y - 1).
  return {x:p.x+.5, y:p.y, z:p.z+1.5};
}
function transitionSupport(previous, next) {
  if (!previous || next.y === previous.y) return null;
  if (next.y !== previous.y+1 ||
      Math.abs(next.x-previous.x)+Math.abs(next.z-previous.z) !== 1) {
    throw new Error('Only one-block-high adjacent rises are supported');
  }
  // The prior step touches this lower support horizontally; it can be placed
  // natively before the raised step, without flying or /setblock.
  return {x:next.x,y:next.y-1,z:next.z,material:previous.material};
}
function directionFaces() {
  return [{x:0,y:-1,z:0},{x:-1,y:0,z:0},{x:1,y:0,z:0},{x:0,y:0,z:-1},{x:0,y:0,z:1},{x:0,y:1,z:0}];
}
function candidateSupports(target, getBlock) {
  return directionFaces().map(face=>{
    const reference=getBlock({x:target.x+face.x,y:target.y+face.y,z:target.z+face.z});
    return reference && !isEmptyBlock(reference) && !isLiquid(reference)
      ? {reference, face:{x:-face.x,y:-face.y,z:-face.z}} : null;
  }).filter(Boolean);
}

function durationToWalk(distance, rising=false) {
  return Math.min(4300,Math.max(1800,1100+distance*1500+(rising?800:0)));
}
function isFeetInsideSolid(feet, getBlock) {
  const lower=getBlock({x:Math.floor(feet.x),y:Math.floor(feet.y),z:Math.floor(feet.z)});
  const upper=getBlock({x:Math.floor(feet.x),y:Math.floor(feet.y)+1,z:Math.floor(feet.z)});
  return [lower,upper].some(b=>b && !isEmptyBlock(b) && !isLiquid(b) && b.boundingBox === 'block');
}
module.exports={isEmptyBlock,isLiquid,standingPosition,firstAnchor,transitionSupport,candidateSupports,durationToWalk,isFeetInsideSolid};
