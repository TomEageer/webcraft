'use strict';
// ---------- 末地模块（二）：末影人、末影螨、末影龙、末地水晶及投掷物 ----------

// ---------------- 通用：随机传送（末影人、紫颂果、龙蛋） ----------------
function endBurst(g, x, y, z, n) {
  for (let i = 0; i < n; i++) g.particles.add(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 2, z + (Math.random() - 0.5) * 0.8,
    (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, Math.random() < 0.5 ? [200, 80, 255] : [120, 40, 180], 0.6 + Math.random() * 0.6, 0);
}
// 在 (cx,cy,cz) 附近 range 格内找一处脚下实心、身体空间无阻挡且不在液体中的位置
function endFindSpot(w, e, cx, cy, cz, range) {
  for (let i = 0; i < 24; i++) {
    const x = Math.floor(cx + (Math.random() * 2 - 1) * range), z = Math.floor(cz + (Math.random() * 2 - 1) * range);
    const y0 = Math.floor(cy + (Math.random() * 2 - 1) * Math.min(range, 16));
    if (!w.isLoaded(x, z)) continue;
    for (let y = Math.min(CH - 4, y0 + 8); y >= Math.max(1, y0 - 16); y--) {
      const below = w.getBlock(x, y - 1, z);
      if (!BLOCKS[below].solid || isLiquid(below)) continue;
      if (isLiquid(w.getBlock(x, y, z)) || isLiquid(w.getBlock(x, y + 1, z))) break;
      if (!boxFree(w, x + 0.5, y, z + 0.5, e.w, e.h)) continue;
      return [x + 0.5, y, z + 0.5];
    }
  }
  return null;
}
function endTeleport(e, g, cx, cy, cz, range, sound) {
  const s = endFindSpot(e.world, e, cx, cy, cz, range);
  if (!s) return false;
  endBurst(g, e.pos.x, e.pos.y, e.pos.z, 24);
  g.audio.play(sound || 'enderman.tp', e.pos.clone());
  e.pos.set(s[0], s[1], s[2]); e.vel.set(0, 0, 0); e.fallDist = 0;
  endBurst(g, s[0], s[1], s[2], 24);
  return true;
}

// ---------------- 占位模型（models 模块会覆盖 MODELS[type]） ----------------
function endBox(mats, w, h, d, base, key, faceDraw, opts) { return part(mats, w * 16, h * 16, d * 16, base, key, faceDraw, opts); }
const END_MODELS = {
  enderman() {
    const root = new THREE.Group(), mats = [], P = { legs: [], arms: [] }, black = [24, 20, 28], legH = 28;
    const body = part(mats, 8, 12, 4, black, 'enderman_body'); body.position.set(0, px(legH + 6), 0); root.add(body); P.body = body;
    const head = pivot(part(mats, 8, 8, 8, black, 'enderman_head', ctx => { ctx.fillStyle = '#e07cff'; ctx.fillRect(0, 4, 3, 1); ctx.fillRect(5, 4, 3, 1); ctx.fillStyle = '#b040e0'; ctx.fillRect(1, 4, 1, 1); ctx.fillRect(6, 4, 1, 1); }), 0, legH + 12, 0, 4);
    root.add(head); P.head = head;
    for (const s of [-1, 1]) {
      const lg = pivot(part(mats, 2, legH, 2, black, 'enderman_leg'), s * 2, legH, 0, -legH / 2); root.add(lg); P.legs.push(lg);
      const ar = pivot(part(mats, 2, 28, 2, black, 'enderman_arm'), s * 5, legH + 11, 0, -13); root.add(ar); P.arms.push(ar);
    }
    return { root, mats, P };
  },
  endermite() {
    const root = new THREE.Group(), mats = [], c = [80, 70, 96];
    const segs = [[4, 3, 2, 2.5], [6, 4, 5, -1], [3, 3, 1, -4.5]];
    for (const [w, h, d, z] of segs) { const m = part(mats, w, h, d, c, 'endermite_' + w); m.position.set(0, px(h / 2), px(z)); root.add(m); }
    return { root, mats, P: { legs: [], body: root.children[1] } };
  },
  end_crystal() {
    const root = new THREE.Group();
    const cv = document.createElement('canvas'); cv.width = cv.height = 8; const x = cv.getContext('2d'), r = mulberry32(99);
    for (let i = 0; i < 64; i++) { const v = 0.75 + r() * 0.5; x.fillStyle = `rgb(${220 * v | 0},${120 * v | 0},${230 * v | 0})`; x.fillRect(i % 8, i >> 3, 1, 1); }
    x.fillStyle = '#ffe0ff'; x.fillRect(3, 3, 2, 2);
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter;
    const spin = new THREE.Group(); spin.position.y = 1.25; root.add(spin);
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshBasicMaterial({ map: t }));
    const glass = new THREE.MeshBasicMaterial({ color: 0xf0d8ff, transparent: true, opacity: 0.22, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
    const shell = s => { const g = new THREE.Group(), bg = new THREE.BoxGeometry(s, s, s); g.add(new THREE.Mesh(bg, glass)); g.add(new THREE.LineSegments(new THREE.EdgesGeometry(bg), edge)); return g; };
    const f1 = shell(0.75), f2 = shell(0.95);
    spin.add(core); spin.add(f1); spin.add(f2);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), new THREE.MeshBasicMaterial({ color: 0x3a3a3a }));
    base.position.y = 0.175; root.add(base);
    return { root, mats: [], P: { legs: [], spin, core, f1, f2, base } };
  },
  ender_dragon() {
    const root = new THREE.Group(), mats = [], P = { legs: [], neck: [], tail: [], wings: [], tips: [] };
    const dark = [34, 30, 38], gray = [60, 56, 66];
    const add = (o, x, y, z, par) => { o.position.set(x, y, z); (par || root).add(o); return o; };
    P.body = add(endBox(mats, 2.6, 2.0, 5, dark, 'dragon_body'), 0, 2.2, 0);
    for (let i = 0; i < 4; i++) P.neck.push(add(endBox(mats, 0.9, 0.9, 1.0, dark, 'dragon_neck'), 0, 2.6 + i * 0.12, 3.0 + i * 0.95));
    const head = new THREE.Group(); add(head, 0, 3.05, 7.0); P.head = head;
    add(endBox(mats, 1.6, 1.2, 1.6, dark, 'dragon_head'), 0, 0, 0, head);
    add(endBox(mats, 1.1, 0.6, 1.5, gray, 'dragon_snout'), 0, -0.15, 1.5, head);
    const jaw = new THREE.Group(); add(jaw, 0, -0.5, 0.8, head); P.jaw = jaw;
    add(endBox(mats, 1.0, 0.3, 1.5, gray, 'dragon_jaw'), 0, 0, 0.7, jaw);
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xd060ff });
    for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.3), eyeM), s * 0.81, 0.2, 0.4, head);
    let tz = -2.5;
    for (let i = 0; i < 9; i++) { const s = 0.85 - i * 0.04; tz -= s * 1.05; P.tail.push(add(endBox(mats, s, s, s, dark, 'dragon_tail'), 0, 2.3, tz)); }
    const memb = new THREE.MeshBasicMaterial({ color: 0x302838, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
    mats.push(memb);
    for (const s of [-1, 1]) {
      const wing = new THREE.Group(); add(wing, s * 1.3, 2.9, 0.6); P.wings.push(wing);
      add(endBox(mats, 4.5, 0.35, 0.35, gray, 'dragon_bone'), s * 2.25, 0, 0, wing);
      add(new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.05, 3.6), memb), s * 2.25, 0, -1.8, wing);
      const tip = new THREE.Group(); add(tip, s * 4.5, 0, 0, wing); P.tips.push(tip);
      add(endBox(mats, 4, 0.3, 0.3, gray, 'dragon_bone'), s * 2, 0, 0, tip);
      add(new THREE.Mesh(new THREE.BoxGeometry(4, 0.05, 3.2), memb), s * 2, 0, -1.6, tip);
    }
    for (const [sx, sz] of [[-1, 1.6], [1, 1.6], [-1, -1.6], [1, -1.6]]) add(endBox(mats, 0.5, 1.1, 0.5, dark, 'dragon_leg'), sx * 1.0, 0.9, sz);
    return { root, mats, P };
  },
};

