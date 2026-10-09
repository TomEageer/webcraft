'use strict';
// ---------- 实体：物理、生物、掉落物、TNT、下落方块、箭、粒子 ----------

const GRAVITY = 32, TERMINAL = 78;
let PARTICLE_LEVEL = 0; // 0 全部 1 减少 2 最少

// 与方块碰撞的 AABB 移动（未加载区块视为实心）
function gatherBoxes(world, x0, y0, z0, x1, y1, z1) {
  const out = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++)
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++) {
      if (!world.isLoaded(x, z)) { out.push([x, -64, z, x + 1, 512, z + 1]); continue; }
      for (let y = Math.floor(y0) - 1; y <= Math.floor(y1); y++) {
        if (y < 0) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
        const id = world.getBlock(x, y, z);
        if (!id) continue;
        if (y < Math.floor(y0) && !BLOCKS[id].tall) continue; // 下一格只取高碰撞方块（栅栏/墙 1.5 格）
        const bx = collisionBoxes(id, world.getMeta(x, y, z), worldNB(world, x, y, z));
        if (!bx) continue;
        for (const b of bx) out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
      }
    }
  return out;
}

function sweep(world, e, dx, dy, dz) {
  const w = e.w, p = e.pos;
  const boxes = gatherBoxes(world, Math.min(p.x - w, p.x - w + dx) - 0.01, Math.min(p.y, p.y + dy) - 0.01, Math.min(p.z - w, p.z - w + dz) - 0.01,
    Math.max(p.x + w, p.x + w + dx) + 0.01, Math.max(p.y + e.h, p.y + e.h + dy) + 0.01, Math.max(p.z + w, p.z + w + dz) + 0.01);
  const E = 1e-6;
  let minX = p.x - w, maxX = p.x + w, minY = p.y, maxY = p.y + e.h, minZ = p.z - w, maxZ = p.z + w;
  const ody = dy, odx = dx, odz = dz;
  for (const b of boxes) {
    if (b[3] <= minX + E || b[0] >= maxX - E || b[5] <= minZ + E || b[2] >= maxZ - E) continue;
    if (dy > 0 && b[1] >= maxY - E) dy = Math.min(dy, b[1] - maxY);
    else if (dy < 0 && b[4] <= minY + E) dy = Math.max(dy, b[4] - minY);
  }
  minY += dy; maxY += dy;
  for (const b of boxes) {
    if (b[4] <= minY + E || b[1] >= maxY - E || b[5] <= minZ + E || b[2] >= maxZ - E) continue;
    if (dx > 0 && b[0] >= maxX - E) dx = Math.min(dx, b[0] - maxX);
    else if (dx < 0 && b[3] <= minX + E) dx = Math.max(dx, b[3] - minX);
  }
  minX += dx; maxX += dx;
  for (const b of boxes) {
    if (b[4] <= minY + E || b[1] >= maxY - E || b[3] <= minX + E || b[0] >= maxX - E) continue;
    if (dz > 0 && b[2] >= maxZ - E) dz = Math.min(dz, b[2] - maxZ);
    else if (dz < 0 && b[5] <= minZ + E) dz = Math.max(dz, b[5] - minZ);
  }
  return { dx, dy, dz, hx: dx !== odx, hy: dy !== ody, hz: dz !== odz };
}

function boxFree(world, x, y, z, w, h) {
  const bs = gatherBoxes(world, x - w, y, z - w, x + w, y + h, z + w);
  for (const b of bs) if (b[3] > x - w && b[0] < x + w && b[4] > y && b[1] < y + h && b[5] > z - w && b[2] < z + w) return false;
  return true;
}

class Entity {
  constructor(game, x, y, z) {
    this.game = game; this.world = game.world;
    this.pos = new THREE.Vector3(x, y, z); this.vel = new THREE.Vector3();
    this.w = 0.3; this.h = 1.8; this.onGround = false; this.inWater = false; this.inLava = false;
    this.yaw = 0; this.dead = false; this.age = 0; this.fallDist = 0; this.hurtTime = 0;
    this.stepH = 0.6; this.mesh = null; this.horizHit = false; this.fire = 0;
  }
  // 移动 + 碰撞 + 台阶自动跨越
  move(dx, dy, dz) {
    const world = this.world;
    let r = sweep(world, this, dx, dy, dz);
    if ((r.hx || r.hz) && (this.onGround || (dy < 0 && r.hy)) && this.stepH > 0) {
      const save = this.pos.clone();
      const up = sweep(world, this, 0, this.stepH, 0);
      this.pos.y += up.dy;
      const r2 = sweep(world, this, dx, 0, dz);
      this.pos.x += r2.dx; this.pos.z += r2.dz;
      const dn = sweep(world, this, 0, -this.stepH - 0.01 + Math.min(0, dy), 0);
      this.pos.y += dn.dy;
      if (r2.dx * r2.dx + r2.dz * r2.dz > r.dx * r.dx + r.dz * r.dz + 1e-6 && dn.hy) {
        this.horizHit = r2.hx || r2.hz; this.onGround = true; this.vel.y = 0; return;
      }
      this.pos.copy(save);
    }
    this.pos.x += r.dx; this.pos.y += r.dy; this.pos.z += r.dz;
    this.horizHit = r.hx || r.hz;
    if (r.hx) this.vel.x = 0;
    if (r.hz) this.vel.z = 0;
    if (r.hy) { this.onGround = dy < 0; this.vel.y = 0; } else this.onGround = false;
  }
  checkFluids() {
    const w = this.world;
    const fx = Math.floor(this.pos.x), fz = Math.floor(this.pos.z);
    const feet = w.getBlock(fx, Math.floor(this.pos.y + 0.1), fz), mid = w.getBlock(fx, Math.floor(this.pos.y + this.h * 0.5), fz);
    this.inWater = feet === B.water || mid === B.water;
    this.inLava = feet === B.lava || mid === B.lava;
    this.eyeInWater = w.getBlock(fx, Math.floor(this.pos.y + this.h * 0.9), fz) === B.water;
    // 入水溅起水花
    const g = this.game;
    if (this.inWater && !this.wasInWater && this.vel.y < -4 && g && g.particles) {
      const n = Math.min(40, Math.floor(-this.vel.y * 2));
      for (let i = 0; i < n; i++) g.particles.add(this.pos.x + (Math.random() - 0.5) * this.w * 3, this.pos.y + 0.5 + Math.random() * 0.4, this.pos.z + (Math.random() - 0.5) * this.w * 3, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, Math.random() < 0.5 ? [200, 220, 255] : [90, 140, 230], 0.6 + Math.random() * 0.4, 12);
      g.audio.sfx('splash', this.pos, Math.min(1, -this.vel.y / 14), 0.8 + Math.random() * 0.4);
    }
    this.wasInWater = this.inWater;
    // 水下冒气泡
    if (this.eyeInWater && g && g.particles && Math.random() < 0.08) {
      g.particles.add(this.pos.x + (Math.random() - 0.5) * 0.4, this.pos.y + this.h * 0.9, this.pos.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, 1.2, (Math.random() - 0.5) * 0.3, [210, 230, 255], 1.2 + Math.random(), -1.5);
    }
    // 浸没深度：脚下到液面的高度（0 表示不在液体中）
    this.sub = 0;
    if (this.inWater || this.inLava) {
      const id = this.inWater ? B.water : B.lava;
      let y = Math.floor(this.pos.y + 0.1);
      if (w.getBlock(fx, y, fz) !== id) y++;
      while (w.getBlock(fx, y + 1, fz) === id && y < this.pos.y + this.h + 2) y++;
      const m = w.getMeta(fx, y, fz), top = (m & 8) ? 1 : (m & 7) === 0 ? 0.89 : Math.max(0.12, (8 - (m & 7)) / 9);
      this.sub = Math.max(0, y + top - this.pos.y);
    }
  }
  // 在液体中漂浮：把身体浸没深度稳定在 want（格）附近，避免在水面上下抽动
  swimFloat(want, dt) {
    if (!this.sub) return;
    const target = clamp((this.sub - want) * 3, -1.2, 2.4);
    this.vel.y += (target - this.vel.y) * Math.min(1, dt * 6);
  }
  physics(dt, drag) {
    this.checkFluids();
    if (this.inWater || this.inLava) {
      this.vel.y -= GRAVITY * 0.18 * dt;
      const d = Math.pow(this.inLava ? 0.02 : 0.08, dt);
      this.vel.x *= d; this.vel.z *= d; this.vel.y *= Math.pow(0.2, dt);
      this.fallDist = 0;
    } else {
      this.vel.y = Math.max(this.vel.y - GRAVITY * dt, -TERMINAL);
    }
    const prevY = this.pos.y, wasGround = this.onGround;
    this.move(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    if (!this.onGround && this.pos.y < prevY) this.fallDist += prevY - this.pos.y;
    if (this.onGround && !wasGround) { this.onLand(this.fallDist); this.fallDist = 0; }
    if (this.onGround) this.fallDist = 0;
    const steering = this.steering; this.steering = false;
    if (this.onGround && drag !== false && !steering) {
      const below = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.05), Math.floor(this.pos.z));
      const slip = BLOCKS[below].slip ? 0.6 : 0.0001;
      const f = Math.pow(slip, dt);
      this.vel.x *= f; this.vel.z *= f;
    }
    if (this.pos.y < -40) this.hurt(1000, 'void');
  }
  onLand(dist) {
    const d = Math.floor(dist - 3);
    if (d > 0 && !this.inWater) {
      const below = this.world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.2), Math.floor(this.pos.z));
      if (below === B.hay_block || BLOCKS[below].shape === 'bed') this.hurt(Math.floor(d * 0.2), 'fall');
      else this.hurt(d, 'fall');
    }
  }
  hurt() { }
  lightAt() {
    const w = this.world, x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.5), z = Math.floor(this.pos.z);
    const sl = Math.max(0, w.skyLight(x, y, z) - this.game.skyDarken), bl = w.blockLight(x, y, z);
    const info = DIM_INFO[w.dim];
    return Math.max(Math.pow(0.82, 15 - sl), Math.pow(0.82, 15 - bl), (info && info.entityLight) || 0.06);
  }
  dispose() { if (this.mesh) { this.game.scene.remove(this.mesh); } }
}

