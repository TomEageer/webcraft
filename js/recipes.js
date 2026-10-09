'use strict';
// ---------- 合成与熔炼配方 ----------

const RECIPES = [];
const SMELT = {};

function tagMatch(tag, name) {
  if (!tag) return !name;
  if (!name) return false;
  if (tag[0] !== '#') return tag === name;
  const t = tag.slice(1);
  if (t === 'planks') return name.endsWith('_planks');
  if (t === 'log') return name.endsWith('_log');
  if (t === 'wool') return name.endsWith('_wool');
  if (t === 'stone_mat') return name === 'cobblestone' || name === 'cobbled_deepslate';
  if (t === 'coals') return name === 'coal' || name === 'charcoal';
  return false;
}

function shaped(pattern, key, out, n) { RECIPES.push({ type: 'shaped', pattern, key, out, n: n || 1 }); }
function shapeless(ings, out, n) { RECIPES.push({ type: 'shapeless', ings, out, n: n || 1 }); }

function initRecipes() {
  for (const w of ['oak', 'birch', 'spruce', 'cherry', 'pale_oak', 'poplar']) shapeless([w + '_log'], w + '_planks', 4);
  shaped(['P', 'P'], { P: '#planks' }, 'stick', 4);
  shaped(['PP', 'PP'], { P: '#planks' }, 'crafting_table');
  shaped(['CCC', 'C C', 'CCC'], { C: '#stone_mat' }, 'furnace');
  shaped(['PPP', 'P P', 'PPP'], { P: '#planks' }, 'chest');
  shaped(['C', 'S'], { C: '#coals', S: 'stick' }, 'torch', 4);
  const mats = { wooden: '#planks', stone: '#stone_mat', iron: 'iron_ingot', golden: 'gold_ingot', diamond: 'diamond' };
  for (const t in mats) {
    const X = mats[t];
    shaped(['XXX', ' S ', ' S '], { X, S: 'stick' }, t + '_pickaxe');
    shaped(['XX', 'XS', ' S'], { X, S: 'stick' }, t + '_axe');
    shaped(['X', 'S', 'S'], { X, S: 'stick' }, t + '_shovel');
    shaped(['XX', ' S', ' S'], { X, S: 'stick' }, t + '_hoe');
    shaped(['X', 'X', 'S'], { X, S: 'stick' }, t + '_sword');
  }
  shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt');
  shaped(['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' }, 'bookshelf');
  shapeless(['paper', 'paper', 'paper', 'leather'], 'book');
  shaped(['SSS'], { S: 'sugar_cane' }, 'paper', 3);
  shaped(['WWW'], { W: 'wheat' }, 'bread');
  shaped(['WWW', 'WWW', 'WWW'], { W: 'wheat' }, 'hay_block');
  shapeless(['hay_block'], 'wheat', 9);
  shaped(['BB', 'BB'], { B: 'brick' }, 'bricks');
  shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
  shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone');
  shapeless(['cobblestone', 'moss_block'], 'mossy_cobblestone');
  shapeless(['stone_bricks', 'moss_block'], 'mossy_stone_bricks');
  const blocks9 = { iron_block: 'iron_ingot', gold_block: 'gold_ingot', diamond_block: 'diamond', copper_block: 'copper_ingot', emerald_block: 'emerald', coal_block: 'coal', redstone_block: 'redstone', lapis_block: 'lapis_lazuli' };
  for (const b in blocks9) { shaped(['XXX', 'XXX', 'XXX'], { X: blocks9[b] }, b); shapeless([b], blocks9[b], 9); }
  shaped(['X X', ' X '], { X: 'iron_ingot' }, 'bucket');
  shapeless(['iron_ingot', 'flint'], 'flint_and_steel');
  shaped([' X', 'X '], { X: 'iron_ingot' }, 'shears');
  shaped(['WWW', 'PPP'], { W: '#wool', P: '#planks' }, 'red_bed');
  shaped(['WWW', 'PPP'], { W: 'wheat', P: '#planks' }, 'straw_bed');
  shapeless(['white_wool', 'white_wool', 'feather'], 'cushion', 2);
  const slabSrc = { oak: '#planks', stone: 'stone', cobblestone: 'cobblestone', stone_brick: 'stone_bricks', sulfur: 'sulfur', cinnabar: 'cinnabar', white_wool: 'white_wool', sandstone: 'sandstone' };
  for (const k in slabSrc) {
    shaped(['XXX'], { X: slabSrc[k] }, k + '_slab', 6);
    shaped(['X  ', 'XX ', 'XXX'], { X: slabSrc[k] }, k + '_stairs', 4);
  }
  shaped(['XX', 'XX'], { X: 'sulfur' }, 'polished_sulfur', 4);
  shaped(['XX', 'XX'], { X: 'polished_sulfur' }, 'sulfur_bricks', 4);
  shaped(['XX', 'XX'], { X: 'cinnabar' }, 'polished_cinnabar', 4);
  shaped(['XX', 'XX'], { X: 'polished_cinnabar' }, 'cinnabar_bricks', 4);
  shapeless(['red_mushroom', 'brown_mushroom'], 'mushroom_stew');
  shapeless(['shelf_mushroom', 'shelf_mushroom', 'brown_mushroom'], 'shelf_mushroom_stew');
  shapeless(['bone'], 'bone_meal', 3);
  shaped(['SS', 'SS'], { S: 'string' }, 'white_wool');
  shaped(['GG', 'GG'], { G: 'glowstone_dust' }, 'glowstone');
  shaped([' TS', 'T S', ' TS'], { T: 'stick', S: 'string' }, 'bow');
  shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);
  shaped([' S ', 'SCS', 'LLL'], { S: 'stick', C: '#coals', L: '#log' }, 'campfire');
  shaped(['CC', 'CC'], { C: 'clay_ball' }, 'clay');
  shaped(['MMM', 'MMM', 'MMM'], { M: 'melon_slice' }, 'melon');

  const s = (a, b) => { SMELT[a] = b; };
  s('cobblestone', 'stone'); s('cobbled_deepslate', 'deepslate'); s('sand', 'glass'); s('red_sand', 'glass');
  s('raw_iron', 'iron_ingot'); s('raw_gold', 'gold_ingot'); s('raw_copper', 'copper_ingot');
  s('iron_ore', 'iron_ingot'); s('gold_ore', 'gold_ingot'); s('copper_ore', 'copper_ingot');
  s('clay_ball', 'brick'); s('clay', 'terracotta');
  s('porkchop', 'cooked_porkchop'); s('beef', 'cooked_beef'); s('chicken', 'cooked_chicken'); s('mutton', 'cooked_mutton');
  for (const w of ['oak', 'birch', 'spruce', 'cherry', 'pale_oak', 'poplar']) s(w + '_log', 'charcoal');
  s('cactus', 'green_wool'); s('sulfur', 'polished_sulfur');
}

