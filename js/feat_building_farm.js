'use strict';
// ---------- 建筑模块：作物、食物、蛋糕、甜浆果、钓鱼 ----------

const BLD_CROPS = {
  // 种植物品 -> [方块, 可种在哪些方块上]
  carrot: ['carrots', 'farmland'], potato: ['potatoes', 'farmland'], beetroot_seeds: ['beetroots', 'farmland'],
  pumpkin_seeds: ['pumpkin_stem', 'farmland'], melon_seeds: ['melon_stem', 'farmland'], sweet_berries: ['sweet_berry_bush', 'soil'],
};
const BLD_SOIL = () => [B.grass_block, B.dirt, B.farmland, B.moss_block, B.snowy_grass, B.podzol, B.coarse_dirt].filter(v => v !== undefined);
function bldCanPlant(item, b, w) {
  const c = BLD_CROPS[item]; if (!c || !b || b.n[1] !== 1) return false;
  const ok = c[1] === 'farmland' ? b.id === B.farmland : BLD_SOIL().includes(b.id);
  return ok && BLD.canReplace(w, b.x, b.y + 1, b.z) && !isLiquid(w.getBlock(b.x, b.y + 1, b.z));
}

function bldFarmBlocks() {
  const cross = (n, zh, o) => defBlock(n, zh, Object.assign({ shape: 'cross', hard: 0, plant: true, noItem: true }, o));
  const crop = (n, zh, names, drop) => cross(n, zh, { tex: names[0], texNames: names, crop: true, texFn: (f, m) => TEX[names[Math.min(names.length - 1, m >> 1)]], drop });
  crop('carrots', '胡萝卜', ['farming_carrot_1', 'farming_carrot_2', 'farming_carrot_3', 'farming_carrot_4'],
    m => m >= 7 ? ['carrot', 2 + Math.floor(Math.random() * 4)] : ['carrot', 1]);
  crop('potatoes', '马铃薯', ['mcl_farming_potatoes_stage_0', 'mcl_farming_potatoes_stage_1', 'mcl_farming_potatoes_stage_2', 'mcl_farming_potatoes_stage_3'],
    m => m >= 7 ? [['potato', 2 + Math.floor(Math.random() * 4)], Math.random() < 0.02 ? ['poisonous_potato', 1] : null] : ['potato', 1]);
  crop('beetroots', '甜菜根', ['mcl_farming_beetroot_0', 'mcl_farming_beetroot_1', 'mcl_farming_beetroot_2', 'mcl_farming_beetroot_3'],
    m => m >= 7 ? [['beetroot', 1], ['beetroot_seeds', 1 + Math.floor(Math.random() * 3)]] : ['beetroot_seeds', 1]);
  const stems = []; for (let i = 0; i < 8; i++) stems.push('bld_stem_' + i);
  for (const [n, zh, fruit, seed] of [['pumpkin_stem', '南瓜茎', 'pumpkin', 'pumpkin_seeds'], ['melon_stem', '西瓜茎', 'melon', 'melon_seeds']]) {
    cross(n, zh, { tex: stems[0], texNames: stems, crop: true, texFn: (f, m) => TEX[stems[m & 7]], drop: () => Math.random() < 0.5 ? [seed, 1] : null, bldTick: 'stem', fruit });
  }
  cross('sweet_berry_bush', '甜浆果丛', {
    tex: 'mcl_farming_sweet_berry_bush_0', texNames: ['mcl_farming_sweet_berry_bush_1', 'mcl_farming_sweet_berry_bush_2', 'mcl_farming_sweet_berry_bush_3'],
    texFn: (f, m) => TEX['mcl_farming_sweet_berry_bush_' + Math.min(3, m)], bldTick: 'bush', bldKind: 'bush',
    drop: m => m >= 2 ? ['sweet_berries', m === 3 ? 2 + rnd(1) : 1 + rnd(1)] : null,
  });
  // 蛋糕：meta = 已吃掉的块数（0..6）
  defBlock('cake', '蛋糕', {
    shape: 'boxes', tex: 'cake_side', texNames: ['cake_top', 'cake_bottom', 'cake_inner'], opaque: false, hard: 0.5, drop: null, sound: 'wool', bldKind: 'cake',
    boxes: m => [[(1 + 2 * Math.min(6, m)) / 16, 0, 1 / 16, 15 / 16, 0.5, 15 / 16, {
      tex: f => f === 2 ? TEX.cake_top : f === 3 ? TEX.cake_bottom : (f === 1 && m > 0) ? TEX.cake_inner : TEX.cake_side,
    }]],
  });
  ITEMS.cake.stack = 1; ITEMS.cake.icon = 'cake';
}

