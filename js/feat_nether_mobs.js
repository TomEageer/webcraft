'use strict';
// ---------- 下界生物：僵尸猪灵、猪灵、恶魂、烈焰人、岩浆怪、凋灵骷髅；火球投射物 ----------

// 火球：恶魂的大火球（爆炸，可被玩家打回）与烈焰人/火焰弹的小火球（点燃）
class NetherFireball extends Entity {
  constructor(game, x, y, z, dir, owner, small) {
    super(game, x, y, z);
    this.small = !!small; this.owner = owner; this.stepH = 0;
    this.w = small ? 0.16 : 0.5; this.h = this.w * 2; this.speed = small ? 20 : 13;
    const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
    this.vel.set(dir.x / l * this.speed, dir.y / l * this.speed, dir.z / l * this.speed);
    const tex = packTexture('mcl_fire_fire_charge');
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial(tex ? { map: tex, transparent: true, alphaTest: 0.2 } : { color: 0xff7a20 }));
    this.mesh.scale.setScalar(small ? 0.45 : 1.2);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }
  deflect(by) {
    const d = by.lookDir();
    // 大致朝发射者打回时自动瞄准它（原版里打回火球也基本是往回飞）
    const src = this.shooter || this.owner;
    if (src && !src.dead && !src.isPlayer) {
      const to = new THREE.Vector3(src.pos.x - this.pos.x, src.pos.y + src.h * 0.5 - this.pos.y, src.pos.z - this.pos.z);
      if (to.length() > 0.1 && to.clone().normalize().dot(d) > 0.8) d.copy(to.normalize());
    }
    this.vel.set(d.x * this.speed * 1.2, d.y * this.speed * 1.2, d.z * this.speed * 1.2);
    if (!this.shooter) this.shooter = this.owner;
    this.owner = by; this.age = 0; this.deflected = true;
    this.game.audio.play('attack', this.pos);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 12) { this.dead = true; return; }
    const g = this.game, steps = 4;
    for (let s = 0; s < steps; s++) {
      const nx = this.pos.x + this.vel.x * dt / steps, ny = this.pos.y + this.vel.y * dt / steps, nz = this.pos.z + this.vel.z * dt / steps;
      const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id && (BLOCKS[id].solid || id === B.lava || id === B.water)) { this.impact(null); return; }
      this.pos.set(nx, ny, nz);
      for (const t of [g.player, ...g.mobs]) {
        if (t === this.owner || t.dead || (t.isPlayer && (!t.alive || t.mode === 'spectator'))) continue;
        if (this.owner && !this.owner.isPlayer && t.type === this.owner.type) continue;
        const r = this.w + 0.1;
        if (Math.abs(t.pos.x - nx) < t.w + r && Math.abs(t.pos.z - nz) < t.w + r && ny > t.pos.y - r && ny < t.pos.y + t.h + r) { this.impact(t); return; }
      }
    }
    if (Math.random() < 0.6) g.particles.add(this.pos.x, this.pos.y, this.pos.z, 0, 0.3, 0, Math.random() < 0.5 ? [255, 150, 40] : [80, 80, 80], 0.5, -0.5);
    this.mesh.position.copy(this.pos);
  }
  impact(t) {
    const g = this.game, w = this.world;
    this.dead = true;
    if (this.small) {
      if (t) {
        // 被玩家打回的小火球按冲击伤害结算，对免疫火焰的烈焰人也有效
        if (this.deflected) { t.hurtTime = 0; t.hurt(5, 'fireball', this.owner); if (!(t.def && t.def.fireImmune)) t.fire = Math.max(t.fire || 0, 5); }
        else if (!(t.def && t.def.fireImmune)) { t.hurt(5, 'fire', this.owner); t.fire = Math.max(t.fire || 0, 5); }
      } else {
        // 在撞击点前一格放火
        const back = 0.3 / this.speed;
        const x = Math.floor(this.pos.x - this.vel.x * back), y = Math.floor(this.pos.y - this.vel.y * back), z = Math.floor(this.pos.z - this.vel.z * back);
        if (w.getBlock(x, y, z) === 0) netherPlaceFire(w, x, y, z);
      }
      g.particles.burst(this.pos.x, this.pos.y, this.pos.z, [255, 140, 40], 6, 1);
      return;
    }
    if (t) { t.hurtTime = 0; t.hurt(t.type === 'ghast' && this.owner && this.owner.isPlayer ? 1000 : 6, 'fireball', this.owner); }
    g.explode(this.pos.x, this.pos.y, this.pos.z, 1);
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(this.pos.x) + rnd(4) - 2, z = Math.floor(this.pos.z) + rnd(4) - 2;
      for (let y = Math.floor(this.pos.y) + 2; y > this.pos.y - 3; y--) if (w.getBlock(x, y, z) === 0 && BLOCKS[w.getBlock(x, y - 1, z)].solid) { if (Math.random() < 0.4) netherPlaceFire(w, x, y, z); break; }
    }
  }
}

