'use strict';
// ---------- 附魔与酿造（一）：药水、酿造台、炼药锅、投掷物、特殊食物 ----------
// 附魔台 / 铁砧 / 砂轮见 feat_magic_ench.js。其他模块的物品（下界疣、烈焰粉等）只按名字引用。

// 药水种类：eff 效果、t 时长秒 [普通, 延长, 增强]（null 表示无此变种）、lv 增强版等级（从 0 起）
const MG_POTIONS = {
  water: { zh: '水瓶', color: [56, 93, 198] },
  awkward: { zh: '粗制的药水', color: [56, 93, 198] },
  mundane: { zh: '平凡的药水', color: [56, 93, 198] },
  thick: { zh: '浓稠的药水', color: [56, 93, 198] },
  swiftness: { zh: '迅捷药水', eff: 'speed', t: [180, 480, 90], lv: 1 },
  slowness: { zh: '迟缓药水', eff: 'slowness', t: [90, 240, 20], lv: 3 },
  leaping: { zh: '跳跃药水', eff: 'jump_boost', t: [180, 480, 90], lv: 1 },
  fire_resistance: { zh: '抗火药水', eff: 'fire_resistance', t: [180, 480, null] },
  healing: { zh: '治疗药水', eff: 'instant_health', t: [0, null, 0], lv: 1 },
  harming: { zh: '伤害药水', eff: 'instant_damage', t: [0, null, 0], lv: 1 },
  poison: { zh: '剧毒药水', eff: 'poison', t: [45, 90, 21.6], lv: 1 },
  regeneration: { zh: '再生药水', eff: 'regeneration', t: [45, 90, 22], lv: 1 },
  strength: { zh: '力量药水', eff: 'strength', t: [180, 480, 90], lv: 1 },
  weakness: { zh: '虚弱药水', eff: 'weakness', t: [90, 240, null] },
  night_vision: { zh: '夜视药水', eff: 'night_vision', t: [180, 480, null] },
  invisibility: { zh: '隐身药水', eff: 'invisibility', t: [180, 480, null] },
  water_breathing: { zh: '水肺药水', eff: 'water_breathing', t: [180, 480, null] },
  slow_falling: { zh: '缓降药水', eff: 'slow_falling', t: [90, 240, null] },
};
const MG_FORMS = { drink: '', splash: '喷溅型', lingering: '滞留型' };
const MG_PI = {};          // 药水物品名 -> {type, v, form}
const MG_VARIANTS = ['', 'long', 'strong'];

function mgPotionName(type, v, form) {
  if (type === 'water') return form === 'drink' ? 'water_bottle' : form + '_water_bottle';
  const base = (form === 'drink' ? 'potion_' : form + '_potion_') + type;
  return v ? base + '_' + v : base;
}
function mgHasVariant(type, v) {
  if (!v) return true;
  const P = MG_POTIONS[type];
  return !!(P.t && P.t[v === 'long' ? 1 : 2] !== null && P.t[v === 'long' ? 1 : 2] !== undefined);
}
// 药水物品的效果列表 [{id, t, lv}]，滞留型时长为 1/4
function mgPotionEffects(name) {
  const info = MG_PI[name]; if (!info) return [];
  const P = MG_POTIONS[info.type]; if (!P.eff) return [];
  const vi = info.v === 'long' ? 1 : info.v === 'strong' ? 2 : 0;
  let t = P.t[vi];
  if (info.form === 'lingering') t /= 4;
  return [{ id: P.eff, t, lv: info.v === 'strong' ? P.lv : 0 }];
}
function mgPotionColor(name) {
  const info = MG_PI[name]; if (!info) return [56, 93, 198];
  const P = MG_POTIONS[info.type];
  return P.color || EFFECTS[P.eff].color;
}
const mgFmtTime = s => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function mgPotionDesc(name) {
  const ef = mgPotionEffects(name);
  if (!ef.length) return '无效果';
  return ef.map(e => EFFECTS[e.id].zh + (e.lv ? ' ' + ROMAN[e.lv + 1] : '') + (EFFECTS[e.id].instant ? '' : ' (' + mgFmtTime(e.t) + ')')).join('\n');
}