// ---------------- 投掷物与特效实体 ----------------
function endSprite(name, size) {
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: iconTexture(name), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
}

class ThrownPearl extends Entity {
  constructor(game, owner) {
    const e = owner.eye(), d = owner.lookDir();
    super(game, e.x + d.x * 0.4, e.y + d.y * 0.4 - 0.1, e.z + d.z * 0.4);
    this.owner = owner; this.w = 0.1; this.h = 0.1;
    this.vel.set(d.x * 28, d.y * 28 + 2, d.z * 28);
    this.mesh = endSprite('ender_pearl', 0.35); game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 20 || this.pos.y < -20) { this.dead = true; return; }
    this.vel.y -= 14 * dt;
    const steps = 4, w = this.world;
    for (let s = 0; s < steps; s++) {
      const nx = this.pos.x + this.vel.x * dt / steps, ny = this.pos.y + this.vel.y * dt / steps, nz = this.pos.z + this.vel.z * dt / steps;
      const id = w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      let hit = id && BLOCKS[id].solid;
      if (!hit) for (const m of this.game.mobs) if (!m.dead && Math.abs(m.pos.x - nx) < m.w + 0.1 && Math.abs(m.pos.z - nz) < m.w + 0.1 && ny > m.pos.y && ny < m.pos.y + m.h) { hit = true; break; }
      if (hit) { this.land(Math.floor(ny) !== Math.floor(this.pos.y) && this.vel.y < 0 && id && BLOCKS[id].solid ? Math.floor(ny) + 1 : this.pos.y); return; }
      this.pos.set(nx, ny, nz);
    }
    if (Math.random() < 0.5) this.game.particles.add(this.pos.x, this.pos.y, this.pos.z, 0, 0, 0, [150, 60, 210], 0.4, 0);
    this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(this.game.camera.quaternion);
  }
  land(y) {
    this.dead = true;
    const g = this.game, p = this.owner, w = this.world;
    if (!p.alive || p.world !== w) return;
    let x = this.pos.x, z = this.pos.z;
    for (let k = 0; k < 4 && !boxFree(w, x, y, z, p.w, p.h); k++) y = Math.floor(y) + 1;
    endBurst(g, p.pos.x, p.pos.y, p.pos.z, 16);
    p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallDist = 0;
    endBurst(g, x, y, z, 24);
    g.audio.play('pearl.tp', p.pos.clone());
    if (p.mode === 'survival') { p.hurtTime = 0; p.hurt(5, 'fall'); }
    if (Math.random() < 0.05 && MOB_DEFS.endermite) g.spawnMob('endermite', x, y, z);
  }
}

