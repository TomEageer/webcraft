'use strict';
// ---------- 素材包：VoxeLibre（CC BY-SA）贴图/音效接入 ----------
// PACK_TEX / PACK_SND / PACK_MUSIC 由 tools/build_pack.py 生成（assets/pack_*.js）。
// 没有素材包时自动退回程序生成的纹理与合成音效。

const PACK_IMG = {};      // 名称 -> {w, h, data(Uint8ClampedArray)}
let PACK_READY = false;

// 本作纹理名 -> 素材包来源
//   字符串：直接用该图（取第一帧）
//   {src, tint, frame, anim, alpha}：染色/取第几帧/动画
//   {layers:[{src, crop:[x,y,w,h], dst:[x,y,w,h], tint}]}：多图合成
const PACK_MAP = {
  stone: 'default_stone', cobblestone: 'default_cobble', mossy_cobblestone: 'default_mossycobble', dirt: 'default_dirt',
  grass_top: 'mcl_core_grass_block_top',
  grass_side: { layers: [{ src: 'default_dirt' }, { src: 'mcl_core_grass_block_side_overlay', tint: [0.6, 0.8, 0.36] }] },
  snow: 'default_snow', grass_snow_side: 'mcl_core_grass_side_snowed', sand: 'default_sand', red_sand: 'mcl_core_red_sand',
  gravel: 'default_gravel', clay: 'default_clay', sandstone_top: 'mcl_core_sandstone_top', sandstone_side: 'mcl_core_sandstone_normal',
  sandstone_bottom: 'mcl_core_sandstone_bottom', bedrock: 'mcl_core_bedrock', obsidian: 'default_obsidian',
  deepslate: 'mcl_deepslate', deepslate_top: 'mcl_deepslate_top', cobbled_deepslate: 'mcl_cobbled_deepslate',
  water: { src: 'mcl_core_water_source_animation', tint: [0.42, 0.68, 1.45], alpha: 185, anim: 2 },
  lava: { src: 'mcl_core_lava_source_animation', anim: 2 },
  ice: { src: 'default_ice', alpha: 200 }, packed_ice: 'mcl_core_ice_packed', glass: 'default_glass',
  magma: { src: 'mcl_nether_magma', anim: 3 },
  oak_log: 'default_tree', oak_log_top: 'default_tree_top', oak_planks: 'default_wood',
  birch_log: 'mcl_core_log_birch', birch_log_top: 'mcl_core_log_birch_top', birch_planks: 'mcl_core_planks_birch',
  spruce_log: 'mcl_core_log_spruce', spruce_log_top: 'mcl_core_log_spruce_top', spruce_planks: 'mcl_core_planks_spruce',
  cherry_log: 'mcl_cherry_blossom_log', cherry_log_top: 'mcl_cherry_blossom_log_top', cherry_planks: 'mcl_cherry_blossom_planks',
  oak_leaves: 'default_leaves', birch_leaves: { src: 'default_leaves', tint: [0.5, 0.66, 0.34] },
  spruce_leaves: 'mcl_core_leaves_spruce', cherry_leaves: 'mcl_cherry_blossom_leaves',
  coal_ore: 'mcl_core_coal_ore', iron_ore: 'mcl_core_iron_ore', copper_ore: { layers: [{ src: 'default_stone' }, { src: 'mcl_copper_ore' }] }, gold_ore: 'mcl_core_gold_ore',
  redstone_ore: 'mcl_core_redstone_ore', lapis_ore: 'mcl_core_lapis_ore', diamond_ore: 'mcl_core_diamond_ore', emerald_ore: 'mcl_core_emerald_ore',
  deepslate_coal_ore: 'mcl_deepslate_coal_ore', deepslate_iron_ore: 'mcl_deepslate_iron_ore', deepslate_copper_ore: 'mcl_deepslate_copper_ore',
  deepslate_gold_ore: 'mcl_deepslate_gold_ore', deepslate_redstone_ore: 'mcl_deepslate_redstone_ore', deepslate_lapis_ore: 'mcl_deepslate_lapis_ore',
  deepslate_diamond_ore: 'mcl_deepslate_diamond_ore', deepslate_emerald_ore: 'mcl_deepslate_emerald_ore',
  iron_block: 'default_steel_block', gold_block: 'default_gold_block', diamond_block: 'default_diamond_block', copper_block: 'mcl_copper_block',
  emerald_block: 'mcl_core_emerald_block', coal_block: 'default_coal_block', redstone_block: 'redstone_redstone_block', lapis_block: 'mcl_core_lapis_block',
  crafting_table_top: 'crafting_workbench_top', crafting_table_side: 'crafting_workbench_side', crafting_table_front: 'crafting_workbench_front',
  furnace_side: 'default_furnace_side', furnace_top: 'default_furnace_top', furnace_front: 'default_furnace_front', furnace_front_lit: 'default_furnace_front_active',
  chest_top: { layers: [{ fill: [60, 40, 18] }, { src: 'mcl_chests_normal', crop: [14, 0, 14, 14], dst: [1, 1, 14, 14] }] },
  chest_front: { layers: [{ fill: [60, 40, 18] }, { src: 'mcl_chests_normal', crop: [14, 14, 14, 5], dst: [1, 1, 14, 5] }, { src: 'mcl_chests_normal', crop: [14, 33, 14, 10], dst: [1, 6, 14, 9] }, { src: 'mcl_chests_normal', crop: [1, 1, 2, 4], dst: [7, 4, 2, 4] }] },
  chest_side: { layers: [{ fill: [60, 40, 18] }, { src: 'mcl_chests_normal', crop: [0, 14, 14, 5], dst: [1, 1, 14, 5] }, { src: 'mcl_chests_normal', crop: [0, 33, 14, 10], dst: [1, 6, 14, 9] }] },
  tnt_side: 'default_tnt_side', tnt_top: 'default_tnt_top', tnt_bottom: 'default_tnt_bottom',
  bookshelf: 'default_bookshelf', bricks: 'default_brick', stone_bricks: 'default_stone_brick', mossy_stone_bricks: 'mcl_core_stonebrick_mossy',
  glowstone: 'mcl_nether_glowstone', pumpkin_side: 'farming_pumpkin_side', pumpkin_top: 'farming_pumpkin_top',
  melon_side: 'farming_melon_side', melon_top: 'farming_melon_top', hay_side: 'mcl_farming_hayblock_side', hay_top: 'mcl_farming_hayblock_top',
  farmland: 'mcl_farming_farmland_dry', terracotta: 'hardened_clay',
  white_wool: 'wool_white', orange_wool: 'wool_orange', magenta_wool: 'wool_magenta', yellow_wool: 'wool_yellow', pink_wool: 'wool_pink',
  gray_wool: 'wool_dark_grey', light_gray_wool: 'wool_grey', cyan_wool: 'wool_cyan', purple_wool: 'wool_violet', blue_wool: 'wool_blue',
  brown_wool: 'wool_brown', green_wool: 'wool_dark_green', red_wool: 'wool_red', black_wool: 'wool_black',
  short_grass: 'mcl_flowers_tallgrass', fern: 'mcl_flowers_fern', dandelion: 'flowers_dandelion_yellow', poppy: 'mcl_flowers_poppy',
  cornflower: 'mcl_flowers_cornflower', allium: 'mcl_flowers_allium', orange_tulip: 'flowers_tulip', oxeye_daisy: 'mcl_flowers_oxeye_daisy',
  dead_bush: 'default_dry_shrub', oak_sapling: 'default_sapling', birch_sapling: 'mcl_core_sapling_birch', spruce_sapling: 'mcl_core_sapling_spruce',
  cherry_sapling: 'mcl_cherry_blossom_sapling', red_mushroom: 'farming_mushroom_red', brown_mushroom: 'farming_mushroom_brown',
  sugar_cane: { src: 'mcl_core_papyrus', tint: [0.6, 0.86, 0.42] }, cactus_side: 'mcl_core_cactus_side', cactus_top: 'mcl_core_cactus_top',
  wheat_0: 'mcl_farming_wheat_stage_1', wheat_1: 'mcl_farming_wheat_stage_3', wheat_2: 'mcl_farming_wheat_stage_5', wheat_3: 'mcl_farming_wheat_stage_7',
  torch: 'default_torch_on_floor',
};
for (let i = 0; i < 10; i++) PACK_MAP['destroy_' + i] = { src: 'crack_anylength', frame: i };
// 素材包里只有“叠加层”的贴图：合成到底图上（键为素材包贴图名，方块直接引用该名字时生效）
PACK_MAP.mcl_core_crying_obsidian = { layers: [{ src: 'default_obsidian' }, { src: 'mcl_core_crying_obsidian' }] };
PACK_MAP.mcl_copper_ore = { layers: [{ src: 'default_stone' }, { src: 'mcl_copper_ore' }] };