// ---------------- 生物模型 ----------------
const SKIN_CACHE = new Map();
function skinTex(key, base, draw) {
  if (SKIN_CACHE.has(key)) return SKIN_CACHE.get(key);
  const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
  const ctx = cv.getContext('2d'), r = mulberry32(hashString(key));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const f = 0.88 + r() * 0.24;
    ctx.fillStyle = `rgb(${base[0] * f | 0},${base[1] * f | 0},${base[2] * f | 0})`; ctx.fillRect(x, y, 1, 1);
  }
  if (draw) draw(ctx, r);
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  SKIN_CACHE.set(key, t);
  return t;
}
const px = v => v / 16;
function part(mats, w, h, d, base, key, faceDraw, opts) {
  const g = new THREE.BoxGeometry(px(w), px(h), px(d));
  const m = [];
  for (let f = 0; f < 6; f++) {
    const isFace = f === 4 && faceDraw;
    const mat = new THREE.MeshBasicMaterial({ map: skinTex(key + (isFace ? '_face' : ''), base, isFace ? faceDraw : null), transparent: !!(opts && opts.alpha), opacity: opts && opts.alpha ? opts.alpha : 1, depthWrite: !(opts && opts.alpha) });
    m.push(mat); mats.push(mat);
  }
  return new THREE.Mesh(g, m);
}
function pivot(mesh, x, y, z, oy) {
  const g = new THREE.Group(); g.position.set(px(x), px(y), px(z)); mesh.position.y = px(oy); g.add(mesh); return g;
}
const eyes = (c, y) => (ctx) => { ctx.fillStyle = c || '#1a1a1a'; ctx.fillRect(1, y || 3, 2, 1); ctx.fillRect(5, y || 3, 2, 1); };

// 自定义模型注册表：MODELS[type] = (small) => {root, mats, P}（见 models.js）
const MODELS = {};
function buildMob(type, small) {
  if (MODELS[type]) { const m = MODELS[type](small); if (m) return m; }
  const root = new THREE.Group(), mats = [], P = {};
  const add = (o) => { root.add(o); return o; };
  const quad = (o) => {
    const { body, legH, head, color, headColor, legColor, faceDraw, bodyColor } = o;
    const bd = add(part(mats, body[0], body[1], body[2], bodyColor || color, type + '_body'));
    bd.position.set(0, px(legH + body[1] / 2), 0); P.body = bd;
    P.legs = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const lg = pivot(part(mats, 4, legH, 4, legColor || color, type + '_leg'), sx * (body[0] / 2 - 2), legH, sz * (body[2] / 2 - 2.5), -legH / 2);
      add(lg); P.legs.push(lg);
    }
    const hd = pivot(part(mats, head[0], head[1], head[2], headColor || color, type + '_head', faceDraw), 0, legH + body[1] - 1, body[2] / 2, head[1] / 2 - 1);
    hd.children[0].position.z = px(head[2] / 2); add(hd); P.head = hd;
    return hd;
  };
  const humanoid = (o) => {
    const { head, body, limb, skin, shirt, pants, faceDraw, armsForward, tall } = o;
    const H = tall || 12;
    const bd = add(part(mats, body[0], body[1], body[2], shirt, type + '_body')); bd.position.set(0, px(H + body[1] / 2), 0); P.body = bd;
    const hd = pivot(part(mats, head, head, head, skin, type + '_head', faceDraw), 0, H + body[1], 0, head / 2); add(hd); P.head = hd;
    P.legs = []; P.arms = [];
    for (const s of [-1, 1]) {
      const lg = pivot(part(mats, limb, H, limb, pants, type + '_leg'), s * limb / 2, H, 0, -H / 2); add(lg); P.legs.push(lg);
      const ar = pivot(part(mats, limb, body[1], limb, o.armColor || skin, type + '_arm'), s * (body[0] / 2 + limb / 2), H + body[1] - 1, 0, -body[1] / 2 + 1); add(ar); P.arms.push(ar);
      if (armsForward) ar.rotation.x = -Math.PI / 2;
    }
  };
  switch (type) {
    case 'pig': {
      const hd = quad({ body: [10, 8, 16], legH: 6, head: [8, 8, 8], color: [240, 160, 160], faceDraw: eyes('#222', 2) });
      const sn = part(mats, 4, 3, 1, [230, 130, 140], 'pig_snout'); sn.position.set(0, px(-1), px(8.5)); hd.children[0].add(sn); sn.position.set(0, px(-1), px(4.5));
      break;
    }
    case 'cow': {
      const spots = (ctx, r) => { ctx.fillStyle = '#eee'; for (let i = 0; i < 6; i++) ctx.fillRect(r() * 8 | 0, r() * 8 | 0, 2, 2); };
      SKIN_CACHE.delete('cow_body');
      quad({ body: [12, 10, 18], legH: 12, head: [8, 8, 6], color: [80, 56, 40], faceDraw: (ctx) => { eyes('#111', 3)(ctx); ctx.fillStyle = '#ccc'; ctx.fillRect(2, 5, 4, 3); } });
      P.body.material.forEach(m => { m.map = skinTex('cow_spotted', [80, 56, 40], spots); });
      break;
    }
    case 'sheep': {
      quad({ body: [12, 10, 16], legH: 12, head: [6, 6, 8], color: [234, 234, 230], headColor: [210, 190, 170], legColor: [210, 190, 170], faceDraw: eyes('#222', 2) });
      break;
    }
    case 'chicken': {
      const bd = add(part(mats, 6, 6, 8, [240, 240, 240], 'chicken_body')); bd.position.set(0, px(8), 0); P.body = bd;
      P.legs = [];
      for (const s of [-1, 1]) { const lg = pivot(part(mats, 1, 5, 1, [240, 180, 40], 'chicken_leg'), s * 1.5, 5, 0, -2.5); add(lg); P.legs.push(lg); }
      const hd = pivot(part(mats, 4, 6, 3, [240, 240, 240], 'chicken_head', eyes('#111', 1)), 0, 9, 4, 3); add(hd); P.head = hd;
      hd.children[0].position.z = px(1.5);
      const bk = part(mats, 4, 2, 2, [240, 170, 40], 'chicken_beak'); bk.position.set(0, px(0.5), px(2.5)); hd.children[0].add(bk);
      const wt = part(mats, 2, 2, 2, [220, 30, 30], 'chicken_wattle'); wt.position.set(0, px(-1.5), px(2)); hd.children[0].add(wt);
      break;
    }
    case 'fox': {
      quad({ body: [6, 6, 12], legH: 6, head: [8, 6, 6], color: [226, 132, 52], legColor: [50, 36, 30], faceDraw: (ctx) => { eyes('#111', 3)(ctx); ctx.fillStyle = '#f4f0e8'; ctx.fillRect(0, 5, 8, 3); } });
      const tail = part(mats, 4, 4, 9, [226, 132, 52], 'fox_tail'); tail.position.set(0, px(10), px(-9)); tail.rotation.x = 0.4; add(tail);
      break;
    }
    case 'zombie':
      humanoid({ head: 8, body: [8, 12, 4], limb: 4, skin: [90, 140, 80], shirt: [50, 130, 150], pants: [60, 60, 150], faceDraw: eyes('#1a2a10', 4), armsForward: true });
      break;
    case 'skeleton':
      humanoid({ head: 8, body: [8, 12, 4], limb: 2, skin: [200, 200, 196], shirt: [190, 190, 186], pants: [190, 190, 186], faceDraw: (ctx) => { eyes('#222', 3)(ctx); ctx.fillStyle = '#333'; ctx.fillRect(2, 6, 4, 1); }, armsForward: true });
      break;
    case 'steve':
      humanoid({ head: 8, body: [8, 12, 4], limb: 4, skin: [200, 150, 120], shirt: [40, 170, 180], pants: [60, 60, 160], armColor: [40, 170, 180], faceDraw: (ctx) => { ctx.fillStyle = '#4a2f1a'; ctx.fillRect(0, 0, 8, 2); ctx.fillStyle = '#fff'; ctx.fillRect(1, 4, 2, 1); ctx.fillRect(5, 4, 2, 1); ctx.fillStyle = '#3a5aa0'; ctx.fillRect(2, 4, 1, 1); ctx.fillRect(5, 4, 1, 1); ctx.fillStyle = '#8a5a40'; ctx.fillRect(3, 6, 2, 1); } });
      break;
    case 'creaking':
      humanoid({ head: 8, body: [8, 16, 5], limb: 3, skin: [96, 84, 74], shirt: [86, 76, 66], pants: [80, 70, 60], tall: 20, faceDraw: (ctx) => { ctx.fillStyle = '#ff9a28'; ctx.fillRect(1, 3, 2, 2); ctx.fillRect(5, 3, 2, 2); } });
      break;
    case 'creeper': {
      const camo = [90, 176, 80];
      const bd = add(part(mats, 8, 12, 4, camo, 'creeper_body')); bd.position.set(0, px(6 + 6), 0); P.body = bd;
      const hd = pivot(part(mats, 8, 8, 8, camo, 'creeper_head', (ctx) => { ctx.fillStyle = '#111'; ctx.fillRect(1, 2, 2, 2); ctx.fillRect(5, 2, 2, 2); ctx.fillRect(3, 4, 2, 3); ctx.fillRect(2, 5, 1, 3); ctx.fillRect(5, 5, 1, 3); }), 0, 18, 0, 4); add(hd); P.head = hd;
      P.legs = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const lg = pivot(part(mats, 4, 6, 4, camo, 'creeper_leg'), sx * 2, 6, sz * 4, -3); add(lg); P.legs.push(lg); }
      break;
    }
    case 'spider': {
      const dark = [52, 44, 40];
      const bd = add(part(mats, 10, 8, 12, dark, 'spider_body')); bd.position.set(0, px(6), px(-6)); P.body = bd;
      const hd = pivot(part(mats, 8, 8, 8, dark, 'spider_head', (ctx) => { ctx.fillStyle = '#d00'; ctx.fillRect(1, 3, 2, 1); ctx.fillRect(5, 3, 2, 1); ctx.fillRect(2, 2, 1, 1); ctx.fillRect(5, 2, 1, 1); }), 0, 6, 0, 0); add(hd); P.head = hd;
      hd.children[0].position.z = px(4);
      P.legs = [];
      for (let i = 0; i < 8; i++) {
        const s = i < 4 ? -1 : 1;
        const lg = new THREE.Group(); lg.position.set(px(s * 4), px(6), px(-2 - (i % 4) * 2.5));
        const m = part(mats, 16, 2, 2, dark, 'spider_leg'); m.position.x = px(s * 8); lg.add(m);
        lg.rotation.z = s * 0.5; lg.rotation.y = s * ((i % 4) - 1.5) * 0.35;
        add(lg); P.legs.push(lg);
      }
      break;
    }
    case 'sulfur_cube': {
      const s = small ? 8 : 16;
      const outer = add(part(mats, s, s, s, [232, 214, 80], 'sulfur_cube_outer', null, { alpha: 0.65 })); outer.position.y = px(s / 2);
      const face = add(part(mats, s * 0.6, s * 0.6, s * 0.6, [200, 180, 60], 'sulfur_cube_core', (ctx) => { ctx.fillStyle = '#3a2a00'; ctx.fillRect(1, 2, 2, 2); ctx.fillRect(5, 2, 2, 2); ctx.fillRect(3, 5, 2, 1); }));
      face.position.y = px(s / 2); P.body = outer; P.core = face; P.legs = [];
      break;
    }
  }
  if (small && type !== 'sulfur_cube') root.scale.setScalar(0.55);
  return { root, mats, P };
}