class EyeOfEnder extends Entity {
  constructor(game, owner, target) {
    const e = owner.eye();
    super(game, e.x, e.y - 0.2, e.z);
    const dx = target[0] + 0.5 - e.x, dz = target[2] + 0.5 - e.z, d = Math.hypot(dx, dz) || 1;
    this.dir = [dx / d, dz / d]; this.reach = Math.min(12, d);
    this.mesh = endSprite('eye_of_ender', 0.4); game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    const g = this.game, t = this.age;
    if (t < 1.6) {
      const sp = this.reach / 1.6;
      this.pos.x += this.dir[0] * sp * dt; this.pos.z += this.dir[1] * sp * dt;
      this.pos.y += (t < 1.0 ? 3.2 : 0.6) * dt;
    } else if (t < 2.4) this.pos.y += Math.sin(t * 12) * 0.01;
    else {
      this.vel.y -= 20 * dt; this.pos.y += this.vel.y * dt;
      const id = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
      if ((id && BLOCKS[id].solid) || t > 5) {
        this.dead = true;
        if (Math.random() < 0.2) { g.particles.burst(this.pos.x, this.pos.y + 0.3, this.pos.z, [60, 160, 90], 16, 2); g.audio.play('dig.glass', this.pos.clone()); }
        else { const it = g.dropItem(this.pos.x, this.pos.y + 0.6, this.pos.z, 'eye_of_ender', 1); if (it) it.vel.set(0, 2, 0); }
        return;
      }
    }
    g.particles.add(this.pos.x, this.pos.y, this.pos.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, [170, 70, 230], 0.6, 0);
    this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(g.camera.quaternion);
  }
}

