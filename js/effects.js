'use strict';
// ---------- 状态效果、盔甲、附魔（核心数据与公式） ----------

const EFFECTS = {
  // 颜色取自现行原版 MobEffects（1.19.4 起的新配色）
  speed: { zh: '迅捷', icon: 'mcl_potions_effect_swiftness', color: [51, 235, 255], good: true },
  slowness: { zh: '缓慢', icon: 'mcl_potions_effect_slowness', color: [139, 175, 224] },
  haste: { zh: '急迫', icon: 'mcl_potions_effect_haste', color: [217, 192, 67], good: true },
  mining_fatigue: { zh: '挖掘疲劳', icon: 'mcl_potions_effect_fatigue', color: [74, 66, 23] },
  strength: { zh: '力量', icon: 'mcl_potions_effect_strength', color: [255, 199, 0], good: true },
  instant_health: { zh: '瞬间治疗', icon: 'mcl_potions_effect_health_boost', color: [248, 36, 35], good: true, instant: true },
  instant_damage: { zh: '瞬间伤害', icon: 'mcl_potions_effect_withering', color: [169, 101, 106], instant: true },
  jump_boost: { zh: '跳跃提升', icon: 'mcl_potions_effect_leaping', color: [253, 255, 132], good: true },
  nausea: { zh: '反胃', icon: 'mcl_potions_effect_nausea', color: [85, 29, 74] },
  regeneration: { zh: '生命恢复', icon: 'mcl_potions_effect_regeneration', color: [205, 92, 171], good: true },
  resistance: { zh: '抗性提升', icon: 'mcl_potions_effect_resistance', color: [145, 70, 240], good: true },
  fire_resistance: { zh: '抗火', icon: 'mcl_potions_effect_fire_resistance', color: [255, 153, 0], good: true },
  water_breathing: { zh: '水下呼吸', icon: 'mcl_potions_effect_water_breathing', color: [152, 218, 192], good: true },
  invisibility: { zh: '隐身', icon: 'mcl_potions_effect_invisibility', color: [246, 246, 246], good: true },
  blindness: { zh: '失明', icon: 'mcl_potions_effect_blindness', color: [31, 31, 35] },
  night_vision: { zh: '夜视', icon: 'mcl_potions_effect_night_vision', color: [194, 255, 102], good: true },
  hunger: { zh: '饥饿', icon: 'mcl_potions_effect_food_poisoning', color: [88, 118, 83] },
  weakness: { zh: '虚弱', icon: 'mcl_potions_effect_weakness', color: [72, 77, 72] },
  poison: { zh: '中毒', icon: 'mcl_potions_effect_poison', color: [135, 163, 99] },
  wither: { zh: '凋零', icon: 'mcl_potions_effect_withering', color: [115, 97, 86] },
  absorption: { zh: '伤害吸收', icon: 'mcl_potions_effect_absorption', color: [37, 82, 165], good: true },
  saturation: { zh: '饱和', icon: 'mcl_potions_effect_saturation', color: [248, 36, 35], good: true },
  slow_falling: { zh: '缓降', icon: 'mcl_potions_effect_slow_falling', color: [243, 207, 185], good: true },
  levitation: { zh: '飘浮', icon: 'mcl_potions_effect_levitation', color: [206, 255, 255] },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// level 从 0 开始（0 = I 级）
function applyEffect(ent, id, seconds, level) {
  const e = EFFECTS[id]; if (!e) return;
  level = level || 0;
  if (e.instant) {
    const amt = 4 << level;
    const undead = ent.def && ent.def.undead;
    if ((id === 'instant_health') !== !!undead) { if (ent.isPlayer) ent.health = Math.min(ent.maxHealth(), ent.health + amt); else ent.health = Math.min(ent.def.hp, ent.health + amt); }
    else { ent.hurtTime = 0; ent.hurt(amt + (amt >> 1), 'magic'); }
    return;
  }
  if (!ent.effects) ent.effects = {};
  const cur = ent.effects[id];
  if (!cur || cur.level < level || (cur.level === level && cur.t < seconds)) ent.effects[id] = { t: seconds, level, max: seconds };
  if (id === 'absorption' && ent.isPlayer) ent.absorb = Math.max(ent.absorb || 0, 4 * (level + 1));
}
// 返回等级（I=1），无效果为 0
function effLv(ent, id) { const e = ent.effects && ent.effects[id]; return e ? e.level + 1 : 0; }
function clearEffects(ent) { ent.effects = {}; if (ent.isPlayer) ent.absorb = 0; }

function tickEffects(ent, dt) {
  if (!ent.effects) return;
  for (const id in ent.effects) {
    const e = ent.effects[id];
    e.t -= dt;
    e.acc = (e.acc || 0) + dt;
    const lv = e.level + 1;
    if (id === 'regeneration' && e.acc >= Math.max(0.15, 2.5 / lv)) { e.acc = 0; if (ent.isPlayer) ent.health = Math.min(ent.maxHealth(), ent.health + 1); else ent.health = Math.min(ent.def.hp, ent.health + 1); }
    if (id === 'poison' && e.acc >= Math.max(0.2, 1.25 / lv)) { e.acc = 0; if (ent.health > 1) { ent.hurtTime = 0; ent.hurt(1, 'poison'); } }
    if (id === 'wither' && e.acc >= Math.max(0.2, 2 / lv)) { e.acc = 0; ent.hurtTime = 0; ent.hurt(1, 'wither'); }
    if (id === 'hunger' && ent.isPlayer) ent.exh += 0.025 * lv * dt * 20;
    if (id === 'saturation' && ent.isPlayer) { ent.food = Math.min(20, ent.food + lv * dt * 20); ent.sat = Math.min(ent.food, ent.sat + lv * dt * 40); }
    if (id === 'levitation') ent.vel.y = Math.max(ent.vel.y, 0.9 * lv);
    if (e.t <= 0) { delete ent.effects[id]; if (id === 'absorption') ent.absorb = 0; }
  }
}

// ---------------- 附魔 ----------------
// 物品堆叠上的附魔：stack.ench = { sharpness: 3, unbreaking: 2, ... }
const ENCHANTS = {
  protection: { zh: '保护', max: 4, for: 'armor', weight: 10 },
  fire_protection: { zh: '火焰保护', max: 4, for: 'armor', weight: 5 },
  feather_falling: { zh: '摔落缓冲', max: 4, for: 'feet', weight: 5 },
  blast_protection: { zh: '爆炸保护', max: 4, for: 'armor', weight: 2 },
  projectile_protection: { zh: '弹射物保护', max: 4, for: 'armor', weight: 5 },
  respiration: { zh: '水下呼吸', max: 3, for: 'head', weight: 2 },
  aqua_affinity: { zh: '水下速掘', max: 1, for: 'head', weight: 2 },
  thorns: { zh: '荆棘', max: 3, for: 'chest', weight: 1 },
  depth_strider: { zh: '深海探索者', max: 3, for: 'feet', weight: 2 },
  sharpness: { zh: '锋利', max: 5, for: 'weapon', weight: 10 },
  smite: { zh: '亡灵杀手', max: 5, for: 'weapon', weight: 5 },
  bane_of_arthropods: { zh: '节肢杀手', max: 5, for: 'weapon', weight: 5 },
  knockback: { zh: '击退', max: 2, for: 'sword', weight: 5 },
  fire_aspect: { zh: '火焰附加', max: 2, for: 'sword', weight: 2 },
  looting: { zh: '抢夺', max: 3, for: 'sword', weight: 2 },
  sweeping: { zh: '横扫之刃', max: 3, for: 'sword', weight: 2 },
  efficiency: { zh: '效率', max: 5, for: 'digger', weight: 10 },
  silk_touch: { zh: '精准采集', max: 1, for: 'digger', weight: 1 },
  fortune: { zh: '时运', max: 3, for: 'digger', weight: 2 },
  unbreaking: { zh: '耐久', max: 3, for: 'breakable', weight: 5 },
  power: { zh: '力量', max: 5, for: 'bow', weight: 10 },
  punch: { zh: '冲击', max: 2, for: 'bow', weight: 2 },
  flame: { zh: '火矢', max: 1, for: 'bow', weight: 2 },
  infinity: { zh: '无限', max: 1, for: 'bow', weight: 1 },
  mending: { zh: '经验修补', max: 1, for: 'breakable', weight: 2 },
};
const ENCH_CONFLICT = [['protection', 'fire_protection', 'blast_protection', 'projectile_protection'], ['sharpness', 'smite', 'bane_of_arthropods'], ['silk_touch', 'fortune'], ['infinity', 'mending']];
function enchLv(stack, id) { return stack && stack.ench ? stack.ench[id] || 0 : 0; }
// 物品能否接受某类附魔
function enchApplies(itemName, enchId) {
  const it = ITEMS[itemName], e = ENCHANTS[enchId]; if (!it || !e) return false;
  if (itemName === 'book' || itemName === 'enchanted_book') return true;
  const tool = it.tool, ar = it.armor;
  switch (e.for) {
    case 'armor': return !!ar;
    case 'feet': case 'head': case 'chest': return !!ar && ar.slot === e.for;
    case 'weapon': return !!tool && (tool.type === 'sword' || tool.type === 'axe');
    case 'sword': return !!tool && tool.type === 'sword';
    case 'digger': return !!tool && ['pickaxe', 'axe', 'shovel', 'hoe'].includes(tool.type);
    case 'bow': return itemName === 'bow';
    case 'breakable': return !!it.durability;
  }
  return false;
}
function enchText(stack) {
  if (!stack || !stack.ench) return '';
  return Object.keys(stack.ench).map(k => (ENCHANTS[k] ? ENCHANTS[k].zh : k) + ' ' + (ROMAN[stack.ench[k]] || stack.ench[k])).join('，');
}

// ---------------- 盔甲 ----------------
const ARMOR_SLOTS = ['head', 'chest', 'legs', 'feet'];
const ARMOR_ZH = { head: '头盔', chest: '胸甲', legs: '护腿', feet: '靴子' };
function defineArmor() {
  // 材料：防御点 [头,胸,腿,脚]、韧性、耐久系数、中文、素材名、合成材料
  const mats = {
    leather: [[1, 3, 2, 1], 0, 5, '皮革', 'leather', 'leather'],
    chainmail: [[2, 5, 4, 1], 0, 15, '锁链', 'chain', null],
    iron: [[2, 6, 5, 2], 0, 15, '铁', 'iron', 'iron_ingot'],
    golden: [[2, 5, 3, 1], 0, 7, '金', 'gold', 'gold_ingot'],
    diamond: [[3, 8, 6, 3], 2, 33, '钻石', 'diamond', 'diamond'],
    netherite: [[3, 8, 6, 3], 3, 37, '下界合金', 'netherite', null],
  };
  const pieceName = { head: 'helmet', chest: 'chestplate', legs: 'leggings', feet: 'boots' };
  const dur = { head: 11, chest: 16, legs: 15, feet: 13 };
  const patterns = { head: ['XXX', 'X X'], chest: ['X X', 'XXX', 'XXX'], legs: ['XXX', 'X X', 'X X'], feet: ['X X', 'X X'] };
  ARMOR_SLOTS.forEach((slot, si) => {
    for (const m in mats) {
      const [pts, tough, dm, zh, pk, mat] = mats[m];
      const name = m + '_' + pieceName[slot];
      defItem(name, zh + ARMOR_ZH[slot], { armor: { slot, points: pts[si], tough }, durability: dur[slot] * dm, icon: 'mcl_armor_inv_' + pieceName[slot] + '_' + pk, material: m });
      if (mat) shaped(patterns[slot], { X: mat }, name);
    }
  });
}
// 伤害经过盔甲后的数值（不含附魔）
function armorReduce(dmg, points, tough) {
  const eff = Math.min(20, Math.max(points / 5, points - 4 * dmg / (tough + 8)));
  return dmg * (1 - eff / 25);
}
