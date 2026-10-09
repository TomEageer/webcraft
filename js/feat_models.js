'use strict';
// ---------- 生物模型：按 Java 版实体模型尺寸 + 素材包皮肤（box UV） ----------
// 坐标约定：MC 模型空间 y 向下、脸朝 -Z、地面在 y=24；本作 y 向上、脸朝 +Z。
// 两者相差绕 X 轴 180°：ours = (x, 24 - y, -z)，旋转 (rx, -ry, -rz)，欧拉顺序 ZYX。
// 本文件在 main.js 之后加载，覆盖其他模块注册的占位模型。

const MC_GEO = new Map();
const MC_TEX = new Map();

// 标准 box UV 的六个面矩形（像素），面顺序同 BoxGeometry：+x -x +y -y +z -z
// 模型右侧（-X）在 (u, v+d)，正面在 (u+d, v+d)，左侧在 (u+d+w, v+d)，背面在 (u+2d+w, v+d)
function mcFaceRects(u, v, w, h, d) {
  return [
    [u + d + w, v + d, d, h],
    [u, v + d, d, h],
    [u + d, v, w, d],
    [u + d + w, v, w, d],
    [u + d, v + d, w, h],
    [u + d + d + w, v + d, w, h],
  ];
}

// faces：可选 {面号: [x,y,w,h]} 覆盖某个面的贴图矩形（非标准布局用，按“从外看、正立”的方向）
function mcBoxGeo(tw, th, u, v, w, h, d, g, mirror, faces) {
  const key = [tw, th, u, v, w, h, d, g || 0, mirror ? 1 : 0, faces ? JSON.stringify(faces) : ''].join(',');
  let geo = MC_GEO.get(key);
  if (geo) return geo;
  const gi = g || 0;
  geo = new THREE.BoxGeometry(Math.max(w + gi * 2, 0) / 16, Math.max(h + gi * 2, 0) / 16, Math.max(d + gi * 2, 0) / 16);
  const r = mcFaceRects(u, v, w, h, d);
  if (mirror) { const t = r[0]; r[0] = r[1]; r[1] = t; }
  const uv = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const custom = faces && faces[f];
    const [x, y, fw, fh] = custom || r[f];
    let u0 = x / tw, u1 = (x + fw) / tw;
    let vt = 1 - y / th, vb = 1 - (y + fh) / th;
    if (mirror && !custom) { const t = u0; u0 = u1; u1 = t; }
    // 底面：MC 贴图正面朝下边，BoxGeometry 默认相反
    if (f === 3 && !custom) { const t = vt; vt = vb; vb = t; }
    uv.setXY(f * 4, u0, vt); uv.setXY(f * 4 + 1, u1, vt); uv.setXY(f * 4 + 2, u0, vb); uv.setXY(f * 4 + 3, u1, vb);
  }
  MC_GEO.set(key, geo);
  return geo;
}

function mcCanvasTex(cv) {
  const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
// 素材包贴图；缺失时退回灰色占位，保证模型仍能显示
function mcTex(name) {
  const t = typeof packTexture === 'function' ? packTexture(name) : null;
  if (t) return t;
  if (!MC_TEX.has('_missing')) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 4;
    const c = cv.getContext('2d'); c.fillStyle = '#8a8a8a'; c.fillRect(0, 0, 4, 4); c.fillStyle = '#6a6a6a'; c.fillRect(0, 0, 2, 2); c.fillRect(2, 2, 2, 2);
    MC_TEX.set('_missing', mcCanvasTex(cv));
  }
  return MC_TEX.get('_missing');
}
// 染色后的素材贴图（羊毛等），按颜色缓存
function mcTintTex(name, rgb) {
  const key = name + '#' + rgb.join(',');
  if (MC_TEX.has(key)) return MC_TEX.get(key);
  const src = typeof packCanvas === 'function' ? packCanvas(name) : null;
  if (!src) return mcTex(name);
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
  const c = cv.getContext('2d'); c.drawImage(src, 0, 0);
  const im = c.getImageData(0, 0, cv.width, cv.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = d[i] * rgb[0] / 255; d[i + 1] = d[i + 1] * rgb[1] / 255; d[i + 2] = d[i + 2] * rgb[2] / 255; }
  c.putImageData(im, 0, 0);
  const t = mcCanvasTex(cv); MC_TEX.set(key, t);
  return t;
}

class MCModel {
  constructor(tw, th, tex, small) {
    this.tw = tw; this.th = th;
    this.root = new THREE.Group();
    this.base = new THREE.Group(); this.root.add(this.base);
    this.mats = []; this.P = { legs: [], arms: [] }; this.meshes = [];
    this.mat = this.material(tex);
    this.small = !!small;
  }
  // o.glow：不受光照（不进 mats）；o.over：叠加层（多边形偏移防 z 冲突）；o.blend：半透明
  material(tex, o) {
    o = o || {};
    const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: o.blend ? 0.02 : 0.5, transparent: !!o.blend, depthWrite: !o.blend });
    if (o.over) { m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -4; }
    if (!o.glow) this.mats.push(m);
    return m;
  }
  // cubes: [u, v, x, y, z, w, h, d, {g 膨胀, m 镜像, mat, faces, tw, th}]
  part(parent, pivot, rot, cubes, mat) {
    const gp = new THREE.Group();
    gp.rotation.order = 'ZYX';
    const p = pivot || [0, 0, 0];
    gp.position.set(p[0] / 16, ((parent ? 0 : 24) - p[1]) / 16, -p[2] / 16);
    if (rot) mcRot(gp, rot[0], rot[1], rot[2]);
    for (const c of cubes || []) this.cube(gp, c, mat);
    (parent || this.base).add(gp);
    return gp;
  }
  cube(gp, c, mat) {
    const [u, v, x, y, z, w, h, d] = c, o = c[8] || {};
    const geo = mcBoxGeo(o.tw || this.tw, o.th || this.th, u, v, w, h, d, o.g, o.m, o.faces);
    const mesh = new THREE.Mesh(geo, o.mat || mat || this.mat);
    mesh.position.set((x + w / 2) / 16, -(y + h / 2) / 16, -(z + d / 2) / 16);
    gp.add(mesh); this.meshes.push(mesh);
    return mesh;
  }
  // 给一组网格叠一层同几何体的贴图（职业服装、发光眼睛、鞍）
  overlay(meshes, mat) {
    const out = [];
    for (const m of meshes) { const o = new THREE.Mesh(m.geometry, mat); m.add(o); out.push(o); }
    return out;
  }
  done(tick, extra) {
    if (this.small) this.root.scale.setScalar(0.5);
    const r = { root: this.root, mats: this.mats, P: this.P };
    if (tick) r.tick = tick;
    if (extra) Object.assign(r, extra);
    return r;
  }
}

// 以 MC 角度设置旋转（自动换算方向）
function mcRot(g, x, y, z) { g.rotation.set(x || 0, -(y || 0), -(z || 0), 'ZYX'); }
function mcWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

// 头部看向附近的玩家
function mcLook(mob, head, dt, range, maxYaw, baseX) {
  const pl = mob.game && mob.game.player;
  let ty = 0, tp = 0;
  if (pl && pl.alive !== false) {
    const dx = pl.pos.x - mob.pos.x, dz = pl.pos.z - mob.pos.z, d = Math.hypot(dx, dz);
    if (d < (range || 8) && d > 0.01) {
      ty = mcWrap(Math.atan2(dx, dz) - mob.yaw);
      const lim = maxYaw || 1.2;
      if (Math.abs(ty) > lim * 1.6) ty = 0; else ty = Math.max(-lim, Math.min(lim, ty));
      tp = Math.max(-0.7, Math.min(0.7, Math.atan2(pl.pos.y + 1.62 - (mob.pos.y + mob.h * 0.85), d)));
    }
  }
  const k = Math.min(1, dt * 6);
  head.rotation.y += (ty - head.rotation.y) * k;
  head.rotation.x += ((baseX || 0) - tp - head.rotation.x) * k;
}
function mcBaby(P, mob, s) { if (P.head) P.head.scale.setScalar(mob.small ? (s || 1.5) : 1); }
// 受伤闪红时保留调色，否则恢复全亮（自发光生物）
function mcFullbright(mats, mob) { if (!(mob.hurtTime > 0.2)) for (const m of mats) m.color.setRGB(1, 1, 1); }