// 龙息云：持续造成魔法伤害
class BreathCloud extends Entity {
  constructor(game, x, y, z, life) { super(game, x, y, z); this.life = life || 8; this.rad = 3; this.dmgT = 0; }
  update(dt) {
    this.age += dt; this.dmgT -= dt;
    if (this.age > this.life) { this.dead = true; return; }
    const g = this.game, p = g.player;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.rad;
      g.particles.add(this.pos.x + Math.cos(a) * r, this.pos.y + Math.random() * 0.6, this.pos.z + Math.sin(a) * r, 0, 0.4 + Math.random() * 0.5, 0, Math.random() < 0.5 ? [190, 60, 230] : [230, 120, 255], 0.8, -0.2);
    }
    if (this.dmgT <= 0 && p.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z) < this.rad && Math.abs(p.pos.y - this.pos.y) < 2.5) {
      this.dmgT = 1; p.hurtTime = 0; p.hurt(3, 'magic');
    }
  }
}

class DragonFireball extends Entity {
  constructor(game, x, y, z, tx, ty, tz) {
    super(game, x, y, z);
    const d = new THREE.Vector3(tx - x, ty - y, tz - z).normalize();
    this.vel.copy(d.multiplyScalar(16));
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshBasicMaterial({ map: packTexture('mobs_mc_dragon_fireball') || null, color: packTexture('mobs_mc_dragon_fireball') ? 0xffffff : 0xb040e0, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide }));
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    const g = this.game, p = g.player;
    this.pos.addScaledVector(this.vel, dt);
    const id = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(this.pos.z));
    const hitP = p.alive && Math.hypot(p.pos.x - this.pos.x, p.pos.y + 0.9 - this.pos.y, p.pos.z - this.pos.z) < 1.3;
    if ((id && BLOCKS[id].solid) || hitP || this.age > 8 || this.pos.y < 0) {
      this.dead = true;
      let y = Math.floor(this.pos.y);
      for (let k = 0; k < 12 && y > 1 && !BLOCKS[this.world.getBlock(Math.floor(this.pos.x), y - 1, Math.floor(this.pos.z))].solid; k++) y--;
      g.entities.push(new BreathCloud(g, this.pos.x, y, this.pos.z, 10));
      g.particles.burst(this.pos.x, this.pos.y, this.pos.z, [200, 80, 255], 30, 3);
      g.audio.play('explode', this.pos.clone());
      if (hitP) { p.hurtTime = 0; p.hurt(4, 'magic'); }
      return;
    }
    g.particles.add(this.pos.x, this.pos.y, this.pos.z, 0, 0, 0, [170, 60, 220], 0.5, 0);
    this.mesh.position.copy(this.pos); this.mesh.quaternion.copy(g.camera.quaternion);
  }
}

// 末影龙死亡动画：上升、光芒四射、发放经验，结束时激活返回传送门
class DragonDeathFx extends Entity {
  constructor(game, x, y, z, yaw, first) {
    super(game, x, y, z);
    this.first = first; this.xpLeft = first ? 12000 : 500; this.xpAcc = 0; this.dur = 6;
    const g = new THREE.Group();
    this.model = buildMob('ender_dragon'); this.model.root.rotation.y = yaw; g.add(this.model.root);
    this.rays = new THREE.Group(); this.rays.position.y = 2.2; g.add(this.rays);
    const geo = new THREE.BoxGeometry(0.25, 0.25, 1); geo.translate(0, 0, 0.5);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xf0b0ff : 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.lookAt(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5));
      m.userData.len = 6 + Math.random() * 10; this.rays.add(m);
    }
    this.mesh = g; game.scene.add(g);
  }
  update(dt) {
    this.age += dt;
    const g = this.game, t = this.age / this.dur, p = g.player;
    this.pos.y += dt * 1.0;
    this.mesh.position.set(this.pos.x + (Math.random() - 0.5) * 0.3 * t, this.pos.y, this.pos.z + (Math.random() - 0.5) * 0.3 * t);
    this.rays.rotation.y += dt * 0.6; this.rays.rotation.x += dt * 0.25;
    for (const r of this.rays.children) { r.scale.set(1 + t * 4, 1 + t * 4, r.userData.len * Math.min(1, t * 1.6)); r.material.opacity = 0.75 * (1 - t * 0.6); }
    const b = 0.3 + 0.7 * (1 - t); for (const m of this.model.mats) m.color.setRGB(b, b, b);
    for (let i = 0; i < 4; i++) g.particles.add(this.pos.x + (Math.random() - 0.5) * 6, this.pos.y + 2 + (Math.random() - 0.5) * 3, this.pos.z + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6, [240, 200, 255], 0.8, 0);
    // 经验分批发放
    if (p.alive && g.world.dim === 'end') {
      this.xpAcc += this.xpLeft * dt / Math.max(0.1, this.dur - this.age + dt);
      if (this.xpAcc >= 1 && Math.floor(this.age * 4) !== Math.floor((this.age - dt) * 4)) { const n = Math.floor(this.xpAcc); this.xpAcc -= n; this.xpLeft -= n; p.addXp(n); }
    }
    if (this.age >= this.dur) {
      this.dead = true;
      if (this.xpLeft > 0 && p.alive) p.addXp(Math.floor(this.xpLeft));
      g.particles.burst(this.pos.x, this.pos.y + 2, this.pos.z, [255, 230, 255], 60, 6);
      endFinishDragon(g);
    }
  }
}

