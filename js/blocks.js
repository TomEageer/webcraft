'use strict';
// ---------- 方块与物品注册表 ----------

const BLOCKS = [];   // id -> def
const B = {};        // name -> id
const ITEMS = {};    // name -> item def
const ITEM_ORDER = []; // 创造模式物品栏顺序

// 工具等级：0 空手 1 木 2 石 3 铁 4 钻石
function defBlock(name, zh, o) {
  const d = Object.assign({
    id: BLOCKS.length, name, zh,
    shape: 'cube', solid: true, opaque: true, render: 'opaque',
    hard: 1, tool: null, tier: 0, emit: 0, atten: 0, drop: name,
    tint: null, gravity: false, replaceable: false, blast: 3,
  }, o);
  if (d.shape === 'cross' || d.shape === 'torch') {
    if (o.solid === undefined) d.solid = false;
    d.opaque = false; d.render = 'cutout';
  }
  if (d.shape === 'slab' || d.shape === 'stairs') d.opaque = false;
  if (d.shape === 'liquid') { d.solid = false; d.opaque = false; d.render = 'blend'; d.replaceable = true; }
  if (typeof d.tex === 'string') d.tex = { all: d.tex };
  BLOCKS.push(d); B[name] = d.id;
  if (name !== 'air' && !o.noItem) defItem(name, zh, { block: d.id });
  return d;
}

function defItem(name, zh, o) {
  const it = Object.assign({ name, zh, stack: 64 }, o || {});
  if (it.tool || it.durability) it.stack = 1;
  ITEMS[name] = it; ITEM_ORDER.push(name);
  return it;
}

function texOf(def, face, meta) {
  // face: 0 +X,1 -X,2 +Y,3 -Y,4 +Z,5 -Z
  const t = def.tex;
  if (def.texFn) return def.texFn(face, meta);
  if (t.front) {
    const fdir = [4, 1, 5, 0][meta & 3];
    if (face === fdir) return TEX[t.front];
  }
  if (face === 2 && t.top) return TEX[t.top];
  if (face === 3 && (t.bottom || t.top)) return TEX[t.bottom || t.top];
  return TEX[t.side || t.all];
}