// 酿造：返回瓶中物品与材料反应后的结果物品名，不能酿造返回 null
const MG_AWKWARD_BASE = { sugar: 'swiftness', rabbit_foot: 'leaping', glistering_melon_slice: 'healing', spider_eye: 'poison', pufferfish: 'water_breathing', magma_cream: 'fire_resistance', golden_carrot: 'night_vision', blaze_powder: 'strength', ghast_tear: 'regeneration', phantom_membrane: 'slow_falling' };
const MG_MUNDANE_SRC = ['sugar', 'rabbit_foot', 'glistering_melon_slice', 'spider_eye', 'magma_cream', 'blaze_powder', 'ghast_tear', 'redstone'];
const MG_INGREDIENTS = new Set(['nether_wart', 'redstone', 'glowstone_dust', 'gunpowder', 'dragon_breath', 'fermented_spider_eye', ...Object.keys(MG_AWKWARD_BASE)]);
function mgBrew(bottle, ing) {
  const info = MG_PI[bottle]; if (!info) return null;
  const { type, v, form } = info;
  const out = (t, vv) => mgHasVariant(t, vv) ? mgPotionName(t, vv, form) : mgPotionName(t, '', form);
  switch (ing) {
    case 'gunpowder': return form === 'drink' ? mgPotionName(type, v, 'splash') : null;
    case 'dragon_breath': return form === 'splash' ? mgPotionName(type, v, 'lingering') : null;
    case 'nether_wart': return type === 'water' ? out('awkward') : null;
    case 'redstone':
      if (type === 'water') return out('mundane');
      return v !== 'long' && MG_POTIONS[type].eff && mgHasVariant(type, 'long') ? out(type, 'long') : null;
    case 'glowstone_dust':
      if (type === 'water') return out('thick');
      return v !== 'strong' && MG_POTIONS[type].eff && mgHasVariant(type, 'strong') ? out(type, 'strong') : null;
    case 'fermented_spider_eye': {
      const conv = { water: 'weakness', swiftness: 'slowness', leaping: 'slowness', healing: 'harming', poison: 'harming', night_vision: 'invisibility' }[type];
      if (!conv) return null;
      if (type === 'poison' || type === 'healing') return out(conv, v === 'strong' ? 'strong' : '');
      if (type === 'water') return out(conv);
      return out(conv, v === 'long' ? 'long' : '');
    }
  }
  if (type === 'awkward' && MG_AWKWARD_BASE[ing]) return out(MG_AWKWARD_BASE[ing]);
  if (type === 'water' && MG_MUNDANE_SRC.includes(ing)) return out('mundane');
  return null;
}
const mgIsBottle = n => !!MG_PI[n];

// 把完整的堆叠（保留附魔/名称/修复花费）放进物品栏，放不下就丢在脚下
function mgGive(game, st) {
  if (!st) return;
  const p = game.player, ms = ITEMS[st.id] ? ITEMS[st.id].stack : 64;
  if (!st.ench && !st.name && !st.dmg && !st.rc && ms > 1) {
    const left = p.inventory.add(st.id, st.n);
    if (left) game.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, st.id, left);
    return;
  }
  const i = p.inventory.slots.indexOf(null);
  if (i >= 0) p.inventory.slots[i] = st;
  else game.dropItem(p.pos.x, p.pos.y + 1, p.pos.z, st.id, st.n, st.dmg, st.ench);
}
// 手持物品换成容器物品（瓶子、桶），生存模式下扣一个
function mgSwapHeld(game, player, back) {
  if (player.mode !== 'survival') { if (back && !player.inventory.count(back)) player.inventory.add(back, 1); game.ui.refresh(); return; }
  const h = player.held();
  if (h.n > 1) { h.n--; if (back && player.inventory.add(back, 1)) game.dropItem(player.pos.x, player.pos.y + 1, player.pos.z, back, 1); }
  else player.inventory.slots[player.sel] = back ? { id: back, n: 1 } : null;
  game.ui.refresh();
}

// ---------- 药水效果的实际施加 ----------
// f：效果系数（喷溅距离衰减），瞬间效果按系数缩放数值
function mgApplyPotion(ent, name, f) {
  if (f === undefined) f = 1;
  for (const e of mgPotionEffects(name)) {
    if (EFFECTS[e.id].instant) {
      if (f >= 0.999) { applyEffect(ent, e.id, 0, e.lv); continue; }
      const amt = (4 << e.lv) * f, undead = ent.def && ent.def.undead;
      if ((e.id === 'instant_health') !== !!undead) { const mx = ent.isPlayer ? ent.maxHealth() : ent.def.hp; ent.health = Math.min(mx, ent.health + Math.max(1, Math.round(amt))); }
      else { ent.hurtTime = 0; ent.hurt(Math.max(1, Math.round(amt * 1.5)), 'magic'); }
    } else {
      const t = e.t * f;
      if (t >= 1) applyEffect(ent, e.id, t, e.lv);
    }
  }
}
function mgDrinkPotion(player, stack) { mgApplyPotion(player, stack.id, 1); return 'glass_bottle'; }

