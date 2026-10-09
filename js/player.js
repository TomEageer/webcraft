'use strict';
// ---------- 玩家：背包、移动、挖掘、放置、战斗、生存属性 ----------

class Inventory {
  constructor(size) { this.slots = new Array(size || 36).fill(null); }
  maxStack(name) { const it = ITEMS[name]; return it ? it.stack : 64; }
  add(name, count, dmg, ench) {
    const ms = this.maxStack(name);
    if (ench) { for (let i = 0; i < this.slots.length; i++) if (!this.slots[i]) { this.slots[i] = { id: name, n: count, dmg, ench }; return 0; } return count; }
    if (ms > 1) for (let i = 0; i < this.slots.length && count > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === name && s.n < ms) { const k = Math.min(ms - s.n, count); s.n += k; count -= k; }
    }
    for (let i = 0; i < this.slots.length && count > 0; i++) {
      if (!this.slots[i]) { const k = Math.min(ms, count); this.slots[i] = { id: name, n: k }; if (dmg) this.slots[i].dmg = dmg; count -= k; }
    }
    return count;
  }
  count(name) { return this.slots.reduce((a, s) => a + (s && s.id === name ? s.n : 0), 0); }
  removeOne(name) {
    for (let i = this.slots.length - 1; i >= 0; i--) { const s = this.slots[i]; if (s && s.id === name) { if (--s.n <= 0) this.slots[i] = null; return true; } }
    return false;
  }
  toJSON() { return this.slots; }
}