// ---------------- 生物定义 ----------------
MOB_DEFS.enderman = {
  zh: '末影人', hp: 40, w: 0.3, h: 2.9, speed: 3.0, hostile: true, dmg: 7, xp: 5,
  drops: (m) => [['ender_pearl', Math.random() < 0.5 + 0.1 * (m.lootLvl || 0) ? 1 : 0], m.carry ? [BLOCKS[m.carry].name, 1] : null],
  ai: (m, dt, g) => endermanAI(m, dt, g),
};
MOB_DEFS.endermite = { zh: '末影螨', hp: 8, w: 0.2, h: 0.3, speed: 3.2, hostile: true, dmg: 2, arthropod: true, drops: () => [], xp: 3 };
MOB_DEFS.ender_dragon = {
  zh: '末影龙', hp: 200, w: 2.5, h: 3, speed: 14, hostile: true, noDespawn: true, fireImmune: true, dmg: 10, xp: 0,
  drops: () => [], ai: (m, dt, g) => dragonAI(m, dt, g),
  onDeath: (m) => {
    const g = m.game, st = END.state;
    if (m.world.dim !== 'end' || !st || st.killed) return;
    st.killed = true; st.pending = true; st.hp = 200;
    const first = !st.everKilled; st.everKilled = true;
    g.entities.push(new DragonDeathFx(g, m.pos.x, m.pos.y, m.pos.z, m.yaw, first));
    g.audio.sfx('mobs_mc_wither_spawn', null, 1, 0.7);
    g.ui.chat('末影龙已被击败！');
  },
};
MOB_DEFS.end_crystal = {
  zh: '末地水晶', hp: 1, w: 1, h: 2, speed: 0, noDespawn: true, fireImmune: true, xp: 0, drops: () => [],
  ai: (m, dt) => {
    const P = m.model.P;
    if (P.spin) { P.spin.position.y = 1.25 + Math.sin(m.age * 2) * 0.25; P.f1.rotation.set(m.age * 1.3, m.age * 1.7, 0); P.f2.rotation.set(-m.age, 0, m.age * 1.1); P.core.rotation.y = m.age * 2; }
    if (P.base) P.base.visible = !!m.showBase;
    m.vel.set(0, 0, 0);
    return true;
  },
  onDeath: (m, killer) => {
    const g = m.game, st = END.state;
    if (st) {
      if (m.pillar !== undefined) st.crystals[m.pillar] = 0;
      if (m.placedId) st.placed = st.placed.filter(c => c.id !== m.placedId);
    }
    if (m.silentDeath) return;
    const dragon = g.mobs.find(d => d.type === 'ender_dragon' && !d.dead && d.link === m);
    g.explode(m.pos.x, m.pos.y + 1, m.pos.z, 6);
    if (dragon) { dragon.link = null; dragon.hurtTime = 0; dragon.hurt(10, 'explosion', killer && killer.isPlayer ? killer : null); }
  },
};