const MOB_DEFS = {
  pig: { zh: '猪', hp: 10, w: 0.45, h: 0.9, speed: 2.2, drops: () => [['porkchop', 1 + rnd(3)]], food: 'wheat', xp: 2 },
  cow: { zh: '牛', hp: 10, w: 0.45, h: 1.4, speed: 2.0, drops: () => [['beef', 1 + rnd(3)], ['leather', rnd(3)]], food: 'wheat', xp: 2 },
  sheep: { zh: '绵羊', hp: 8, w: 0.45, h: 1.3, speed: 2.2, drops: (m) => [['mutton', 1 + rnd(2)], m.sheared ? null : ['white_wool', 1]], food: 'wheat', xp: 2 },
  chicken: { zh: '鸡', hp: 4, w: 0.2, h: 0.7, speed: 2.0, drops: () => [['chicken', 1], ['feather', rnd(3)]], food: 'wheat_seeds', xp: 1 },
  fox: { zh: '狐狸', hp: 10, w: 0.35, h: 0.7, speed: 3.0, drops: () => [], xp: 2 },
  zombie: { zh: '僵尸', hp: 20, w: 0.3, h: 1.95, speed: 2.6, hostile: true, dmg: 3, burns: true, undead: true, drops: () => [['rotten_flesh', rnd(3)]], xp: 5 },
  skeleton: { zh: '骷髅', hp: 20, w: 0.3, h: 1.99, speed: 2.8, hostile: true, dmg: 2, burns: true, ranged: true, undead: true, drops: () => [['bone', rnd(3)], ['arrow', rnd(3)]], xp: 5 },
  creeper: { zh: '苦力怕', hp: 20, w: 0.3, h: 1.7, speed: 2.6, hostile: true, creeper: true, drops: () => [['gunpowder', rnd(3)]], xp: 5 },
  spider: { zh: '蜘蛛', hp: 16, w: 0.7, h: 0.9, speed: 3.6, hostile: true, dmg: 2, neutralDay: true, arthropod: true, drops: () => [['string', rnd(3)]], xp: 5 },
  sulfur_cube: { zh: '硫磺立方', hp: 8, w: 0.5, h: 1.0, speed: 2.4, hopper: true, drops: (m) => m.small ? [['slime_ball', rnd(2)]] : [], xp: 1 },
  creaking: { zh: '嘎枝', hp: 1, w: 0.45, h: 2.7, speed: 4.5, hostile: true, dmg: 3, creaking: true, drops: () => [], xp: 0 },
};
function rnd(n) { return Math.floor(Math.random() * (n + 1)); }