// ---------------- 通用 AI 片段 ----------------
function nTarget(m, g, range) {
  const p = g.player;
  if (!p.alive || p.mode !== 'survival') return null;
  const d = m.distTo(p) / (effLv(p, 'invisibility') ? 0.3 : 1);
  return d <= range ? p : null;
}
function nLOS(m, g, p) { return g.lineOfSight(new THREE.Vector3(m.pos.x, m.eyeY, m.pos.z), p.eye()); }
function nWander(m, dt, mul, avoidLava) {
  m.wanderT -= dt;
  if (m.wanderT <= 0) { m.wanderT = 2 + Math.random() * 5; m.moveDir = Math.random() < 0.4 ? null : Math.random() * Math.PI * 2; }
  if (m.moveDir === null) { m.steer(0, 0, 0, dt); return; }
  const tx = Math.sin(m.moveDir), tz = Math.cos(m.moveDir);
  if (m.onGround) {
    const w = m.world, ax = Math.floor(m.pos.x + tx * 0.9), az = Math.floor(m.pos.z + tz * 0.9), ay = Math.floor(m.pos.y);
    const drop = !BLOCKS[w.getBlock(ax, ay - 1, az)].solid && !BLOCKS[w.getBlock(ax, ay - 2, az)].solid && !BLOCKS[w.getBlock(ax, ay - 3, az)].solid;
    const lava = w.getBlock(ax, ay, az) === B.lava || w.getBlock(ax, ay - 1, az) === B.lava;
    if (drop || (avoidLava && lava)) { m.moveDir = null; m.wanderT = 1; m.steer(0, 0, 0, dt); return; }
  }
  m.steer(tx, tz, m.def.speed * mul, dt);
}
function nMelee(m, p, dmg, extra) {
  const dy = p.pos.y - m.pos.y, dh = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z);
  if (dh < 1.5 + m.w && Math.abs(dy) < 2 && m.attackCd <= 0) {
    m.attackCd = 1;
    if (p.hurt(dmg, 'mob', m) && extra) extra(p);
    if (m.model.P.arms) m.swingT = 0.3;
  }
}
function nChase(m, g, p, dt, mul) {
  m.steer(p.pos.x - m.pos.x, p.pos.z - m.pos.z, m.def.speed * mul, dt);
}
function nFace(m, p) { m.yaw = Math.atan2(p.pos.x - m.pos.x, p.pos.z - m.pos.z); }
function nOverworldZombify(m, dt, g) {
  // 猪灵离开下界 15 秒后僵尸化
  if (g.world.dim === 'nether') { m.zombT = 0; return false; }
  m.zombT = (m.zombT || 0) + dt;
  if (m.zombT < 15) return false;
  m.dead = true; m.silent = true;
  const z = g.spawnMob('zombified_piglin', m.pos.x, m.pos.y, m.pos.z);
  z.yaw = m.yaw;
  g.particles.burst(m.pos.x, m.pos.y + 1, m.pos.z, [120, 200, 120], 12, 1);
  return true;
}

// ---------------- 各生物 AI ----------------
function aiZombifiedPiglin(m, dt, g) {
  const p = g.player;
  if (m.angerT > 0) m.angerT -= dt;
  const t = m.angerT > 0 ? nTarget(m, g, 32) : null;
  if (t) {
    nChase(m, g, t, dt, 1.5);
    nMelee(m, t, 5);
  } else nWander(m, dt, 0.4, false);
  m.physics(dt);
  return true;
}
function piglinWearsGold(p) { return p.armor.some(s => s && /^golden_/.test(s.id)); }
const PIGLIN_BARTER = [['iron_nugget', 10, 36, 10], ['ender_pearl', 2, 4, 10], ['string', 3, 9, 20], ['quartz', 5, 12, 20], ['obsidian', 1, 1, 40],
  ['crying_obsidian', 1, 1, 40], ['fire_charge', 1, 1, 40], ['leather', 2, 4, 40], ['soul_sand', 2, 8, 40], ['nether_brick', 2, 8, 40],
  ['spectral_arrow', 6, 12, 40], ['gravel', 8, 16, 40], ['blackstone', 8, 16, 40]];