// ---------- 投掷物：喷溅/滞留药水、附魔之瓶 ----------
class MgThrown extends Entity {
  constructor(game, owner, name) {
    const e = owner.eye(), d = owner.lookDir();
    super(game, e.x + d.x * 0.4, e.y + d.y * 0.4 - 0.1, e.z + d.z * 0.4);
    this.name = name; this.owner = owner; this.w = 0.12; this.h = 0.12; this.stepH = 0;
    const exp = name === 'experience_bottle', sp = exp ? 14 : 10;
    this.grav = exp ? 28 : 20;
    this.vel.set(d.x * sp + owner.vel.x * 0.5, d.y * sp + 2.5, d.z * sp + owner.vel.z * 0.5);
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(name), transparent: true, alphaTest: 0.3 }));
    this.mesh.scale.set(0.4, 0.4, 0.4);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 20) { this.dead = true; return; }
    this.vel.y -= this.grav * dt;
    const g = this.game, steps = 4;
    for (let s = 0; s < steps; s++) {
      const nx = this.pos.x + this.vel.x * dt / steps, ny = this.pos.y + this.vel.y * dt / steps, nz = this.pos.z + this.vel.z * dt / steps;
      const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id && BLOCKS[id].solid) { this.shatter(null); return; }
      this.pos.set(nx, ny, nz);
      const targets = [...g.mobs, g.player];
      for (const t of targets) {
        if (t.dead || (t.isPlayer && (!t.alive || this.age < 0.25))) continue;
        if (Math.abs(t.pos.x - nx) < t.w + 0.15 && Math.abs(t.pos.z - nz) < t.w + 0.15 && ny > t.pos.y - 0.1 && ny < t.pos.y + t.h + 0.1) { this.shatter(t); return; }
      }
    }
    this.mesh.position.copy(this.pos);
    const b = this.lightAt(); this.mesh.material.color.setRGB(b, b, b);
  }
  shatter(direct) {
    this.dead = true;
    mgShatter(this.game, this.pos.clone(), this.name, direct);
  }
}

function mgShatter(game, pos, name, direct) {
  game.audio.play('potion.break', pos);
  if (name === 'experience_bottle') {
    game.particles.burst(pos.x, pos.y, pos.z, [120, 160, 255], 24, 1.5);
    let xp = 3 + Math.floor(Math.random() * 9);
    while (xp > 0) { const v = Math.min(xp, 1 + Math.floor(Math.random() * 4)); xp -= v; game.entities.push(new MgXpOrb(game, pos.x, pos.y + 0.2, pos.z, v)); }
    return;
  }
  const c = mgPotionColor(name), info = MG_PI[name];
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
    game.particles.add(pos.x, pos.y + 0.1, pos.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, i % 4 ? c : [230, 230, 255], 0.6 + Math.random() * 0.6, 8);
  }
  if (!info) return;
  if (info.form === 'lingering') { game.entities.push(new MgCloud(game, pos.x, pos.y, pos.z, name)); return; }
  for (const t of [game.player, ...game.mobs]) {
    if (t.dead || (t.isPlayer && !t.alive)) continue;
    const d = Math.hypot(t.pos.x - pos.x, t.pos.y + t.h / 2 - pos.y, t.pos.z - pos.z);
    if (d >= 4 && t !== direct) continue;
    const f = t === direct ? 1 : 1 - d / 4;
    if (info.type === 'water') { t.fire = 0; continue; }
    mgApplyPotion(t, name, f);
  }
}

// 滞留药水的效果云：半径 3，持续 30 秒并逐渐缩小
class MgCloud extends Entity {
  constructor(game, x, y, z, name) {
    super(game, x, y, z);
    this.name = name; this.r = 3; this.life = 30; this.cool = new Map(); this.color = mgPotionColor(name); this.pt = 0;
  }
  update(dt) {
    this.age += dt;
    this.r -= dt * 0.1;
    if (this.age > this.life || this.r < 0.5) { this.dead = true; return; }
    const g = this.game;
    this.pt += dt;
    while (this.pt > 0.02) {
      this.pt -= 0.02;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * this.r;
      g.particles.add(this.pos.x + Math.cos(a) * rr, this.pos.y + 0.1 + Math.random() * 0.3, this.pos.z + Math.sin(a) * rr, 0, 0.3, 0, this.color, 0.8, 0);
    }
    if (MG_PI[this.name].type === 'water') return;
    for (const t of [g.player, ...g.mobs]) {
      if (t.dead || (t.isPlayer && !t.alive)) continue;
      if (Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) > this.r || Math.abs(t.pos.y - this.pos.y) > 1.5) continue;
      if ((this.cool.get(t) || 0) > this.age) continue;
      this.cool.set(t, this.age + 1);
      mgApplyPotion(t, this.name, 1);
      this.r -= 0.25;
    }
  }
}