// ---------------- 程序生成的皮肤（素材包缺失的生物） ----------------
function mcPaintBox(ctx, u, v, w, h, d, pick) {
  for (const [x, y, fw, fh] of mcFaceRects(u, v, w, h, d))
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) { ctx.fillStyle = pick(i, j); ctx.fillRect(x + i, y + j, 1, 1); }
}
function mcPalette(cols, r) { return () => { const c = cols[Math.floor(r() * cols.length)]; return `rgb(${c[0]},${c[1]},${c[2]})`; }; }

function creeperTex() {
  if (MC_TEX.has('creeper')) return MC_TEX.get('creeper');
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const ctx = cv.getContext('2d'), r = mulberry32(5150);
  const pick = mcPalette([[94, 196, 84], [80, 176, 70], [110, 212, 98], [60, 150, 54], [70, 160, 62], [150, 222, 140], [94, 196, 84]], r);
  mcPaintBox(ctx, 0, 0, 8, 8, 8, pick);
  mcPaintBox(ctx, 16, 16, 8, 12, 4, pick);
  mcPaintBox(ctx, 0, 16, 4, 6, 4, pick);
  // 脸：正面 (8,8)
  ctx.fillStyle = '#0b0b0b';
  for (const [x, y, w, h] of [[1, 2, 2, 2], [5, 2, 2, 2], [3, 4, 2, 3], [2, 5, 1, 3], [5, 5, 1, 3]]) ctx.fillRect(8 + x, 8 + y, w, h);
  ctx.fillStyle = '#1e3a1a'; ctx.fillRect(9, 10, 1, 1); ctx.fillRect(14, 10, 1, 1);
  const t = mcCanvasTex(cv); MC_TEX.set('creeper', t);
  return t;
}
function blazeTex() {
  if (MC_TEX.has('blaze')) return MC_TEX.get('blaze');
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 32;
  const ctx = cv.getContext('2d'), r = mulberry32(7331);
  const px = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  const rgb = (c, f) => `rgb(${Math.min(255, c[0] * f) | 0},${Math.min(255, c[1] * f) | 0},${Math.min(255, c[2] * f) | 0})`;
  // 头部六个面：上亮下暗的黄橙渐变 + 成块的橙色斑纹 + 少量高光
  const YEL = [252, 206, 58], ORA = [232, 136, 24], HI = [255, 238, 140];
  const face = (u, v, w, h, topBright) => {
    const blot = [];
    for (let i = 0; i < Math.max(2, (w * h) / 12); i++) blot.push([r() * w, r() * h, 0.8 + r() * 1.3]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let c = YEL, f = topBright ? 1.08 - y / h * 0.28 : 0.92;
      for (const [bx, by, br] of blot) if (Math.hypot(x + 0.5 - bx, y + 0.5 - by) < br) { c = ORA; break; }
      if (r() < 0.06) c = HI;
      px(u + x, v + y, rgb(c, f * (0.94 + r() * 0.1)));
    }
  };
  // 盒子 UV（MC 规则）：上 (8,0) 下 (16,0)，侧面一排从 (0,8)：右 前 左 后
  face(8, 0, 8, 8, false); face(16, 0, 8, 8, false);
  face(0, 8, 8, 8, true); face(8, 8, 8, 8, true); face(16, 8, 8, 8, true); face(24, 8, 8, 8, true);
  // 正脸（8,8 起的 8x8）：深色眉带、黑眼与亮瞳、深色嘴
  const fx = 8, fy = 8;
  for (let x = 0; x < 8; x++) px(fx + x, fy + 2, x === 3 || x === 4 ? rgb(ORA, 0.8) : '#5a2c06');
  for (const ex of [1, 5]) { px(fx + ex, fy + 3, '#120800'); px(fx + ex + 1, fy + 3, '#120800'); px(fx + ex, fy + 4, '#2a1404'); px(fx + ex + 1, fy + 4, '#2a1404'); }
  px(fx + 2, fy + 3, '#ffd84a'); px(fx + 5, fy + 3, '#ffd84a');
  for (let x = 2; x < 6; x++) px(fx + x, fy + 6, '#4a2206');
  px(fx + 1, fy + 6, rgb(ORA, 0.7)); px(fx + 6, fy + 6, rgb(ORA, 0.7));
  // 烈焰棒（0,16 起，2x8x2）：亮黄底 + 橙褐分段，顶端更亮
  const rodPx = (u, v, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const band = y % 3 === 2;
      px(u + x, v + y, band ? (r() < 0.5 ? '#b0600e' : '#c8741a') : (y < 2 ? '#fff0a0' : (r() < 0.5 ? '#ffd23c' : '#f6b42a')));
    }
  };
  rodPx(2, 16, 2, 2); rodPx(4, 16, 2, 2);
  for (let i = 0; i < 4; i++) rodPx(i * 2, 18, 2, 8);
  const t = mcCanvasTex(cv); MC_TEX.set('blaze', t);
  return t;
}

// ---------------- 人形 ----------------
// 标准 Java 人形：头 (0,0)、帽层 (32,0)、身体 (16,16)、右臂 (40,16)、右腿 (0,16)，左侧镜像（旧 64x32 布局）
// P.legs = [右腿, 左腿]，P.arms = [左臂, 右臂]：Mob.animate 的摆动相位因此是对侧手脚同步
function mcHumanoid(tex, tw, th, small, o) {
  o = o || {};
  const M = new MCModel(tw, th, tex, small);
  const limb = o.limb || 4, slim = limb === 2;
  M.P.head = M.part(null, [0, 0, 0], null, [[0, 0, -4, -8, -4, 8, 8, 8], [32, 0, -4, -8, -4, 8, 8, 8, { g: 0.5 }]]);
  M.P.body = M.part(null, [0, 0, 0], null, [[16, 16, -4, 0, -2, 8, 12, 4]].concat(o.layer2 ? [[16, 32, -4, 0, -2, 8, 12, 4, { g: 0.25 }]] : []));
  const ar = slim ? [-1, -2, -1, 2, 12, 2] : [-3, -2, -2, 4, 12, 4], al = slim ? [-1, -2, -1, 2, 12, 2] : [-1, -2, -2, 4, 12, 4];
  const lg = slim ? [-1, 0, -1, 2, 12, 2] : [-2, 0, -2, 4, 12, 4];
  const lx = slim ? 2 : 1.9;
  let rArm, lArm, rLeg, lLeg;
  if (o.layer2) {
    rArm = M.part(null, [-5, 2, 0], null, [[40, 16, ...ar], [40, 32, ...ar, { g: 0.25 }]]);
    lArm = M.part(null, [5, 2, 0], null, [[32, 48, ...al], [48, 48, ...al, { g: 0.25 }]]);
    rLeg = M.part(null, [-lx, 12, 0], null, [[0, 16, ...lg], [0, 32, ...lg, { g: 0.25 }]]);
    lLeg = M.part(null, [lx, 12, 0], null, [[16, 48, ...lg], [0, 48, ...lg, { g: 0.25 }]]);
  } else {
    rArm = M.part(null, [-5, 2, 0], null, [[40, 16, ...ar]]);
    lArm = M.part(null, [5, 2, 0], null, [[40, 16, ...(slim ? al : [-1, -2, -2, 4, 12, 4]), { m: true }]]);
    rLeg = M.part(null, [-lx, 12, 0], null, [[0, 16, ...lg]]);
    lLeg = M.part(null, [lx, 12, 0], null, [[0, 16, ...lg, { m: true }]]);
  }
  M.P.legs = [rLeg, lLeg]; M.P.arms = [lArm, rArm];
  M.armL = lArm; M.armR = rArm;
  return M;
}