// 物品图标 -> 素材包贴图
const ICON_MAP = {
  stick: 'default_stick', coal: 'default_coal_lump', charcoal: 'mcl_core_charcoal', raw_iron: 'mcl_raw_ores_raw_iron', raw_gold: 'mcl_raw_ores_raw_gold',
  raw_copper: 'mcl_copper_raw', iron_ingot: 'default_steel_ingot', gold_ingot: 'default_gold_ingot', copper_ingot: 'mcl_copper_ingot',
  diamond: 'default_diamond', emerald: 'mcl_core_emerald', redstone: 'redstone_redstone_dust', lapis_lazuli: 'mcl_core_lapis', flint: 'default_flint',
  clay_ball: 'default_clay_lump', brick: 'default_clay_brick', glowstone_dust: 'mcl_nether_glowstone_dust', book: 'default_book', paper: 'default_paper',
  string: 'mcl_mobitems_string', feather: 'mcl_mobitems_feather', leather: 'mcl_mobitems_leather', gunpowder: 'default_gunpowder',
  bone: 'mcl_mobitems_bone', bone_meal: 'mcl_dye_white', slime_ball: 'mcl_mobitems_slimeball', wheat: 'farming_wheat_harvested',
  wheat_seeds: 'mcl_farming_wheat_seeds', arrow: 'mcl_bows_arrow_inv', apple: 'default_apple', bread: 'farming_bread', melon_slice: 'farming_melon',
  porkchop: 'mcl_mobitems_porkchop_raw', cooked_porkchop: 'mcl_mobitems_porkchop_cooked', beef: 'mcl_mobitems_beef_raw', cooked_beef: 'mcl_mobitems_beef_cooked',
  chicken: 'mcl_mobitems_chicken_raw', cooked_chicken: 'mcl_mobitems_chicken_cooked', mutton: 'mcl_mobitems_mutton_raw', cooked_mutton: 'mcl_mobitems_mutton_cooked',
  rotten_flesh: 'mcl_mobitems_rotten_flesh', mushroom_stew: 'farming_mushroom_stew', bucket: 'mcl_buckets_bucket', water_bucket: 'mcl_buckets_water_bucket',
  lava_bucket: 'mcl_buckets_lava_bucket', flint_and_steel: 'mcl_fire_flint_and_steel', shears: 'default_tool_shears', bow: 'mcl_bows_bow',
  red_bed: 'mcl_beds_bed_red_inv', torch: 'default_torch_on_floor', sugar_cane: 'mcl_core_reeds',
};
{
  const t = { wooden: 'wood', stone: 'stone', iron: 'steel', golden: 'gold', diamond: 'diamond' };
  const k = { pickaxe: 'pick', axe: 'axe', shovel: 'shovel', sword: 'sword' };
  for (const a in t) { for (const b in k) ICON_MAP[a + '_' + b] = 'default_tool_' + t[a] + k[b]; ICON_MAP[a + '_hoe'] = 'farming_tool_' + t[a] + 'hoe'; }
  const eggs = { pig: 'pig', cow: 'cow', sheep: 'sheep', chicken: 'chicken', zombie: 'zombie', skeleton: 'skeleton', spider: 'spider' };
  for (const m in eggs) ICON_MAP[m + '_spawn_egg'] = 'mobs_mc_spawn_icon_' + eggs[m];
}