// 经验球：飞向附近玩家
class MgXpOrb extends Entity {
  constructor(game, x, y, z, v) {
    super(game, x, y, z);
    this.v = v; this.w = 0.12; this.h = 0.25; this.stepH = 0;
    this.vel.set((Math.random() - 0.5) * 3, 3 + Math.random() * 2, (Math.random() - 0.5) * 3);
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: mgOrbTexture(), transparent: true, alphaTest: 0.2 }));
    const s = 0.18 + Math.min(v, 10) * 0.02; this.mesh.scale.set(s, s, s);
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 300) { this.dead = true; return; }
    const pl = this.game.player, dx = pl.pos.x - this.pos.x, dy = pl.pos.y + 0.8 - this.pos.y, dz = pl.pos.z - this.pos.z, d = Math.hypot(dx, dy, dz);
    if (pl.alive && this.age > 0.4 && d < 8) {
      if (d < 1) { pl.addXp(this.v); this.dead = true; return; }
      const k = (1 - d / 8) * 30 * dt;
      this.vel.x += dx / d * k; this.vel.y += dy / d * k; this.vel.z += dz / d * k;
    }
    this.physics(dt);
    if (this.onGround) { this.vel.x *= Math.pow(0.05, dt); this.vel.z *= Math.pow(0.05, dt); }
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15, this.pos.z);
    const pulse = 0.75 + 0.25 * Math.sin(this.age * 8);
    this.mesh.material.color.setRGB(pulse, 1, pulse * 0.5);
  }
}
let MG_ORB_TEX = null;
function mgOrbTexture() {
  if (MG_ORB_TEX) return MG_ORB_TEX;
  const cv = document.createElement('canvas'); cv.width = cv.height = 16;
  const ctx = cv.getContext('2d');
  if (PACK_READY && PACK_IMG.mcl_experience_orb) {
    const im = PACK_IMG.mcl_experience_orb, fs = im.w, c = document.createElement('canvas'); c.width = fs; c.height = fs;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(im.data.slice(0, fs * fs * 4)), fs, fs), 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 0, 0, 16, 16);
  } else {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 5) { ctx.fillStyle = d < 3 ? '#e8ff70' : '#7ad21e'; ctx.fillRect(x, y, 1, 1); } }
  }
  MG_ORB_TEX = new THREE.CanvasTexture(cv); MG_ORB_TEX.magFilter = THREE.NearestFilter; MG_ORB_TEX.minFilter = THREE.NearestFilter;
  return MG_ORB_TEX;
}

// ---------- 图标：瓶身 + 按效果颜色染色的液体 ----------
function mgBottleIcon(form, color) {
  const cv = document.createElement('canvas'); cv.width = cv.height = IS;
  const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const bn = form === 'drink' ? 'mcl_potions_potion_bottle' : form === 'splash' ? 'mcl_potions_splash_bottle' : 'mcl_potions_lingering_bottle';
  const on = form === 'drink' ? 'mcl_potions_potion_overlay' : 'mcl_potions_splash_overlay';
  const bb = PACK_READY && PACK_IMG[bn], ob = PACK_READY && PACK_IMG[on];
  const sm = document.createElement('canvas');
  if (bb) {
    const w = bb.w, h = bb.h; sm.width = w; sm.height = h;
    const out = new Uint8ClampedArray(w * h * 4);
    if (color && ob && ob.w === w && ob.h === h) {
      for (let i = 0; i < out.length; i += 4) {
        if (!ob.data[i + 3]) continue;
        out[i] = ob.data[i] * color[0] / 255; out[i + 1] = ob.data[i + 1] * color[1] / 255; out[i + 2] = ob.data[i + 2] * color[2] / 255; out[i + 3] = ob.data[i + 3];
      }
    }
    for (let i = 0; i < out.length; i += 4) {
      const a = bb.data[i + 3] / 255; if (!a) continue;
      for (let k = 0; k < 3; k++) out[i + k] = out[i + k] * (1 - a) + bb.data[i + k] * a;
      out[i + 3] = Math.max(out[i + 3], bb.data[i + 3]);
    }
    sm.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
    const s = IS / Math.max(w, h);
    ctx.drawImage(sm, (IS - w * s) / 2, (IS - h * s) / 2, w * s, h * s);
  } else {
    // 无素材包时的程序瓶子
    sm.width = sm.height = 16; const c = sm.getContext('2d');
    const px = (x, y, col) => { c.fillStyle = `rgb(${col.map(v => v | 0).join(',')})`; c.fillRect(x, y, 1, 1); };
    for (let y = 6; y < 15; y++) for (let x = 3; x < 13; x++) { const d = Math.hypot(x - 7.5, (y - 10.5) * 1.1); if (d < 4.8) px(x, y, d > 3.8 ? [200, 210, 240] : (color || [200, 210, 240])); }
    for (let y = 2; y < 6; y++) { px(7, y, [200, 210, 240]); px(8, y, [200, 210, 240]); }
    px(7, 1, [140, 90, 50]); px(8, 1, [140, 90, 50]);
    ctx.drawImage(sm, 0, 0, IS, IS);
  }
  return cv;
}