function raycastBlocks(world, o, d, maxDist, liquids) {
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = Math.abs(1 / d.x), tdy = Math.abs(1 / d.y), tdz = Math.abs(1 / d.z);
  let tmx = sx > 0 ? (x + 1 - o.x) * tdx : (o.x - x) * tdx;
  let tmy = sy > 0 ? (y + 1 - o.y) * tdy : (o.y - y) * tdy;
  let tmz = sz > 0 ? (z + 1 - o.z) * tdz : (o.z - z) * tdz;
  if (!isFinite(tmx)) tmx = Infinity; if (!isFinite(tmy)) tmy = Infinity; if (!isFinite(tmz)) tmz = Infinity;
  for (let i = 0; i < 200; i++) {
    const id = world.getBlock(x, y, z);
    if (id && (liquids ? (isLiquid(id) ? (world.getMeta(x, y, z) & 7) === 0 && !(world.getMeta(x, y, z) & 8) : true) : !isLiquid(id))) {
      const boxes = shapeBoxes(id, world.getMeta(x, y, z), worldNB(world, x, y, z));
      let best = null;
      for (const b of boxes) {
        const h = rayBox(o, d, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
        if (h && (!best || h.t < best.t)) best = h;
      }
      if (best && best.t <= maxDist) return { x, y, z, id, t: best.t, n: best.n, p: best.p };
    }
    const tmin = Math.min(tmx, tmy, tmz);
    if (tmin > maxDist) return null;
    if (tmx === tmin) { x += sx; tmx += tdx; } else if (tmy === tmin) { y += sy; tmy += tdy; } else { z += sz; tmz += tdz; }
  }
  return null;
}
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, n = null;
  const ax = [[o.x, d.x, x0, x1, [-1, 0, 0], [1, 0, 0]], [o.y, d.y, y0, y1, [0, -1, 0], [0, 1, 0]], [o.z, d.z, z0, z1, [0, 0, -1], [0, 0, 1]]];
  for (const [oo, dd, a, b, na, nb] of ax) {
    if (Math.abs(dd) < 1e-9) { if (oo < a || oo > b) return null; continue; }
    let t1 = (a - oo) / dd, t2 = (b - oo) / dd, n1 = na, n2 = nb;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [n1, n2] = [n2, n1]; }
    if (t1 > tmin) { tmin = t1; n = n1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const t = Math.max(0, tmin);
  return { t, n: n || [0, 1, 0], p: [o.x + d.x * t, o.y + d.y * t, o.z + d.z * t] };
}

class Player extends Entity {
  constructor(game, x, y, z) {
    super(game, x, y, z);
    this.isPlayer = true; this.w = 0.3; this.h = 1.8;
    this.pitch = 0; this.mode = 'survival'; this.flying = false;
    this.health = 20; this.food = 20; this.sat = 5; this.exh = 0; this.air = 15; this.xp = 0; this.level = 0;
    this.inventory = new Inventory(36); this.sel = 0; this.alive = true;
    this.spawn = [x, y, z];
    this.mining = null; this.mineProg = 0; this.mineCd = 0; this.useCd = 0; this.attackCd = 0;
    this.regenT = 0; this.starveT = 0; this.drownT = 0; this.lavaT = 0; this.cactusT = 0;
    this.sprinting = false; this.sneaking = false; this.lastW = 0; this.lastSpace = 0;
    this.bob = 0; this.swing = 0; this.eatT = 0; this.bowT = 0; this.stepDist = 0;
    this.armor = [null, null, null, null]; this.effects = {}; this.absorb = 0;
  }
  // 落地：按摔落高度播放脚下方块的声音（原版行为），摔伤时另有摔落音效
  onLand(dist) {
    const below = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
    if (dist > 0.4 && !this.inWater && this.mode !== 'spectator') {
      const m = this.game.audio.material(below);
      this.game.audio.sfx('step.' + m, null, Math.min(1, 0.35 + dist * 0.12), 0.75 + Math.random() * 0.1) || this.game.audio.stepSound(below);
      if (dist > 3.5 && this.mode === 'survival') this.game.audio.sfx('fall', null, Math.min(1, dist / 10));
      // 原版：落地时脚下方块溅起碎屑，摔得越高越多
      if (below && dist > 1.5) { const n = Math.min(60, Math.floor(dist * 6)); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5; this.game.particles.blockCrumb(below, this.pos.x + Math.cos(a) * r, this.pos.y + 0.05, this.pos.z + Math.sin(a) * r, Math.cos(a) * 2, 1.5 + Math.random() * 2, Math.sin(a) * 2); } }
    }
    super.onLand(dist);
  }
  maxHealth() { return 20; }
  onClimbable() {
    const w = this.world;
    for (let y = Math.floor(this.pos.y); y <= Math.floor(this.pos.y + 1); y++)
      for (const [dx, dz] of [[0, 0], [0.32, 0], [-0.32, 0], [0, 0.32], [0, -0.32]]) {
        const id = w.getBlock(Math.floor(this.pos.x + dx), y, Math.floor(this.pos.z + dz));
        if (id && BLOCKS[id].climbable) return true;
      }
    return false;
  }
  armorPoints() { let p = 0, t = 0; for (const s of this.armor) if (s && ITEMS[s.id] && ITEMS[s.id].armor) { p += ITEMS[s.id].armor.points; t += ITEMS[s.id].armor.tough; } return [p, t]; }
  armorEnch(id) { let n = 0; for (const s of this.armor) n += enchLv(s, id); return n; }
  eye() { return new THREE.Vector3(this.pos.x, this.pos.y + (this.sneaking ? 1.27 : 1.62), this.pos.z); }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }
  held() { return this.inventory.slots[this.sel]; }
  holding() { const h = this.held(); return h ? h.id : null; }
  addXp(n) {
    this.xp += n;
    for (;;) { const need = this.level < 16 ? 2 * this.level + 7 : this.level < 31 ? 5 * this.level - 38 : 9 * this.level - 158; if (this.xp < need) break; this.xp -= need; this.level++; this.game.audio.play('levelup'); }
    if (n > 0) this.game.audio.play('xp');
  }
  hurt(dmg, src, attacker) {
    if (!this.alive || this.mode !== 'survival' || dmg <= 0) return false;
    if (this.hurtTime > 0 && src !== 'void' && src !== 'starve' && src !== 'drown' && src !== 'poison' && src !== 'wither') return false;
    const fireSrc = src === 'lava' || src === 'fire';
    if (fireSrc && effLv(this, 'fire_resistance')) return false;
    if (src === 'fall' && effLv(this, 'slow_falling')) return false;
    const bypass = ['void', 'starve', 'drown', 'magic', 'poison', 'wither'].includes(src);
    if (!bypass) {
      const [pts, tough] = this.armorPoints();
      if (pts) {
        dmg = armorReduce(dmg, pts, tough);
        for (let i = 0; i < 4; i++) this.damageArmor(i, 1);
      }
      let epf = this.armorEnch('protection');
      if (fireSrc) epf += 2 * this.armorEnch('fire_protection');
      if (src === 'explosion') epf += 2 * this.armorEnch('blast_protection');
      if (src === 'arrow') epf += 2 * this.armorEnch('projectile_protection');
      if (src === 'fall') epf += 3 * enchLv(this.armor[3], 'feather_falling');
      dmg *= 1 - Math.min(20, epf) * 0.04;
      const th = this.armorEnch('thorns');
      if (th && attacker && attacker.hurt && Math.random() < 0.15 * th) attacker.hurt(1 + rnd(3), 'thorns', this);
    }
    const res = effLv(this, 'resistance'); if (res && src !== 'void') dmg *= Math.max(0, 1 - 0.2 * res);
    for (const f of FEATURES) if (f.damageTaken) dmg = f.damageTaken(this.game, this, dmg, src, attacker);
    // 难度：只缩放生物造成的伤害
    const diff = this.game.rules.difficulty || 'normal';
    if (attacker && attacker.def) dmg = diff === 'peaceful' ? 0 : diff === 'easy' ? Math.min(dmg / 2 + 1, dmg) : diff === 'hard' ? dmg * 1.5 : dmg;
    if (dmg <= 0) return false;
    this.game.stats.damage = (this.game.stats.damage || 0) + dmg;
    if (this.absorb > 0) { const a = Math.min(this.absorb, dmg); this.absorb -= a; dmg -= a; }
    this.health -= dmg; this.hurtTime = 0.5; this.exh += 0.1;
    this.game.audio.play('hurt'); this.game.ui.flashDamage();
    if (attacker) {
      const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / l * 6; this.vel.z += dz / l * 6; this.vel.y = 5;
    }
    if (this.health <= 0) this.die(src, attacker);
    return true;
  }
  damageArmor(i, n) {
    const s = this.armor[i]; if (!s || this.mode !== 'survival') return;
    const it = ITEMS[s.id]; if (!it.durability) return;
    const ub = enchLv(s, 'unbreaking'); if (ub && Math.random() > 1 / (ub + 1)) return;
    s.dmg = (s.dmg || 0) + n;
    if (s.dmg >= it.durability) { this.armor[i] = null; this.game.audio.play('break_tool'); this.game.ui.refresh(); }
  }
  die(src, attacker) {
    this.health = 0; this.alive = false; clearEffects(this);
    const msg = { fall: '从高处摔了下来', lava: '试图在熔岩里游泳', drown: '淹死了', starve: '饿死了', explosion: '被炸死了', void: '掉出了这个世界', cactus: '被戳死了', arrow: '被射杀' }[src] || (attacker ? '被' + attacker.def.zh + '杀死了' : '死了');
    if (!this.game.rules.keepInventory) {
      for (let i = 0; i < 36; i++) { const s = this.inventory.slots[i]; if (s) { this.game.dropItem(this.pos.x, this.pos.y + 1, this.pos.z, s.id, s.n, s.dmg, s.ench); this.inventory.slots[i] = null; } }
      for (let i = 0; i < 4; i++) { const s = this.armor[i]; if (s) { this.game.dropItem(this.pos.x, this.pos.y + 1, this.pos.z, s.id, s.n, s.dmg, s.ench); this.armor[i] = null; } }
      this.xp = 0; this.level = 0;
    }
    this.game.ui.showDeath('玩家' + msg);
  }
  respawn() {
    this.alive = true; this.health = 20; this.food = 20; this.sat = 5; this.air = 15; this.fire = 0; clearEffects(this);
    this.pos.set(this.spawn[0], this.spawn[1], this.spawn[2]); this.vel.set(0, 0, 0); this.fallDist = 0;
  }

  update(dt) {
    const g = this.game, inp = g.input, world = this.world;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (!this.alive) return;
    tickEffects(this, dt);
    const playing = g.state === 'playing';
    const key = k => playing && inp.keys.has(k);
    // ---- 移动 ----
    let fw = 0, st = 0;
    if (key('KeyW')) fw += 1; if (key('KeyS')) fw -= 1; if (key('KeyA')) st -= 1; if (key('KeyD')) st += 1;
    this.sneaking = (g.settings.toggleSneak ? !!this.sneakToggled && playing : key('ShiftLeft')) && !this.flying;
    if (key('ControlLeft') && fw > 0) this.sprinting = true;
    if (fw <= 0 || this.sneaking || (this.food <= 6 && this.mode === 'survival') || this.horizHit && !this.flying) this.sprinting = false;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = -sin * fw + cos * st, mz = -cos * fw - sin * st;
    const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
    if (this.mode === 'spectator') this.flying = true;
    // 插件接管移动（例如骑乘船/矿车）
    let moved = false;
    for (const f of FEATURES) if (f.playerMove && f.playerMove(g, this, dt, { fw, st, mx, mz, jump: key('Space'), sneak: key('ShiftLeft') })) { moved = true; break; }
    if (moved) { this.fallDist = 0; this.checkFluids(); }
    else if (this.flying) {
      const sp = this.sprinting ? 21.6 : 10.9;
      const k = Math.min(1, dt * 10);
      this.vel.x += (mx * sp - this.vel.x) * k; this.vel.z += (mz * sp - this.vel.z) * k;
      let vy = 0; if (key('Space')) vy += 7.5; if (key('ShiftLeft')) vy -= 7.5;
      this.vel.y += (vy - this.vel.y) * k;
      if (this.mode === 'spectator') { this.pos.addScaledVector(this.vel, dt); }
      else { this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt); if (this.onGround && this.mode === 'creative') this.flying = false; }
      this.fallDist = 0;
      this.checkFluids();
    } else {
      this.checkFluids();
      let sp = this.sneaking ? 1.31 : this.sprinting ? 5.61 : 4.317;
      sp *= (1 + 0.2 * effLv(this, 'speed')) * Math.max(0.1, 1 - 0.15 * effLv(this, 'slowness'));
      if (this.inWater) sp *= 0.5 + 0.17 * Math.min(3, enchLv(this.armor[3], 'depth_strider'));
      if (this.inLava) sp *= 0.3;
      const k = this.onGround ? Math.min(1, dt * 18) : this.inWater ? Math.min(1, dt * 6) : Math.min(1, dt * 3.5);
      this.vel.x += (mx * sp - this.vel.x) * k; this.vel.z += (mz * sp - this.vel.z) * k;
      if (key('Space')) {
        if (this.inWater || this.inLava) {
          // 头没入水中时上浮；到水面后浮在“眼睛刚露出水面”的位置
          if (this.sub > 1.75) this.vel.y = Math.min(this.vel.y + 30 * dt, 3.2);
          else this.swimFloat(1.1 + Math.sin(performance.now() / 700) * 0.06, dt);
          // 贴着岸边时可以爬出水面
          if (this.horizHit && this.sub < 1.6) this.vel.y = Math.max(this.vel.y, 5.5);
        }
        else if (this.onGround && this.jumpCd <= 0) {
          this.vel.y = 9.0 + 1.6 * effLv(this, 'jump_boost'); this.jumpCd = 0.25; g.stats.jumps = (g.stats.jumps || 0) + 1;
          g.audio.stepSound(world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)));
          if (this.sprinting) { this.vel.x -= sin * 2; this.vel.z -= cos * 2; this.exh += 0.2; } else this.exh += 0.05;
          // 层架菌：踩上去跳得更高
          const under = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
          if (under === B.shelf_mushroom) this.vel.y = 13;
        }
      }
      this.jumpCd = (this.jumpCd || 0) - dt;
      // 气泡柱 / 间歇泉：水下方有强效硫磺时向上推
      if (this.inWater) {
        for (let d = 1; d < 8; d++) {
          const id = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y) - d, Math.floor(this.pos.z));
          if (id === B.potent_sulfur) { this.vel.y = Math.min(this.vel.y + 40 * dt, 7); break; }
          if (id !== B.water) break;
        }
      }
      // 潜行防掉落
      const ox = this.pos.x, oz = this.pos.z;
      if (this.sneaking && this.onGround) {
        const tryX = this.pos.x + this.vel.x * dt, tryZ = this.pos.z + this.vel.z * dt;
        if (boxFree(world, tryX, this.pos.y - 0.6, this.pos.z, this.w, 0.55)) this.vel.x = 0;
        if (boxFree(world, this.pos.x, this.pos.y - 0.6, tryZ, this.w, 0.55)) this.vel.z = 0;
      }
      // 梯子/藤蔓：贴着时可上下攀爬
      if (this.onClimbable()) {
        this.fallDist = 0;
        if (fw !== 0 || st !== 0 || this.horizHit || key('Space')) this.vel.y = Math.max(this.vel.y, 2.4);
        else if (this.sneaking) this.vel.y = Math.max(this.vel.y, 0);
        else this.vel.y = Math.max(this.vel.y, -2.4);
      }
      this.physics(dt, false);
      const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      if (this.inWater && !this.onGround) {
        // 游泳：划水声
        this.swimDist = (this.swimDist || 0) + moved + Math.abs(this.vel.y) * dt * 0.5;
        if (this.swimDist > 1.4) { this.swimDist = 0; g.audio.stepSound(0, true); }
      } else if (this.onGround) { this.stepDist += moved; if (this.stepDist > 1.8) { this.stepDist = 0; g.audio.stepSound(world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z)), this.inWater); } }
      if (this.sprinting) this.exh += moved * 0.1;
      g.stats.distance = (g.stats.distance || 0) + moved;
      // 自动跳跃：贴着一格高的台阶往前走时自动跳上去
      if (g.settings.autoJump && this.onGround && this.horizHit && fw > 0 && !this.sneaking && this.jumpCd <= 0) {
        const ax = Math.floor(this.pos.x - Math.sin(this.yaw) * 0.6), az = Math.floor(this.pos.z - Math.cos(this.yaw) * 0.6), ay = Math.floor(this.pos.y);
        if (BLOCKS[world.getBlock(ax, ay, az)].solid && !BLOCKS[world.getBlock(ax, ay + 1, az)].solid && !BLOCKS[world.getBlock(ax, ay + 2, az)].solid) { this.vel.y = 9.0; this.jumpCd = 0.3; }
      }
      this.bob += moved * 2.2;
    }
    // ---- 环境伤害 ----
    if (this.mode === 'survival') {
      if (this.inLava) { this.fire = 8; this.lavaT -= dt; if (this.lavaT <= 0) { this.lavaT = 0.5; this.hurtTime = 0; this.hurt(4, 'lava'); } }
      if (this.inWater) this.fire = 0;
      if (this.fire > 0) { this.fire -= dt; this.fireT = (this.fireT || 0) - dt; if (this.fireT <= 0) { this.fireT = 1; this.hurtTime = 0; this.hurt(1, 'lava'); } }
      if (this.eyeInWater && !effLv(this, 'water_breathing')) { const rs = enchLv(this.armor[0], 'respiration'); if (!rs || Math.random() < 1 / (rs + 1)) this.air -= dt; if (this.air <= 0) { this.air = 0; this.drownT -= dt; if (this.drownT <= 0) { this.drownT = 1; this.hurtTime = 0; this.hurt(2, 'drown'); } } }
      else this.air = Math.min(15, this.air + dt * 5);
      // 仙人掌
      this.cactusT -= dt;
      if (this.cactusT <= 0) {
        const bs = gatherBoxes(world, this.pos.x - this.w - 0.05, this.pos.y, this.pos.z - this.w - 0.05, this.pos.x + this.w + 0.05, this.pos.y + this.h, this.pos.z + this.w + 0.05);
        for (let x = Math.floor(this.pos.x - 0.4); x <= Math.floor(this.pos.x + 0.4); x++) for (let z = Math.floor(this.pos.z - 0.4); z <= Math.floor(this.pos.z + 0.4); z++) for (let y = Math.floor(this.pos.y); y <= Math.floor(this.pos.y + 1.7); y++) {
          if (world.getBlock(x, y, z) === B.cactus) { this.cactusT = 0.5; this.hurt(1, 'cactus'); }
        }
      }
      if (g.rules.difficulty === 'peaceful') { this.food = 20; this.exh = 0; this.peaceT = (this.peaceT || 0) + dt; if (this.peaceT > 2 && this.health < 20) { this.peaceT = 0; this.health = Math.min(20, this.health + 1); } }
      // 饥饿
      if (this.exh >= 4) { this.exh -= 4; if (this.sat > 0) this.sat = Math.max(0, this.sat - 1); else this.food = Math.max(0, this.food - 1); }
      this.regenT += dt;
      if (this.food >= 18 && this.health < 20 && this.regenT > (this.sat > 0 && this.food >= 20 ? 0.5 : 4)) { this.regenT = 0; this.health = Math.min(20, this.health + 1); this.exh += 6; }
      if (this.food <= 0) { this.starveT += dt; if (this.starveT > 4) { this.starveT = 0; if (this.health > 1) { this.hurtTime = 0; this.hurt(1, 'starve'); } } }
    } else { this.air = 15; this.fire = 0; }
    // ---- 交互 ----
    this.mineCd -= dt; this.useCd -= dt; this.attackCd -= dt;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - dt * 3.5);
    if (playing && this.mode !== 'spectator') this.interact(dt);
    else { this.mining = null; this.mineProg = 0; }
  }

  target() {
    const eye = this.eye(), dir = this.lookDir(), reach = this.mode === 'creative' ? 5 : 4.5;
    const hit = raycastBlocks(this.world, eye, dir, reach, false);
    let mob = null, mt = hit ? hit.t : reach;
    for (const m of this.game.mobs) {
      if (m.dead) continue;
      const h = rayBox(eye, dir, m.pos.x - m.w, m.pos.y, m.pos.z - m.w, m.pos.x + m.w, m.pos.y + m.h, m.pos.z + m.w);
      if (h && h.t < mt) { mt = h.t; mob = m; }
    }
    return { block: mob ? null : hit, mob };
  }

  interact(dt) {
    const g = this.game, inp = g.input, world = this.world;
    const tg = this.target();
    g.highlight(tg.block);
    // 左键：攻击 / 挖掘
    if (inp.mouse[0]) {
      if (tg.mob) {
        if (inp.mouseClicked[0] && this.attackCd <= 0) this.attack(tg.mob);
        this.mining = null; this.mineProg = 0;
      } else if (tg.block) {
        const b = tg.block;
        if (!this.mining || this.mining.x !== b.x || this.mining.y !== b.y || this.mining.z !== b.z) { this.mining = { x: b.x, y: b.y, z: b.z }; this.mineProg = 0; }
        if (this.mineCd <= 0) {
          this.swing = 1;
          const t = this.breakTime(b.id);
          this.mineProg += dt / t;
          this.mineSoundT = (this.mineSoundT || 0) - dt;
          if (this.mineSoundT <= 0) { this.mineSoundT = 0.25; g.audio.digSound(b.id, 0.4); }
          // 原版：挖掘时被敲的那一面每刻冒出方块碎屑
          this.hitPartT = (this.hitPartT || 0) - dt;
          if (this.hitPartT <= 0) { this.hitPartT = 0.05; const n = b.n || [0, 1, 0]; g.particles.blockHit(b.x, b.y, b.z, b.id, DIRS.findIndex(d => d[0] === n[0] && d[1] === n[1] && d[2] === n[2])); }
          if (this.mineProg >= 1) this.finishBreak(b);
        }
      } else { this.mining = null; this.mineProg = 0; if (inp.mouseClicked[0]) this.swing = 1; }
    } else { this.mining = null; this.mineProg = 0; }
    g.setCrack(this.mining, this.mineProg);
    // 右键：使用 / 放置
    const held = this.held(), it = held ? ITEMS[held.id] : null;
    if (inp.mouse[2]) {
      // 方块可交互（开箱子、开门）时优先交互，不开始吃东西
      const interactable = tg.block && !this.sneaking && (BLOCKS[tg.block.id].interact || BLOCKS[tg.block.id].useable);
      if (it && it.food && !interactable && !(it.canUse && tg.block && it.canUse(this, tg.block)) && ((this.food < 20 && this.mode !== 'creative') || it.alwaysEat)) {
        this.eatT += dt; this.swing = 0.3;
        if (Math.floor(this.eatT * 5) !== Math.floor((this.eatT - dt) * 5)) g.audio.play(it.drink ? 'drink' : 'eat');
        if (this.eatT >= (it.eatTime || 1.6)) { this.eatT = 0; this.eat(held); }
        return;
      }
      if (held && held.id === 'bow') { this.bowT += dt; return; }
      // 按下的那一下完整处理；按住不放时只重复放置方块（与原版一致，避免拉杆/门/桶被来回触发）
      if (inp.mouseClicked[2]) { this.useCd = 0.25; this.use(tg, true); }
      else if (this.useCd <= 0) { this.useCd = 0.2; if (it && it.block !== undefined) this.use(tg, false); }
    } else {
      this.eatT = 0;
      if (this.bowT > 0) { this.shootBow(); this.bowT = 0; }
    }
  }

  breakTime(id) {
    const def = BLOCKS[id];
    if (this.mode === 'creative') return 0.01;
    if (def.hard < 0) return Infinity;
    if (def.hard === 0) return 0.05;
    const h = this.held(), tool = h && ITEMS[h.id] ? ITEMS[h.id].tool : null;
    let speed = 1;
    const eff = tool && (tool.type === def.tool || (tool.type === 'shears' && def.leaves) || (tool.type === 'sword' && def.leaves));
    if (eff) { speed = tool.speed; const e = enchLv(h, 'efficiency'); if (e) speed += e * e + 1; }
    speed *= 1 + 0.2 * effLv(this, 'haste');
    const fat = effLv(this, 'mining_fatigue'); if (fat) speed *= Math.pow(0.3, Math.min(4, fat));
    for (const f of FEATURES) if (f.breakSpeed) speed = f.breakSpeed(this.game, this, id, speed);
    const can = this.canHarvest(def, tool);
    let t = def.hard * (can ? 1.5 : 5) / speed;
    if (this.eyeInWater && !enchLv(this.armor[0], 'aqua_affinity')) t *= 5;
    if (!this.onGround && !this.flying && !this.inWater) t *= 5;
    return t;
  }
  canHarvest(def, tool) { return !def.tier || (tool && tool.type === def.tool && tool.tier >= def.tier); }

  finishBreak(b) {
    const g = this.game, world = this.world, def = BLOCKS[b.id];
    const h = this.held(), tool = h && ITEMS[h.id] ? ITEMS[h.id].tool : null;
    g.particles.blockBreak(b.x, b.y, b.z, b.id);
    g.audio.digSound(b.id, 1);
    this.mining = null; this.mineProg = 0; this.mineCd = this.mode === 'creative' ? 0.2 : 0.05;
    g.stats.mined = (g.stats.mined || 0) + 1;
    if (this.mode === 'creative') { world.setBlock(b.x, b.y, b.z, 0); return; }
    const meta = world.getMeta(b.x, b.y, b.z);
    world.setBlock(b.x, b.y, b.z, 0);
    for (const f of FEATURES) if (f.onBreak) f.onBreak(g, b.x, b.y, b.z, b.id, meta, this);
    if (this.canHarvest(def, tool)) {
      let drops = blockDrops(b.id, meta);
      if (tool && tool.type === 'shears' && (def.leaves || b.id === B.short_grass || b.id === B.fern)) drops = [[def.name, 1]];
      if (enchLv(h, 'silk_touch') && ITEMS[def.name] && !def.noSilk) drops = [[def.name, 1]];
      else if (enchLv(h, 'fortune') && def.xp) { const fo = enchLv(h, 'fortune'); drops = drops.map(([n, c]) => [n, c * (1 + Math.max(0, rnd(fo + 1) - 1))]); }
      for (const f of FEATURES) if (f.drops) drops = f.drops(g, this, b.id, meta, drops);
      for (const [n, c] of drops) if (c > 0) g.dropItem(b.x + 0.5, b.y + 0.3, b.z + 0.5, n, c);
      if (def.xp) this.addXp(def.xp);
    }
    this.exh += 0.005;
    if (tool && def.hard > 0) this.damageHeld(1);
  }
  damageHeld(n) {
    const h = this.held(); if (!h || this.mode !== 'survival') return;
    const it = ITEMS[h.id]; if (!it.durability) return;
    const ub = enchLv(h, 'unbreaking'); if (ub && Math.random() > 1 / (ub + 1)) return;
    h.dmg = (h.dmg || 0) + n;
    if (h.dmg >= it.durability) { this.inventory.slots[this.sel] = null; this.game.audio.play('break_tool'); }
    this.game.ui.refresh();
  }
  attack(mob) {
    const h = this.held(), tool = h && ITEMS[h.id] ? ITEMS[h.id].tool : null;
    let dmg = tool ? tool.dmg : 1;
    dmg += 3 * effLv(this, 'strength') - 4 * effLv(this, 'weakness');
    const sh = enchLv(h, 'sharpness'); if (sh) dmg += 0.5 * sh + 0.5;
    if (mob.def.undead) dmg += 2.5 * enchLv(h, 'smite');
    if (mob.def.arthropod) dmg += 2.5 * enchLv(h, 'bane_of_arthropods');
    for (const f of FEATURES) if (f.attack) dmg = f.attack(this.game, this, mob, dmg);
    mob.lootLvl = enchLv(h, 'looting');
    const crit = this.vel.y < -1 && !this.onGround && !this.inWater;
    if (crit) dmg *= 1.5;
    // 原版：暴击冒星形粒子，带锋利等附魔时额外冒蓝色魔法暴击粒子
    const P = this.game.particles, cy = mob.pos.y + mob.h * 0.5;
    const ring = (type, n) => { for (let i = 0; i < n; i++) { const vx = Math.random() * 2 - 1, vy = Math.random() * 2 - 1, vz = Math.random() * 2 - 1; P.spawn(type, mob.pos.x + vx * mob.w, cy + vy * mob.h * 0.4, mob.pos.z + vz * mob.w, vx * 3, vy * 3 + 1, vz * 3, { life: 0.4 + Math.random() * 0.3, grav: 6, size: 0.15 + Math.random() * 0.1 }); } };
    if (crit) ring('crit', 16);
    if (sh || enchLv(h, 'smite') || enchLv(h, 'bane_of_arthropods')) ring('magic_crit', 12);
    this.swing = 1; this.attackCd = tool && tool.type === 'sword' ? 0.3 : tool && tool.type === 'axe' ? 0.6 : 0.25;
    if (mob.hurt(Math.ceil(dmg), 'player', this)) {
      const kb = enchLv(h, 'knockback') + (this.sprinting ? 1 : 0);
      if (kb) { mob.vel.x -= Math.sin(this.yaw) * 4 * kb; mob.vel.z -= Math.cos(this.yaw) * 4 * kb; this.sprinting = false; }
      const fa = enchLv(h, 'fire_aspect'); if (fa) mob.fire = 4 * fa;
      this.exh += 0.1;
      if (tool) this.damageHeld(tool.type === 'sword' ? 1 : 2);
    }
    this.game.audio.play('attack');
  }
  eat(held) {
    const it = ITEMS[held.id];
    this.food = Math.min(20, this.food + it.food[0]); this.sat = Math.min(this.food, this.sat + it.food[1]);
    if (held.id === 'rotten_flesh' && Math.random() < 0.8) applyEffect(this, 'hunger', 30, 0);
    this.game.audio.play(it.drink ? 'drink' : 'burp');
    // onEat 返回容器物品名（例如喝完药水返回玻璃瓶）
    const back = it.onEat ? it.onEat(this, held, this.game) : null;
    if (this.mode === 'survival') {
      held.n--;
      if (held.n <= 0) this.inventory.slots[this.sel] = back ? { id: back, n: 1 } : null;
      else if (back && this.inventory.add(back, 1)) this.game.dropItem(this.pos.x, this.pos.y + 1, this.pos.z, back, 1);
    }
    this.game.ui.refresh();
  }
  shootBow() {
    const g = this.game;
    if (this.bowT < 0.15) return;
    const bow = this.held();
    if (this.mode === 'survival' && !enchLv(bow, 'infinity') && !this.inventory.removeOne('arrow')) return;
    if (this.mode === 'survival' && enchLv(bow, 'infinity') && !this.inventory.count('arrow')) return;
    const p = Math.min(1, this.bowT / 1.0);
    const e = this.eye(), d = this.lookDir();
    const ar = new Arrow(g, e.x + d.x * 0.5, e.y + d.y * 0.5, e.z + d.z * 0.5, d.x * 50 * p, d.y * 50 * p, d.z * 50 * p, this, (6 * p + 1) * (1 + 0.25 * enchLv(bow, 'power')));
    ar.punch = enchLv(bow, 'punch'); ar.flame = enchLv(bow, 'flame');
    g.entities.push(ar);
    g.audio.play('bow'); this.damageHeld(1); g.ui.refresh();
  }

  consume(n) {
    if (this.mode !== 'survival') return;
    const h = this.held(); if (!h) return;
    h.n -= n || 1; if (h.n <= 0) this.inventory.slots[this.sel] = null;
    this.game.ui.refresh();
  }

  use(tg, fresh) {
    if (fresh === undefined) fresh = true;
    const g = this.game, world = this.world, held = this.held(), it = held ? ITEMS[held.id] : null;
    this.swing = 0.6;
    if (!fresh) {
      // 按住右键：只重复“放置方块”。插件方块（门、铁轨等）有自己的放置规则，先交给插件
      if (!tg.block || !it || it.block === undefined) return;
      for (const f of FEATURES) if (f.useItem && f.useItem(g, this, tg.block, held)) return;
      this.placeHeld(tg.block, held, it);
      return;
    }
    // 对生物
    if (tg.mob) {
      const m = tg.mob;
      for (const f of FEATURES) if (f.useMob && f.useMob(g, this, m, held)) return;
      if (it && it.spawnEgg) { g.spawnMob(it.spawnEgg, m.pos.x, m.pos.y, m.pos.z, { small: true }); this.consume(); return; }
      if (held && held.id === 'shears' && m.type === 'sheep' && !m.sheared && !m.small) { m.setSheared(true); g.dropItem(m.pos.x, m.pos.y + 1, m.pos.z, 'white_wool', 1 + rnd(2)); g.audio.play('shear'); this.damageHeld(1); return; }
      if (held && m.def.food === held.id && !m.small && m.breedCd <= 0 && m.love <= 0) { m.love = 30; this.consume(); for (let i = 0; i < 7; i++) g.particles.spawn('heart', m.pos.x + (Math.random() - 0.5) * m.w * 2, m.pos.y + m.h * 0.6 + Math.random() * 0.5, m.pos.z + (Math.random() - 0.5) * m.w * 2, 0, 0.6, 0, { life: 1, size: 0.2, drag: 1 }); return; }
      if (m.type === 'sulfur_cube' && held && it.block !== undefined && !m.absorbed) { m.setAbsorbed(held.id); this.consume(); g.audio.play('slime'); return; }
      if (m.type === 'sulfur_cube' && held && held.id === 'flint_and_steel' && m.absorbed === 'tnt') { m.dead = true; g.explode(m.pos.x, m.pos.y + 0.5, m.pos.z, 3); this.damageHeld(1); return; }
      if (m.type === 'sulfur_cube' && !held && m.absorbed) { g.dropItem(m.pos.x, m.pos.y + 1, m.pos.z, m.absorbed, 1); m.setAbsorbed(null); m.model.P.core.visible = true; return; }
      return;
    }
    const b = tg.block;
    // 1. 方块交互（未潜行）：插件方块（拉杆、门、酿造台……）与核心方块（工作台、熔炉、箱子、床）
    if (b && !this.sneaking) {
      for (const f of FEATURES) if (f.useBlock && f.useBlock(g, this, b, held)) return;
      const def = BLOCKS[b.id];
      if (def.interact === 'crafting') { g.ui.openScreen('crafting'); return; }
      if (def.interact === 'furnace') { g.ui.openScreen('furnace', [b.x, b.y, b.z]); return; }
      if (def.interact === 'chest') { g.ui.openScreen('chest', [b.x, b.y, b.z]); g.audio.play('chest'); return; }
      if (def.interact === 'bed') { g.trySleep(b); return; }
      if (def.interact === 'tnt' && held && (held.id === 'flint_and_steel' || held.id === 'fire_charge')) { world.setBlock(b.x, b.y, b.z, 0); g.entities.push(new PrimedTNT(g, b.x, b.y, b.z)); if (held.id === 'fire_charge') this.consume(); else this.damageHeld(1); return; }
    }
    // 2. 物品使用（插件）
    for (const f of FEATURES) if (f.useItem && f.useItem(g, this, b, held)) return;
    // 穿戴盔甲
    if (it && it.armor) {
      const i = ARMOR_SLOTS.indexOf(it.armor.slot);
      const old = this.armor[i];
      this.armor[i] = held; this.inventory.slots[this.sel] = old || null;
      g.audio.play('armor'); g.ui.refresh();
      return;
    }
    if (!held) return;
    // 液体容器
    if (held.id === 'bucket') {
      const lh = raycastBlocks(world, this.eye(), this.lookDir(), 5, true);
      if (lh && isLiquid(lh.id)) {
        world.setBlock(lh.x, lh.y, lh.z, 0);
        const full = lh.id === B.water ? 'water_bucket' : 'lava_bucket';
        if (this.mode === 'survival') { if (held.n > 1) { held.n--; if (this.inventory.add(full, 1)) g.dropItem(this.pos.x, this.pos.y + 1, this.pos.z, full, 1); } else this.inventory.slots[this.sel] = { id: full, n: 1 }; }
        g.audio.play('bucket'); g.ui.refresh();
      }
      return;
    }
    if (!b) return;
    const tgtRepl = BLOCKS[b.id].replaceable && !isLiquid(b.id);
    const px = tgtRepl ? b.x : b.x + b.n[0], py = tgtRepl ? b.y : b.y + b.n[1], pz = tgtRepl ? b.z : b.z + b.n[2];
    if (held.id === 'water_bucket' || held.id === 'lava_bucket') {
      const cur = world.getBlock(px, py, pz);
      if (cur === 0 || BLOCKS[cur].replaceable) {
        world.setBlock(px, py, pz, held.id === 'water_bucket' ? B.water : B.lava, 0);
        if (this.mode === 'survival') this.inventory.slots[this.sel] = { id: 'bucket', n: 1 };
        g.audio.play('bucket'); g.ui.refresh();
      }
      return;
    }
    if (held.id === 'flint_and_steel') {
      if (b.id === B.tnt) { world.setBlock(b.x, b.y, b.z, 0); g.entities.push(new PrimedTNT(g, b.x, b.y, b.z)); this.damageHeld(1); }
      return;
    }
    if (held.id === 'bone_meal') {
      const def = BLOCKS[b.id];
      let used = false;
      if (def.sapling) { world.growTree(b.x, b.y, b.z, def.sapling); used = true; }
      else if (def.crop) { world.setMeta(b.x, b.y, b.z, Math.min(7, world.getMeta(b.x, b.y, b.z) + 2 + rnd(3))); used = true; }
      else if (b.id === B.grass_block) {
        for (let i = 0; i < 20; i++) {
          const x = b.x + rnd(6) - 3, z = b.z + rnd(6) - 3;
          if (world.getBlock(x, b.y, z) === B.grass_block && world.getBlock(x, b.y + 1, z) === 0) world.setBlock(x, b.y + 1, z, Math.random() < 0.85 ? B.short_grass : [B.dandelion, B.poppy][rnd(1)]);
        }
        used = true;
      }
      if (used) { for (let i = 0; i < 15; i++) g.particles.spawn('happy', b.x + Math.random(), b.y + Math.random() * 1.2, b.z + Math.random(), 0, 0.3, 0, { life: 1 + Math.random(), size: 0.18, drag: 2 }); this.consume(); }
      return;
    }
    if (it.tool && it.tool.type === 'hoe' && (b.id === B.grass_block || b.id === B.dirt) && world.getBlock(b.x, b.y + 1, b.z) === 0) {
      world.setBlock(b.x, b.y, b.z, B.farmland); g.audio.digSound(B.dirt, 1); this.damageHeld(1); return;
    }
    if (held.id === 'wheat_seeds') {
      if (b.id === B.farmland && b.n[1] === 1 && world.getBlock(b.x, b.y + 1, b.z) === 0) { world.setBlock(b.x, b.y + 1, b.z, B.wheat, 0); this.consume(); g.audio.digSound(B.grass_block, 1); }
      return;
    }
    if (it.spawnEgg) { g.spawnMob(it.spawnEgg, px + 0.5, py, pz + 0.5); this.consume(); return; }
    if (it.block === undefined) return;
    this.placeHeld(b, held, it);
  }
  // 放置手中的方块（按住右键时会重复调用）
  placeHeld(b, held, it) {
    const g = this.game, world = this.world;
    const tgtRepl = BLOCKS[b.id].replaceable && !isLiquid(b.id);
    const px = tgtRepl ? b.x : b.x + b.n[0], py = tgtRepl ? b.y : b.y + b.n[1], pz = tgtRepl ? b.z : b.z + b.n[2];
    // 放置方块
    const id = it.block, def = BLOCKS[id];
    if (py < 0 || py >= CH) return;
    // 台阶：叠成双台阶 / 上半台阶
    let slabMeta = 0;
    if (def.shape === 'slab') {
      const full = slabFullBlock(def.name);
      const hitM = world.getMeta(b.x, b.y, b.z) & 1;
      if (b.id === id && full !== undefined && ((b.n[1] === 1 && !hitM) || (b.n[1] === -1 && hitM))) {
        world.setBlock(b.x, b.y, b.z, full); g.audio.placeSound(full); this.consume(); return;
      }
      if (world.getBlock(px, py, pz) === id && full !== undefined) { world.setBlock(px, py, pz, full); g.audio.placeSound(full); this.consume(); return; }
      const fy = b.p ? b.p[1] - Math.floor(b.p[1]) : 0;
      slabMeta = b.n[1] === -1 || (b.n[1] === 0 && fy > 0.5) ? 1 : 0;
    }
    // 火把：点地面立着放，点墙侧面插在墙上
    let torchMeta = 0;
    if (id === B.torch) {
      if (b.n[1] === -1) return;
      if (b.n[1] === 0) {
        if (!BLOCKS[b.id].solid || BLOCKS[b.id].shape !== 'cube') return;
        torchMeta = b.n[0] === 1 ? 1 : b.n[0] === -1 ? 2 : b.n[2] === 1 ? 3 : 4;
      }
    }
    const cur = world.getBlock(px, py, pz);
    if (cur && !BLOCKS[cur].replaceable) return;
    if (def.shape === 'cross' || def.shape === 'torch' || id === B.cactus || id === B.sugar_cane) {
      const below = world.getBlock(px, py - 1, pz);
      if (id === B.torch && torchMeta) { }
      else if (id === B.torch || id === B.campfire) { if (!BLOCKS[below].solid) return; }
      else if (def.spike || id === B.shelf_mushroom) { }
      else if (id === B.cactus) { if (below !== B.sand && below !== B.cactus && below !== B.red_sand) return; }
      else if (id === B.sugar_cane) { if (![B.sugar_cane, B.grass_block, B.dirt, B.sand].includes(below)) return; }
      else if (id === B.dead_bush) { if (![B.sand, B.red_sand, B.dirt, B.terracotta].includes(below)) return; }
      else if (![B.grass_block, B.dirt, B.farmland, B.moss_block, B.snowy_grass].includes(below)) return;
    }
    if (def.solid) {
      const bxs = collisionBoxes(id, 0, worldNB(world, px, py, pz)) || [];
      for (const e of [this, ...g.mobs]) {
        if (e.dead) continue;
        for (const bb of bxs) if (px + bb[3] > e.pos.x - e.w && px + bb[0] < e.pos.x + e.w && py + bb[4] > e.pos.y && py + bb[1] < e.pos.y + e.h && pz + bb[5] > e.pos.z - e.w && pz + bb[2] < e.pos.z + e.w) return;
      }
    }
    // 朝向：熔炉/箱子正面朝向玩家；楼梯高的一侧远离玩家
    const yawDir = ((Math.round(-this.yaw / (Math.PI / 2)) % 4) + 4) % 4; // 0:-z 1:+x 2:+z 3:-x（视线方向）
    let meta = 0;
    if (BLOCKS[id].tex && BLOCKS[id].tex.front) meta = yawDir;
    if (def.shape === 'stairs') meta = [2, 3, 0, 1][yawDir];
    if (def.shape === 'slab') meta = slabMeta;
    if (id === B.torch) meta = torchMeta;
    world.setBlock(px, py, pz, id, meta);
    g.stats.placed = (g.stats.placed || 0) + 1;
    g.audio.placeSound(id);
    this.consume();
  }
}

// 台阶对应的完整方块（oak_slab -> oak_planks，stone_brick_slab -> stone_bricks ...）
function slabFullBlock(name) {
  const base = name.replace(/_slab$/, '');
  for (const n of [base, base + 's', base + '_planks', base + '_block']) if (B[n] !== undefined && BLOCKS[B[n]].shape === 'cube') return B[n];
  return undefined;
}