function piglinBarter(m, g) {
  const list = PIGLIN_BARTER.filter(e => ITEMS[e[0]]);
  let t = Math.random() * list.reduce((a, e) => a + e[3], 0), e = list[0];
  for (const q of list) { t -= q[3]; if (t <= 0) { e = q; break; } }
  const n = e[1] + Math.floor(Math.random() * (e[2] - e[1] + 1));
  const p = g.player, dx = p.pos.x - m.pos.x, dz = p.pos.z - m.pos.z, l = Math.hypot(dx, dz) || 1;
  const it = g.dropItem(m.pos.x + dx / l * 0.5, m.pos.y + 1.2, m.pos.z + dz / l * 0.5, e[0], n);
  if (it) { it.vel.set(dx / l * 3, 3, dz / l * 3); it.pickup = 0.8; }
  m.lastBarter = e[0];
  g.audio.sfx('piglin.say', m.pos, 0.8, 1.1);
}
function aiPiglin(m, dt, g) {
  if (m.crossbow === undefined) m.crossbow = Math.random() < 0.5;
  if (nOverworldZombify(m, dt, g)) return true;
  const p = g.player;
  if (m.angerT > 0) m.angerT -= dt;
  if (m.barterT > 0) {
    // 正在端详金锭
    m.barterT -= dt; m.steer(0, 0, 0, dt); nFace(m, p);
    if (m.barterT <= 0) piglinBarter(m, g);
    m.physics(dt);
    return true;
  }
  const hostile = (m.angerT > 0 && nTarget(m, g, 24)) || (!piglinWearsGold(p) && nTarget(m, g, 16));
  if (!hostile) {
    // 拾取掉在附近的金锭
    let gold = null, gd = 9;
    for (const e of g.entities) if (e instanceof ItemEntity && !e.dead && e.name === 'gold_ingot' && e.pickup <= 0.5) { const d = e.pos.distanceTo(m.pos); if (d < gd) { gd = d; gold = e; } }
    if (gold) {
      m.steer(gold.pos.x - m.pos.x, gold.pos.z - m.pos.z, m.def.speed * 0.8, dt);
      if (gd < 1.4) { if (--gold.count <= 0) gold.dead = true; m.barterT = 6; g.audio.play('pop', m.pos); }
      m.physics(dt);
      return true;
    }
  }
  if (hostile) {
    const t = g.player, d = m.distTo(t);
    if (m.crossbow) {
      if (d < 4) m.steer(m.pos.x - t.pos.x, m.pos.z - t.pos.z, m.def.speed * 0.8, dt);
      else if (d > 10) nChase(m, g, t, dt, 1.1);
      else { m.steer(0, 0, 0, dt); nFace(m, t); }
      if (m.attackCd <= 0 && d < 16 && nLOS(m, g, t)) { m.attackCd = 2; g.shootArrow(m, t); }
    } else {
      nChase(m, g, t, dt, 1.4);
      nMelee(m, t, 5);
    }
  } else if (p.alive && p.holding() === 'gold_ingot' && m.distTo(p) < 8) {
    if (m.distTo(p) > 3) nChase(m, g, p, dt, 0.7); else { m.steer(0, 0, 0, dt); nFace(m, p); }
  } else nWander(m, dt, 0.4, true);
  m.physics(dt);
  return true;
}
function aiGhast(m, dt, g) {
  m.stepH = 0;
  const w = m.world, p = g.player;
  m.destT = (m.destT || 0) - dt;
  const dest = m.dest;
  if (!dest || m.destT <= 0 || m.horizHit || Math.hypot(dest[0] - m.pos.x, dest[1] - m.pos.y, dest[2] - m.pos.z) < 1.5) {
    for (let k = 0; k < 6; k++) {
      const x = m.pos.x + (Math.random() - 0.5) * 32, y = clamp(m.pos.y + (Math.random() - 0.5) * 16, 34, 112), z = m.pos.z + (Math.random() - 0.5) * 32;
      if (w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === 0 && w.getBlock(Math.floor(x), Math.floor(y + 3), Math.floor(z)) === 0) { m.dest = [x, y, z]; break; }
    }
    m.destT = 4 + Math.random() * 6;
  }
  if (m.dest) {
    const dx = m.dest[0] - m.pos.x, dy = m.dest[1] - m.pos.y, dz = m.dest[2] - m.pos.z, l = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * 1.5);
    m.vel.x += (dx / l * m.def.speed - m.vel.x) * k; m.vel.y += (dy / l * m.def.speed - m.vel.y) * k; m.vel.z += (dz / l * m.def.speed - m.vel.z) * k;
  }
  const t = nTarget(m, g, 64);
  const see = t && nLOS({ pos: m.pos, eyeY: m.pos.y + 2 }, g, t);
  if (see) {
    nFace(m, t);
    m.shootT = (m.shootT || 0) + dt;
    if (m.shootT > 2 && !m.charging) { m.charging = true; g.audio.sfx('ghast.charge', m.pos, 1, 1.3); }
    if (m.shootT >= 3) {
      m.shootT = Math.random(); m.charging = false;
      const ex = t.eye(), sx = m.pos.x, sy = m.pos.y + 2, sz = m.pos.z;
      const d = new THREE.Vector3(ex.x - sx, ex.y - 0.4 - sy, ex.z - sz).normalize();
      g.entities.push(new NetherFireball(g, sx + d.x * 2.4, sy + d.y * 2.4, sz + d.z * 2.4, d, m, false));
      g.audio.play('ghast.shoot', m.pos);
    }
  } else { m.shootT = Math.max(0, (m.shootT || 0) - dt); m.charging = false; if (Math.hypot(m.vel.x, m.vel.z) > 0.2) m.yaw = Math.atan2(m.vel.x, m.vel.z); }
  m.move(m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  m.checkFluids();
  if (m.model.P.legs) m.model.P.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.age * 2 + i) * 0.25; });
  return true;
}
function aiBlaze(m, dt, g) {
  m.stepH = 0;
  const t = nTarget(m, g, 48), w = m.world;
  m.checkFluids();
  let vy;
  if (t) {
    const want = t.pos.y + 1.5 + Math.sin(m.age * 1.3) * 0.6;
    vy = clamp((want - m.pos.y) * 1.5, -2.5, 3);
    const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z);
    const sp = d > 9 ? m.def.speed : d < 4 ? -m.def.speed * 0.6 : 0;
    const dx = (t.pos.x - m.pos.x) / (d || 1), dz = (t.pos.z - m.pos.z) / (d || 1);
    const k = Math.min(1, dt * 3);
    m.vel.x += (dx * sp - m.vel.x) * k; m.vel.z += (dz * sp - m.vel.z) * k;
    nFace(m, t);
    // 三连发小火球
    const see = nLOS(m, g, t);
    m.atkT = (m.atkT === undefined ? 1 : m.atkT) - dt;
    if (!m.burst && m.atkT <= 0 && see && m.distTo(t) < 40) { m.burst = 3; m.burstGap = 0.5; g.audio.sfx('blaze.say', m.pos, 0.8, 1); }
    if (m.burst > 0) {
      m.burstGap -= dt;
      if (m.burstGap <= 0) {
        const e = t.eye(), sx = m.pos.x, sy = m.eyeY - 0.3, sz = m.pos.z;
        const dir = new THREE.Vector3(e.x - sx + (Math.random() - 0.5) * 1.2, e.y - 0.5 - sy + (Math.random() - 0.5) * 0.6, e.z - sz + (Math.random() - 0.5) * 1.2).normalize();
        g.entities.push(new NetherFireball(g, sx + dir.x * 0.7, sy + dir.y * 0.7, sz + dir.z * 0.7, dir, m, true));
        g.audio.play('blaze.shoot', m.pos);
        m.burst--; m.burstGap = 0.3;
        if (!m.burst) m.atkT = 3 + Math.random() * 2;
      }
    }
    if (m.distTo(t) < 1.8) nMelee(m, t, 6, pl => { pl.fire = Math.max(pl.fire, 5); });
  } else {
    vy = m.onGround ? 0 : -1.2;
    m.vel.x *= Math.pow(0.2, dt); m.vel.z *= Math.pow(0.2, dt);
    if (Math.random() < dt * 0.3) { m.vel.y = 3; }
  }
  m.vel.y += (vy - m.vel.y) * Math.min(1, dt * 4);
  m.move(m.vel.x * dt, m.vel.y * dt, m.vel.z * dt);
  if (m.inWater) { m.wetT = (m.wetT || 0) + dt; if (m.wetT > 1) { m.wetT = 0; m.hurtTime = 0; m.hurt(1, 'drown'); } }
  if (Math.random() < dt * 6) g.particles.add(m.pos.x + (Math.random() - 0.5) * 0.6, m.pos.y + Math.random() * 1.6, m.pos.z + (Math.random() - 0.5) * 0.6, 0, 0.6, 0, Math.random() < 0.5 ? [70, 70, 70] : [255, 170, 50], 0.8, -0.6);
  // 模型模块可能把 rods 做成数组并自行在 tick 里旋转，只有 Object3D 时才在这里转
  if (m.model.P.rods && m.model.P.rods.rotation) m.model.P.rods.rotation.y += dt * 2.2;
  return true;
}
function magmaInit(m) {
  if (m.size) return;
  m.size = m.small ? 1 : [1, 2, 4][Math.floor(Math.random() * 3)];
  m.small = false; m.growT = 0;
  m.w = 0.26 * m.size; m.h = 0.52 * m.size; m.health = m.size * m.size;
  m.mesh.scale.setScalar(m.size / 2);
  m.onLand = () => { };
}
function aiMagma(m, dt, g) {
  magmaInit(m);
  const t = nTarget(m, g, 16);
  m.hopT = (m.hopT === undefined ? Math.random() : m.hopT) - dt;
  m.checkFluids();
  if (m.inLava) m.vel.y = Math.max(m.vel.y, 3);
  if (m.onGround) {
    m.vel.x *= Math.pow(0.001, dt); m.vel.z *= Math.pow(0.001, dt);
    if (m.hopT <= 0) {
      let dx, dz;
      if (t) { dx = t.pos.x - m.pos.x; dz = t.pos.z - m.pos.z; } else { const a = Math.random() * Math.PI * 2; dx = Math.sin(a); dz = Math.cos(a); }
      const l = Math.hypot(dx, dz) || 1, sp = m.def.speed * (0.8 + m.size * 0.15);
      m.vel.x = dx / l * sp; m.vel.z = dz / l * sp; m.vel.y = 6.5 + m.size * 1.1;
      m.yaw = Math.atan2(dx, dz);
      m.hopT = t ? 0.4 + Math.random() * 0.8 : 1.5 + Math.random() * 3;
      g.audio.sfx(m.size > 1 ? 'magma_cube.jump' : 'magma_cube.hurt', m.pos, 0.6, 1.4 - m.size * 0.1);
    }
  }
  if (t) {
    const dx = Math.abs(t.pos.x - m.pos.x), dz = Math.abs(t.pos.z - m.pos.z), dy = t.pos.y - m.pos.y;
    if (dx < m.w + 0.4 && dz < m.w + 0.4 && dy > -1.8 && dy < m.h + 0.2 && m.attackCd <= 0) {
      m.attackCd = 1; if (t.hurt({ 1: 3, 2: 4, 4: 6 }[m.size] || 3, 'mob', m)) g.audio.sfx('magma_cube.attack', m.pos, 0.8);
    }
  }
  m.physics(dt, false);
  if (m.model.P.body) { const sq = m.onGround ? 1 : 1.25; m.model.P.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); }
  return true;
}
function magmaSplit(m) {
  if (!m.size || m.size <= 1) return;
  const g = m.game, n = 2 + Math.floor(Math.random() * 3), s = m.size / 2;
  for (let i = 0; i < n; i++) {
    const c = g.spawnMob('magma_cube', m.pos.x + (Math.random() - 0.5) * m.w, m.pos.y + 0.3, m.pos.z + (Math.random() - 0.5) * m.w);
    c.small = false; magmaInitSize(c, s);
  }
}
function magmaInitSize(c, s) {
  c.size = s; c.w = 0.26 * s; c.h = 0.52 * s; c.health = s * s; c.mesh.scale.setScalar(s / 2); c.onLand = () => { };
}
function aiWitherSkeleton(m, dt, g) {
  const t = nTarget(m, g, 16);
  if (t && (nLOS(m, g, t) || m.distTo(t) < 6)) {
    nChase(m, g, t, dt, 1.2);
    nMelee(m, t, 5, pl => applyEffect(pl, 'wither', 10, 0));
  } else nWander(m, dt, 0.4, false);
  m.physics(dt);
  return true;
}