// grid: 名称数组（长度 w*w），返回 {out, n} 或 null
function matchRecipe(grid, w) {
  let minX = w, minY = w, maxX = -1, maxY = -1;
  const items = [];
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const v = grid[y * w + x];
    if (v) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); items.push(v); }
  }
  if (maxX < 0) return null;
  const gw = maxX - minX + 1, gh = maxY - minY + 1;
  const at = (x, y) => grid[(y + minY) * w + x + minX];
  for (const r of RECIPES) {
    if (r.type === 'shapeless') {
      if (r.ings.length !== items.length) continue;
      const left = items.slice();
      let ok = true;
      for (const ing of r.ings) {
        const i = left.findIndex(n => tagMatch(ing, n));
        if (i < 0) { ok = false; break; }
        left.splice(i, 1);
      }
      if (ok) return r;
    } else {
      const ph = r.pattern.length, pw = r.pattern[0].length;
      if (ph !== gh || pw !== gw) continue;
      for (const mirror of [false, true]) {
        let ok = true;
        for (let y = 0; y < ph && ok; y++) for (let x = 0; x < pw && ok; x++) {
          const ch = r.pattern[y][mirror ? pw - 1 - x : x];
          const tag = ch === ' ' ? null : r.key[ch];
          if (!tagMatch(tag, at(x, y))) ok = false;
        }
        if (ok) return r;
      }
    }
  }
  return null;
}

function fuelValue(name) {
  if (!name) return 0;
  const it = ITEMS[name];
  if (!it) return 0;
  if (it.fuel) return it.fuel;
  if (it.block !== undefined && BLOCKS[it.block].fuel) return BLOCKS[it.block].fuel;
  return 0;
}