function hasPack() { return typeof window.PACK_TEX === 'object' && window.PACK_TEX !== null; }

// 原版素材覆盖包（tools/build_vanilla.py 从本机客户端生成，assets/vanilla/）：同名键覆盖 VoxeLibre
const VANILLA = typeof window.VANILLA_TEX === 'object' && window.VANILLA_TEX !== null;
function vanillaHas(n) { return VANILLA && !!window.VANILLA_TEX[n]; }
function applyVanillaPack() {
  if (!VANILLA || !hasPack()) return;
  Object.assign(window.PACK_TEX, window.VANILLA_TEX);
  if (window.VANILLA_MUSIC && window.VANILLA_MUSIC.length) window.PACK_MUSIC = window.VANILLA_MUSIC;
  // 原版甘蔗本身就是绿色，不再额外染色
  if (vanillaHas('mcl_core_papyrus')) PACK_MAP.sugar_cane = 'mcl_core_papyrus';
}

async function loadPackImages(onProgress) {
  if (!hasPack()) return;
  applyVanillaPack();
  const names = Object.keys(window.PACK_TEX);
  const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
  let done = 0;
  const decode = (n) => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      cv.width = img.width; cv.height = img.height; ctx.clearRect(0, 0, img.width, img.height); ctx.drawImage(img, 0, 0);
      PACK_IMG[n] = { w: img.width, h: img.height, data: ctx.getImageData(0, 0, img.width, img.height).data };
      res();
    };
    img.onerror = () => res();
    img.src = window.PACK_TEX[n];
  });
  for (let i = 0; i < names.length; i += 64) {
    // 逐个解码，避免同一张 canvas 被并发改写
    for (const n of names.slice(i, i + 64)) await decode(n);
    done += Math.min(64, names.length - i);
    if (onProgress) onProgress(done / names.length);
  }
  packOverrides();
  PACK_READY = true;
}