Object.assign(MOB_DEFS, {
  zombified_piglin: { zh: '僵尸猪灵', hp: 20, w: 0.3, h: 1.95, speed: 2.3, hostile: true, dmg: 5, undead: true, fireImmune: true, nether: true, xp: 5,
    drops: () => [['rotten_flesh', rnd(1)], ['gold_nugget', rnd(1)], Math.random() < 0.025 ? ['gold_ingot', 1] : null], ai: aiZombifiedPiglin },
  piglin: { zh: '猪灵', hp: 16, w: 0.3, h: 1.95, speed: 2.5, hostile: true, dmg: 5, nether: true, xp: 5,
    drops: () => [Math.random() < 0.085 ? ['golden_sword', 1] : null], ai: aiPiglin },
  ghast: { zh: '恶魂', hp: 10, w: 2, h: 4, speed: 2.2, hostile: true, fireImmune: true, nether: true, xp: 5,
    drops: () => [['ghast_tear', rnd(1)], ['gunpowder', rnd(2)]], ai: aiGhast },
  blaze: { zh: '烈焰人', hp: 20, w: 0.3, h: 1.8, speed: 2.3, hostile: true, dmg: 6, fireImmune: true, nether: true, xp: 10,
    drops: m => m.lastAttacker && m.lastAttacker.isPlayer ? [['blaze_rod', rnd(1)]] : [], ai: aiBlaze },
  magma_cube: { zh: '岩浆怪', hp: 16, w: 0.52, h: 1.04, speed: 2.6, hostile: true, fireImmune: true, nether: true, xp: 4,
    drops: m => m.size > 1 && Math.random() < 0.25 ? [['magma_cream', 1]] : [], onDeath: magmaSplit, ai: aiMagma },
  wither_skeleton: { zh: '凋灵骷髅', hp: 20, w: 0.35, h: 2.4, speed: 2.9, hostile: true, dmg: 5, undead: true, fireImmune: true, nether: true, xp: 5,
    drops: () => [Math.random() < 0.33 ? ['coal', 1] : null, ['bone', rnd(2)]], ai: aiWitherSkeleton },
});