function bldFarmItems() {
  const I = (n, zh, o) => ITEMS[n] ? ITEMS[n] : defItem(n, zh, o);
  const plant = item => (pl, b) => bldCanPlant(item, b, pl.world);
  I('carrot', '胡萝卜', { food: [3, 3.6], icon: 'farming_carrot', canUse: plant('carrot') });
  I('potato', '马铃薯', { food: [1, 0.6], icon: 'farming_potato', canUse: plant('potato') });
  I('baked_potato', '烤马铃薯', { food: [5, 6], icon: 'farming_potato_baked' });
  I('poisonous_potato', '毒马铃薯', { food: [2, 1.2], icon: 'farming_potato_poison', onEat: pl => { if (Math.random() < 0.6) applyEffect(pl, 'poison', 5, 0); return null; } });
  I('beetroot', '甜菜根', { food: [1, 1.2], icon: 'mcl_farming_beetroot' });
  I('beetroot_seeds', '甜菜种子', { icon: 'mcl_farming_beetroot_seeds' });
  I('beetroot_soup', '甜菜汤', { food: [6, 7.2], stack: 1, icon: 'mcl_farming_beetroot_soup', onEat: () => 'bowl' });
  I('pumpkin_seeds', '南瓜种子', { icon: 'mcl_farming_pumpkin_seeds' });
  I('melon_seeds', '西瓜种子', { icon: 'mcl_farming_melon_seeds' });
  I('sweet_berries', '甜浆果', { food: [2, 0.4], icon: 'mcl_farming_sweet_berry', canUse: plant('sweet_berries') });
  I('cookie', '曲奇', { food: [2, 0.4], icon: 'farming_cookie' });
  I('pumpkin_pie', '南瓜派', { food: [8, 4.8], icon: 'mcl_farming_pumpkin_pie' });
  I('bowl', '碗', { icon: 'mcl_core_bowl', fuel: 100 });
  I('sugar', '糖', { icon: 'mcl_core_sugar' });
  // 蘑菇煲：吃完返还碗
  const stew = ITEMS.mushroom_stew;
  if (stew && !stew._bldBowl) { const o = stew.onEat; stew.onEat = (p, s, g) => (o && o(p, s, g)) || 'bowl'; stew._bldBowl = true; }
  // 钓鱼
  I('fishing_rod', '钓鱼竿', { durability: 64, icon: 'mcl_fishing_fishing_rod' });
  I('cod', '生鳕鱼', { food: [2, 0.4], icon: 'mcl_fishing_fish_raw' });
  I('cooked_cod', '熟鳕鱼', { food: [5, 6], icon: 'mcl_fishing_fish_cooked' });
  I('salmon', '生鲑鱼', { food: [2, 0.4], icon: 'mcl_fishing_salmon_raw' });
  I('cooked_salmon', '熟鲑鱼', { food: [6, 9.6], icon: 'mcl_fishing_salmon_cooked' });
  I('tropical_fish', '热带鱼', { food: [1, 0.2], icon: 'mcl_fishing_clownfish_raw' });
  I('pufferfish', '河豚', {
    food: [1, 0.2], icon: 'mcl_fishing_pufferfish_raw',
    onEat: pl => { applyEffect(pl, 'poison', 60, 1); applyEffect(pl, 'hunger', 15, 2); applyEffect(pl, 'nausea', 15, 0); return null; },
  });
  // 僵尸稀有掉落胡萝卜/马铃薯
  if (MOB_DEFS.zombie && !MOB_DEFS.zombie._bldWrap) {
    const orig = MOB_DEFS.zombie.drops;
    MOB_DEFS.zombie.drops = m => { const d = orig(m).slice(); const r = Math.random(); if (r < 0.01) d.push(['carrot', 1]); else if (r < 0.02) d.push(['potato', 1]); return d; };
    MOB_DEFS.zombie._bldWrap = true;
  }
}