// VoxeLibre 的末影之眼/珍珠/末地传送门框架与原版配色差异很大（红色、灰褐色），这里按原版风格重绘覆盖
function packOverrides() {
  const mk = (fn) => {
    const d = new Uint8ClampedArray(TS * TS * 4), r = mulberry32(7);
    fn((x, y, c, a) => { if (x < 0 || y < 0 || x >= TS || y >= TS) return; const i = (y * TS + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a === undefined ? 255 : a; }, r);
    return { w: TS, h: TS, data: d };
  };
  const sh = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
  const endStone = PACK_IMG.mcl_end_end_stone;
  const stonePx = (x, y, k) => endStone ? sh([endStone.data[(y * endStone.w + x) * 4], endStone.data[(y * endStone.w + x) * 4 + 1], endStone.data[(y * endStone.w + x) * 4 + 2]], k) : sh([219, 222, 158], k);
  // 基岩：原版是黑/深灰/浅灰高对比的不规则色块，VoxeLibre 的偏褐色像普通石头
  if (!vanillaHas('mcl_core_bedrock')) PACK_IMG.mcl_core_bedrock = mk((set, r) => {
    const tones = [[38, 38, 38], [62, 62, 62], [88, 88, 88], [122, 122, 122], [150, 150, 150]];
    const pts = []; for (let i = 0; i < 22; i++) pts.push([r() * 16, r() * 16, Math.floor(r() * tones.length)]);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let best = 1e9, t = 0;
      for (const [px, py, k] of pts) for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
        const d = (x + 0.5 - px - ox) ** 2 + (y + 0.5 - py - oy) ** 2; if (d < best) { best = d; t = k; }
      }
      set(x, y, sh(tones[t], 0.9 + r() * 0.2));
    }
  });
  // 末影之眼：青绿色眼球，黄绿虹膜，深色竖瞳
  if (!vanillaHas('mcl_end_ender_eye')) PACK_IMG.mcl_end_ender_eye = mk((set, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d > 6.3) continue;
      let c = d > 5.4 ? [16, 56, 46] : d > 3.6 ? sh([46, 132, 104], 0.85 + 0.25 * (-dx - dy) / 8 + r() * 0.12) : [150, 206, 92];
      if (d <= 3.6 && d > 2.6) c = [96, 170, 84];
      if (Math.abs(dx) < 1 && Math.abs(dy) < 2.6) c = [12, 30, 22];
      set(x, y, c);
    }
    set(5, 4, [200, 245, 210]); set(4, 5, [150, 220, 180]);
  });
  // 末影珍珠：深青色球体，中心偏亮
  if (!vanillaHas('mcl_throwing_ender_pearl')) PACK_IMG.mcl_throwing_ender_pearl = mk((set, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d > 5.8) continue;
      const c = d > 4.9 ? [8, 44, 40] : d < 2.2 ? [44, 150, 130] : [20, 92, 82];
      set(x, y, sh(c, 0.9 + r() * 0.2));
    }
    set(6, 5, [120, 220, 196]); set(5, 6, [70, 180, 160]);
  });
  // 框架顶面：青绿色石面，中间凹槽
  if (!vanillaHas('mcl_portals_endframe_top')) PACK_IMG.mcl_portals_endframe_top = mk((set, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const e = Math.min(x, y, 15 - x, 15 - y);
      let c = e === 0 ? [30, 70, 60] : [52, 112, 94];
      if (e >= 4) c = e === 4 ? [26, 62, 54] : [20, 46, 42];
      else if (e === 3) c = [70, 140, 116];
      set(x, y, sh(c, 0.88 + r() * 0.24));
    }
  });
  // 框架侧面：下部末地石，上沿青绿色镶边（方块高 13/16，侧面贴图从第 3 行开始显示）
  if (!vanillaHas('mcl_portals_endframe_side')) PACK_IMG.mcl_portals_endframe_side = mk((set, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c;
      if (y <= 5) c = sh(y === 5 ? [30, 70, 60] : [52, 112, 94], 0.88 + r() * 0.24);
      else c = stonePx(x, y, y === 6 ? 0.75 : 0.95);
      if (y >= 7 && y <= 13 && (x === 3 || x === 12) && y % 2) c = sh(c, 0.85);
      set(x, y, c);
    }
  });
  if (!vanillaHas('mcl_portals_endframe_bottom')) PACK_IMG.mcl_portals_endframe_bottom = mk(set => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) set(x, y, stonePx(x, y, 0.85)); });
  // 嵌入的末影之眼（顶面用 4..12 区域，侧面用 0..3 行）
  if (!vanillaHas('mcl_portals_endframe_eye')) PACK_IMG.mcl_portals_endframe_eye = mk((set, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = sh([38, 120, 94], 0.85 + r() * 0.3);
      if (y >= 4 && y < 12 && x >= 4 && x < 12) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        c = d > 3.3 ? [30, 96, 76] : d > 1.6 ? [140, 200, 90] : [12, 30, 22];
      }
      set(x, y, c);
    }
  });
}