MODELS.steve = (small) => {
  const M = mcHumanoid(mcTex('character'), 64, 32, small);
  return M.done();
};

// 僵尸类：双臂前伸，走路时微微晃动
function zombieTick(M, extraTick) {
  const { armL, armR, P } = M;
  P.arms = [];
  return (dt, mob, sp) => {
    const t = mob.age * 2, bob = Math.sin(t) * 0.05;
    const atk = mob.attackCd > 0.6 ? Math.sin((1 - mob.attackCd) * Math.PI * 2.5) * 0.4 : 0;
    mcRot(armR, -Math.PI / 2 + bob - atk, -0.1, 0.05 + Math.cos(t) * 0.05);
    mcRot(armL, -Math.PI / 2 - bob - atk, 0.1, -0.05 - Math.cos(t) * 0.05);
    mcLook(mob, P.head, dt, 16, 1.2);
    mcBaby(P, mob);
    if (extraTick) extraTick(dt, mob, sp);
  };
}
MODELS.zombie = (small) => {
  const M = mcHumanoid(mcTex('mobs_mc_zombie'), 64, 64, small);
  return M.done(zombieTick(M));
};

// 骷髅：瞄准时双臂平举，否则随步伐摆动（Mob.animate 对 skeleton 不摆臂，这里补上）
function skeletonModel(tex, small, scale) {
  const M = mcHumanoid(mcTex(tex), 64, 32, small, { limb: 2 });
  if (scale) { M.base.scale.setScalar(scale); }
  const { armL, armR, P } = M;
  return M.done((dt, mob) => {
    const pl = mob.game.player;
    const aim = mob.def && mob.def.hostile && pl && pl.alive !== false && pl.mode === 'survival' && mob.distTo(pl) < 15;
    mcLook(mob, P.head, dt, aim ? 16 : 8, 1.2);
    if (aim && mob.def.ranged) {
      const hy = -P.head.rotation.y, hx = P.head.rotation.x;
      mcRot(armR, -Math.PI / 2 + hx, -0.1 + hy, 0);
      mcRot(armL, -Math.PI / 2 + hx, 0.1 + hy + 0.4, 0);
    } else if (aim) {
      const atk = mob.attackCd > 0.6 ? Math.sin((1 - mob.attackCd) * Math.PI * 2.5) : 0;
      mcRot(armR, P.legs[0].rotation.x - atk * 1.6, 0, 0);
      mcRot(armL, P.legs[1].rotation.x * -1, 0, 0);
    } else {
      mcRot(armL, P.legs[0].rotation.x, 0, 0);
      mcRot(armR, P.legs[1].rotation.x, 0, 0);
    }
    mcBaby(P, mob);
  });
}
MODELS.skeleton = (small) => skeletonModel('mobs_mc_skeleton', small);
MODELS.wither_skeleton = (small) => skeletonModel('mobs_mc_wither_skeleton', small, 1.2);

// 猪灵 / 僵尸猪灵（64x64 双层皮肤）
function piglinModel(tex, small, zombified) {
  const M = new MCModel(64, 64, mcTex(tex), small);
  const P = M.P;
  P.head = M.part(null, [0, 0, 0], null, [
    [0, 0, -5, -8, -4, 10, 8, 8], [31, 1, -2, -4, -5, 4, 4, 1], [2, 4, 2, -2, -5, 1, 2, 1], [2, 0, -3, -2, -5, 1, 2, 1],
  ]);
  const earL = M.part(P.head, [4.5, -6, 0], [0, 0, -Math.PI / 6], [[51, 6, 0, 0, -2, 1, 5, 4]]);
  const earR = M.part(P.head, [-4.5, -6, 0], [0, 0, Math.PI / 6], [[39, 6, -1, 0, -2, 1, 5, 4]]);
  P.body = M.part(null, [0, 0, 0], null, [[16, 16, -4, 0, -2, 8, 12, 4], [16, 32, -4, 0, -2, 8, 12, 4, { g: 0.25 }]]);
  const rArm = M.part(null, [-5, 2, 0], null, [[40, 16, -3, -2, -2, 4, 12, 4], [40, 32, -3, -2, -2, 4, 12, 4, { g: 0.25 }]]);
  const lArm = M.part(null, [5, 2, 0], null, [[32, 48, -1, -2, -2, 4, 12, 4], [48, 48, -1, -2, -2, 4, 12, 4, { g: 0.25 }]]);
  const rLeg = M.part(null, [-1.9, 12, 0], null, [[0, 16, -2, 0, -2, 4, 12, 4], [0, 32, -2, 0, -2, 4, 12, 4, { g: 0.25 }]]);
  const lLeg = M.part(null, [1.9, 12, 0], null, [[16, 48, -2, 0, -2, 4, 12, 4], [0, 48, -2, 0, -2, 4, 12, 4, { g: 0.25 }]]);
  P.legs = [rLeg, lLeg]; P.arms = [lArm, rArm];
  const arms = P.arms;
  return M.done((dt, mob, sp) => {
    mcLook(mob, P.head, dt, 10, 1.2);
    // 耳朵随步伐抖动
    const f = mob.age * 0.1 * 20 + mob.walkPhase;
    mcRot(earL, 0, 0, -Math.PI / 6 - Math.cos(f * 1.2) * 0.1 * Math.min(1, sp + 0.3));
    mcRot(earR, 0, 0, Math.PI / 6 + Math.cos(f) * 0.1 * Math.min(1, sp + 0.3));
    // 僵尸猪灵被激怒后像僵尸一样举臂
    if (zombified && (mob.angry || mob.angerT > 0)) {
      P.arms = [];
      mcRot(rArm, -Math.PI / 2 + Math.sin(mob.age * 2) * 0.05, -0.1, 0);
      mcRot(lArm, -Math.PI / 2 - Math.sin(mob.age * 2) * 0.05, 0.1, 0);
    } else if (!P.arms.length) P.arms = arms;
    mcBaby(P, mob);
  });
}
MODELS.piglin = (small) => piglinModel('extra_mobs_piglin', small);
MODELS.zombified_piglin = (small) => piglinModel('extra_mobs_zombified_piglin', small, true);

// 末影人：细长四肢，眼睛单独一层不受光照
MODELS.enderman = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_enderman'), small);
  const P = M.P;
  P.head = M.part(null, [0, -13, 0], null, [[0, 0, -4, -8, -4, 8, 8, 8]]);
  const jaw = M.part(null, [0, -13, 0], null, [[0, 16, -4, -8, -4, 8, 8, 8, { g: -0.5 }]]);
  M.overlay([P.head.children[0]], M.material(mcTex('mobs_mc_enderman_eyes'), { glow: true, over: true }));
  P.body = M.part(null, [0, -14, 0], null, [[32, 16, -4, 0, -2, 8, 12, 4]]);
  const rArm = M.part(null, [-5, -12, 0], null, [[56, 0, -1, -2, -1, 2, 30, 2]]);
  const lArm = M.part(null, [5, -12, 0], null, [[56, 0, -1, -2, -1, 2, 30, 2, { m: true }]]);
  const rLeg = M.part(null, [-2, -5, 0], null, [[56, 0, -1, 0, -1, 2, 30, 2]]);
  const lLeg = M.part(null, [2, -5, 0], null, [[56, 0, -1, 0, -1, 2, 30, 2, { m: true }]]);
  P.legs = [rLeg, lLeg]; P.arms = [lArm, rArm];
  const arms = P.arms, headY = P.head.position.y;
  return M.done((dt, mob, sp) => {
    mcLook(mob, P.head, dt, 12, 1.2);
    // 尖叫时头部上移露出下颚
    const open = mob.angry || mob.screaming || mob.aggro;
    P.head.position.y = headY + (open ? 5 / 16 : 0);
    jaw.rotation.copy(P.head.rotation);
    // 四肢摆幅减半；搬方块时双臂前伸
    for (const l of P.legs) l.rotation.x *= 0.5;
    if (mob.carried || mob.carry) {
      P.arms = [];
      mcRot(rArm, -0.5, 0, 0.05); mcRot(lArm, -0.5, 0, -0.05);
    } else {
      P.arms = arms;
      for (const a of arms) { a.rotation.x *= 0.5; a.rotation.y = 0; a.rotation.z = 0; }
    }
  });
};