// ---------- 方块形状 ----------
const MG_P = 1 / 16;
function mgCauldronBoxes(meta) {
  const p = MG_P, T = n => TEX[n];
  const wall = inner => ({ tex: f => f === 2 ? T('mcl_cauldrons_cauldron_top') : f === 3 ? T('mcl_cauldrons_cauldron_bottom') : f === inner ? T('mcl_cauldrons_cauldron_inner') : T('mcl_cauldrons_cauldron_side') });
  const b = [
    [0, 0, 0, 1, 1, 2 * p, wall(4)], [0, 0, 14 * p, 1, 1, 1, wall(5)],
    [0, 0, 2 * p, 2 * p, 1, 14 * p, wall(0)], [14 * p, 0, 2 * p, 1, 1, 14 * p, wall(1)],
    [2 * p, 3 * p, 2 * p, 14 * p, 4 * p, 14 * p, { tex: f => f === 3 ? T('mcl_cauldrons_cauldron_bottom') : T('mcl_cauldrons_cauldron_inner') }],
  ];
  const lv = meta & 3;
  if (lv) { const h = (6 + 3 * lv) * p; b.push([2 * p, h, 2 * p, 14 * p, h, 14 * p, { tex: f => TEX.water, faces: [false, false, true, false, false, false] }]); }
  return b;
}
function mgBrewingBoxes() {
  const p = MG_P, T = n => TEX[n];
  const base = { tex: () => T('mcl_brewing_base') };
  const plane = { tex: f => T('mcl_brewing_side'), noCull: true };
  return [
    [9 * p, 0, 5 * p, 15 * p, 2 * p, 11 * p, base], [2 * p, 0, 1 * p, 8 * p, 2 * p, 7 * p, base], [2 * p, 0, 9 * p, 8 * p, 2 * p, 15 * p, base],
    [7 * p, 0, 7 * p, 9 * p, 14 * p, 9 * p, { tex: f => f === 2 || f === 3 ? T('mcl_brewing_top') : T('mcl_brewing_side'), uv: f => f < 2 || f > 3 ? [7, 2, 9, 16] : [7, 7, 9, 9] }],
    [0, 0, 0.5, 1, 1, 0.5, Object.assign({ faces: [false, false, false, false, true, true] }, plane)],
    [0.5, 0, 0, 0.5, 1, 1, Object.assign({ faces: [true, true, false, false, false, false] }, plane)],
  ];
}

// ---------- 酿造台界面 ----------
const MG_BREW_TIME = 400;
function mgBrewTile(world, pos) {
  const k = pos.join(',');
  let t = world.tiles.get(k);
  if (!t || t.type !== 'brewing_stand') { t = { type: 'brewing_stand', items: [null, null, null, null, null], fuel: 0, brew: 0 }; world.tiles.set(k, t); }
  return t;
}
function mgTickBrewing(game, t, x, y, z) {
  const it = t.items, ing = it[3], fuel = it[4];
  if (t.fuel <= 0 && fuel && fuel.id === 'blaze_powder') { t.fuel = 20; if (--fuel.n <= 0) it[4] = null; t._dirtyUI = true; }
  const can = !!ing && [0, 1, 2].some(i => it[i] && mgBrew(it[i].id, ing.id));
  if (t.brew > 0) {
    if (!can || ing.id !== t.ingId) { t.brew = 0; t._dirtyUI = true; return; }
    if (--t.brew === 0) {
      for (let i = 0; i < 3; i++) { const r = it[i] && mgBrew(it[i].id, ing.id); if (r) it[i] = { id: r, n: 1 }; }
      if (--ing.n <= 0) it[3] = null;
      game.audio.play('brew', new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5));
      t._dirtyUI = true;
    }
  } else if (can && t.fuel > 0) { t.fuel--; t.brew = MG_BREW_TIME; t.ingId = ing.id; t._dirtyUI = true; }
}

SCREENS.brewing = {
  title: '酿造台',
  open(ui, arg) { ui.mgTile = mgBrewTile(ui.g.world, arg); ui.mgPos = arg; },
  close(ui) { ui.mgTile = null; },
  render(ui) {
    const t = ui.mgTile, it = t.items;
    let bub = '';
    for (let i = 0; i < 5; i++) bub += `<i style="left:${2 + (i * 5) % 14}px;animation-delay:${-i * 0.37}s"></i>`;
    return `<div class="mg-brew">
      <div class="mg-bfuel">${ui.slotHTML('brew', 4, it[4], 'mg-fuelslot')}<div class="mg-fuelbar"><i id="mg-fuel"></i></div></div>
      <div class="mg-bubbles ${t.brew > 0 ? 'on' : ''}">${bub}</div>
      <div class="mg-bing">${ui.slotHTML('brew', 3, it[3])}</div>
      <div class="mg-barrow"><i id="mg-prog"></i></div>
      <div class="mg-bb0">${ui.slotHTML('brew', 0, it[0], 'mg-bottle')}</div>
      <div class="mg-bb1">${ui.slotHTML('brew', 1, it[1], 'mg-bottle')}</div>
      <div class="mg-bb2">${ui.slotHTML('brew', 2, it[2], 'mg-bottle')}</div>
      <div class="mg-btube"></div>
    </div>`;
  },
  after(ui) { SCREENS.brewing.bars(ui); },
  bars(ui) {
    const t = ui.mgTile; if (!t) return;
    const f = document.getElementById('mg-fuel'), pr = document.getElementById('mg-prog');
    if (f) f.style.width = (t.fuel / 20 * 100) + '%';
    if (pr) pr.style.height = (t.brew > 0 ? (MG_BREW_TIME - t.brew) / MG_BREW_TIME * 100 : 0) + '%';
  },
  update(ui) {
    const t = ui.mgTile; if (!t) return;
    if (t._dirtyUI) { t._dirtyUI = false; ui.renderScreen(); } else SCREENS.brewing.bars(ui);
  },
  containers: {
    brew: {
      get: ui => ui.mgTile.items,
      accept: (ui, i, st) => i < 3 ? mgIsBottle(st.id) : i === 3 ? MG_INGREDIENTS.has(st.id) : st.id === 'blaze_powder',
      quick: true,
    },
  },
};