// ---------------- 占位模型（models 模块会覆盖） ----------------
function netherHumanoid(type, o) {
  const root = new THREE.Group(), mats = [], P = { legs: [], arms: [] };
  const H = o.legH || 12, body = o.body || [8, 12, 4], limb = o.limb || 4, head = o.head || [8, 8, 8];
  const bd = part(mats, body[0], body[1], body[2], o.shirt, type + '_n_body'); bd.position.set(0, px(H + body[1] / 2), 0); root.add(bd); P.body = bd;
  const hd = pivot(part(mats, head[0], head[1], head[2], o.skin, type + '_n_head', o.face), 0, H + body[1], 0, head[1] / 2); root.add(hd); P.head = hd;
  hd.children[0].position.z = 0;
  for (const s of [-1, 1]) {
    const lg = pivot(part(mats, limb, H, limb, o.pants, type + '_n_leg'), s * limb / 2, H, 0, -H / 2); root.add(lg); P.legs.push(lg);
    const ar = pivot(part(mats, limb, body[1], limb, o.arm || o.skin, type + '_n_arm'), s * (body[0] / 2 + limb / 2), H + body[1] - 1, 0, -body[1] / 2 + 1); root.add(ar); P.arms.push(ar);
  }
  if (o.extra) o.extra(root, mats, P, hd);
  if (o.scale) root.scale.setScalar(o.scale);
  return { root, mats, P };
}
const snout = (c) => (root, mats, P, hd) => { const sn = part(mats, 4, 4, 1, c, 'snout_' + c.join('_')); sn.position.set(0, px(-2), px(4.5)); hd.children[0].add(sn); };
if (!MODELS.zombified_piglin) MODELS.zombified_piglin = () => netherHumanoid('zombified_piglin', {
  head: [10, 8, 8], skin: [228, 150, 150], shirt: [110, 140, 90], pants: [100, 80, 60], arm: [200, 140, 140], face: eyes('#2a1010', 3), extra: snout([210, 130, 130]),
});
if (!MODELS.piglin) MODELS.piglin = () => netherHumanoid('piglin', {
  head: [10, 8, 8], skin: [236, 168, 150], shirt: [120, 80, 50], pants: [90, 60, 40], face: eyes('#2a1010', 3), extra: snout([220, 140, 130]),
});
if (!MODELS.wither_skeleton) MODELS.wither_skeleton = () => netherHumanoid('wither_skeleton', {
  limb: 2, skin: [44, 44, 46], shirt: [36, 36, 38], pants: [36, 36, 38], face: (ctx) => { ctx.fillStyle = '#000'; ctx.fillRect(1, 3, 2, 2); ctx.fillRect(5, 3, 2, 2); ctx.fillRect(2, 6, 4, 1); }, scale: 1.2,
});
if (!MODELS.ghast) MODELS.ghast = () => {
  const root = new THREE.Group(), g = new THREE.Group(), mats = [], P = { legs: [] };
  g.scale.setScalar(4); root.add(g);
  const bd = part(mats, 16, 16, 16, [240, 240, 240], 'ghast_n_body', (ctx) => { ctx.fillStyle = '#555'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); ctx.fillRect(3, 5, 2, 2); });
  bd.position.y = px(8); g.add(bd); P.body = bd;
  for (let i = 0; i < 9; i++) {
    const len = 9 + (i * 7) % 6, tx = ((i % 3) - 1) * 5, tz = (Math.floor(i / 3) - 1) * 5;
    const lg = pivot(part(mats, 2, len, 2, [230, 230, 230], 'ghast_n_leg'), tx, 0, tz, -len / 2); g.add(lg); P.legs.push(lg);
  }
  return { root, mats, P };
};
if (!MODELS.blaze) MODELS.blaze = () => {
  const root = new THREE.Group(), mats = [], P = { legs: [] };
  const hd = pivot(part(mats, 8, 8, 8, [250, 200, 60], 'blaze_n_head', (ctx) => { ctx.fillStyle = '#3a2000'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); }), 0, 20, 0, 4);
  root.add(hd); P.head = hd; P.body = hd.children[0];
  const rods = new THREE.Group(); root.add(rods); P.rods = rods;
  for (let i = 0; i < 12; i++) {
    const ring = Math.floor(i / 4), a = (i % 4) / 4 * Math.PI * 2 + ring * 0.6, rad = [9, 7, 5][ring];
    const rd = part(mats, 2, 8, 2, [240, 170, 40], 'blaze_n_rod');
    rd.position.set(px(Math.cos(a) * rad), px(18 - ring * 6), px(Math.sin(a) * rad)); rods.add(rd);
  }
  return { root, mats, P };
};
if (!MODELS.magma_cube) MODELS.magma_cube = () => {
  const root = new THREE.Group(), mats = [], P = { legs: [] };
  const bd = part(mats, 16, 16, 16, [80, 28, 18], 'magma_n_body', (ctx) => { ctx.fillStyle = '#ff9a20'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); ctx.fillStyle = '#ffd040'; ctx.fillRect(0, 5, 8, 1); });
  bd.position.y = px(8); root.add(bd); P.body = bd;
  return { root, mats, P };
};