// ---------------- 末影人 AI ----------------
const ENDER_PICKABLE = ['grass_block', 'dirt', 'sand', 'red_sand', 'gravel', 'clay', 'pumpkin', 'melon', 'dandelion', 'poppy', 'red_mushroom', 'brown_mushroom', 'cactus', 'moss_block', 'mycelium', 'netherrack'];
function endermanAI(m, dt, g) {
  const pl = g.player, w = m.world;
  m.tpCd = (m.tpCd || 0) - dt; m.wetT = (m.wetT || 0) - dt;
  const dx = pl.pos.x - m.pos.x, dy = pl.pos.y - m.pos.y, dz = pl.pos.z - m.pos.z, dist = Math.hypot(dx, dy, dz);
  // 遇水或淋雨：受伤并逃离
  const wet = m.inWater || (g.isRaining() && w.skyLight(Math.floor(m.pos.x), Math.floor(m.pos.y + m.h), Math.floor(m.pos.z)) >= 15);
  if (wet && m.wetT <= 0) { m.wetT = 1; m.hurtTime = 0; m.hurt(1, 'water'); if (!m.dead) endTeleport(m, g, m.pos.x, m.pos.y, m.pos.z, 32); return true; }
  if (m.tpPending) { m.tpPending = false; endTeleport(m, g, m.pos.x, m.pos.y, m.pos.z, 32); }
  const target = pl.alive && pl.mode === 'survival';
  // 玩家准星注视其头部即被激怒（戴雕刻南瓜除外）
  if (!m.angry && target && dist < 64 && !(pl.armor[0] && pl.armor[0].id === 'carved_pumpkin')) {
    const e = pl.eye(), head = new THREE.Vector3(m.pos.x, m.pos.y + m.h - 0.25, m.pos.z), v = head.clone().sub(e), d = v.length();
    if (v.normalize().dot(pl.lookDir()) > 1 - 0.025 / d && g.lineOfSight(e, head)) {
      m.angry = true; m.angerT = 30; m.stareT = 0.6;
      g.audio.sfx('enderman.say', m.pos, 1, 0.6);
    }
  }
  if (m.angry) { m.angerT -= dt; if (m.angerT <= 0 || !target || dist > 64) m.angry = false; }
  if (m.stareT > 0) m.stareT -= dt;
  m.attacking = !!(m.angry && target);
  if (m.attacking) {
    m.angerT = Math.max(m.angerT, dist < 16 ? 30 : m.angerT);
    if (m.stareT > 0) m.steer(dx, dz, 0, dt);
    else m.steer(dx, dz, 4.6, dt);
    if (dist < 1.6 + m.w && Math.abs(dy) < 2.6 && m.attackCd <= 0) { m.attackCd = 1; pl.hurt(m.def.dmg, 'mob', m); }
    if (dist > 12 && m.tpCd <= 0 && Math.random() < dt * 0.8) { m.tpCd = 3; endTeleport(m, g, pl.pos.x, pl.pos.y, pl.pos.z, 8); }
  } else {
    m.wanderT -= dt;
    if (m.wanderT <= 0) { m.wanderT = 2 + Math.random() * 6; m.moveDir = Math.random() < 0.5 ? null : Math.random() * Math.PI * 2; }
    if (m.moveDir !== null && m.moveDir !== undefined) m.steer(Math.sin(m.moveDir), Math.cos(m.moveDir), 1.4, dt); else m.steer(0, 0, 0, dt);
    // 偶尔随机传送、搬运方块
    if (m.tpCd <= 0 && Math.random() < dt * 0.02) { m.tpCd = 5; endTeleport(m, g, m.pos.x, m.pos.y, m.pos.z, 32); }
    if (Math.random() < dt * 0.05) endermanCarry(m, g);
  }
  m.physics(dt);
  // 搬运的方块显示在手中
  if (m.carry && !m.carryMesh) { const cm = makeBlockMesh(m.carry, 0.42); cm.position.set(0, 1.85, 0.45); m.mesh.add(cm); m.carryMesh = cm; m.model.mats.push(cm.material); }
  if (!m.carry && m.carryMesh) { m.mesh.remove(m.carryMesh); m.model.mats = m.model.mats.filter(x => x !== m.carryMesh.material); m.carryMesh = null; }
  if (m.model.P.arms && m.carry) m.model.P.arms.forEach(a => { a.rotation.x = -0.9; });
  // 尖叫张嘴由模型根据 screaming 标记绘制，这里只传状态，不直接改头部位置
  m.screaming = !!m.attacking;
  return true;
}
function endermanCarry(m, g) {
  const w = m.world, x = Math.floor(m.pos.x + Math.sin(m.yaw)), z = Math.floor(m.pos.z + Math.cos(m.yaw)), y = Math.floor(m.pos.y);
  if (!m.carry) {
    for (const yy of [y, y - 1]) {
      const id = w.getBlock(x, yy, z);
      if (id && ENDER_PICKABLE.includes(BLOCKS[id].name) && ITEMS[BLOCKS[id].name]) { w.setBlock(x, yy, z, 0); m.carry = id; return; }
    }
  } else if (w.getBlock(x, y, z) === 0 && BLOCKS[w.getBlock(x, y - 1, z)].solid && Math.random() < 0.3) {
    w.setBlock(x, y, z, m.carry); m.carry = 0;
  }
}