// ---------- 插件注册 ----------
const MG_STYLE = `
.mg-brew { position: relative; width: 300px; height: 150px; margin: 4px auto; }
.mg-brew > div { position: absolute; }
.mg-bfuel { left: 0; top: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; }
.mg-fuelbar { width: 36px; height: 8px; background: #3a3a3a; border: 1px solid #222; }
.mg-fuelbar i { display: block; height: 100%; background: #e8a020; }
.mg-bing { left: 128px; top: 0; }
.mg-bubbles { left: 98px; top: 6px; width: 18px; height: 34px; overflow: hidden; }
.mg-bubbles i { position: absolute; bottom: -4px; width: 4px; height: 4px; border: 1px solid #cfe7ff; border-radius: 50%; opacity: 0; }
.mg-bubbles.on i { animation: mgbub 1.8s linear infinite; }
@keyframes mgbub { 0% { bottom: -4px; opacity: 0; } 15% { opacity: 1; } 100% { bottom: 34px; opacity: 0; } }
.mg-barrow { left: 178px; top: 4px; width: 10px; height: 40px; background: #555; border: 1px solid #222; }
.mg-barrow i { display: block; width: 100%; height: 0; background: #fff; }
.mg-btube { left: 102px; top: 52px; width: 96px; height: 18px; border: 3px solid #555; border-bottom: none; pointer-events: none; }
.mg-bb0 { left: 74px; top: 66px; } .mg-bb1 { left: 128px; top: 80px; } .mg-bb2 { left: 182px; top: 66px; }
.slot.mg-bottle:empty::before { content: ''; position: absolute; inset: 8px; opacity: .3; background: var(--mg-bottle) center/contain no-repeat; }
.slot.mg-lapis:empty::before { content: ''; position: absolute; inset: 8px; opacity: .3; background: var(--mg-lapis) center/contain no-repeat; }
.mg-ench { display: flex; gap: 14px; align-items: flex-start; margin: 4px 0 8px; }
.mg-enchslots { display: flex; gap: 6px; padding-top: 30px; }
.mg-opts { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.mg-opt { position: relative; height: 38px; background: #6b5f52; border: 2px solid; border-color: #9a8b7a #3c342b #3c342b #9a8b7a; color: #685e4a; font-size: 12px; padding: 3px 34px 3px 30px; cursor: pointer; overflow: hidden; line-height: 15px; user-select: none; }
.mg-opt.ok { background: #8a7d6c; color: #e6dfb4; }
.mg-opt.ok:hover { background: #a29380; color: #ffff80; }
.mg-opt.off { background: #4e4840; color: #6e6658; cursor: default; }
.mg-opt .lp { position: absolute; left: 4px; top: 6px; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #7fff3f; text-shadow: 1px 1px 0 #000; }
.mg-opt.off .lp, .mg-opt.no .lp { color: #555; text-shadow: none; }
.mg-opt .lv { position: absolute; right: 5px; bottom: 3px; font-weight: 700; color: #80ff20; text-shadow: 1px 1px 0 #253c10; }
.mg-opt.no .lv { color: #c04030; text-shadow: none; }
.mg-opt .gl { font-family: serif; letter-spacing: 1px; opacity: .85; }
.mg-anvil { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
#mg-name { width: 100%; box-sizing: border-box; background: #000; color: #fff; border: 2px solid #a0a0a0; padding: 4px 6px; font: inherit; font-size: 13px; }
#mg-name:disabled { background: #333; color: #777; }
.mg-plus { font-size: 22px; font-weight: 700; color: #444; }
.mg-cost { min-height: 18px; font-size: 13px; font-weight: 700; color: #80ff20; text-shadow: 1px 1px 0 #253c10; text-align: right; }
.mg-cost.bad { color: #ff6060; text-shadow: 1px 1px 0 #3c1010; }
.mg-grind { display: grid; grid-template-columns: 48px 40px 60px; grid-template-rows: 48px 48px; align-items: center; justify-items: center; margin: 6px auto; width: 160px; }
.mg-grind .x { font-size: 24px; color: #a02020; font-weight: 700; }
`;
function mgInjectStyle() {
  if (document.getElementById('mg-style')) return;
  const s = document.createElement('style'); s.id = 'mg-style'; s.textContent = MG_STYLE;
  document.head.appendChild(s);
}