// 从素材图截取一个 16x16 帧（大图按比例缩放到 16）
function packFrame(name, frame) {
  const im = PACK_IMG[name]; if (!im) return null;
  const out = new Uint8ClampedArray(TS * TS * 4);
  const fs = im.w, frames = Math.max(1, Math.floor(im.h / fs)), f = Math.min(frame || 0, frames - 1);
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const sx = Math.floor(x * fs / TS), sy = f * fs + Math.floor(y * fs / TS);
    const si = (sy * im.w + sx) * 4, di = (y * TS + x) * 4;
    out[di] = im.data[si]; out[di + 1] = im.data[si + 1]; out[di + 2] = im.data[si + 2]; out[di + 3] = im.data[si + 3];
  }
  return out;
}
function packFrameCount(name) { const im = PACK_IMG[name]; return im ? Math.max(1, Math.floor(im.h / im.w)) : 0; }
function tintPix(d, t, alpha) {
  for (let i = 0; i < d.length; i += 4) {
    if (t) { d[i] = Math.min(255, d[i] * t[0]); d[i + 1] = Math.min(255, d[i + 1] * t[1]); d[i + 2] = Math.min(255, d[i + 2] * t[2]); }
    if (alpha !== undefined && d[i + 3] > 0) d[i + 3] = alpha;
  }
  return d;
}
function cropPix(name, crop, dst, tint, base) {
  const im = PACK_IMG[name]; if (!im) return base;
  const [cx, cy, cw, ch] = crop || [0, 0, im.w, Math.min(im.w, im.h)];
  const [dx, dy, dw, dh] = dst || [0, 0, TS, TS];
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const sx = cx + Math.floor(x * cw / dw), sy = cy + Math.floor(y * ch / dh);
    const si = (sy * im.w + sx) * 4, di = ((dy + y) * TS + dx + x) * 4;
    const a = im.data[si + 3] / 255; if (a <= 0) continue;
    for (let k = 0; k < 3; k++) { const v = im.data[si + k] * (tint ? tint[k] : 1); base[di + k] = Math.min(255, base[di + k] * (1 - a) + v * a); }
    base[di + 3] = Math.max(base[di + 3], im.data[si + 3]);
  }
  return base;
}