// ---------------- 四足动物 ----------------
// 腿的顺序与 Mob.animate 一致：[右后, 左后, 右前, 左前]
function quadLegs(M, uv, box, pts, mirrorLeft) {
  return pts.map((p, i) => M.part(null, p, null, [[uv[0], uv[1], ...box, { m: !!(mirrorLeft && i % 2) }]]));
}

MODELS.pig = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_pig'), small), P = M.P;
  P.head = M.part(null, [0, 12, -6], null, [[0, 0, -4, -4, -8, 8, 8, 8], [16, 16, -2, 0, -9, 4, 3, 1]]);
  P.body = M.part(null, [0, 11, 2], [Math.PI / 2, 0, 0], [[28, 8, -5, -10, -7, 10, 16, 8]]);
  P.legs = quadLegs(M, [0, 16], [-2, 0, -2, 4, 6, 4], [[-3, 18, 7], [3, 18, 7], [-3, 18, -5], [3, 18, -5]]);
  // 鞍：同一套几何体叠加 pig_saddle 贴图
  const saddleMat = M.material(mcTex('mobs_mc_pig_saddle'), { over: true });
  const saddle = M.overlay([P.body.children[0], P.head.children[0]], saddleMat);
  return M.done((dt, mob) => {
    mcLook(mob, P.head, dt, 6, 0.9);
    mcBaby(P, mob, 1.6);
    const s = !!mob.saddled; for (const o of saddle) o.visible = s;
  });
};

MODELS.cow = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_cow'), small), P = M.P;
  P.head = M.part(null, [0, 4, -8], null, [[0, 0, -4, -4, -6, 8, 8, 6], [22, 0, -5, -5, -4, 1, 3, 1], [22, 0, 4, -5, -4, 1, 3, 1]]);
  P.body = M.part(null, [0, 5, 2], [Math.PI / 2, 0, 0], [[18, 4, -6, -10, -7, 12, 18, 10], [52, 0, -2, 2, -8, 4, 6, 1]]);
  P.legs = quadLegs(M, [0, 16], [-2, 0, -2, 4, 12, 4], [[-4, 12, 7], [4, 12, 7], [-4, 12, -6], [4, 12, -6]], true);
  return M.done((dt, mob) => { mcLook(mob, P.head, dt, 6, 0.9); mcBaby(P, mob, 1.6); });
};

// 绵羊：羊毛是单独一层（剪毛后隐藏），mob.woolColor 存在时按染料颜色染色
const WOOL_RGB = {
  white: [249, 255, 254], orange: [249, 128, 29], magenta: [199, 78, 189], light_blue: [58, 179, 218],
  yellow: [254, 216, 61], lime: [128, 199, 31], pink: [243, 139, 170], gray: [71, 79, 82],
  light_gray: [157, 157, 151], cyan: [22, 156, 156], purple: [137, 50, 184], blue: [60, 68, 170],
  brown: [131, 84, 50], green: [94, 124, 22], red: [176, 46, 38], black: [29, 29, 33],
};
MODELS.sheep = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_sheep'), small), P = M.P;
  const furMat = M.material(mcTex('mobs_mc_sheep_fur'));
  P.head = M.part(null, [0, 6, -8], null, [[0, 0, -3, -4, -6, 6, 6, 8]]);
  P.body = M.part(null, [0, 5, 2], [Math.PI / 2, 0, 0], [[28, 8, -4, -10, -7, 8, 16, 6]]);
  P.legs = quadLegs(M, [0, 16], [-2, 0, -2, 4, 12, 4], [[-3, 12, 7], [3, 12, 7], [-3, 12, -5], [3, 12, -5]]);
  const wool = [
    M.cube(P.head, [0, 0, -3, -4, -4, 6, 6, 6, { g: 0.6 }], furMat),
    M.cube(P.body, [28, 8, -4, -10, -7, 8, 16, 6, { g: 1.75 }], furMat),
    ...P.legs.map(l => M.cube(l, [0, 16, -2, 0, -2, 4, 6, 4, { g: 0.5 }], furMat)),
  ];
  P.wool = wool;
  let col = null, grazeT = 0;
  return M.done((dt, mob) => {
    const c = mob.woolColor && WOOL_RGB[mob.woolColor] ? mob.woolColor : 'white';
    if (c !== col) { col = c; furMat.map = c === 'white' ? mcTex('mobs_mc_sheep_fur') : mcTintTex('mobs_mc_sheep_fur', WOOL_RGB[c]); furMat.needsUpdate = true; }
    const v = !mob.sheared; for (const w of wool) w.visible = v;
    // 偶尔低头吃草
    if (grazeT > 0) { grazeT -= dt; P.head.rotation.x += (1.0 - P.head.rotation.x) * Math.min(1, dt * 8); P.head.position.y = (24 - 6) / 16 - Math.min(1, grazeT) * 0.2; }
    else { if (Math.random() < dt / 25 && Math.hypot(mob.vel.x, mob.vel.z) < 0.1) grazeT = 2; P.head.position.y = (24 - 6) / 16; mcLook(mob, P.head, dt, 6, 0.9); }
    mcBaby(P, mob, 1.6);
  });
};

MODELS.chicken = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_chicken'), small), P = M.P;
  P.head = M.part(null, [0, 15, -4], null, [[0, 0, -2, -6, -2, 4, 6, 3], [14, 0, -2, -4, -4, 4, 2, 2], [14, 4, -1, -2, -3, 2, 2, 2]]);
  P.body = M.part(null, [0, 16, 0], [Math.PI / 2, 0, 0], [[0, 9, -3, -4, -3, 6, 8, 6]]);
  // 素材包的鸡腿只在一列像素里画了细腿、顶部画了脚趾：腿做成 1 像素粗的细杆 + 脚掌薄片
  const stick = [36, 3, 1, 5], legF = { 0: stick, 1: stick, 4: stick, 5: stick, 2: [36, 3, 1, 1], 3: [36, 7, 1, 1] };
  const toe = { 2: [32, 0, 3, 3], 3: [32, 0, 3, 3] };
  const leg = (x) => M.part(null, [x, 19, 1], null, [[26, 0, 0, 0, -2, 1, 5, 1, { faces: legF }], [26, 0, -1, 4.99, -3, 3, 0, 3, { faces: toe }]]);
  P.legs = [leg(-2), leg(1)];
  const wR = M.part(null, [-4, 13, 0], null, [[24, 13, 0, 0, -3, 1, 4, 6]]);
  const wL = M.part(null, [4, 13, 0], null, [[24, 13, -1, 0, -3, 1, 4, 6]]);
  let flap = 0;
  return M.done((dt, mob) => {
    mcLook(mob, P.head, dt, 6, 1.0);
    flap = mob.onGround ? Math.max(0, flap - dt * 4) : 1;
    const a = flap * (Math.sin(mob.age * 40) * 0.5 + 0.5) * 1.2;
    mcRot(wR, 0, 0, a); mcRot(wL, 0, 0, -a);
    mcBaby(P, mob, 1.5);
  });
};