class Mob extends Entity {
  constructor(game, type, x, y, z, opts) {
    super(game, x, y, z);
    this.type = type; this.def = MOB_DEFS[type];
    this.small = !!(opts && opts.small);
    this.w = this.def.w * (this.small ? 0.5 : 1); this.h = this.def.h * (this.small ? 0.5 : 1);
    this.health = this.small && type === 'sulfur_cube' ? 4 : this.def.hp;
    this.yaw = Math.random() * Math.PI * 2;
    this.wanderT = 0; this.moveDir = null; this.attackCd = 0; this.fuse = 0; this.walkPhase = 0; this.flee = 0;
    this.love = 0; this.breedCd = 0; this.growT = this.small && type !== 'sulfur_cube' ? 300 : 0;
    this.sheared = false; this.absorbed = null; this.heart = opts && opts.heart;
    const m = buildMob(type, this.small);
    this.model = m; this.mesh = m.root; game.scene.add(this.mesh);
    this.persistent = !this.def.hostile;
  }
  get eyeY() { return this.pos.y + this.h * 0.85; }
  // 原版：音高在 0.8-1.2 间随机，幼体再升高约 50%
  pitch() { return (0.8 + Math.random() * 0.4) * (this.small && this.type !== 'sulfur_cube' ? 1.5 : 1); }
  hurt(dmg, src, attacker) {
    if (this.dead || this.dying || dmg <= 0) return false;
    if (this.type === 'creaking' && this.heart) { // 与心绑定的嘎枝：只要嘎枝之心存在就无敌
      this.hurtTime = 0.3; this.game.audio.play('wood_hit'); return false;
    }
    if (this.hurtTime > 0 && src !== 'fire' && src !== 'void' && src !== 'poison' && src !== 'wither') return false;
    if ((src === 'fire' || src === 'lava') && (this.def.fireImmune || effLv(this, 'fire_resistance'))) return false;
    const res = effLv(this, 'resistance'); if (res) dmg *= Math.max(0, 1 - 0.2 * res);
    for (const f of FEATURES) if (f.damageTaken) dmg = f.damageTaken(this.game, this, dmg, src, attacker);
    if (dmg <= 0) return false;
    this.lastAttacker = attacker;
    this.health -= dmg; this.hurtTime = 0.5;
    if (this.health > 0 && !this.game.audio.sfx(this.type + '.hurt', this.pos, 1, this.pitch())) this.game.audio.play(this.def.hostile ? 'mob_hurt' : 'animal_hurt', this.pos);
    if (attacker) {
      const dx = this.pos.x - attacker.pos.x, dz = this.pos.z - attacker.pos.z, l = Math.hypot(dx, dz) || 1;
      this.vel.x += dx / l * 7; this.vel.z += dz / l * 7; this.vel.y = 5;
      if (!this.def.hostile) this.flee = 4;
      if (this.def.neutralDay) this.angry = true;
    }
    if (this.health <= 0) this.die(attacker);
    return true;
  }
  die(killer) {
    // 原版：死亡后 20 刻（1 秒）内侧倒并保持红色，结束时冒一团烟再消失；掉落物与音效在死亡瞬间
    this.dying = true; this.deathT = 0; this.health = 0;
    const g = this.game;
    if (!g.audio.sfx(this.type + '.death', this.pos, 1, this.pitch())) g.audio.sfx(this.type + '.hurt', this.pos, 1, this.pitch() * 0.8);
    const lt = killer && killer.isPlayer ? (this.lootLvl || 0) : 0;
    for (const d of this.def.drops(this)) if (d && d[1] > 0) g.dropItem(this.pos.x, this.pos.y + 0.5, this.pos.z, d[0], d[1] + (lt ? rnd(lt) : 0));
    if (this.def.onDeath) this.def.onDeath(this, killer);
    if (this.type === 'sulfur_cube' && !this.small) {
      for (let i = 0; i < 2; i++) g.spawnMob('sulfur_cube', this.pos.x + (i - 0.5) * 0.6, this.pos.y + 0.3, this.pos.z, { small: true });
      if (this.absorbed) g.dropItem(this.pos.x, this.pos.y + 0.5, this.pos.z, this.absorbed, 1);
    }
    if (killer && killer.isPlayer) { killer.addXp(this.def.xp); g.stats.kills = (g.stats.kills || 0) + 1; }
  }
  // 死亡动画：倒地角度 = min(1, sqrt(t/1s * 1.6)) * 90°（与原版 LivingEntityRenderer 一致）
  updateDying(dt) {
    const g = this.game;
    this.deathT += dt;
    this.physics(dt);
    const f = Math.min(1, Math.sqrt(Math.max(0, this.deathT - 0.05) * 1.6));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw; this.mesh.rotation.x = 0; this.mesh.rotation.z = -f * Math.PI / 2;
    const b = this.lightAt();
    for (const m of this.model.mats) m.color.setRGB(Math.min(1, b * 2), b * 0.4, b * 0.4);
    if (this.deathT >= 1) {
      this.dead = true;
      // 原版 poof：20 个灰白烟雾粒子
      for (let i = 0; i < 20; i++) g.particles.spawn('poof', this.pos.x + (Math.random() - 0.5) * this.w * 2, this.pos.y + Math.random() * this.h, this.pos.z + (Math.random() - 0.5) * this.w * 2,
        (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.4, { life: 0.4 + Math.random() * 0.5, size: 0.25 + Math.random() * 0.2 });
    }
  }
  update(dt) {
    const g = this.game, pl = g.player, def = this.def;
    if (this.dying) { this.updateDying(dt); return; }
    this.age += dt; if (this.hurtTime > 0) this.hurtTime -= dt; if (this.attackCd > 0) this.attackCd -= dt;
    // 随机叫声
    this.sayT = (this.sayT === undefined ? 4 + Math.random() * 10 : this.sayT) - dt;
    if (this.sayT <= 0) { this.sayT = 8 + Math.random() * 16; if (this.pos.distanceTo(pl.pos) < 20) g.audio.sfx(this.type + '.say', this.pos, 0.7, this.pitch()); }
    if (this.flee > 0) this.flee -= dt; if (this.breedCd > 0) this.breedCd -= dt; if (this.love > 0) { this.love -= dt; if (Math.random() < dt * 2) g.particles.spawn('heart', this.pos.x + (Math.random() - 0.5) * this.w * 2, this.pos.y + this.h * 0.6 + Math.random() * 0.5, this.pos.z + (Math.random() - 0.5) * this.w * 2, 0, 0.6, 0, { life: 1, size: 0.2 }); }
    if (this.growT > 0) { this.growT -= dt; if (this.growT <= 0) { this.small = false; this.w = def.w; this.h = def.h; this.mesh.scale.setScalar(1); } }
    const dx = pl.pos.x - this.pos.x, dz = pl.pos.z - this.pos.z, dy = pl.pos.y - this.pos.y, dist = Math.hypot(dx, dz, dy);
    // 阳光灼烧
    if (def.burns && g.isDay() && !g.isRaining() && !this.inWater && this.world.skyLight(Math.floor(this.pos.x), Math.floor(this.pos.y + this.h), Math.floor(this.pos.z)) >= 15) this.fire = 2;
    tickEffects(this, dt);
    if (this.inLava && !def.fireImmune) { this.fire = 5; this.hurt(4, 'lava'); }
    if (this.inWater) this.fire = 0;
    if (def.fireImmune) this.fire = 0;
    if (this.fire > 0) { this.fire -= dt; this.fireTick = (this.fireTick || 0) + dt; if (this.fireTick > 1) { this.fireTick = 0; this.hurtTime = 0; this.hurt(1, 'fire'); } }
    // 嘎枝：心被破坏即消失；白天消散
    if (def.creaking) {
      const hb = this.heart && this.world.getBlock(this.heart[0], this.heart[1], this.heart[2]);
      // 原版：只有嘎枝之心生成的嘎枝才与心绑定（心没了或天亮就消散）；刷怪蛋放出的是普通嘎枝
      if (this.heart && (hb !== B.creaking_heart || g.isDay())) { this.dead = true; g.particles.burst(this.pos.x, this.pos.y + 1.3, this.pos.z, [120, 100, 80], 30, 3); return; }
    }
    if (def.ai) {
      // 插件定义的 AI：完全接管行为，可调用 this.steer() / this.physics()
      if (def.ai(this, dt, g) !== false) { this.animate(dt, Math.hypot(this.vel.x, this.vel.z)); return; }
    }
    let speed = 0, tx = 0, tz = 0, jump = false;
    const target = def.hostile && pl.alive && pl.mode === 'survival' && dist < (def.creaking ? 32 : 16) * (effLv(pl, 'invisibility') ? 0.3 : 1) && (!def.neutralDay || this.angry || !g.isDay());
    if (target) {
      tx = dx; tz = dz; speed = def.speed;
      if (def.creaking) {
        // 被玩家注视时冻结
        const look = pl.lookDir(), inv = 1 / (dist || 1);
        const dot = -(dx * look.x + dy * look.y + dz * look.z) * inv;
        if (dot > 0.55 && g.lineOfSight(pl.eye(), new THREE.Vector3(this.pos.x, this.pos.y + 2.2, this.pos.z))) { speed = 0; this.frozen = true; }
        else this.frozen = false;
      }
      if (def.ranged) {
        // 原版骷髅：始终面朝目标；太近就后退，中距离左右横移；先拉弓约 1 秒再射
        if (dist < 6) { tx = -dx; tz = -dz; speed = def.speed * 0.7; }
        else if (dist < 13) {
          this.strafeT = (this.strafeT || 0) - dt;
          if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 2; this.strafeDir = Math.random() < 0.5 ? 1 : -1; }
          tx = -dz * this.strafeDir; tz = dx * this.strafeDir; speed = def.speed * 0.35;
        }
        const see = dist < 16 && g.lineOfSight(new THREE.Vector3(this.pos.x, this.eyeY, this.pos.z), pl.eye());
        if (see && this.attackCd <= 0) { this.drawT = (this.drawT || 0) + dt; this.aiming = true; }
        else { this.drawT = 0; this.aiming = false; }
        if (this.drawT >= 1.0) { this.drawT = 0; this.aiming = false; this.attackCd = 1 + Math.random() * 1.2; g.shootArrow(this, pl); }
        this.faceTarget = Math.atan2(dx, dz);
      } else if (def.creeper) {
        if (dist < 3.2) { this.fuse += dt; speed = 0; if (this.fuse > 0.05 && !this.hissed) { this.hissed = true; g.audio.play('fuse', this.pos); } }
        else { this.fuse = Math.max(0, this.fuse - dt); this.hissed = false; }
        if (this.fuse >= 1.5) { this.dead = true; g.explode(this.pos.x, this.pos.y + 0.8, this.pos.z, 3); return; }
      } else if (dist < 1.6 + this.w && Math.abs(dy) < 1.8 && this.attackCd <= 0 && !this.frozen) {
        this.attackCd = 1; pl.hurt(def.dmg, 'mob', this);
      }
    } else if (this.flee > 0) {
      tx = -dx; tz = -dz; speed = def.speed * 1.6;
    } else if (def.food && pl.holding() === def.food && dist < 8 && dist > 2) {
      tx = dx; tz = dz; speed = def.speed * 0.7;
    } else if (this.love > 0) {
      const mate = g.mobs.find(m => m !== this && m.type === this.type && m.love > 0 && !m.dead);
      if (mate) {
        tx = mate.pos.x - this.pos.x; tz = mate.pos.z - this.pos.z; speed = def.speed * 0.6;
        if (Math.hypot(tx, tz) < 1.2) { this.love = mate.love = 0; this.breedCd = mate.breedCd = 300; g.spawnMob(this.type, this.pos.x, this.pos.y + 0.2, this.pos.z, { small: true }); pl.addXp(3); for (let i = 0; i < 7; i++) g.particles.spawn('heart', this.pos.x + (Math.random() - 0.5), this.pos.y + this.h * 0.6 + Math.random() * 0.5, this.pos.z + (Math.random() - 0.5), 0, 0.6, 0, { life: 1, size: 0.2 }); }
      }
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 6;
        this.moveDir = Math.random() < 0.4 ? null : Math.random() * Math.PI * 2;
      }
      if (this.moveDir !== null) { tx = Math.sin(this.moveDir); tz = Math.cos(this.moveDir); speed = def.speed * 0.45; }
    }
    if (def.hopper) {
      // 硫磺立方靠跳跃移动；吸收的方块改变它的物理性质
      const ab = this.absorbed ? ITEMS[this.absorbed] : null;
      let hop = 7, sp = speed;
      if (ab && ab.block !== undefined) {
        const bd = BLOCKS[ab.block];
        if (bd.tool === 'axe') hop = 11; else if (bd.slip) sp *= 2.2; else if (bd.tool === 'pickaxe') { hop = 5; sp *= 0.6; } else if (bd.tool === 'shovel') hop = 6;
      }
      if (this.onGround && speed > 0 && Math.random() < dt * 1.2) {
        const l = Math.hypot(tx, tz) || 1; this.vel.x = tx / l * sp * 1.4; this.vel.z = tz / l * sp * 1.4; this.vel.y = hop * (this.small ? 0.8 : 1);
        this.yaw = Math.atan2(tx, tz);
      }
      if (this.onGround && !(ab && BLOCKS[ab.block] && BLOCKS[ab.block].slip)) { this.vel.x *= Math.pow(0.001, dt); this.vel.z *= Math.pow(0.001, dt); }
      if (target && dist < 1.4 && this.attackCd <= 0 && false) pl.hurt(1);
      this.physics(dt, false);
    } else {
      if (speed > 0) {
        const l = Math.hypot(tx, tz) || 1;
        // 远程生物锁定目标时朝向目标（后退/横移不转身），其余朝移动方向
        if (this.faceTarget === undefined) {
          const desiredYaw = Math.atan2(tx, tz);
          let dyaw = desiredYaw - this.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
          this.yaw += dyaw * Math.min(1, dt * 8);
        }
        const ax = tx / l * speed, az = tz / l * speed;
        const k = this.onGround ? Math.min(1, dt * 10) : Math.min(1, dt * 6);
        this.steering = true;
        this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
        if (this.horizHit && this.onGround) { jump = true; const js = Math.max(speed, 2.2); this.vel.x = tx / l * js; this.vel.z = tz / l * js; }
        // 避免走下悬崖或走进熔岩（非敌对）
        if (!def.hostile && this.onGround) {
          const ax2 = Math.floor(this.pos.x + tx / l * 0.8), az2 = Math.floor(this.pos.z + tz / l * 0.8), ay = Math.floor(this.pos.y);
          const w = this.world;
          if (!BLOCKS[w.getBlock(ax2, ay - 1, az2)].solid && !BLOCKS[w.getBlock(ax2, ay - 2, az2)].solid && !BLOCKS[w.getBlock(ax2, ay - 3, az2)].solid) { this.vel.x = 0; this.vel.z = 0; this.wanderT = 0; }
          if (w.getBlock(ax2, ay, az2) === B.lava || w.getBlock(ax2, ay - 1, az2) === B.lava) { this.vel.x = 0; this.vel.z = 0; this.wanderT = 0; }
        }
      }
      if (jump) this.vel.y = 8.4;
      if (this.faceTarget !== undefined) {
        let d = this.faceTarget - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        this.yaw += d * Math.min(1, dt * 12); this.faceTarget = undefined;
      }
      if (this.inWater) this.swimFloat(this.h * 0.6 + Math.sin(this.age * 2.2 + this.pos.x) * 0.06, dt);
      this.physics(dt);
    }
    // 绵羊吃草长回羊毛
    if (this.type === 'sheep' && this.sheared && Math.random() < dt / 60) {
      const bx = Math.floor(this.pos.x), by = Math.floor(this.pos.y - 0.5), bz = Math.floor(this.pos.z);
      if (this.world.getBlock(bx, by, bz) === B.grass_block) { this.world.setBlock(bx, by, bz, B.dirt); this.setSheared(false); }
    }
    this.animate(dt, Math.hypot(this.vel.x, this.vel.z));
  }
  // 朝 (tx, tz) 方向移动（供自定义 AI 使用），返回是否需要跳
  steer(tx, tz, speed, dt) {
    const l = Math.hypot(tx, tz) || 1;
    if (speed > 0) {
      const desiredYaw = Math.atan2(tx, tz);
      let dyaw = desiredYaw - this.yaw; while (dyaw > Math.PI) dyaw -= Math.PI * 2; while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      this.yaw += dyaw * Math.min(1, dt * 8);
    }
    const ax = tx / l * speed, az = tz / l * speed;
    if (speed > 0) this.steering = true;
    const k = this.onGround ? Math.min(1, dt * 10) : Math.min(1, dt * 6);
    this.vel.x += (ax - this.vel.x) * k; this.vel.z += (az - this.vel.z) * k;
    // 撞墙时起跳；起跳瞬间给足水平速度，否则慢速生物还没前进就落回原地
    if (this.horizHit && this.onGround && speed > 0) { this.vel.y = 8.4; const js = Math.max(speed, 2.2); this.vel.x = tx / l * js; this.vel.z = tz / l * js; }
    if (this.inWater) this.swimFloat(this.h * 0.6 + Math.sin(this.age * 2.2 + this.pos.x) * 0.06, dt);
  }
  distTo(e) { return Math.hypot(e.pos.x - this.pos.x, e.pos.y - this.pos.y, e.pos.z - this.pos.z); }
  setSheared(v) {
    this.sheared = v;
    // 皮肤模型：羊毛是单独一层，直接切换可见性
    if (this.model.P.wool) { this.model.P.wool.forEach(m => { m.visible = !v; }); return; }
    const t = v ? skinTex('sheep_sheared', [210, 190, 170]) : skinTex('sheep_body', [234, 234, 230]);
    this.model.P.body.material.forEach(m => { m.map = t; });
    this.model.P.body.scale.setScalar(v ? 0.85 : 1);
  }
  animate(dt, sp) {
    const P = this.model.P;
    this.walkPhase += dt * sp * 4.5;
    const sw = Math.sin(this.walkPhase) * Math.min(1, sp / 2) * 0.8;
    if (P.legs) P.legs.forEach((l, i) => { if (this.type === 'spider') l.rotation.x = Math.sin(this.walkPhase * 1.5 + i) * 0.3 * Math.min(1, sp); else l.rotation.x = (i % 2 ? sw : -sw) * ((i >> 1) % 2 ? -1 : 1); });
    if (P.arms && !['zombie', 'skeleton'].includes(this.type)) P.arms.forEach((a, i) => { a.rotation.x = i % 2 ? sw : -sw; });
    if (P.arms && this.type === 'skeleton') P.arms.forEach((a, i) => { a.rotation.x = -Math.PI / 2 + (this.aiming ? -0.15 : 0.25); a.rotation.y = this.aiming ? (i ? 0.25 : -0.4) : 0; });
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (this.type === 'creeper') { const s = 1 + Math.min(this.fuse / 1.5, 1) * 0.25 + (this.fuse > 0 ? Math.sin(this.fuse * 30) * 0.03 : 0); this.mesh.scale.set(s, 1 + (s - 1) * 0.5, s); }
    if (this.type === 'sulfur_cube' && P.core) {
      const sq = this.onGround ? 1 : 1.1; P.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    }
    if (this.type === 'creaking' && this.hurtTime > 0) this.mesh.position.x += Math.sin(this.age * 60) * 0.05;
    const b = this.lightAt();
    const flash = this.hurtTime > 0.2 || (this.type === 'creeper' && this.fuse > 0 && Math.floor(this.fuse * 8) % 2);
    for (const m of this.model.mats) { if (flash) m.color.setRGB(Math.min(1, b * 2), b * 0.4, b * 0.4); else if (this.fire > 0) m.color.setRGB(b * 1.5, b * 0.9, b * 0.4); else m.color.setRGB(b, b, b); }
    // 模型自带的额外动画（看向玩家、触手、扇翅、烈焰棒等）
    if (this.model.tick) this.model.tick(dt, this, sp);
  }
  setAbsorbed(name) {
    this.absorbed = name;
    if (this.absorbMesh) { this.model.P.body.remove(this.absorbMesh); this.absorbMesh = null; }
    const it = ITEMS[name];
    if (it && it.block !== undefined) {
      const m = makeBlockMesh(it.block, 0.42 * (this.small ? 0.5 : 1));
      m.position.y = -0.05; this.model.P.body.add(m); this.absorbMesh = m; this.model.mats.push(m.material);
      if (this.model.P.core) this.model.P.core.visible = false;
    }
  }
}