function bldFarmRecipes() {
  SMELT.potato = 'baked_potato'; SMELT.cod = 'cooked_cod'; SMELT.salmon = 'cooked_salmon';
  shaped(['P P', ' P '], { P: '#planks' }, 'bowl', 4);
  if (!RECIPES.some(r => r.out === 'sugar')) shapeless(['sugar_cane'], 'sugar', 1);
  shapeless(['beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'beetroot', 'bowl'], 'beetroot_soup', 1);
  shapeless(['pumpkin'], 'pumpkin_seeds', 4);
  shapeless(['melon_slice'], 'melon_seeds', 1);
  shaped(['WCW'], { W: 'wheat', C: 'cocoa_beans' }, 'cookie', 8);
  if (ITEMS.egg) shapeless(['pumpkin', 'sugar', 'egg'], 'pumpkin_pie', 1);
  if (ITEMS.egg && ITEMS.milk_bucket) shaped(['MMM', 'SES', 'WWW'], { M: 'milk_bucket', S: 'sugar', E: 'egg', W: 'wheat' }, 'cake', 1);
  shaped(['  S', ' SL', 'S L'], { S: 'stick', L: 'string' }, 'fishing_rod', 1);
  // 蘑菇煲需要碗
  const st = RECIPES.find(r => r.out === 'mushroom_stew' && r.type === 'shapeless');
  if (st && !st.ings.includes('bowl')) st.ings = st.ings.concat(['bowl']);
}

function bldFarmTextures() {
  // 南瓜/西瓜茎：素材是灰度图，按生长阶段截取高度并染色
  for (let s = 0; s < 8; s++) {
    defTex('bld_stem_' + s, p => {
      const fr = PACK_READY ? packFrame('mcl_farming_pumpkin_stem_disconnected', 0) : null;
      const col = [s * 32, 255 - s * 8, s * 4], top = 16 - (s + 1) * 2;
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (fr) { const i = (y * 16 + x) * 4, a = y >= top ? fr[i + 3] : 0; p.set(x, y, [fr[i] * col[0] / 255, fr[i + 1] * col[1] / 255, fr[i + 2] * col[2] / 255], a); }
        else p.set(x, y, col, (x === 8 && y >= top) ? 255 : 0);
      }
    });
  }
}

function bldFarmBlockUpdate(w, x, y, z, id) {
  const d = BLOCKS[id];
  if (d.bldKind === 'bush') { if (!BLD_SOIL().includes(w.getBlock(x, y - 1, z))) w.breakBlock(x, y, z, true); return true; }
  if (d.bldKind === 'cake') { if (!BLD.isSolid(w.getBlock(x, y - 1, z))) w.setBlock(x, y, z, 0); return true; }
  return false;
}

function bldFarmRandomTick(w, x, y, z, id) {
  const d = BLOCKS[id];
  if (d.bldTick === 'stem') {
    const m = w.getMeta(x, y, z);
    const light = Math.max(w.skyLight(x, y + 1, z), w.blockLight(x, y + 1, z));
    if (light < 9) return true;
    if (m < 7) { if (Math.random() < 0.35) w.setMeta(x, y, z, m + 1); return true; }
    const fruit = B[d.fruit];
    if (BLD.H4.some(([dx, dz]) => w.getBlock(x + dx, y, z + dz) === fruit) || Math.random() > 0.3) return true;
    const [dx, dz] = BLD.H4[Math.floor(Math.random() * 4)];
    const g = w.getBlock(x + dx, y - 1, z + dz);
    if (w.getBlock(x + dx, y, z + dz) === 0 && (g === B.dirt || g === B.grass_block || g === B.farmland || g === B.moss_block)) w.setBlock(x + dx, y, z + dz, fruit);
    return true;
  }
  if (d.bldTick === 'bush') {
    const m = w.getMeta(x, y, z);
    if (m < 3 && Math.random() < 0.2 && Math.max(w.skyLight(x, y + 1, z), w.blockLight(x, y + 1, z)) >= 9) w.setMeta(x, y, z, m + 1);
    return true;
  }
  return false;
}

function bldFarmUseBlock(game, player, b, held) {
  const w = game.world;
  if (b.id === B.cake) {
    if (player.food >= 20 && player.mode !== 'creative') return true;
    player.food = Math.min(20, player.food + 2); player.sat = Math.min(player.food, player.sat + 0.4);
    game.audio.play('eat'); game.audio.play('burp');
    const m = w.getMeta(b.x, b.y, b.z) + 1;
    if (m > 6) w.setBlock(b.x, b.y, b.z, 0); else w.setMeta(b.x, b.y, b.z, m);
    game.ui.refresh();
    return true;
  }
  if (b.id === B.sweet_berry_bush) {
    const m = w.getMeta(b.x, b.y, b.z);
    if (held && held.id === 'bone_meal') {
      if (m < 3) { w.setMeta(b.x, b.y, b.z, m + 1); player.consume(); game.particles.burst(b.x + 0.5, b.y + 0.8, b.z + 0.5, [120, 230, 120], 12, 1); }
      return true;
    }
    if (m >= 2) {
      game.dropItem(b.x + 0.5, b.y + 0.5, b.z + 0.5, 'sweet_berries', m === 3 ? 2 + rnd(1) : 1 + rnd(1));
      w.setMeta(b.x, b.y, b.z, 1); game.audio.play('pop');
      return true;
    }
  }
  return false;
}

function bldFarmUseItem(game, player, b, held) {
  if (!held) return false;
  if (held.id === 'fishing_rod') return bldRodUse(game, player);
  const c = BLD_CROPS[held.id];
  if (c && b) {
    if (!bldCanPlant(held.id, b, game.world)) return !ITEMS[held.id].food;
    game.world.setBlock(b.x, b.y + 1, b.z, B[c[0]], 0);
    game.audio.digSound(B.grass_block, 1);
    player.consume();
    return true;
  }
  return false;
}

// 甜浆果丛：减速并扣血
function bldFarmTick(game) {
  const p = game.player, w = game.world;
  if (!p || !p.alive || p.riding) return;
  let inBush = false;
  for (const dy of [0, 1]) {
    const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y + dy * 0.9), z = Math.floor(p.pos.z);
    if (w.getBlock(x, y, z) === B.sweet_berry_bush && w.getMeta(x, y, z) > 0) inBush = true;
  }
  if (!inBush) return;
  p.vel.x *= 0.45; p.vel.z *= 0.45;
  if (Math.hypot(p.vel.x, p.vel.z) > 0.15 && p.mode === 'survival') p.hurt(1, 'sweet_berry_bush');
}