MODELS.wolf = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_wolf'), small), P = M.P;
  P.head = M.part(null, [-1, 13.5, -7], null, [
    [0, 0, -2, -3, -2, 6, 6, 4], [16, 14, -2, -5, 0, 2, 2, 1], [16, 14, 2, -5, 0, 2, 2, 1], [0, 10, -0.5, 0, -5, 3, 3, 4],
  ]);
  P.body = M.part(null, [0, 14, 2], [Math.PI / 2, 0, 0], [[18, 14, -3, -2, -3, 6, 9, 6]]);
  M.part(null, [-1, 14, -3], [Math.PI / 2, 0, 0], [[21, 0, -3, -3, -3, 8, 6, 7]]);
  P.legs = quadLegs(M, [0, 18], [0, 0, -1, 2, 8, 2], [[-2.5, 16, 7], [0.5, 16, 7], [-2.5, 16, -4], [0.5, 16, -4]]);
  const tail = M.part(null, [-1, 12, 8], [0.63, 0, 0], [[9, 18, 0, 0, -1, 2, 8, 2]]);
  let state = '';
  return M.done((dt, mob, sp) => {
    const s = mob.angry ? 'angry' : (mob.tamed || mob.owner) ? 'tame' : '';
    if (s !== state) {
      state = s;
      M.mat.map = mcTex(s === 'angry' ? 'mobs_mc_wolf_angry' : s === 'tame' ? 'mobs_mc_wolf_tame' : 'mobs_mc_wolf'); M.mat.needsUpdate = true;
    }
    mcLook(mob, P.head, dt, 8, 1.0);
    // 尾巴：驯服后翘起，奔跑时左右摆
    const up = s === 'angry' ? 1.4 : s === 'tame' ? 1.0 : 0.63;
    mcRot(tail, up, Math.cos(mob.walkPhase * 1.3) * 0.5 * Math.min(1, sp / 2), 0);
    mcBaby(P, mob, 1.5);
  });
};

// ---------------- 怪物 ----------------
MODELS.creeper = (small) => {
  const M = new MCModel(64, 32, creeperTex(), small), P = M.P;
  P.head = M.part(null, [0, 6, 0], null, [[0, 0, -4, -8, -4, 8, 8, 8]]);
  P.body = M.part(null, [0, 6, 0], null, [[16, 16, -4, 0, -2, 8, 12, 4]]);
  P.legs = quadLegs(M, [0, 16], [-2, 0, -2, 4, 6, 4], [[-2, 18, 4], [2, 18, 4], [-2, 18, -4], [2, 18, -4]]);
  return M.done((dt, mob) => { mcLook(mob, P.head, dt, 16, 1.0); });
};

function spiderModel(tex, small, scale) {
  const M = new MCModel(64, 32, mcTex(tex), small), P = M.P;
  if (scale) M.base.scale.setScalar(scale);
  P.head = M.part(null, [0, 15, -3], null, [[32, 4, -4, -4, -8, 8, 8, 8]]);
  M.overlay([P.head.children[0]], M.material(mcTex('mobs_mc_spider_eyes'), { glow: true, over: true }));
  M.part(null, [0, 15, 0], null, [[0, 0, -3, -3, -3, 6, 6, 6]]);
  P.body = M.part(null, [0, 15, 9], null, [[0, 12, -5, -4, -6, 10, 8, 12]]);
  // 8 条腿：右侧向 -X 伸出，左侧向 +X；由后到前
  const legs = [];
  const zs = [2, 1, 0, -1], q = Math.PI / 4, e = Math.PI / 8;
  const baseY = [q, e, -e, -q], baseZ = [q, q * 0.74, q * 0.74, q];
  for (let i = 0; i < 4; i++) {
    legs.push({ g: M.part(null, [-4, 15, zs[i]], null, [[18, 0, -15, -1, -1, 16, 2, 2]]), s: 1, i });
    legs.push({ g: M.part(null, [4, 15, zs[i]], null, [[18, 0, -1, -1, -1, 16, 2, 2]]), s: -1, i });
  }
  P.legs = [];
  return M.done((dt, mob, sp) => {
    mcLook(mob, P.head, dt, 12, 0.8);
    const ls = mob.walkPhase * 0.6, amt = Math.min(1, sp / 2);
    const ph = [0, Math.PI, Math.PI / 2, Math.PI * 1.5];
    for (const L of legs) {
      const fy = -(Math.cos(ls * 2 + ph[L.i]) * 0.4) * amt, fz = Math.abs(Math.sin(ls + ph[L.i]) * 0.4) * amt;
      mcRot(L.g, 0, L.s * (baseY[L.i] + fy), L.s * -(baseZ[L.i] + fz));
    }
  });
}
MODELS.spider = (small) => spiderModel('mobs_mc_spider', small);
MODELS.cave_spider = (small) => spiderModel('mobs_mc_cave_spider', small, 0.7);

MODELS.endermite = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_endermite'), small), P = M.P;
  const sz = [[4, 3, 2], [6, 4, 5], [3, 3, 1], [1, 2, 1]], uv = [[0, 0], [0, 5], [0, 14], [0, 18]];
  const seg = [];
  let f = -3.5;
  for (let i = 0; i < 4; i++) {
    const [w, h, d] = sz[i];
    seg.push(M.part(null, [0, 24 - h, f], null, [[uv[i][0], uv[i][1], -w / 2, 0, -d / 2, w, h, d]]));
    if (i < 3) f += (d + sz[i + 1][2]) * 0.5;
  }
  P.head = seg[0]; P.body = seg[1];
  const bx = seg.map(s => s.position.x);
  return M.done((dt, mob) => {
    const t = mob.age * 20;
    for (let i = 0; i < 4; i++) {
      seg[i].rotation.y = -Math.cos(t * 0.9 + i * 0.15 * Math.PI) * Math.PI * 0.01 * (1 + Math.abs(i - 2));
      seg[i].position.x = bx[i] + Math.sin(t * 0.9 + i * 0.15 * Math.PI) * Math.PI * 0.1 * Math.abs(i - 2) / 16;
    }
  });
};

// 恶魂：16 像素立方体 + 9 根触手，整体放大 4.5 倍（素材为非标准 80x72 十字展开）
MODELS.ghast = () => {
  const s = 64 / 80;
  const M = new MCModel(64, 72 * s, mcTex('mobs_mc_ghast'), false), P = M.P;
  M.base.scale.setScalar(4.5);
  P.body = M.part(null, [0, 17.6, 0], null, [[0, 0, -8, -8, -8, 16, 16, 16, { faces: { 3: [16, 32, 16, 16] } }]]);
  P.head = P.body;
  const r = mulberry32(1660), tent = [];
  const tf = { 0: [42 * s, 60 * s, 2.5 * s, 12 * s], 1: [44.5 * s, 60 * s, 2.5 * s, 12 * s], 4: [47 * s, 60 * s, 2.5 * s, 12 * s], 5: [49.5 * s, 60 * s, 2.5 * s, 12 * s], 2: [42 * s, 60 * s, 2.5 * s, 2.5 * s], 3: [42 * s, 70 * s, 2.5 * s, 2 * s] };
  for (let i = 0; i < 9; i++) {
    const len = 8 + Math.floor(r() * 7);
    const x = (((i % 3) - ((i / 3) | 0) % 2 * 0.5 + 0.25) / 2 * 2 - 1) * 5, z = (((i / 3) | 0) / 2 * 2 - 1) * 5;
    tent.push(M.part(null, [x, 24.6, z], null, [[0, 0, -1, 0, -1, 2, len, 2, { faces: tf }]]));
  }
  P.tentacles = tent;
  let firing = null;
  return M.done((dt, mob) => {
    const t = mob.age * 20;
    tent.forEach((g, i) => { g.rotation.x = 0.2 * Math.sin(t * 0.3 + i) + 0.4; });
    const f = !!(mob.firing || mob.charging);
    if (f !== firing) { firing = f; M.mat.map = mcTex(f ? 'mobs_mc_ghast_firing' : 'mobs_mc_ghast'); M.mat.needsUpdate = true; }
  });
};