// 小方块网格（掉落物/手持）
const BLOCK_GEO_CACHE = new Map();
function blockGeometry(id) {
  if (BLOCK_GEO_CACHE.has(id)) return BLOCK_GEO_CACHE.get(id);
  const def = BLOCKS[id];
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uv = g.attributes.uv;
  // BoxGeometry 面顺序：+x -x +y -y +z -z，每面 4 顶点 (左上,右上,左下,右下)
  for (let f = 0; f < 6; f++) {
    const t = tileUV(texOf(def, f, 0));
    const coords = [[t.u0, t.v1], [t.u1, t.v1], [t.u0, t.v0], [t.u1, t.v0]];
    for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, coords[k][0], coords[k][1]);
  }
  BLOCK_GEO_CACHE.set(id, g);
  return g;
}
function makeBlockMesh(id, size) {
  const def = BLOCKS[id];
  if (def.shape === 'cross' || def.shape === 'torch') {
    const sp = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.3, size * 1.3), new THREE.MeshBasicMaterial({ map: iconTexture(def.name), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
    return sp;
  }
  const m = new THREE.Mesh(blockGeometry(id), new THREE.MeshBasicMaterial({ map: ATLAS.texture, transparent: def.render !== 'opaque', alphaTest: 0.3, vertexColors: false }));
  m.scale.setScalar(size);
  if (def.tint) m.material.color.setRGB(0.55, 0.8, 0.4);
  return m;
}

class ItemEntity extends Entity {
  constructor(game, x, y, z, name, count) {
    super(game, x, y, z);
    this.name = name; this.count = count; this.w = 0.125; this.h = 0.25; this.pickup = 0.6; this.stepH = 0;
    this.vel.set((Math.random() - 0.5) * 3, 4, (Math.random() - 0.5) * 3);
    const it = ITEMS[name];
    if (it && it.block !== undefined && BLOCKS[it.block].shape !== 'cross' && BLOCKS[it.block].shape !== 'torch') this.mesh = makeBlockMesh(it.block, 0.25);
    else {
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: iconTexture(name), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
      this.flat = true;
    }
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt; this.pickup -= dt;
    if (this.age > 300) { this.dead = true; return; }
    const pl = this.game.player;
    const d = this.pos.distanceTo(new THREE.Vector3(pl.pos.x, pl.pos.y + 0.6, pl.pos.z));
    if (this.pickup <= 0 && pl.alive && d < 1.8) {
      if (d < 0.9) {
        const left = pl.inventory.add(this.name, this.count, this.dmg, this.ench);
        if (left < this.count) { this.game.audio.play('pop'); this.game.ui.refresh(); }
        this.count = left; if (left <= 0) { this.dead = true; return; }
      } else {
        this.vel.x += (pl.pos.x - this.pos.x) * dt * 30; this.vel.z += (pl.pos.z - this.pos.z) * dt * 30; this.vel.y += (pl.pos.y + 0.5 - this.pos.y) * dt * 30;
      }
    }
    if (this.inWater) this.vel.y += 40 * dt;
    this.physics(dt);
    if (this.onGround) { this.vel.x *= Math.pow(0.02, dt); this.vel.z *= Math.pow(0.02, dt); }
    this.mesh.position.set(this.pos.x, this.pos.y + 0.15 + Math.sin(this.age * 2.5) * 0.06, this.pos.z);
    this.mesh.rotation.y = this.age * 1.5;
    const b = this.lightAt(); this.mesh.material.color && (this.mesh.material.color.setScalar ? null : null);
    if (!BLOCKS[ITEMS[this.name] && ITEMS[this.name].block] || !BLOCKS[ITEMS[this.name].block].tint) this.mesh.material.color.setRGB(b, b, b);
  }
}

class FallingBlock extends Entity {
  constructor(game, x, y, z, id) {
    super(game, x + 0.5, y, z + 0.5);
    this.id = id; this.w = 0.49; this.h = 0.98; this.stepH = 0;
    this.mesh = makeBlockMesh(id, 1); game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    this.physics(dt, false);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.49, this.pos.z);
    const b = this.lightAt(); this.mesh.material.color.setRGB(b, b, b);
    if (this.onGround || this.age > 20) {
      this.dead = true;
      const x = Math.floor(this.pos.x), y = Math.floor(this.pos.y + 0.5), z = Math.floor(this.pos.z);
      const cur = this.world.getBlock(x, y, z);
      if (cur === 0 || BLOCKS[cur].replaceable) this.world.setBlock(x, y, z, this.id);
      else this.game.dropItem(this.pos.x, this.pos.y + 0.5, this.pos.z, BLOCKS[this.id].name, 1);
    }
  }
}