// ---------------- 刷怪与交互 ----------------
function netherPickType(table) {
  const list = table.filter(e => MOB_DEFS[e[0]]);
  if (!list.length) return null;
  let t = Math.random() * list.reduce((a, e) => a + e[1], 0);
  for (const e of list) { t -= e[1]; if (t <= 0) return e; }
  return list[list.length - 1];
}
const NETHER_SPAWNS = {
  nether_wastes: [['zombified_piglin', 100, 2, 4], ['ghast', 12, 1, 1], ['magma_cube', 4, 1, 2], ['piglin', 15, 2, 4], ['enderman', 1, 1, 2]],
  crimson_forest: [['zombified_piglin', 2, 2, 4], ['piglin', 8, 2, 4], ['hoglin', 9, 2, 3]],
  warped_forest: [['enderman', 1, 1, 2]],
  soul_sand_valley: [['skeleton', 20, 2, 4], ['ghast', 14, 1, 1], ['enderman', 1, 1, 2]],
  basalt_deltas: [['magma_cube', 100, 1, 3], ['ghast', 10, 1, 1]],
  fortress: [['blaze', 10, 1, 2], ['wither_skeleton', 8, 1, 3], ['skeleton', 2, 1, 2], ['magma_cube', 3, 1, 2], ['zombified_piglin', 2, 1, 2]],
};
function netherSpawn(g) {
  const w = g.world, p = g.player;
  if (w.dim !== 'nether' || !p.alive) return;
  const cnt = g.mobs.filter(m => m.def.hostile).length;
  if (cnt >= 24) return;
  const ghasts = g.mobs.filter(m => m.type === 'ghast').length;
  const fort = typeof netherInFortress === 'function' ? netherInFortress(w, p.pos.x, p.pos.y, p.pos.z, 48) : null;
  for (let a = 0; a < 4; a++) {
    // 要塞范围内优先刷要塞生物，站在下界砖地板上
    if (fort && Math.random() < 0.7) {
      const x = Math.floor(p.pos.x + (Math.random() - 0.5) * 64), z = Math.floor(p.pos.z + (Math.random() - 0.5) * 64), y = fort.y + 1;
      if (Math.hypot(x - p.pos.x, z - p.pos.z) < 12 || !w.isLoaded(x, z)) continue;
      if (w.getBlock(x, y - 1, z) !== B.nether_bricks || w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0 || w.getBlock(x, y + 2, z) !== 0) continue;
      const e = netherPickType(NETHER_SPAWNS.fortress);
      if (e) { g.spawnMob(e[0], x + 0.5, y, z + 0.5); return; }
      continue;
    }
    const ang = Math.random() * Math.PI * 2, r = 20 + Math.random() * 32;
    const x = Math.floor(p.pos.x + Math.cos(ang) * r), z = Math.floor(p.pos.z + Math.sin(ang) * r);
    if (!w.isLoaded(x, z)) continue;
    const e = netherPickType(NETHER_SPAWNS[w.biomeAt(x, z)] || NETHER_SPAWNS.nether_wastes);
    if (!e) continue;
    if (e[0] === 'ghast') {
      if (ghasts >= 3) continue;
      const y = 40 + Math.floor(Math.random() * 60);
      if (w.getBlock(x, y, z) === 0 && boxFree(w, x + 0.5, y, z + 0.5, 2.2, 4.5)) { g.spawnMob('ghast', x + 0.5, y, z + 0.5); return; }
      continue;
    }
    let y = 34 + Math.floor(Math.random() * 84), ok = false;
    for (let s = 0; s < 48 && y > 31; s++, y--) {
      const below = w.getBlock(x, y - 1, z);
      if (w.getBlock(x, y, z) === 0 && w.getBlock(x, y + 1, z) === 0 && BLOCKS[below].solid && below !== B.bedrock && !isLiquid(below)) { ok = true; break; }
    }
    if (!ok) continue;
    const n = e[2] + Math.floor(Math.random() * (e[3] - e[2] + 1));
    for (let i = 0; i < n; i++) {
      const sx = x + (i ? Math.random() * 3 - 1.5 : 0), sz = z + (i ? Math.random() * 3 - 1.5 : 0);
      if (i && (w.getBlock(Math.floor(sx), y, Math.floor(sz)) !== 0 || !BLOCKS[w.getBlock(Math.floor(sx), y - 1, Math.floor(sz))].solid)) continue;
      g.spawnMob(e[0], Math.floor(sx) + 0.5, y, Math.floor(sz) + 0.5);
    }
    return;
  }
}