// 解析一个映射规格，返回 {frames:[Uint8ClampedArray...], speed}
function resolvePackSpec(spec) {
  if (!PACK_READY || !spec) return null;
  if (typeof spec === 'string') spec = { src: spec };
  if (spec.layers) {
    const base = new Uint8ClampedArray(TS * TS * 4);
    for (const l of spec.layers) {
      if (l.fill) { for (let i = 0; i < base.length; i += 4) { base[i] = l.fill[0]; base[i + 1] = l.fill[1]; base[i + 2] = l.fill[2]; base[i + 3] = 255; } continue; }
      if (!PACK_IMG[l.src]) return null;
      if (!l.crop && !l.dst) { const fr = packFrame(l.src, 0); const tmp = new Uint8ClampedArray(TS * TS * 4); tmp.set(fr); if (l.tint) tintPix(tmp, l.tint); for (let i = 0; i < tmp.length; i += 4) { const a = tmp[i + 3] / 255; if (!a) continue; for (let k = 0; k < 3; k++) base[i + k] = base[i + k] * (1 - a) + tmp[i + k] * a; base[i + 3] = Math.max(base[i + 3], tmp[i + 3]); } }
      else cropPix(l.src, l.crop, l.dst, l.tint, base);
    }
    return { frames: [base] };
  }
  if (!PACK_IMG[spec.src]) return null;
  const n = spec.anim ? packFrameCount(spec.src) : 1;
  const frames = [];
  for (let i = 0; i < n; i++) frames.push(tintPix(packFrame(spec.src, spec.frame !== undefined ? spec.frame : i), spec.tint, spec.alpha));
  return { frames, speed: spec.anim || 0 };
}