class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse) {
    super(game, x + 0.5, y, z + 0.5);
    this.w = 0.49; this.h = 0.98; this.fuse = fuse || 4; this.stepH = 0;
    this.vel.set((Math.random() - 0.5) * 1, 4, (Math.random() - 0.5) * 1);
    this.mesh = makeBlockMesh(B.tnt, 1); game.scene.add(this.mesh);
    game.audio.play('fuse', this.pos);
  }
  update(dt) {
    this.fuse -= dt;
    this.physics(dt);
    this.mesh.position.set(this.pos.x, this.pos.y + 0.49, this.pos.z);
    const flash = Math.floor(this.fuse * 5) % 2 === 0;
    const b = this.lightAt();
    this.mesh.material.color.setRGB(flash ? 1.6 : b, flash ? 1.6 : b, flash ? 1.6 : b);
    this.mesh.scale.setScalar(1 + (this.fuse < 0.5 ? (0.5 - this.fuse) * 0.3 : 0));
    if (this.fuse <= 0) { this.dead = true; this.game.explode(this.pos.x, this.pos.y + 0.5, this.pos.z, 4); }
  }
}

// 原版箭矢：两片十字交叉的面片，贴图取实体贴图左上角的侧视图（左尾羽、右箭头）
let ARROW_GEO = null;
function makeArrowMesh() {
  const tex = typeof packTexture === 'function' ? packTexture('mcl_bows_arrow') : null;
  if (!tex) return new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.5), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }));
  if (!ARROW_GEO) {
    const plane = () => {
      const g = new THREE.PlaneGeometry(0.5, 5 / 32);
      const uv = g.attributes.uv, v0 = 1 - 10 / 64, v1 = 1;
      uv.setXY(0, 0, v1); uv.setXY(1, 0.5, v1); uv.setXY(2, 0, v0); uv.setXY(3, 0.5, v0);
      g.rotateY(-Math.PI / 2);
      return g;
    };
    const a = plane(), b = plane(); b.rotateZ(Math.PI / 2);
    ARROW_GEO = [a, b];
  }
  const grp = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
  for (const g of ARROW_GEO) grp.add(new THREE.Mesh(g, mat));
  grp.material = mat;
  return grp;
}