// 烈焰人：12 根烈焰棒分三层环绕旋转，全亮
MODELS.blaze = (small) => {
  // 有原版素材时直接用原版 blaze.png（布局相同），否则用程序贴图
  const M = new MCModel(64, 32, typeof vanillaHas === 'function' && vanillaHas('mobs_mc_blaze') ? mcTex('mobs_mc_blaze') : blazeTex(), small), P = M.P;
  P.head = M.part(null, [0, 0, 0], null, [[0, 0, -4, -4, -4, 8, 8, 8]]);
  P.body = P.head;
  const rods = [];
  for (let i = 0; i < 12; i++) rods.push(M.part(null, [0, 0, 0], null, [[0, 16, 0, 0, 0, 2, 8, 2]]));
  P.rods = rods;
  const place = (g, x, y, z) => g.position.set(x / 16, (24 - y) / 16, -z / 16);
  const pose = (age) => {
    let f = age * Math.PI * -0.1;
    for (let i = 0; i < 4; i++) { place(rods[i], Math.cos(f) * 9, -2 + Math.cos((i * 2 + age) * 0.25), Math.sin(f) * 9); f += Math.PI / 2; }
    f = Math.PI / 4 + age * Math.PI * 0.03;
    for (let i = 4; i < 8; i++) { place(rods[i], Math.cos(f) * 7, 2 + Math.cos((i * 2 + age) * 0.25), Math.sin(f) * 7); f += Math.PI / 2; }
    f = 0.47123894 + age * Math.PI * -0.05;
    for (let i = 8; i < 12; i++) { place(rods[i], Math.cos(f) * 5, 11 + Math.cos((i * 1.5 + age) * 0.5), Math.sin(f) * 5); f += Math.PI / 2; }
  };
  pose(0);
  return M.done((dt, mob) => {
    pose(mob.age * 20);
    mcLook(mob, P.head, dt, 16, 1.2);
    mcFullbright(M.mats, mob);
    // 原版烈焰人身上持续冒火焰与黑烟
    const g = mob.game;
    if (g && g.particles && Math.random() < dt * 14) {
      const a = Math.random() * Math.PI * 2, rr = 0.3 + Math.random() * 0.35;
      const fire = Math.random() < 0.55;
      g.particles.add(mob.pos.x + Math.cos(a) * rr, mob.pos.y + 0.2 + Math.random() * 1.4, mob.pos.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.3, fire ? 0.9 : 0.6, (Math.random() - 0.5) * 0.3, fire ? [255, 160 + rnd(60), 40] : [55, 50, 48], fire ? 0.45 : 0.9, -0.4);
    }
  });
};

// 史莱姆：外层半透明 + 内核 + 眼嘴（素材是 2 倍分辨率的 MC 布局，眼嘴画在左上角空白处）
MODELS.slime = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_slime'), false), P = M.P;
  const outerMat = M.material(mcTex('mobs_mc_slime'), { blend: true });
  M.part(null, [0, 0, 0], null, [[0, 16, -3, 17, -3, 6, 6, 6]]);
  const eye = (x, y) => { const r = [x, y, 2, 2], fc = { 0: r, 1: r, 2: r, 3: r, 4: r, 5: r }; return { faces: fc }; };
  M.part(null, [0, 0, 0], null, [
    [0, 0, -3.25, 18, -3.5, 2, 2, 2, eye(1.5, 2.5)], [0, 0, 1.25, 18, -3.5, 2, 2, 2, eye(5, 2.5)],
    [0, 0, 0, 21, -3.5, 1, 1, 1, eye(3.5, 5)],
  ]);
  const outer = M.part(null, [0, 0, 0], null, [[0, 0, -4, 16, -4, 8, 8, 8, { mat: outerMat }]]);
  outer.children[0].renderOrder = 1;
  P.body = outer; P.head = outer;
  return M.done(slimeTick(M, small));
};
function slimeTick(M, small) {
  let sq = 0;
  return (dt, mob) => {
    // 按碰撞箱高度缩放（模型 8 像素 = 0.5 格）；离地时拉伸、落地压扁
    const s = (mob.h || (small ? 0.25 : 0.5)) / 0.5;
    const target = mob.onGround ? 0 : Math.max(-0.5, Math.min(1, mob.vel.y / 8));
    sq += (target - sq) * Math.min(1, dt * 10);
    M.base.scale.set(s / (1 + sq * 0.25), s * (1 + sq * 0.4), s / (1 + sq * 0.25));
  };
}

// 岩浆怪：8 层薄片 + 熔岩内核；跳起时薄片上下拉开
MODELS.magma_cube = (small) => {
  const M = new MCModel(64, 32, mcTex('mobs_mc_magmacube'), false), P = M.P;
  const slices = [];
  for (let i = 0; i < 8; i++) {
    let u = 0, v = i;
    if (i === 2) { u = 24; v = 10; } else if (i === 3) { u = 24; v = 19; }
    slices.push(M.part(null, [0, 0, 0], null, [[u, v, -4, 16 + i, -4, 8, 1, 8]]));
  }
  M.part(null, [0, 0, 0], null, [[0, 16, -2, 18, -2, 4, 4, 4]]);
  P.body = slices[4]; P.head = slices[2]; P.slices = slices;
  let sq = 0;
  return M.done((dt, mob) => {
    const s = (mob.h || (small ? 0.26 : 0.52)) / 0.5;
    M.base.scale.setScalar(s);
    const target = mob.onGround ? 0 : Math.max(0, Math.min(1, mob.vel.y / 6 + 0.3));
    sq += (target - sq) * Math.min(1, dt * 12);
    slices.forEach((g, i) => { g.position.y = (24 + (4 - i) * sq * 1.7) / 16; });
  });
};

