'use strict';
// Minecraft Java overworld blocks occupy Y=-64...319.
// 25x20 refers to the FREE INNER SPACE, not the glass walls.
const MATERIALS = Object.freeze([
  'minecraft:oak_planks',
  'minecraft:stone_bricks',
  'minecraft:sandstone',
  'minecraft:bricks',
  'minecraft:red_concrete',
  'minecraft:orange_concrete',
  'minecraft:yellow_concrete',
  'minecraft:lime_concrete',
  'minecraft:green_concrete',
  'minecraft:cyan_concrete',
  'minecraft:light_blue_concrete',
  'minecraft:blue_concrete',
  'minecraft:purple_concrete',
  'minecraft:magenta_concrete',
  'minecraft:pink_concrete',
  'minecraft:quartz_block',
  'minecraft:prismarine_bricks',
  'minecraft:deepslate_bricks',
  'minecraft:gold_block',
  'minecraft:diamond_block'
]);
function validateArena(cfg) {
  if (!Number.isInteger(cfg.x) || !Number.isInteger(cfg.z) || !Number.isInteger(cfg.base)) throw new Error('X/Z/TOWER_Y must be integers');
  if (!Number.isInteger(cfg.width) || cfg.width < 4 || cfg.width > 80) throw new Error('TOWER_WIDTH must be 4..80');
  if (!Number.isInteger(cfg.depth) || cfg.depth < 4 || cfg.depth > 80) throw new Error('TOWER_DEPTH must be 4..80');
  if (!Number.isInteger(cfg.height) || cfg.height < 2 || cfg.height > 350) throw new Error('TOWER_HEIGHT must be 2..350');
  if (cfg.base < -62 || cfg.base + cfg.height + 2 > 319) {
    throw new Error(`Arena Y=${cfg.base}, height=${cfg.height}: the roof would exceed Minecraft's vanilla Y=319 block limit. For a 300-block arena set TOWER_Y=0.`);
  }
}
function rowForHeight(height, depth) {
  const period = 2 * (depth - 1);
  const t = height % period;
  return t < depth ? t : period - t;
}
function routeAt(index, cfg) {
  if (!Number.isInteger(index) || index < 0 || index >= cfg.width * cfg.height) throw new RangeError('route index out of range');
  const h = Math.floor(index / cfg.width);
  const col = index % cfg.width;
  const dx = h % 2 === 0 ? col : cfg.width - 1 - col;
  const dz = rowForHeight(h, cfg.depth);
  return {x: cfg.x + dx, y: cfg.base + h, z: cfg.z + dz, h, material: materialForHeight(h, cfg.bandHeight)};
}
function materialForHeight(height, bandHeight=15) {
  return MATERIALS[Math.floor(height / bandHeight) % MATERIALS.length];
}
function buildArenaCommands(cfg, reset) {
  validateArena(cfg);
  const {x,z,base,width:w,depth:d,height:h} = cfg;
  const commands = [];
  // Air removes natural terrain and old construction ONLY WHEN RESET EXPLICITLY ENABLED.
  // Chunk height limits volume to 25x20x24=12,000 (under the default 32768 limit).
  if (reset) {
    for (let from=0; from<h; from+=24) {
      const to=Math.min(h-1,from+23);
      commands.push(`fill ${x} ${base+from} ${z} ${x+w-1} ${base+to} ${z+d-1} minecraft:air`);
    }
  }
  // A simple opaque / blast-resistant shell OUTSIDE the visible glass enclosure.
  const lo=base,hi=base+h+1;
  commands.push(`fill ${x-2} ${lo} ${z-2} ${x-2} ${hi} ${z+d+1} minecraft:barrier`);
  commands.push(`fill ${x+w+1} ${lo} ${z-2} ${x+w+1} ${hi} ${z+d+1} minecraft:barrier`);
  commands.push(`fill ${x-2} ${lo} ${z-2} ${x+w+1} ${hi} ${z-2} minecraft:barrier`);
  commands.push(`fill ${x-2} ${lo} ${z+d+1} ${x+w+1} ${hi} ${z+d+1} minecraft:barrier`);
  commands.push(...glassWallCommands(cfg,lo,hi));
  commands.push(`fill ${x-2} ${base-1} ${z-2} ${x+w+1} ${base-1} ${z+d+1} minecraft:obsidian`);
  commands.push(`fill ${x-1} ${base+h+2} ${z-1} ${x+w} ${base+h+2} ${z+d} minecraft:glass`);
  return commands;
}
function glassWallCommands(cfg, bottom, top) {
  const {x,z,width:w,depth:d} = cfg;
  return [
    `fill ${x-1} ${bottom} ${z-1} ${x-1} ${top} ${z+d} minecraft:glass`,
    `fill ${x+w} ${bottom} ${z-1} ${x+w} ${top} ${z+d} minecraft:glass`,
    `fill ${x-1} ${bottom} ${z-1} ${x+w} ${top} ${z-1} minecraft:glass`,
    `fill ${x-1} ${bottom} ${z+d} ${x+w} ${top} ${z+d} minecraft:glass`
  ];
}
module.exports = { MATERIALS, validateArena, rowForHeight, routeAt, materialForHeight, buildArenaCommands, glassWallCommands };