class Arrow extends Entity {
  constructor(game, x, y, z, vx, vy, vz, owner, dmg) {
    super(game, x, y, z);
    this.vel.set(vx, vy, vz); this.owner = owner; this.w = 0.1; this.h = 0.1; this.dmg = dmg || 3; this.stuck = false; this.stepH = 0;
    this.mesh = makeArrowMesh();
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 30) { this.dead = true; return; }
    if (!this.stuck) {
      this.vel.y -= 20 * dt;
      const steps = 4;
      for (let s = 0; s < steps; s++) {
        const nx = this.pos.x + this.vel.x * dt / steps, ny = this.pos.y + this.vel.y * dt / steps, nz = this.pos.z + this.vel.z * dt / steps;
        const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id && BLOCKS[id].solid) {
          this.stuck = true; this.game.audio.play('arrow_hit', this.pos);
          // 插进方块后按箭尾一侧（空气格）的亮度着色，避免发黑
          const l = this.vel.length() || 1, bx = this.pos.x - this.vel.x / l * 0.4, by = this.pos.y - this.vel.y / l * 0.4, bz = this.pos.z - this.vel.z / l * 0.4;
          const w = this.world, sl = Math.max(0, w.skyLight(Math.floor(bx), Math.floor(by), Math.floor(bz)) - this.game.skyDarken), bl = w.blockLight(Math.floor(bx), Math.floor(by), Math.floor(bz));
          if (this.mesh.material) this.mesh.material.color.setScalar(Math.max(Math.pow(0.82, 15 - sl), Math.pow(0.82, 15 - bl), 0.08));
          break;
        }
        this.pos.set(nx, ny, nz);
        // 命中实体
        const targets = this.owner && this.owner.isPlayer ? this.game.mobs : [this.game.player];
        for (const t of targets) {
          if (t === this.owner || t.dead || (t.isPlayer && !t.alive)) continue;
          if (Math.abs(t.pos.x - nx) < t.w + 0.1 && Math.abs(t.pos.z - nz) < t.w + 0.1 && ny > t.pos.y && ny < t.pos.y + t.h) {
            const sp = this.vel.length();
            if (t.hurt(Math.ceil(this.dmg * sp / 25), 'arrow', this.owner)) {
              if (this.punch) { const l = Math.hypot(this.vel.x, this.vel.z) || 1; t.vel.x += this.vel.x / l * 6 * this.punch; t.vel.z += this.vel.z / l * 6 * this.punch; }
              if (this.flame) t.fire = 5;
            }
            this.dead = true; return;
          }
        }
      }
      this.mesh.position.copy(this.pos);
      this.mesh.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
      if (this.mesh.material) this.mesh.material.color.setScalar(this.lightAt());
    } else if (this.owner && this.owner.isPlayer) {
      const pl = this.game.player;
      if (pl.pos.distanceTo(this.pos) < 1.5 && this.age > 0.5) { if (pl.mode === 'survival' && pl.inventory.add('arrow', 1) === 0) this.game.audio.play('pop'); this.dead = true; }
    }
  }
}