// ---------------- 钓鱼 ----------------
class BldBobber extends Entity {
  constructor(game, owner) {
    const e = owner.eye(), d = owner.lookDir();
    super(game, e.x + d.x * 0.5, e.y + d.y * 0.5 - 0.1, e.z + d.z * 0.5);
    this.owner = owner; this.w = 0.12; this.h = 0.25; this.stepH = 0;
    this.vel.set(d.x * 12, d.y * 12 + 3, d.z * 12);
    this.wait = 5 + Math.random() * 25; this.bite = 0; this.floatT = 0;
    const tex = packTexture('mcl_fishing_bobber');
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex || null, color: tex ? 0xffffff : 0xdd3333, transparent: true, alphaTest: 0.3 }));
    this.mesh.scale.setScalar(0.35);
    game.scene.add(this.mesh);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x202020 }));
    this.line.frustumCulled = false;
    game.scene.add(this.line);
  }
  update(dt) {
    const g = this.game, o = this.owner, w = this.world;
    this.age += dt;
    const h = o.held();
    if (!o.alive || !h || h.id !== 'fishing_rod' || this.pos.distanceTo(o.pos) > 40 || this.age > 300) { this.dead = true; return; }
    const cx = Math.floor(this.pos.x), cz = Math.floor(this.pos.z);
    const inWater = this.inWater = w.getBlock(cx, Math.floor(this.pos.y + 0.12), cz) === B.water;
    if (inWater) {
      // 漂在水面：顶层水格的 0.9 高度处
      let ty = Math.floor(this.pos.y + 0.12); while (w.getBlock(cx, ty + 1, cz) === B.water) ty++;
      const surf = ty + 0.85 - 0.12 - (this.bite > 0 ? 0.25 : 0);
      this.vel.y += ((surf - this.pos.y) * 30 - this.vel.y * 6) * dt;
      this.vel.x *= Math.pow(0.05, dt); this.vel.z *= Math.pow(0.05, dt);
      this.floatT += dt;
    } else { this.vel.y -= 20 * dt; this.floatT = 0; }
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (this.onGround && !inWater) { this.vel.x *= Math.pow(0.01, dt); this.vel.z *= Math.pow(0.01, dt); }
    // 等待上钩
    if (inWater && this.floatT > 0.5) {
      if (this.bite > 0) { this.bite -= dt; if (this.bite <= 0) this.wait = 5 + Math.random() * 25; }
      else {
        this.wait -= dt;
        if (this.wait > 0 && this.wait < 3 && Math.random() < dt * 4) {
          // 鱼游近的水花轨迹
          const a = Math.random() * Math.PI * 2, r = this.wait * 1.2;
          g.particles.add(this.pos.x + Math.cos(a) * r, this.pos.y + 0.15, this.pos.z + Math.sin(a) * r, 0, 0.5, 0, [200, 220, 255], 0.5, 0);
        }
        if (this.wait <= 0) {
          this.bite = 0.9 + Math.random() * 0.6;
          for (let i = 0; i < 16; i++) g.particles.add(this.pos.x + (Math.random() - 0.5) * 0.6, this.pos.y + 0.2, this.pos.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, [210, 230, 255], 0.6, 12);
          g.audio.play('splash', this.pos);
        }
      }
    }
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15, this.pos.z);
    const b = this.lightAt(); this.mesh.material.color.setRGB(b, b, b);
    // 鱼线：从手的大致位置连到浮标
    const e = o.eye(), d = o.lookDir(), rx = Math.cos(o.yaw) * 0.35, rz = -Math.sin(o.yaw) * 0.35;
    const a = this.line.geometry.attributes.position.array;
    a[0] = e.x + d.x * 0.6 + rx; a[1] = e.y + d.y * 0.6 + 0.05; a[2] = e.z + d.z * 0.6 + rz;
    a[3] = this.pos.x; a[4] = this.pos.y + 0.25; a[5] = this.pos.z;
    this.line.geometry.attributes.position.needsUpdate = true;
  }
  dispose() { super.dispose(); if (this.line) { this.game.scene.remove(this.line); this.line.geometry.dispose(); } }
}