function initBlocks() {
  defBlock('air', '空气', { shape: 'air', solid: false, opaque: false, render: 'none', hard: 0, replaceable: true, drop: null });
  defBlock('stone', '石头', { tex: 'stone', hard: 1.5, tool: 'pickaxe', tier: 1, drop: 'cobblestone', blast: 6 });
  defBlock('grass_block', '草方块', { tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hard: 0.6, tool: 'shovel', drop: 'dirt', tint: 'grass' });
  defBlock('dirt', '泥土', { tex: 'dirt', hard: 0.5, tool: 'shovel' });
  defBlock('snowy_grass', '雪地草方块', { tex: { top: 'snow', bottom: 'dirt', side: 'grass_snow_side' }, hard: 0.6, tool: 'shovel', drop: 'dirt' });
  defBlock('cobblestone', '圆石', { tex: 'cobblestone', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('mossy_cobblestone', '苔石', { tex: 'mossy_cobblestone', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('bedrock', '基岩', { tex: 'bedrock', hard: -1, blast: 1e9, drop: null });
  defBlock('sand', '沙子', { tex: 'sand', hard: 0.5, tool: 'shovel', gravity: true });
  defBlock('red_sand', '红沙', { tex: 'red_sand', hard: 0.5, tool: 'shovel', gravity: true });
  defBlock('gravel', '沙砾', { tex: 'gravel', hard: 0.6, tool: 'shovel', gravity: true, drop: () => Math.random() < 0.1 ? ['flint', 1] : ['gravel', 1] });
  defBlock('clay', '黏土块', { tex: 'clay', hard: 0.6, tool: 'shovel', drop: () => ['clay_ball', 4] });
  defBlock('sandstone', '砂岩', { tex: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone_side' }, hard: 0.8, tool: 'pickaxe', tier: 1 });
  defBlock('water', '水', { shape: 'liquid', tex: 'water', hard: 100, atten: 2, drop: null, noItem: true });
  defBlock('lava', '熔岩', { shape: 'liquid', tex: 'lava', hard: 100, emit: 15, drop: null, noItem: true, render: 'opaqueLiquid' });
  BLOCKS[B.lava].render = 'opaque';
  defBlock('ice', '冰', { tex: 'ice', hard: 0.5, tool: 'pickaxe', opaque: false, render: 'blend', atten: 1, drop: null, slip: 0.98 });
  defBlock('packed_ice', '浮冰', { tex: 'packed_ice', hard: 0.5, tool: 'pickaxe', drop: null, slip: 0.98 });
  defBlock('snow_block', '雪块', { tex: 'snow', hard: 0.2, tool: 'shovel' });
  defBlock('obsidian', '黑曜石', { tex: 'obsidian', hard: 50, tool: 'pickaxe', tier: 4, blast: 1200 });
  defBlock('deepslate', '深板岩', { tex: { top: 'deepslate_top', side: 'deepslate' }, hard: 3, tool: 'pickaxe', tier: 1, drop: 'cobbled_deepslate', blast: 6 });
  defBlock('cobbled_deepslate', '深板岩圆石', { tex: 'cobbled_deepslate', hard: 3.5, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('magma_block', '岩浆块', { tex: 'magma', hard: 0.5, tool: 'pickaxe', tier: 1, emit: 3 });
  defBlock('glass', '玻璃', { tex: 'glass', hard: 0.3, opaque: false, render: 'cutout', drop: null });

  const woods = { oak: '橡木', birch: '白桦', spruce: '云杉', cherry: '樱花', pale_oak: '苍白橡木', poplar: '杨木' };
  for (const w in woods) {
    defBlock(w + '_log', woods[w] + '原木', { tex: { top: w + '_log_top', side: w + '_log' }, hard: 2, tool: 'axe', fuel: 300 });
    defBlock(w + '_planks', woods[w] + '木板', { tex: w + '_planks', hard: 2, tool: 'axe', fuel: 300 });
  }
  const leaf = (name, zh, tex, sap, extra) => defBlock(name, zh, Object.assign({
    tex, hard: 0.2, tool: 'hoe', opaque: false, render: 'cutout', atten: 1, leaves: true,
    drop: () => { const r = Math.random(); if (r < 0.05) return [sap, 1]; if (r < 0.07) return ['stick', 1]; if (name === 'oak_leaves' && r < 0.075) return ['apple', 1]; return null; },
  }, extra || {}));
  leaf('oak_leaves', '橡树树叶', 'oak_leaves', 'oak_sapling', { tint: 'foliage' });
  leaf('birch_leaves', '白桦树叶', 'birch_leaves', 'birch_sapling');
  leaf('spruce_leaves', '云杉树叶', 'spruce_leaves', 'spruce_sapling');
  leaf('cherry_leaves', '樱花树叶', 'cherry_leaves', 'cherry_sapling');
  leaf('pale_oak_leaves', '苍白橡树树叶', 'pale_oak_leaves', 'oak_sapling');
  leaf('poplar_leaves_red', '杨树树叶（红）', 'poplar_leaves_red', 'poplar_sapling');
  leaf('poplar_leaves_yellow', '杨树树叶（黄）', 'poplar_leaves_yellow', 'poplar_sapling');
  leaf('poplar_leaves_orange', '杨树树叶（橙）', 'poplar_leaves_orange', 'poplar_sapling');

  // 矿石
  const oreDrops = {
    coal: () => ['coal', 1], iron: () => ['raw_iron', 1], copper: () => ['raw_copper', 2 + Math.floor(Math.random() * 4)],
    gold: () => ['raw_gold', 1], redstone: () => ['redstone', 4 + Math.floor(Math.random() * 2)],
    lapis: () => ['lapis_lazuli', 4 + Math.floor(Math.random() * 5)], diamond: () => ['diamond', 1], emerald: () => ['emerald', 1],
  };
  const oreTier = { coal: 1, iron: 2, copper: 2, gold: 3, redstone: 3, lapis: 2, diamond: 3, emerald: 3 };
  const oreXp = { coal: 1, redstone: 2, lapis: 3, diamond: 5, emerald: 5 };
  const oreZh = { coal: '煤矿石', iron: '铁矿石', copper: '铜矿石', gold: '金矿石', redstone: '红石矿石', lapis: '青金石矿石', diamond: '钻石矿石', emerald: '绿宝石矿石' };
  for (const k in oreDrops) {
    defBlock(k + '_ore', oreZh[k], { tex: k + '_ore', hard: 3, tool: 'pickaxe', tier: oreTier[k], drop: oreDrops[k], xp: oreXp[k] || 0, emit: k === 'redstone' ? 0 : 0 });
    defBlock('deepslate_' + k + '_ore', '深层' + oreZh[k], { tex: 'deepslate_' + k + '_ore', hard: 4.5, tool: 'pickaxe', tier: oreTier[k], drop: oreDrops[k], xp: oreXp[k] || 0 });
  }
  const metalZh = { iron_block: '铁块', gold_block: '金块', diamond_block: '钻石块', copper_block: '铜块', emerald_block: '绿宝石块', coal_block: '煤炭块', redstone_block: '红石块', lapis_block: '青金石块' };
  for (const k in metalZh) defBlock(k, metalZh[k], { tex: k, hard: 5, tool: 'pickaxe', tier: k === 'diamond_block' || k === 'gold_block' || k === 'emerald_block' ? 3 : 2, blast: 6, fuel: k === 'coal_block' ? 16000 : 0, emit: 0 });

  defBlock('crafting_table', '工作台', { tex: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front' }, hard: 2.5, tool: 'axe', interact: 'crafting', fuel: 300 });
  defBlock('furnace', '熔炉', { tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hard: 3.5, tool: 'pickaxe', tier: 1, interact: 'furnace' });
  defBlock('lit_furnace', '燃烧中的熔炉', { tex: { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, hard: 3.5, tool: 'pickaxe', tier: 1, interact: 'furnace', emit: 13, drop: 'furnace', noItem: true });
  // 原版箱子是 14x14x14 的方块实体模型（feat_models.js 渲染、开合动画）；这里的盒子只用于碰撞与选中框
  defBlock('chest', '箱子', { tex: { top: 'chest_top', side: 'chest_side', front: 'chest_front' }, hard: 2.5, tool: 'axe', interact: 'chest', fuel: 300,
    shape: 'boxes', opaque: false, be: 'chest', boxes: () => [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]] });
  defBlock('tnt', 'TNT', { tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hard: 0, interact: 'tnt' });
  defBlock('bookshelf', '书架', { tex: { top: 'oak_planks', side: 'bookshelf' }, hard: 1.5, tool: 'axe', drop: () => ['book', 3], fuel: 300 });
  defBlock('bricks', '红砖块', { tex: 'bricks', hard: 2, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('stone_bricks', '石砖', { tex: 'stone_bricks', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('mossy_stone_bricks', '苔石砖', { tex: 'mossy_stone_bricks', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  defBlock('glowstone', '荧石', { tex: 'glowstone', hard: 0.3, emit: 15, drop: () => ['glowstone_dust', 2 + Math.floor(Math.random() * 3)] });
  defBlock('moss_block', '苔藓块', { tex: 'moss_block', hard: 0.1, tool: 'hoe' });
  defBlock('pumpkin', '南瓜', { tex: { top: 'pumpkin_top', side: 'pumpkin_side' }, hard: 1, tool: 'axe' });
  defBlock('melon', '西瓜', { tex: { top: 'melon_top', side: 'melon_side' }, hard: 1, tool: 'axe', drop: () => ['melon_slice', 3 + Math.floor(Math.random() * 5)] });
  defBlock('hay_block', '干草块', { tex: { top: 'hay_top', side: 'hay_side' }, hard: 0.5, tool: 'hoe' });
  defBlock('farmland', '耕地', { tex: { top: 'farmland', side: 'dirt', bottom: 'dirt' }, hard: 0.6, tool: 'shovel', drop: 'dirt', shape: 'farmland', opaque: false });
  defBlock('terracotta', '陶瓦', { tex: 'terracotta', hard: 1.25, tool: 'pickaxe', tier: 1 });
  const woolZh = { white: '白色', orange: '橙色', magenta: '品红色', light_blue: '淡蓝色', yellow: '黄色', lime: '黄绿色', pink: '粉红色', gray: '灰色', light_gray: '淡灰色', cyan: '青色', purple: '紫色', blue: '蓝色', brown: '棕色', green: '绿色', red: '红色', black: '黑色' };
  for (const k in woolZh) defBlock(k + '_wool', woolZh[k] + '羊毛', { tex: k + '_wool', hard: 0.8, tool: 'shears', fuel: 100 });

  // 台阶 / 楼梯（含 26.3 新增羊毛台阶楼梯、26.2 硫磺/朱砂系列）
  const slabs = { oak: ['oak_planks', '橡木', 'axe'], stone: ['stone', '石头', 'pickaxe'], cobblestone: ['cobblestone', '圆石', 'pickaxe'], stone_brick: ['stone_bricks', '石砖', 'pickaxe'], sulfur: ['sulfur', '硫磺', 'pickaxe'], cinnabar: ['cinnabar', '朱砂', 'pickaxe'], white_wool: ['white_wool', '白色羊毛', 'shears'], sandstone: ['sandstone_side', '砂岩', 'pickaxe'] };
  for (const k in slabs) {
    const [t, zh, tool] = slabs[k];
    defBlock(k + '_slab', zh + '台阶', { tex: t, shape: 'slab', hard: 2, tool, tier: tool === 'pickaxe' ? 1 : 0 });
    defBlock(k + '_stairs', zh + '楼梯', { tex: t, shape: 'stairs', hard: 2, tool, tier: tool === 'pickaxe' ? 1 : 0 });
  }

  // 植物（十字形）
  const cross = (name, zh, tex, extra) => defBlock(name, zh, Object.assign({ shape: 'cross', tex, hard: 0, replaceable: false, plant: true }, extra || {}));
  cross('short_grass', '矮草丛', 'short_grass', { tint: 'grass', replaceable: true, drop: () => Math.random() < 0.125 ? ['wheat_seeds', 1] : null });
  cross('fern', '蕨', 'fern', { tint: 'grass', replaceable: true, drop: () => Math.random() < 0.125 ? ['wheat_seeds', 1] : null });
  cross('dandelion', '蒲公英', 'dandelion');
  cross('poppy', '虞美人', 'poppy');
  cross('cornflower', '矢车菊', 'cornflower');
  cross('allium', '绒球葱', 'allium');
  cross('orange_tulip', '橙色郁金香', 'orange_tulip');
  cross('oxeye_daisy', '滨菊', 'oxeye_daisy');
  cross('dead_bush', '枯萎的灌木', 'dead_bush', { replaceable: true, drop: () => ['stick', 1 + Math.floor(Math.random() * 2)] });
  for (const s of ['oak', 'birch', 'spruce', 'cherry', 'poplar']) cross(s + '_sapling', ({ oak: '橡树', birch: '白桦', spruce: '云杉', cherry: '樱花', poplar: '杨树' })[s] + '树苗', s + '_sapling', { sapling: s });
  cross('red_mushroom', '红色蘑菇', 'red_mushroom');
  cross('brown_mushroom', '棕色蘑菇', 'brown_mushroom');
  cross('sugar_cane', '甘蔗', 'sugar_cane');
  defBlock('cactus', '仙人掌', { tex: { top: 'cactus_top', side: 'cactus_side' }, hard: 0.4, opaque: false, render: 'cutout', shape: 'cactus' });
  cross('wheat', '小麦', 'wheat_0', { noItem: true, crop: true, texFn: (f, m) => TEX['wheat_' + Math.min(3, m >> 1)], drop: (m) => m >= 7 ? [['wheat', 1], ['wheat_seeds', 1 + Math.floor(Math.random() * 3)]] : ['wheat_seeds', 1] });
  defBlock('torch', '火把', { shape: 'torch', tex: 'torch', hard: 0, emit: 14 });
  cross('campfire', '营火', 'campfire', { emit: 15, hard: 2, tool: 'axe', solid: true, drop: () => ['charcoal', 2] });

  // 床、靠垫
  defBlock('red_bed', '红色的床', { tex: { top: 'bed_top', side: 'bed_side', bottom: 'oak_planks' }, shape: 'bed', hard: 0.2, interact: 'bed' });
  defBlock('straw_bed', '稻草床', { tex: { top: 'straw_bed_top', side: 'hay_side', bottom: 'oak_planks' }, shape: 'bed', hard: 0.2, interact: 'bed' });
  defBlock('cushion', '靠垫', { tex: 'cushion', shape: 'cushion', hard: 0.2, tool: 'shears' });

  // 26.2 Chaos Cubed：硫磺洞穴方块
  defBlock('sulfur', '硫磺', { tex: 'sulfur', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('cinnabar', '朱砂', { tex: 'cinnabar', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('potent_sulfur', '强效硫磺', { tex: 'potent_sulfur', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('polished_sulfur', '磨制硫磺', { tex: 'polished_sulfur', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('sulfur_bricks', '硫磺砖', { tex: 'sulfur_bricks', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('polished_cinnabar', '磨制朱砂', { tex: 'polished_cinnabar', hard: 1.5, tool: 'pickaxe', tier: 1 });
  defBlock('cinnabar_bricks', '朱砂砖', { tex: 'cinnabar_bricks', hard: 1.5, tool: 'pickaxe', tier: 1 });
  cross('sulfur_spike', '硫磺尖刺', 'sulfur_spike', { hard: 1.5, tool: 'pickaxe', solid: false, spike: true });
  // 26.3 Wilderness Bound：斑驳森林
  cross('red_shrub', '红灌木', 'red_shrub', { replaceable: true });
  cross('shelf_mushroom', '层架菌', 'shelf_mushroom', { bounce: true });
  // 苍白之园
  defBlock('creaking_heart', '嘎枝之心', { tex: { top: 'pale_oak_log_top', side: 'creaking_heart' }, hard: 10, tool: 'axe' });

  // ---- 纯物品 ----
  const I = (name, zh, o) => defItem(name, zh, o);
  I('stick', '木棍', { fuel: 100 });
  I('coal', '煤炭', { fuel: 1600 }); I('charcoal', '木炭', { fuel: 1600 });
  I('raw_iron', '粗铁'); I('raw_gold', '粗金'); I('raw_copper', '粗铜');
  I('iron_ingot', '铁锭'); I('gold_ingot', '金锭'); I('copper_ingot', '铜锭');
  I('diamond', '钻石'); I('emerald', '绿宝石'); I('redstone', '红石粉'); I('lapis_lazuli', '青金石');
  I('flint', '燧石'); I('clay_ball', '黏土球'); I('brick', '红砖'); I('glowstone_dust', '荧石粉');
  I('book', '书'); I('paper', '纸'); I('string', '线'); I('feather', '羽毛'); I('leather', '皮革');
  I('gunpowder', '火药'); I('bone', '骨头'); I('bone_meal', '骨粉'); I('slime_ball', '黏液球');
  I('wheat', '小麦'); I('wheat_seeds', '小麦种子');
  I('arrow', '箭');
  I('apple', '苹果', { food: [4, 2.4] }); I('bread', '面包', { food: [5, 6] });
  I('melon_slice', '西瓜片', { food: [2, 1.2] });
  I('porkchop', '生猪排', { food: [3, 1.8] }); I('cooked_porkchop', '熟猪排', { food: [8, 12.8] });
  I('beef', '生牛肉', { food: [3, 1.8] }); I('cooked_beef', '牛排', { food: [8, 12.8] });
  I('chicken', '生鸡肉', { food: [2, 1.2] }); I('cooked_chicken', '熟鸡肉', { food: [6, 7.2] });
  I('mutton', '生羊肉', { food: [2, 1.2] }); I('cooked_mutton', '熟羊肉', { food: [6, 9.6] });
  I('rotten_flesh', '腐肉', { food: [4, 0.8] });
  I('mushroom_stew', '蘑菇煲', { food: [6, 7.2], stack: 1 });
  I('shelf_mushroom_stew', '层架菌炖菜', { food: [8, 9], stack: 1 });
  I('bucket', '铁桶', { stack: 16 }); I('water_bucket', '水桶', { stack: 1 }); I('lava_bucket', '熔岩桶', { stack: 1, fuel: 20000 });
  I('flint_and_steel', '打火石', { durability: 64 });
  I('shears', '剪刀', { durability: 238, tool: { type: 'shears', tier: 2, speed: 5, dmg: 1 } });
  I('bow', '弓', { durability: 384 });

  const tiers = { wooden: ['木', 1, 2, 59, 0], stone: ['石', 2, 4, 131, 1], iron: ['铁', 3, 6, 250, 2], golden: ['金', 1, 12, 32, 0], diamond: ['钻石', 4, 8, 1561, 3] };
  const kinds = { pickaxe: ['镐', 2], axe: ['斧', 7], shovel: ['锹', 2.5], hoe: ['锄', 1], sword: ['剑', 4] };
  for (const t in tiers) for (const k in kinds) {
    const [tz, tier, speed, dur, dmgAdd] = tiers[t];
    I(t + '_' + k, tz + kinds[k][0], { tool: { type: k, tier, speed, dmg: kinds[k][1] + dmgAdd + (k === 'sword' || k === 'axe' ? 0 : 0) }, durability: dur, fuel: t === 'wooden' ? 200 : 0 });
  }
  // 刷怪蛋（创造模式）
  const eggs = { pig: '猪', cow: '牛', sheep: '绵羊', chicken: '鸡', fox: '狐狸', zombie: '僵尸', skeleton: '骷髅', creeper: '苦力怕', spider: '蜘蛛', sulfur_cube: '硫磺立方', creaking: '嘎枝' };
  for (const k in eggs) I(k + '_spawn_egg', eggs[k] + '刷怪蛋', { spawnEgg: k, creativeOnly: true });
  defineArmor();
}

const isLiquid = id => id === B.water || id === B.lava;