// ---------------- 村民 / 女巫 / 铁傀儡 ----------------
const VILLAGER_PROF_TEX = {
  farmer: 'farmer', librarian: 'librarian', armorer: 'armorer', weaponsmith: 'weaponsmith', toolsmith: 'toolsmith',
  butcher: 'butcher', leatherworker: 'leatherworker', cleric: 'priest', shepherd: 'sheperd', fletcher: 'fletcher',
  cartographer: 'cartographer', mason: 'mason', fisherman: 'fisherman', nitwit: 'nitwit',
};
// 村民骨架（witch 共用）：头 + 鼻 + 长袍 + 交叉抱臂 + 腿
function villagerBase(M, witch) {
  const P = M.P;
  P.head = M.part(null, [0, 0, 0], null, [[0, 0, -4, -10, -4, 8, 10, 8]].concat(witch ? [] : [[32, 0, -4, -10, -4, 8, 10, 8, { g: 0.51 }]]));
  if (!witch) M.part(P.head, [0, 0, 0], [-Math.PI / 2, 0, 0], [[30, 47, -8, -8, -6, 16, 16, 1]]);
  const nose = M.part(P.head, [0, -2, 0], null, [[24, 0, -1, -1, -6, 2, 4, 2]]);
  P.body = M.part(null, [0, 0, 0], null, [[16, 20, -4, 0, -3, 8, 12, 6], [0, 38, -4, 0, -3, 8, 20, 6, { g: 0.5 }]]);
  P.crossed = M.part(null, [0, 3, -1], [-0.75, 0, 0], [[44, 22, -8, -2, -2, 4, 8, 4], [44, 22, 4, -2, -2, 4, 8, 4, { m: true }], [40, 38, -4, 2, -2, 8, 4, 4]]);
  P.legs = [M.part(null, [-2, 12, 0], null, [[0, 22, -2, 0, -2, 4, 12, 4]]), M.part(null, [2, 12, 0], null, [[0, 22, -2, 0, -2, 4, 12, 4, { m: true }]])];
  P.arms = [];
  return nose;
}
MODELS.villager = (small) => {
  const M = new MCModel(64, 64, mcTex('mobs_mc_villager'), small), P = M.P;
  villagerBase(M);
  // 职业服装：所有部件叠一层同几何体
  const profMat = M.material(null, { over: true });
  const over = M.overlay(M.meshes.slice(), profMat);
  for (const o of over) o.visible = false;
  let prof = null, nodT = 0;
  return M.done((dt, mob) => {
    const p = mob.profession && VILLAGER_PROF_TEX[mob.profession] ? mob.profession : 'none';
    if (p !== prof) {
      prof = p;
      const show = p !== 'none';
      if (show) { profMat.map = mcTex('mobs_mc_villager_' + VILLAGER_PROF_TEX[p]); profMat.needsUpdate = true; }
      for (const o of over) o.visible = show;
    }
    mcLook(mob, P.head, dt, 8, 1.2);
    // 交易时点头 / 拒绝时摇头
    if (mob.nod > 0 || mob.trading) { nodT += dt; P.head.rotation.x += Math.sin(nodT * 14) * 0.25; } else nodT = 0;
    if (mob.shake > 0) P.head.rotation.y += Math.sin(mob.age * 30) * 0.35;
    mcBaby(P, mob);
  });
};
MODELS.witch = (small) => {
  const M = new MCModel(64, 128, mcTex('mobs_mc_witch'), small), P = M.P;
  const nose = villagerBase(M, true);
  M.cube(nose, [0, 0, 0, 3, -6.75, 1, 1, 1, { g: -0.25 }]);
  const hat = M.part(P.head, [-5, -10.03125, -5], null, [[0, 64, 0, 0, 0, 10, 2, 10]]);
  const hat2 = M.part(hat, [1.75, -4, 2], [-0.05235988, 0, 0.02617994], [[0, 76, 0, 0, 0, 7, 4, 7]]);
  const hat3 = M.part(hat2, [1.75, -4, 2], [-0.10471976, 0, 0.05235988], [[0, 87, 0, 0, 0, 4, 4, 4]]);
  M.part(hat3, [1.75, -2, 2], [-0.20943952, 0, 0.10471976], [[0, 95, 0, 0, 0, 1, 2, 1, { g: 0.25 }]]);
  return M.done((dt, mob) => {
    mcLook(mob, P.head, dt, 10, 1.2);
    // 鼻子抽动
    nose.position.x = Math.sin(mob.age * 20 * 0.1) * 0.02 * (Math.sin(mob.age * 0.7) > 0.6 ? 1 : 0);
  });
};

MODELS.iron_golem = () => {
  const M = new MCModel(128, 128, mcTex('mobs_mc_iron_golem'), false), P = M.P;
  P.head = M.part(null, [0, -7, -2], null, [[0, 0, -4, -12, -5.5, 8, 10, 8], [24, 0, -1, -5, -7.5, 2, 4, 2]]);
  P.body = M.part(null, [0, -7, 0], null, [[0, 40, -9, -2, -6, 18, 12, 11], [0, 70, -4.5, 10, -3, 9, 5, 6, { g: 0.5 }]]);
  const rArm = M.part(null, [0, -7, 0], null, [[60, 21, -13, -2.5, -3, 4, 30, 6]]);
  const lArm = M.part(null, [0, -7, 0], null, [[60, 58, 9, -2.5, -3, 4, 30, 6]]);
  const rLeg = M.part(null, [-4, 11, 0], null, [[37, 0, -3.5, -3, -3, 6, 16, 5]]);
  const lLeg = M.part(null, [5, 11, 0], null, [[60, 0, -3.5, -3, -3, 6, 16, 5, { m: true }]]);
  P.legs = [rLeg, lLeg]; P.arms = [lArm, rArm];
  const arms = P.arms;
  return M.done((dt, mob, sp) => {
    mcLook(mob, P.head, dt, 10, 1.0);
    for (const l of P.legs) l.rotation.x *= 0.6;
    // 攻击：双臂猛地上举
    if (mob.attackCd > 0.5) {
      P.arms = [];
      const a = -2 + 1.5 * Math.abs(((1 - mob.attackCd) * 4) % 2 - 1);
      rArm.rotation.x = lArm.rotation.x = a;
    } else { P.arms = arms; for (const a of arms) a.rotation.x *= 0.6; }
  });
};