FEATURES.push({
  name: 'nether_mobs',
  spawn: netherSpawn,
  damageTaken(g, e, dmg, src, attacker) {
    if (!e.isPlayer && attacker && attacker.isPlayer && (e.type === 'zombified_piglin' || e.type === 'piglin')) {
      // 被玩家攻击：附近同类一起愤怒
      for (const m of g.mobs) if (m.type === e.type && !m.dead && m.distTo(e) < (e.type === 'piglin' ? 16 : 32)) { m.angerT = 25 + Math.random() * 15; m.barterT = 0; }
      g.audio.sfx(e.type + '.angry', e.pos, 1);
    }
    return dmg;
  },
  useMob(g, p, m, held) {
    // 右键给猪灵金锭进行以物易物
    if (m.type === 'piglin' && held && held.id === 'gold_ingot' && !(m.angerT > 0) && !(m.barterT > 0) && !m.small) {
      m.barterT = 6; p.consume(1);
      g.audio.play('pop', m.pos);
      return true;
    }
    return false;
  },
  frame(g, dt) {
    // 左键打回火球
    if (g.state !== 'playing' || !g.input.mouseClicked[0] || !g.player || !g.player.alive) return;
    const p = g.player;
    for (const e of g.entities) if (e instanceof NetherFireball && !e.dead && netherAimAt(p, e)) { e.deflect(p); p.swing = 1; break; }
  },
});
function netherAimAt(p, e) {
  const eye = p.eye(), d = p.lookDir();
  const vx = e.pos.x - eye.x, vy = e.pos.y - eye.y, vz = e.pos.z - eye.z;
  const t = vx * d.x + vy * d.y + vz * d.z;
  if (t < 0 || t > 4.5) return false;
  const r = e.w + 0.5;
  return vx * vx + vy * vy + vz * vz - t * t < r * r;
}