// ---------------- 末影龙 AI ----------------
function dragonAI(m, dt, g) {
  const pl = g.player, w = m.world, S = END_S;
  if (!m.inited) {
    m.inited = true; m.phase = 'circle'; m.phaseT = 6 + Math.random() * 6; m.ang = Math.atan2(m.pos.z, m.pos.x);
    m.hitCd = 0; m.healT = 0; m.linkT = 0; m.spin = Math.random() < 0.5 ? 1 : -1; m.mesh.rotation.order = 'YXZ'; m.breathT = 0;
  }
  m.phaseT -= dt; m.hitCd -= dt; m.linkT -= dt;
  const canTarget = w.dim === 'end' && pl.alive && pl.mode === 'survival' && m.distTo(pl) < 160;
  const R = 58;
  let tx, ty, tz, sp = 14, hold = false;
  const circlePt = () => { m.ang += m.spin * dt * 14 / R; tx = Math.cos(m.ang + m.spin * 0.5) * R; tz = Math.sin(m.ang + m.spin * 0.5) * R; ty = 86 + Math.sin(m.age * 0.4) * 8; };
  switch (m.phase) {
    case 'circle':
      circlePt();
      if (m.phaseT <= 0) {
        m.phaseT = 10 + Math.random() * 6;
        if (canTarget) { const r = Math.random(); m.phase = r < 0.4 ? 'charge' : r < 0.8 ? 'strafe' : 'perch'; m.phaseT = m.phase === 'charge' ? 7 : m.phase === 'strafe' ? 8 : 20; }
      }
      break;
    case 'strafe': {
      circlePt();
      const head = new THREE.Vector3(m.pos.x + Math.sin(m.yaw) * 7, m.pos.y + 3, m.pos.z + Math.cos(m.yaw) * 7);
      if (canTarget && m.distTo(pl) < 90 && g.lineOfSight(head, pl.eye())) {
        g.entities.push(new DragonFireball(g, head.x, head.y, head.z, pl.pos.x, pl.pos.y + 1, pl.pos.z));
        g.audio.sfx('dragon.shoot', m.pos); m.jawT = 0.6;
        m.phase = 'circle'; m.phaseT = 8 + Math.random() * 8;
      } else if (m.phaseT <= 0) { m.phase = 'circle'; m.phaseT = 6; }
      break;
    }
    case 'charge':
      tx = pl.pos.x; ty = pl.pos.y + 0.5; tz = pl.pos.z; sp = 22;
      if (!canTarget || m.phaseT <= 0) { m.phase = 'climb'; m.phaseT = 3; }
      break;
    case 'climb':
      tx = m.pos.x * 1.4 + Math.sin(m.yaw) * 10; tz = m.pos.z * 1.4 + Math.cos(m.yaw) * 10; ty = 96; sp = 16;
      if (m.phaseT <= 0) { m.phase = 'circle'; m.phaseT = 8 + Math.random() * 8; m.ang = Math.atan2(m.pos.z, m.pos.x); }
      break;
    case 'perch': {
      const a = Math.atan2(pl.pos.z, pl.pos.x);
      tx = 0.5 + Math.cos(a) * 4; tz = 0.5 + Math.sin(a) * 4; ty = S + 3; sp = 12;
      if (Math.hypot(tx - m.pos.x, ty - m.pos.y, tz - m.pos.z) < 2) { m.phase = 'perching'; m.phaseT = 9; m.breathT = 1.5; }
      else if (m.phaseT <= 0 || !canTarget) { m.phase = 'climb'; m.phaseT = 3; }
      break;
    }
    case 'perching': {
      hold = true; tx = m.pos.x; ty = m.pos.y; tz = m.pos.z;
      const want = Math.atan2(pl.pos.x - m.pos.x, pl.pos.z - m.pos.z);
      let dy = want - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      m.yaw += dy * Math.min(1, dt * 2);
      m.breathT -= dt;
      if (m.breathT <= 0 && canTarget) {
        m.breathT = 3; m.jawT = 1;
        const fx = m.pos.x + Math.sin(m.yaw) * 7, fz = m.pos.z + Math.cos(m.yaw) * 7;
        let y = Math.floor(m.pos.y + 2); while (y > 1 && !BLOCKS[w.getBlock(Math.floor(fx), y - 1, Math.floor(fz))].solid) y--;
        g.entities.push(new BreathCloud(g, fx, y, fz, 6));
        g.audio.sfx('dragon.say', m.pos);
      }
      if (m.phaseT <= 0 || !canTarget) { m.phase = 'climb'; m.phaseT = 3; }
      break;
    }
  }
  // 目标点落在未加载区块时向玩家一侧收拢，避免被区块卸载清掉
  if (!w.isLoaded(Math.floor(tx), Math.floor(tz)) || !w.isLoaded(Math.floor(m.pos.x), Math.floor(m.pos.z))) { tx = (tx + pl.pos.x) / 2; tz = (tz + pl.pos.z) / 2; }
  if (hold) { m.vel.multiplyScalar(Math.pow(0.05, dt)); }
  else {
    const v = new THREE.Vector3(tx - m.pos.x, ty - m.pos.y, tz - m.pos.z), d = v.length();
    if (d > 0.01) v.multiplyScalar(sp / d * Math.min(1, d / 3 + 0.3));
    m.vel.lerp(v, Math.min(1, dt * (m.phase === 'charge' ? 2.2 : 1.4)));
  }
  m.pos.addScaledVector(m.vel, dt);
  if (m.pos.y < 30) m.pos.y = 30;
  if (m.pos.y > CH + 20) m.pos.y = CH + 20;
  const hs = Math.hypot(m.vel.x, m.vel.z);
  if (hs > 0.6 && !hold) {
    const want = Math.atan2(m.vel.x, m.vel.z);
    let dy = want - m.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    m.yaw += dy * Math.min(1, dt * 3);
  }
  m.mesh.rotation.x = clamp(-Math.atan2(m.vel.y, hs + 0.01) * 0.6, -0.7, 0.7);
  // 撞击玩家：击退 + 伤害
  if (canTarget && m.hitCd <= 0) {
    const c = new THREE.Vector3(m.pos.x, m.pos.y + 1.6, m.pos.z), pc = new THREE.Vector3(pl.pos.x, pl.pos.y + 0.9, pl.pos.z);
    const head = new THREE.Vector3(m.pos.x + Math.sin(m.yaw) * 6, m.pos.y + 3, m.pos.z + Math.cos(m.yaw) * 6);
    if (c.distanceTo(pc) < 3.6 || head.distanceTo(pc) < 2.2) {
      m.hitCd = 1;
      const dmg = m.phase === 'charge' ? m.def.dmg : 5;
      pl.hurtTime = 0; pl.hurt(dmg, 'mob', m);
      const kx = pl.pos.x - m.pos.x, kz = pl.pos.z - m.pos.z, kl = Math.hypot(kx, kz) || 1;
      pl.vel.x += kx / kl * 14; pl.vel.z += kz / kl * 14; pl.vel.y = 9;
      if (m.phase === 'charge') { m.phase = 'climb'; m.phaseT = 3; }
    }
  }
  // 末地水晶治疗
  if (m.linkT <= 0) {
    m.linkT = 0.25;
    let best = null, bd = 32;
    for (const c of g.mobs) if (c.type === 'end_crystal' && !c.dead) { const d = c.distTo(m); if (d < bd) { bd = d; best = c; } }
    m.link = best;
  }
  if (m.link && m.link.dead) m.link = null;
  if (m.link) { m.healT += dt; if (m.healT >= 0.5) { m.healT = 0; m.health = Math.min(m.def.hp, m.health + 1); } }
  // 翅膀扇动、下颌
  const P = m.model.P, flap = Math.sin(m.age * (m.phase === 'charge' ? 5 : 3));
  if (P.wings && P.wings.length === 2) { P.wings[0].rotation.z = flap * 0.55; P.wings[1].rotation.z = -flap * 0.55; }
  if (P.tips && P.tips.length === 2) { P.tips[0].rotation.z = flap * 0.4; P.tips[1].rotation.z = -flap * 0.4; }
  if (P.tail) P.tail.forEach((t, i) => { t.position.x = Math.sin(m.age * 2 - i * 0.6) * 0.12 * i; });
  m.jawT = (m.jawT || 0) - dt;
  if (P.jaw) P.jaw.rotation.x = m.jawT > 0 ? 0.5 : 0.05;
  if (w.dim === 'end' && END.state && m.fight) END.state.hp = m.health;
  return true;
}
