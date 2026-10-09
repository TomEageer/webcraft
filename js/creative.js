'use strict';
// ---------- 创造模式物品栏：原版风格分类标签 + 支持中文输入法的搜索 ----------

const COLORS16 = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
const COLOR_RE = new RegExp('^(' + COLORS16.join('|') + ')_');

// 标签顺序与图标（图标用物品名）
const CREATIVE_TABS = [
  { id: 'building', zh: '建筑方块', icon: 'bricks' },
  { id: 'colored', zh: '染色方块', icon: 'cyan_wool' },
  { id: 'natural', zh: '自然方块', icon: 'grass_block' },
  { id: 'functional', zh: '功能方块', icon: 'crafting_table' },
  { id: 'redstone', zh: '红石方块', icon: 'redstone' },
  { id: 'tools', zh: '工具与实用物品', icon: 'diamond_pickaxe' },
  { id: 'combat', zh: '战斗用品', icon: 'diamond_sword' },
  { id: 'food', zh: '食物与饮品', icon: 'apple' },
  { id: 'ingredients', zh: '原材料', icon: 'iron_ingot' },
  { id: 'spawn_eggs', zh: '刷怪蛋', icon: 'zombie_spawn_egg' },
  { id: 'search', zh: '搜索物品', icon: 'compass', search: true },
  { id: 'inventory', zh: '生存模式物品栏', icon: 'chest', inv: true },
];

const RE_REDSTONE = /redstone|lever|_button$|pressure_plate|repeater|comparator|piston|observer|note_block|daylight_detector|dispenser|dropper|hopper|^tnt$|_door$|_trapdoor$|_fence_gate$|rail$|^target$|lamp|tripwire|lectern|sculk_sensor|lightning_rod|minecart/;
const RE_FUNCTIONAL = /crafting_table|furnace|smoker|chest|barrel|smithing|stonecutter|loom|cartography|fletching|grindstone|anvil|enchanting_table|brewing_stand|cauldron|composter|bell|_bed$|campfire|torch|lantern|ladder|spawner|jukebox|end_portal_frame|ender_chest|bookshelf|beehive|respawn_anchor|lodestone|scaffolding|chain$|cushion|sign$|flower_pot|conduit|beacon|creaking_heart/;
const RE_NATURAL = /_ore$|_log$|leaves|sapling|grass|^dirt$|coarse_dirt|podzol|^sand$|red_sand|gravel|snow|ice$|^ice|netherrack|soul_sand|soul_soil|basalt|^blackstone$|^end_stone$|obsidian|bedrock|^clay$|mycelium|moss|nylium|_stem$|fungus|roots|wart_block|shroomlight|amethyst|calcite|^tuff$|^stone$|^deepslate$|magma|^glowstone$|sulfur|cinnabar|cactus|sugar_cane|pumpkin$|^melon$|mushroom|dead_bush|fern|dandelion|poppy|cornflower|allium|tulip|daisy|shrub|vine|lily|bee_nest|chorus|ancient_debris|^dripstone|pointed|coral|kelp|seagrass|sponge|bone_block|hay_block|^cobweb|sweet_berry|^andesite$|^diorite$|^granite$|wheat_seeds|beetroot_seeds|melon_seeds|pumpkin_seeds|^carrot$|^potato$|nether_wart$|spike/;
const RE_TOOLS = /_pickaxe$|_shovel$|_hoe$|_axe$|shears|flint_and_steel|fishing_rod|bucket|compass|clock|_boat$|minecart|ender_pearl|eye_of_ender|enchanted_book|saddle|name_tag|music_disc|experience_bottle|bone_meal|spyglass|lead$|map$|carrot_on_a_stick|bundle|snowball/;
const RE_COMBAT = /_sword$|_axe$|_helmet$|_chestplate$|_leggings$|_boots$|^bow$|crossbow|arrow|shield|trident|totem|end_crystal|^tnt$|snowball|^egg$|wind_charge|splash_potion|lingering_potion|mace/;

function itemCategories(name) {
  const it = ITEMS[name]; if (!it) return [];
  const cats = [];
  const isBlock = it.block !== undefined;
  const def = isBlock ? BLOCKS[it.block] : null;
  if (it.spawnEgg) return ['spawn_eggs'];
  if (/potion|^milk_bucket$|golden_apple/.test(name) || (it.food && !isBlock)) cats.push('food');
  if (isBlock && def.name === 'cake') cats.push('food');
  if (RE_REDSTONE.test(name)) cats.push('redstone');
  if (RE_TOOLS.test(name)) cats.push('tools');
  if (RE_COMBAT.test(name) || it.armor) cats.push('combat');
  if (isBlock) {
    const plantish = def.plant || def.leaves || def.sapling;
    if (COLOR_RE.test(name) && !plantish && !/mushroom|_bed$|red_sand|_tulip|_dye$/.test(name)) cats.push('colored');
    if (RE_FUNCTIONAL.test(name) || def.interact) cats.push('functional');
    if (plantish || RE_NATURAL.test(name)) cats.push('natural');
    if (!cats.length || (!cats.includes('natural') && !cats.includes('colored') && !cats.includes('functional') && !cats.includes('redstone'))) cats.push('building');
  } else if (!cats.length) cats.push(RE_NATURAL.test(name) ? 'natural' : 'ingredients');
  return [...new Set(cats)];
}

let CREATIVE_INDEX = null;
function creativeIndex() {
  if (CREATIVE_INDEX) return CREATIVE_INDEX;
  CREATIVE_INDEX = {};
  for (const t of CREATIVE_TABS) CREATIVE_INDEX[t.id] = [];
  for (const n of ITEM_ORDER) {
    const it = ITEMS[n];
    if (!it || it.hidden) continue;
    for (const c of itemCategories(n)) CREATIVE_INDEX[c].push(n);
  }
  return CREATIVE_INDEX;
}

// 搜索：中文名、英文 id、拼音首字母都不支持太复杂，这里支持中文子串与英文 id 子串（空格分隔多个关键词）
function creativeSearch(q) {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return ITEM_ORDER.filter(n => ITEMS[n] && !ITEMS[n].hidden);
  return ITEM_ORDER.filter(n => {
    const it = ITEMS[n]; if (!it || it.hidden) return false;
    const hay = (n + ' ' + it.zh).toLowerCase();
    return words.every(w => hay.includes(w));
  });
}