// ---------------- 音效 ----------------
// 事件名 -> 素材包音效键（可多个候选，随机挑一个变体）
const SND_MAP = {
  'dig.stone': 'default_dig_cracky', 'dig.wood': 'default_dig_choppy', 'dig.grass': 'default_grass_footstep', 'dig.dirt': 'default_dirt_footstep',
  'dig.sand': 'default_sand_footstep', 'dig.gravel': 'default_gravel_dig', 'dig.glass': 'default_break_glass', 'dig.wool': 'mcl_sounds_cloth',
  'dig.snow': 'pedology_snow_soft_footstep', 'dig.metal': 'default_dig_metal', 'dig.ice': 'default_ice_dig',
  'step.stone': 'default_hard_footstep', 'step.wood': 'default_wood_footstep', 'step.grass': 'default_grass_footstep', 'step.dirt': 'default_dirt_footstep',
  'step.sand': 'default_sand_footstep', 'step.gravel': 'default_gravel_footstep', 'step.glass': 'default_glass_footstep', 'step.wool': 'mcl_sounds_cloth',
  'step.snow': 'pedology_snow_soft_footstep', 'step.metal': 'default_metal_footstep', 'step.ice': 'default_ice_footstep', 'step.water': 'default_water_footstep',
  'place': 'default_place_node', 'place.stone': 'default_place_node_hard', 'place.metal': 'default_place_node_metal',
  hurt: 'player_damage', drink: 'mobs_mc_animal_eat_generic', fall: 'player_falling_damage', explode: 'tnt_explode', fuse: 'tnt_ignite', pop: 'item_drop_pickup',
  xp: 'mcl_experience', levelup: 'mcl_experience_level_up', eat: 'mobs_mc_animal_eat_generic', bow: 'mcl_bows_bow_shoot',
  arrow_hit: 'mcl_bows_hit_other', bucket: 'mcl_sounds_dug_water', bucket_lava: 'default_place_node_lava', fizz: 'default_cool_lava',
  chest: 'default_chest_open', chest_close: 'default_chest_close', door: 'doors_door_open', door_close: 'doors_door_close',
  shear: 'mcl_tools_shears_cut', break_tool: 'default_tool_breaks', flint: 'fire_flint_and_steel', splash: 'watersplash',
  rain: 'weather_rain', thunder: 'lightning_thunder', portal: 'mcl_portals_teleport', enchant: 'mcl_enchanting_enchant',
  brew: 'mcl_brewing_complete', piston_out: 'piston_extend', piston_in: 'piston_retract', button: 'mesecons_button_push',
  armor: 'mcl_armor_equip_leather', fire: 'fire_fire', end_portal: 'mcl_portals_open_end_portal', cave: ['cave1', 'cave2', 'cave3', 'cave4', 'cave5'],
  'pig.say': 'mobs_pig', 'pig.hurt': 'mobs_pig_angry', 'cow.say': 'mobs_mc_cow', 'cow.hurt': 'mobs_mc_cow_hurt',
  'sheep.say': 'mobs_mc_sheep_random', 'sheep.hurt': 'mobs_mc_sheep_damage', 'chicken.say': 'mobs_mc_chicken_buck', 'chicken.hurt': 'mobs_mc_chicken_hurt',
  'zombie.say': 'mobs_mc_zombie_growl', 'zombie.hurt': 'mobs_mc_zombie_hurt', 'zombie.death': 'mobs_mc_zombie_death',
  'skeleton.say': 'mobs_mc_skeleton_random', 'skeleton.hurt': 'mobs_mc_skeleton_hurt', 'skeleton.death': 'mobs_mc_skeleton_death',
  'spider.say': 'mobs_mc_spider_random', 'spider.hurt': 'mobs_mc_spider_hurt', 'spider.death': 'mobs_mc_spider_death',
  'creeper.hurt': 'mobs_mc_creeper_hurt', 'creeper.death': 'mobs_mc_creeper_death',
  'sulfur_cube.hurt': 'green_slime_damage', 'sulfur_cube.death': 'green_slime_death', 'sulfur_cube.jump': 'green_slime_jump',
  'fox.hurt': 'mobs_mc_rabbit_hurt', 'creaking.say': 'default_dig_choppy', 'creaking.hurt': 'default_dig_choppy',
  'villager.say': 'mobs_mc_villager', 'villager.hurt': 'mobs_mc_villager_hurt', 'villager.trade': 'mobs_mc_villager_trade', 'villager.yes': 'mobs_mc_villager_accept',
  'enderman.say': 'mobs_mc_enderman_random', 'enderman.hurt': 'mobs_mc_enderman_hurt', 'enderman.death': 'mobs_mc_enderman_death', 'enderman.tp': 'mobs_mc_enderman_teleport_src',
  'iron_golem.hurt': 'mobs_mc_iron_golem_clank_damage', 'iron_golem.death': 'mobs_mc_iron_golem_death',
  'wolf.say': 'mobs_mc_wolf_bark', 'wolf.hurt': 'mobs_mc_wolf_hurt', 'zombified_piglin.say': 'mobs_mc_zombiepig_random', 'zombified_piglin.hurt': 'mobs_mc_zombiepig_hurt',
  'blaze.say': 'vl_elemental_fire_breath', 'blaze.hurt': 'vl_elemental_fire_hurt', 'blaze.death': 'vl_elemental_fire_died',
  'magma_cube.hurt': 'mobs_mc_magma_cube_small', 'magma_cube.jump': 'mobs_mc_magma_cube_big', 'ghast.say': 'mobs_eerie', 'ghast.shoot': 'mobs_fireball',
  'dragon.say': 'mobs_mc_ender_dragon_attack', 'dragon.shoot': 'mobs_mc_ender_dragon_shoot', 'witch.say': 'vl_witch_laugh',
};
function packSound(event) {
  if (window.VANILLA_SND && window.VANILLA_SND[event]) return window.VANILLA_SND[event];
  if (!window.PACK_SND) return null;
  const key = SND_MAP[event] || event;
  if (Array.isArray(key)) { const all = []; for (const k of key) if (window.PACK_SND[k]) all.push(...window.PACK_SND[k]); return all.length ? all : null; }
  return window.PACK_SND[key] || null;
}

// 整张素材图 -> canvas / THREE 纹理（生物皮肤等用）
const PACK_CANVAS = new Map(), PACK_THREE = new Map();
function packCanvas(name) {
  if (PACK_CANVAS.has(name)) return PACK_CANVAS.get(name);
  const im = PACK_IMG[name]; if (!im) return null;
  const cv = document.createElement('canvas'); cv.width = im.w; cv.height = im.h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data), im.w, im.h), 0, 0);
  PACK_CANVAS.set(name, cv);
  return cv;
}
function packTexture(name) {
  if (PACK_THREE.has(name)) return PACK_THREE.get(name);
  const cv = packCanvas(name); if (!cv) return null;
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  PACK_THREE.set(name, t);
  return t;
}