function bldFishLoot() {
  const r = Math.random();
  const pick = list => { list = list.filter(e => ITEMS[e[0]]); let t = list.reduce((a, e) => a + e[1], 0) * Math.random(); for (const e of list) { t -= e[1]; if (t <= 0) return e[0]; } return list[0][0]; };
  if (r < 0.85) return [pick([['cod', 60], ['salmon', 25], ['tropical_fish', 2], ['pufferfish', 13]]), 1];
  if (r < 0.95) {
    const it = pick([['bowl', 10], ['leather', 10], ['rotten_flesh', 10], ['stick', 5], ['string', 5], ['bone', 10], ['ink_sac', 1], ['cocoa_beans', 2], ['fishing_rod', 2]]);
    return [it, it === 'ink_sac' ? 10 : 1];
  }
  return [pick([['bow', 1], ['fishing_rod', 1], ['book', 1], ['name_tag', 1], ['saddle', 1], ['nautilus_shell', 1]]), 1];
}

function bldRodUse(game, player) {
  const now = performance.now();
  if (player._rodT && now - player._rodT < 400) return true;
  player._rodT = now;
  const bob = player._bobber;
  if (bob && !bob.dead) {
    if (bob.bite > 0) {
      const [name, n] = bldFishLoot();
      const it = game.dropItem(bob.pos.x, bob.pos.y + 0.5, bob.pos.z, name, n);
      if (it) {
        const dx = player.pos.x - bob.pos.x, dy = player.pos.y + 1 - bob.pos.y, dz = player.pos.z - bob.pos.z;
        it.vel.set(dx * 1.6, dy * 1.6 + Math.sqrt(Math.hypot(dx, dy, dz)) * 1.6, dz * 1.6); it.pickup = 0;
        if (name === 'fishing_rod' || name === 'bow') it.dmg = Math.floor(ITEMS[name].durability * Math.random() * 0.8);
      }
      player.addXp(1 + rnd(5));
      player.damageHeld(1);
    } else if (bob.onGround && !bob.inWater) player.damageHeld(2);
    bob.dead = true; player._bobber = null;
    game.audio.play('reel', player.pos);
    player.swing = 1;
    return true;
  }
  const nb = new BldBobber(game, player);
  game.entities.push(nb); player._bobber = nb;
  game.audio.play('bow', player.pos); player.swing = 1;
  return true;
}

// ---------------- 生成：针叶林的甜浆果丛 ----------------
function bldFarmGen(w, ch, cols) {
  const r = mulberry32(hash3(w.seed, ch.cx, 4411, ch.cz));
  if (r() > 0.35) return;
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(r() * 16), z = Math.floor(r() * 16), ci = cols[(z + 1) * 18 + x + 1];
    if (ci.biome !== 'taiga' && ci.biome !== 'snowy_taiga') continue;
    const y = ci.h;
    if (y + 1 >= CH) continue;
    const g = ch.blocks[idx3(x, y, z)], a = idx3(x, y + 1, z);
    if ((g === B.grass_block || g === B.snowy_grass) && (ch.blocks[a] === 0 || ch.blocks[a] === B.short_grass || ch.blocks[a] === B.fern)) { ch.blocks[a] = B.sweet_berry_bush; ch.meta[a] = 1 + Math.floor(r() * 3); }
  }
}

FEATURES.push({
  name: 'building_farm',
  blocks: bldFarmBlocks,
  items: bldFarmItems,
  recipes: bldFarmRecipes,
  textures: bldFarmTextures,
  genChunk: bldFarmGen,
  blockUpdate: bldFarmBlockUpdate,
  randomTick: bldFarmRandomTick,
  useBlock: bldFarmUseBlock,
  useItem: bldFarmUseItem,
  tick: bldFarmTick,
});