// ---------------- 末影龙 ----------------
// 身体/脖子 5 节/头与下颚/双翼（含翼尖）/四条腿/尾巴 12 节；P.wings 供扇翅
MODELS.ender_dragon = () => {
  const M = new MCModel(256, 256, mcTex('mobs_mc_dragon'), false), P = M.P;
  P.body = M.part(null, [0, 4, 8], null, [
    [0, 0, -12, 0, -16, 24, 24, 64], [220, 53, -1, -6, -10, 2, 6, 12], [220, 53, -1, -6, 10, 2, 6, 12], [220, 53, -1, -6, 30, 2, 6, 12],
  ]);
  const neckCubes = [[192, 104, -5, -5, -5, 10, 10, 10], [48, 0, -1, -9, -3, 2, 4, 6]];
  const neck = [], tail = [];
  for (let i = 0; i < 5; i++) neck.push(M.part(null, [0, 20, -12 - i * 10], null, neckCubes));
  for (let i = 0; i < 12; i++) tail.push(M.part(null, [0, 10, 60 + i * 10], null, neckCubes));
  P.head = M.part(null, [0, 20, -62], null, [
    [176, 44, -6, -1, -24, 12, 5, 16], [112, 30, -8, -8, -10, 16, 16, 16],
    [0, 0, -5, -12, -4, 2, 4, 6, { m: true }], [112, 0, -5, -3, -22, 2, 2, 4, { m: true }],
    [0, 0, 3, -12, -4, 2, 4, 6], [112, 0, 3, -3, -22, 2, 2, 4],
  ]);
  const jaw = M.part(P.head, [0, 4, -8], null, [[176, 65, -6, 0, -16, 12, 4, 16]]);
  const wing = (s) => {
    const m = s > 0;
    const w = M.part(null, [12 * s, 5, 2], null, [
      [112, 88, m ? 0 : -56, -4, -4, 56, 8, 8, { m }], [-56, 88, m ? 0 : -56, 0, 2, 56, 0, 56, { m }],
    ]);
    const t = M.part(w, [56 * s, 0, 0], null, [
      [112, 136, m ? 0 : -56, -2, -2, 56, 4, 4, { m }], [-56, 144, m ? 0 : -56, 0, 2, 56, 0, 56, { m }],
    ]);
    return [w, t];
  };
  const [rW, rT] = wing(-1), [lW, lT] = wing(1);
  // 翼膜双面可见
  const memb = new THREE.MeshBasicMaterial({ map: M.mat.map, alphaTest: 0.5, side: THREE.DoubleSide }); M.mats.push(memb);
  for (const g of [rW, rT, lW, lT]) g.children.forEach(c => { if (c.geometry && c.geometry.parameters.height === 0) c.material = memb; });
  const legs = [];
  for (const s of [-1, 1]) {
    const m = s > 0;
    const fl = M.part(null, [12 * s, 20, 2], null, [[112, 104, -4, -4, -4, 8, 24, 8, { m }]]);
    const ft = M.part(fl, [0, 20, -1], null, [[226, 138, -3, -1, -3, 6, 24, 6, { m }]]);
    const ff = M.part(ft, [0, 23, 0], null, [[144, 104, -4, 0, -12, 8, 4, 16, { m }]]);
    const rl = M.part(null, [16 * s, 16, 42], null, [[0, 0, -8, -4, -8, 16, 32, 16, { m }]]);
    const rt = M.part(rl, [0, 32, -4], null, [[196, 0, -6, -2, 0, 12, 32, 12, { m }]]);
    const rf = M.part(rt, [0, 31, 4], null, [[112, 0, -9, 0, -20, 18, 6, 24, { m }]]);
    legs.push([fl, ft, ff, rl, rt, rf]);
  }
  P.wings = [rW, lW]; P.wingTips = [rT, lT]; P.neck = neck; P.tail = tail; P.jaw = jaw; P.legs = [];
  const place = (g, x, y, z) => g.position.set(x / 16, (24 - y) / 16, -z / 16);
  const pose = (age, flapT) => {
    const f9 = flapT * Math.PI * 2;
    const f1 = Math.sin(f9 - 1) + 1, bob = (f1 * f1 + f1 * 2) * 0.05;
    jaw.rotation.x = (Math.sin(f9) + 1) * 0.2;
    // 脖子：缓慢起伏的链
    let y = 20, z = -12, x = 0;
    for (let i = 0; i < 5; i++) {
      const xr = Math.cos(i * 0.45 + age * 0.6) * 0.15 - 0.08;
      place(neck[i], x, y + bob * 6, z); mcRot(neck[i], xr, 0, 0);
      y += Math.sin(xr) * 10; z -= Math.cos(xr) * 10;
    }
    place(P.head, x, y + bob * 6, z); mcRot(P.head, -0.1 + Math.sin(age * 0.5) * 0.05, 0, 0);
    // 尾巴：左右摆动的链
    y = 10; z = 60; x = 0;
    for (let i = 0; i < 12; i++) {
      const xr = Math.cos(i * 0.45 + age * 0.6) * 0.05 + 0.05, yr = Math.sin(i * 0.3 + age * 0.8) * 0.12;
      place(tail[i], x, y, z); mcRot(tail[i], xr, yr, 0);
      y += Math.sin(xr) * 10; z += Math.cos(yr) * Math.cos(xr) * 10; x -= Math.sin(yr) * Math.cos(xr) * 10;
    }
    mcRot(rW, 0.125 - Math.cos(f9) * 0.2, 0.25, (Math.sin(f9) + 0.125) * 0.8);
    mcRot(rT, 0, 0, -(Math.sin(f9 + 2) + 0.5) * 0.75);
    mcRot(lW, 0.125 - Math.cos(f9) * 0.2, -0.25, -(Math.sin(f9) + 0.125) * 0.8);
    mcRot(lT, 0, 0, (Math.sin(f9 + 2) + 0.5) * 0.75);
    for (const [fl, ft, ff, rl, rt, rf] of legs) {
      mcRot(fl, 1.3 + f1 * 0.1, 0, 0); mcRot(ft, -0.5 - f1 * 0.1, 0, 0); mcRot(ff, 0.75 + f1 * 0.1, 0, 0);
      mcRot(rl, 1.0 + f1 * 0.1, 0, 0); mcRot(rt, 0.5 + f1 * 0.1, 0, 0); mcRot(rf, 0.75 + f1 * 0.1, 0, 0);
    }
    M.base.position.y = -bob * 0.5;
  };
  pose(0, 0);
  let flapT = 0;
  return M.done((dt, mob) => {
    flapT += dt * (mob.flapSpeed || 0.55);
    pose(mob.age, flapT);
  });
};

// ---------------- 第一人称手臂（main.js updateHand 调用） ----------------
function mcFirstPersonArm() {
  const tex = typeof packTexture === 'function' ? packTexture('character') : null;
  if (!tex) return null;
  const geo = mcBoxGeo(64, 32, 40, 16, 4, 12, 4, 0, false);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  m.scale.setScalar(0.52);
  m.rotation.order = 'YXZ';
  m.rotation.set(Math.PI / 2 + 0.55, 0.32, 0.12);
  m.position.set(0.6, -0.56, -0.86);
  return m;
}

// ---------------- 箱子（方块实体）：原版 ChestModel 尺寸 + 开合动画 ----------------
// 箱体 (1,0,1)-(15,10,15) uv(0,19)；盖子 (1,9,1)-(15,14,15) uv(0,0)，铰链在背面 y=9；锁扣 (7,7,15)-(9,11,16) uv(0,0)
// 本地正面朝 +Z；meta 0..3 对应正面朝 +Z、-X、-Z、+X（与 texOf 的 front 规则一致）
const CHEST_BE = new Map(); // "x,y,z" -> { root, lid, mat, open, prev }
const CHEST_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
function chestBeMesh(meta) {
  const tex = mcTex('mcl_chests_normal');
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.1 });
  const root = new THREE.Group(), body = new THREE.Group();
  body.position.set(-0.5, 0, -0.5); root.add(body);
  const box = (parent, u, v, x, y, z, w, h, d) => {
    // 方块实体模型 y 朝上：box UV 的 (u+d,v) 是底面、(u+d+w,v) 是顶面，与生物模型相反
    const m = new THREE.Mesh(mcBoxGeo(64, 64, u, v, w, h, d, 0, false, { 2: [u + d + w, v, w, d], 3: [u + d, v, w, d] }), mat);
    m.position.set((x + w / 2) / 16, (y + h / 2) / 16, (z + d / 2) / 16); parent.add(m); return m;
  };
  box(body, 0, 19, 1, 0, 1, 14, 10, 14);
  const lid = new THREE.Group(); lid.position.set(0, 9 / 16, 1 / 16); body.add(lid);
  box(lid, 0, 0, 1, 0, 0, 14, 5, 14);
  box(lid, 0, 0, 7, -2, 14, 2, 4, 1);
  root.rotation.y = CHEST_ROT[meta & 3];
  return { root, lid, mat, open: 0, prev: 0 };
}
FEATURES.push({
  frame(g, dt) {
    const w = g.world; if (!w) return;
    const want = new Set();
    const opened = g.ui && g.ui.screen === 'chest' && g.ui.tilePos ? g.ui.tilePos.join(',') : null;
    for (const c of w.chunks.values()) {
      if (!c.meshes || !c.bes) continue;
      for (const b of c.bes) {
        if (BLOCKS[b[3]].be !== 'chest') continue;
        const k = b[0] + ',' + b[1] + ',' + b[2];
        want.add(k);
        let e = CHEST_BE.get(k);
        if (!e || e.meta !== b[4]) {
          if (e) g.scene.remove(e.root);
          e = chestBeMesh(b[4]); e.meta = b[4];
          e.root.position.set(b[0] + 0.5, b[1], b[2] + 0.5);
          g.scene.add(e.root); CHEST_BE.set(k, e);
        }
      }
    }
    for (const [k, e] of CHEST_BE) {
      if (!want.has(k)) { g.scene.remove(e.root); CHEST_BE.delete(k); continue; }
      // 原版：openness 每刻 ±0.1，显示角度 = (1-(1-t)^3) * 90°
      const target = k === opened ? 1 : 0;
      e.prev = e.open;
      e.open = target ? Math.min(1, e.open + dt * 2) : Math.max(0, e.open - dt * 2);
      if (e.prev >= 0.5 && e.open < 0.5) g.audio.play('chest_close', new THREE.Vector3(e.root.position.x, e.root.position.y + 0.5, e.root.position.z));
      const f = 1 - Math.pow(1 - e.open, 3);
      e.lid.rotation.x = -f * Math.PI / 2;
      const p = e.root.position, x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
      const sl = Math.max(0, w.skyLight(x, y, z) - g.skyDarken), bl = w.blockLight(x, y, z);
      const b = Math.max(Math.pow(0.82, 15 - sl), Math.pow(0.82, 15 - bl), 0.06);
      e.mat.color.setRGB(b, b, b);
    }
  },
});