FEATURES.push({
  name: 'magic_brewing',
  blocks() {
    defBlock('brewing_stand', '酿造台', { shape: 'boxes', boxes: mgBrewingBoxes, tex: { all: 'mcl_brewing_base' }, texNames: ['mcl_brewing_base', 'mcl_brewing_side', 'mcl_brewing_top'], solid: true, opaque: false, render: 'cutout', hard: 0.5, tool: 'pickaxe', emit: 1, sound: 'metal' });
    defBlock('cauldron', '炼药锅', { shape: 'boxes', boxes: mgCauldronBoxes, tex: { all: 'mcl_cauldrons_cauldron_side' }, texNames: ['mcl_cauldrons_cauldron_side', 'mcl_cauldrons_cauldron_top', 'mcl_cauldrons_cauldron_inner', 'mcl_cauldrons_cauldron_bottom'], solid: true, opaque: false, render: 'cutout', hard: 2, tool: 'pickaxe', tier: 1, drop: 'cauldron', sound: 'metal' });
  },
  items() {
    const I = (n, zh, o) => defItem(n, zh, o);
    I('glass_bottle', '玻璃瓶', { icon: 'mcl_potions_potion_bottle' });
    // 药水：饮用 / 喷溅 / 滞留，每种变种一个物品
    for (const type in MG_POTIONS) for (const v of MG_VARIANTS) {
      if (!mgHasVariant(type, v)) continue;
      for (const form in MG_FORMS) {
        const name = mgPotionName(type, v, form);
        MG_PI[name] = { type, v, form };
        const zh = MG_FORMS[form] + MG_POTIONS[type].zh;
        const o = { stack: 1, potion: true };
        if (form === 'drink') Object.assign(o, { food: [0, 0], alwaysEat: true, drink: true, eatTime: 1.6, onEat: mgDrinkPotion });
        I(name, zh, o);
      }
    }
    for (const n in MG_PI) ITEMS[n].desc = mgPotionDesc(n);
    I('experience_bottle', '附魔之瓶', { icon: 'mcl_experience_bottle', glint: true });
    I('golden_apple', '金苹果', { icon: 'mcl_core_apple_golden', food: [4, 9.6], alwaysEat: true,
      onEat(p) { applyEffect(p, 'regeneration', 5, 1); applyEffect(p, 'absorption', 120, 0); return null; } });
    I('enchanted_golden_apple', '附魔金苹果', { icon: 'mcl_core_apple_golden', glint: true, food: [4, 9.6], alwaysEat: true,
      onEat(p) { applyEffect(p, 'regeneration', 20, 1); applyEffect(p, 'absorption', 120, 3); applyEffect(p, 'resistance', 300, 0); applyEffect(p, 'fire_resistance', 300, 0); return null; } });
    I('milk_bucket', '奶桶', { icon: 'mcl_mobitems_bucket_milk', stack: 1, food: [0, 0], alwaysEat: true, drink: true, onEat(p) { clearEffects(p); return 'bucket'; } });
    I('spider_eye', '蜘蛛眼', { icon: 'mcl_mobitems_spider_eye', food: [2, 3.2], onEat(p) { applyEffect(p, 'poison', 5, 0); return null; } });
    I('fermented_spider_eye', '发酵蛛眼', { icon: 'mcl_potions_spider_eye_fermented' });
    I('glistering_melon_slice', '闪烁的西瓜片', { icon: 'mcl_potions_melon_speckled' });
    I('golden_carrot', '金胡萝卜', { icon: 'farming_carrot_gold', food: [6, 14.4] });
    I('rabbit_foot', '兔子脚', { icon: 'mcl_mobitems_rabbit_foot' });
    if (!ITEMS.sugar) I('sugar', '糖', { icon: 'mcl_core_sugar' });
    ITEMS.cauldron.icon = 'mcl_cauldrons_cauldron';
    ITEMS.brewing_stand.icon = 'mcl_brewing_side';
    // 蜘蛛：被玩家杀死时掉落 0-1 个蜘蛛眼
    if (MOB_DEFS.spider) {
      const old = MOB_DEFS.spider.drops;
      MOB_DEFS.spider.drops = (m) => { const d = old(m).slice(); if (m.lastAttacker && m.lastAttacker.isPlayer) d.push(['spider_eye', rnd(1)]); return d; };
    }
    // 喝东西用素材包的饮用音效；玻璃碎裂、装瓶、挤奶
    Object.assign(SND_MAP, { drink: 'mcl_potions_drinking', 'potion.break': 'mcl_potions_breaking_glass', 'bottle.fill': 'mcl_potions_bottle_fill', 'bottle.pour': 'mcl_potions_bottle_pour', 'potion.throw': 'mcl_throwing_throw', 'cow.milk': 'mobs_mc_cow_milk' });
  },
  recipes() {
    shaped(['G G', ' G '], { G: 'glass' }, 'glass_bottle', 3);
    shaped([' B ', 'CCC'], { B: 'blaze_rod', C: '#stone_mat' }, 'brewing_stand');
    shaped(['I I', 'I I', 'III'], { I: 'iron_ingot' }, 'cauldron');
    shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple');
    shaped(['NNN', 'NMN', 'NNN'], { N: 'gold_nugget', M: 'melon_slice' }, 'glistering_melon_slice');
    shaped(['NNN', 'NCN', 'NNN'], { N: 'gold_nugget', C: 'carrot' }, 'golden_carrot');
    shapeless(['spider_eye', 'brown_mushroom', 'sugar'], 'fermented_spider_eye');
    if (!RECIPES.some(r => r.out === 'sugar')) shapeless(['sugar_cane'], 'sugar');
  },
  textures() {
    mgInjectStyle();
    for (const n in MG_PI) {
      const info = MG_PI[n];
      ICON_CANVAS.set(n, mgBottleIcon(info.form, mgPotionColor(n)));
    }
    // 空瓶的槽位底图
    document.documentElement.style.setProperty('--mg-bottle', `url(${mgBottleIcon('drink', null).toDataURL()})`);
    if (PACK_READY && PACK_IMG.mcl_core_lapis) document.documentElement.style.setProperty('--mg-lapis', `url(${window.PACK_TEX.mcl_core_lapis})`);
  },
  tick(game) {
    const w = game.world;
    for (const [k, t] of w.tiles) {
      if (t.type !== 'brewing_stand') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      mgTickBrewing(game, t, x, y, z);
    }
  },
  useBlock(game, player, hit, held) {
    const w = game.world;
    if (hit.id === B.brewing_stand) { game.ui.openScreen('brewing', [hit.x, hit.y, hit.z]); return true; }
    if (hit.id === B.cauldron) {
      const lv = w.getMeta(hit.x, hit.y, hit.z) & 3, pos = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      if (!held) return false;
      const set = l => w.setMeta(hit.x, hit.y, hit.z, l);
      if (held.id === 'water_bucket') { set(3); if (player.mode === 'survival') player.inventory.slots[player.sel] = { id: 'bucket', n: 1 }; game.audio.play('bucket', pos); game.ui.refresh(); return true; }
      if (held.id === 'bucket' && lv === 3) { set(0); mgSwapHeld(game, player, 'water_bucket'); game.audio.play('bucket', pos); return true; }
      if (held.id === 'glass_bottle' && lv > 0) { set(lv - 1); mgSwapHeld(game, player, 'water_bottle'); game.audio.play('bottle.fill', pos); return true; }
      if (held.id === 'water_bottle' && lv < 3) { set(lv + 1); mgSwapHeld(game, player, 'glass_bottle'); game.audio.play('bottle.pour', pos); return true; }
      return false;
    }
    return false;
  },
  useItem(game, player, hit, held) {
    if (!held) return false;
    const info = MG_PI[held.id];
    if (held.id === 'experience_bottle' || (info && info.form !== 'drink')) return mgThrow(game, player, held);
    if (held.id === 'glass_bottle') {
      const lh = raycastBlocks(game.world, player.eye(), player.lookDir(), 5, true);
      if (lh && lh.id === B.water) { mgSwapHeld(game, player, 'water_bottle'); game.audio.play('bottle.fill', new THREE.Vector3(lh.x + 0.5, lh.y + 0.5, lh.z + 0.5)); return true; }
    }
    return false;
  },
  useMob(game, player, mob, held) {
    if (!held) return false;
    const info = MG_PI[held.id];
    if (held.id === 'experience_bottle' || (info && info.form !== 'drink')) return mgThrow(game, player, held);
    if (held.id === 'bucket' && mob.type === 'cow' && !mob.small) {
      mgSwapHeld(game, player, 'milk_bucket');
      if (!game.audio.sfx('cow.milk', mob.pos)) game.audio.play('bucket', mob.pos);
      return true;
    }
    return false;
  },
});

function mgThrow(game, player, held) {
  if (player.throwCd && performance.now() < player.throwCd) return true;
  player.throwCd = performance.now() + 250;
  game.entities.push(new MgThrown(game, player, held.id));
  game.audio.play('potion.throw', player.pos);
  player.swing = 1;
  player.consume(1);
  return true;
}