// ---------------- 粒子 ----------------
// 原版式粒子：贴图面片（particle 图集或方块图集）、逐帧动画、碰撞落地、自发光粒子不受环境光影响
// 精灵组：名字 -> 原版 particle/ 下的贴图序列；anim=按寿命播放（smoke/poof 从 generic_7 到 generic_0）
const PT_SETS = {
  generic: { tex: ['generic_0', 'generic_1', 'generic_2', 'generic_3', 'generic_4', 'generic_5', 'generic_6', 'generic_7'] },
  poof: { tex: ['generic_7', 'generic_6', 'generic_5', 'generic_4', 'generic_3', 'generic_2', 'generic_1', 'generic_0'], anim: true },
  smoke: { tex: ['generic_7', 'generic_6', 'generic_5', 'generic_4', 'generic_3', 'generic_2', 'generic_1', 'generic_0'], anim: true },
  portal: { tex: ['generic_0', 'generic_1', 'generic_2', 'generic_3', 'generic_4', 'generic_5', 'generic_6', 'generic_7'] },
  flame: { tex: ['flame'], glow: true }, soul_flame: { tex: ['soul_fire_flame'], glow: true },
  lava: { tex: ['lava'], glow: true }, heart: { tex: ['heart'] }, angry: { tex: ['angry'] }, happy: { tex: ['glint'] },
  crit: { tex: ['critical_hit'] }, magic_crit: { tex: ['enchanted_hit'] }, note: { tex: ['note'] }, damage: { tex: ['damage'] },
  splash: { tex: ['splash_0', 'splash_1', 'splash_2', 'splash_3'] }, bubble: { tex: ['bubble'] },
  explosion: { tex: Array.from({ length: 16 }, (_, i) => 'explosion_' + i), anim: true, glow: true },
  big_smoke: { tex: Array.from({ length: 12 }, (_, i) => 'big_smoke_' + i), anim: true },
  effect: { tex: ['effect_7', 'effect_6', 'effect_5', 'effect_4', 'effect_3', 'effect_2', 'effect_1', 'effect_0'], anim: true },
  end_rod: { tex: ['glitter_7', 'glitter_6', 'glitter_5', 'glitter_4', 'glitter_3', 'glitter_2', 'glitter_1', 'glitter_0'], anim: true, glow: true },
  drip: { tex: ['drip_hang'] }, cherry: { tex: Array.from({ length: 12 }, (_, i) => 'cherry_' + i) },
  enchant: { tex: 'abcdefghijklmnopqrstuvwxyz'.split('').map(c => 'sga_' + c), glow: true },
};
class ParticleLayer {
  constructor(scene, max, tex) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.rect = new Float32Array(max * 4); this.glow = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.max0 = new Float32Array(max);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max); this.set = new Array(max); this.fade = new Uint8Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aRect', new THREE.BufferAttribute(this.rect, 4));
    g.setAttribute('aGlow', new THREE.BufferAttribute(this.glow, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uBright: { value: 1 }, uScale: { value: 500 } },
      vertexShader: 'uniform float uScale; attribute vec4 aColor; attribute float aSize; attribute vec4 aRect; attribute float aGlow; varying vec4 vColor; varying vec4 vRect; varying float vGlow;' +
        'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uScale / max(0.05, -mv.z); vColor = aColor; vRect = aRect; vGlow = aGlow; }',
      fragmentShader: 'uniform sampler2D map; uniform float uBright; varying vec4 vColor; varying vec4 vRect; varying float vGlow;' +
        'void main(){ vec2 uv = vRect.xy + vec2(gl_PointCoord.x, 1.0 - gl_PointCoord.y) * vRect.zw; vec4 t = texture2D(map, uv); float a = t.a * vColor.a; if (a < 0.1) discard; gl_FragColor = vec4(t.rgb * vColor.rgb * mix(uBright, 1.0, vGlow), a); }',
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 4;
    scene.add(this.points);
  }
  alloc() {
    if (this.n >= this.max) return -1;
    if (PARTICLE_LEVEL && Math.random() < (PARTICLE_LEVEL === 1 ? 0.5 : 0.85)) return -1;
    return this.n++;
  }
  copy(i, j) {
    const c3 = (a) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    const c4 = (a) => { for (let k = 0; k < 4; k++) a[i * 4 + k] = a[j * 4 + k]; };
    c3(this.pos); c3(this.vel); c4(this.col); c4(this.rect);
    this.size[i] = this.size[j]; this.glow[i] = this.glow[j]; this.life[i] = this.life[j]; this.max0[i] = this.max0[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.set[i] = this.set[j]; this.fade[i] = this.fade[j];
  }
  update(dt, world, rectOf) {
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { const j = --this.n; if (i !== j) this.copy(i, j); i--; continue; }
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      let nx = this.pos[k] + this.vel[k] * dt, ny = this.pos[k + 1] + this.vel[k + 1] * dt, nz = this.pos[k + 2] + this.vel[k + 2] * dt;
      // 与原版一样会落在方块上（只检查脚下）
      if (this.vel[k + 1] < 0 && world) {
        const id = world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        if (id && BLOCKS[id].solid) { ny = Math.floor(ny) + 1.001; this.vel[k + 1] = 0; this.vel[k] *= 0.7; this.vel[k + 2] *= 0.7; }
      }
      this.pos[k] = nx; this.pos[k + 1] = ny; this.pos[k + 2] = nz;
      const s = this.set[i];
      if (s && s.anim && rectOf) {
        const t = 1 - this.life[i] / this.max0[i], f = Math.min(s.tex.length - 1, Math.floor(t * s.tex.length));
        const r = rectOf(s.tex[f]); if (r) this.rect.set(r, i * 4);
      }
      if (this.fade[i]) this.col[i * 4 + 3] = Math.min(1, this.life[i] / this.max0[i] * 2);
    }
    const g = this.geo; g.setDrawRange(0, this.n);
    for (const a of ['position', 'aColor', 'aSize', 'aRect', 'aGlow']) g.attributes[a].needsUpdate = true;
  }
}
class Particles {
  constructor(scene) {
    this.scene = scene; this.rects = {};
    this.sprites = new ParticleLayer(scene, 3000, this.buildAtlas(false));
    this.blocks = new ParticleLayer(scene, 2000, ATLAS.texture);
    this.real = false;
  }
  // 把原版 particle/ 贴图拼成一张图集；素材缺失时用程序方块占位
  buildAtlas(real) {
    const names = new Set(); for (const k in PT_SETS) for (const t of PT_SETS[k].tex) names.add(t);
    const list = [...names], C = 32, cols = 16, rows = Math.ceil(list.length / cols);
    const cv = document.createElement('canvas'); cv.width = C * cols; cv.height = C * rows;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    list.forEach((n, i) => {
      const x = (i % cols) * C, y = Math.floor(i / cols) * C;
      const src = real && PACK_IMG['vp_' + n] ? packCanvas('vp_' + n) : null;
      let w = 8, h = 8;
      if (src) { w = src.width; h = Math.min(src.height, src.width); ctx.drawImage(src, 0, 0, w, h, x, y, w, h); }
      else {
        // 占位：越往后的序号越小的白色方块（generic_0 最大）
        const m = /_(\d+)$/.exec(n), s = m ? Math.max(2, 8 - +m[1]) : 6;
        ctx.fillStyle = '#fff'; ctx.fillRect(x + (8 - s) / 2, y + (8 - s) / 2, s, s);
      }
      this.rects[n] = [x / cv.width, 1 - (y + h) / cv.height, w / cv.width, h / cv.height];
    });
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    return t;
  }
  rectOf(n) { return this.rects[n]; }
  // 通用接口：type 见 PT_SETS；o = { color:[r,g,b], alpha, life(秒), size(格), grav, drag, glow, fade }
  spawn(type, x, y, z, vx, vy, vz, o) {
    o = o || {};
    const s = PT_SETS[type] || PT_SETS.generic, L = this.sprites, i = L.alloc(); if (i < 0) return;
    L.pos[i * 3] = x; L.pos[i * 3 + 1] = y; L.pos[i * 3 + 2] = z;
    L.vel[i * 3] = vx || 0; L.vel[i * 3 + 1] = vy || 0; L.vel[i * 3 + 2] = vz || 0;
    const c = o.color || [255, 255, 255];
    L.col.set([c[0] / 255, c[1] / 255, c[2] / 255, o.alpha === undefined ? 1 : o.alpha], i * 4);
    L.size[i] = o.size || (0.2 + Math.random() * 0.2);
    L.glow[i] = (o.glow !== undefined ? o.glow : s.glow) ? 1 : 0;
    L.life[i] = L.max0[i] = o.life || 1; L.grav[i] = o.grav === undefined ? 0 : o.grav; L.drag[i] = o.drag === undefined ? 1.2 : o.drag;
    L.set[i] = s; L.fade[i] = o.fade ? 1 : 0;
    const tex = s.anim ? s.tex[0] : s.tex[Math.floor(Math.random() * s.tex.length)];
    L.rect.set(this.rects[tex] || [0, 0, 0, 0], i * 4);
  }
  // 兼容旧接口：有颜色的小粒子（原版 generic 精灵染色）
  add(x, y, z, vx, vy, vz, c, life, grav) {
    this.spawn('generic', x, y, z, vx, vy, vz, { color: c, life, grav: grav === undefined ? 12 : grav, size: 0.12 + Math.random() * 0.1, drag: 0.3 });
  }
  burst(x, y, z, c, n, spread) {
    for (let i = 0; i < n; i++) this.add(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * spread * 2, Math.random() * spread * 2, (Math.random() - 0.5) * spread * 2, c, 0.4 + Math.random() * 0.6);
  }
  // 方块碎屑：从方块贴图上随机截 4x4 像素（原版 TerrainParticle）
  blockCrumb(id, x, y, z, vx, vy, vz, face) {
    const def = BLOCKS[id]; if (!def || !def.tex && !def.texFn) return;
    const L = this.blocks, i = L.alloc(); if (i < 0) return;
    const t = texOf(def, face === undefined ? 4 : face, 0);
    const px = Math.floor(Math.random() * 12), py = Math.floor(Math.random() * 12);
    const uv = tileUV(t, px, py, px + 4, py + 4);
    L.rect.set([uv.u0, Math.min(uv.v0, uv.v1), uv.u1 - uv.u0, Math.abs(uv.v1 - uv.v0)], i * 4);
    L.pos[i * 3] = x; L.pos[i * 3 + 1] = y; L.pos[i * 3 + 2] = z;
    L.vel[i * 3] = vx; L.vel[i * 3 + 1] = vy; L.vel[i * 3 + 2] = vz;
    const tint = def.tint ? [0.55, 0.8, 0.4] : [1, 1, 1], sh = 0.6 + Math.random() * 0.4;
    L.col.set([tint[0] * sh, tint[1] * sh, tint[2] * sh, 1], i * 4);
    L.size[i] = 0.1 + Math.random() * 0.1; L.glow[i] = def.emit > 10 ? 1 : 0;
    L.life[i] = L.max0[i] = 0.4 + Math.random() * 0.8; L.grav[i] = 16; L.drag[i] = 0.4; L.set[i] = null; L.fade[i] = 0;
  }
  // 原版：方块破坏时 4x4x4 个碎屑
  blockBreak(x, y, z, id) {
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
      if (Math.random() < 0.45) continue;
      const ox = (a + 0.5) / 4, oy = (b + 0.5) / 4, oz = (c + 0.5) / 4;
      this.blockCrumb(id, x + ox, y + oy, z + oz, (ox - 0.5) * 3 + (Math.random() - 0.5), (oy - 0.5) * 3 + Math.random() * 2, (oz - 0.5) * 3 + (Math.random() - 0.5));
    }
  }
  // 挖掘中：被敲击的那个面上冒出碎屑
  blockHit(x, y, z, id, face) {
    const n = DIRS[face] || [0, 1, 0];
    const px = x + (n[0] ? (n[0] > 0 ? 1.05 : -0.05) : Math.random()), py = y + (n[1] ? (n[1] > 0 ? 1.05 : -0.05) : Math.random()), pz = z + (n[2] ? (n[2] > 0 ? 1.05 : -0.05) : Math.random());
    this.blockCrumb(id, px, py, pz, n[0] * 0.8 + (Math.random() - 0.5) * 0.6, n[1] * 0.8 + Math.random() * 0.8, n[2] * 0.8 + (Math.random() - 0.5) * 0.6, face);
  }
  update(dt, brightness) {
    if (!this.real && PACK_READY && PACK_IMG.vp_generic_0) { this.real = true; this.sprites.mat.uniforms.map.value = this.buildAtlas(true); }
    const g = typeof game !== 'undefined' ? game : null;
    const scale = (window.innerHeight * Math.min(window.devicePixelRatio, 2)) / (2 * Math.tan(((g && g.camera.fov) || 70) * Math.PI / 360));
    const w = g && g.world;
    this.sprites.update(dt, w, n => this.rects[n]); this.blocks.update(dt, w, null);
    for (const L of [this.sprites, this.blocks]) { L.mat.uniforms.uBright.value = brightness; L.mat.uniforms.uScale.value = scale; }
  }
}
