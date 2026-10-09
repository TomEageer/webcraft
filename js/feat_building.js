'use strict';
// ---------- 建筑与杂项：连接方块、装饰、石材、铜、染料、雪、世界生成 ----------
// 农作物/食物/钓鱼见 feat_building_farm.js，船/铁轨/矿车见 feat_building_transport.js

const BLD = {};
BLD.COLORS = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'];
BLD.ZH = { white: '白色', orange: '橙色', magenta: '品红色', light_blue: '淡蓝色', yellow: '黄色', lime: '黄绿色', pink: '粉红色', gray: '灰色', light_gray: '淡灰色', cyan: '青色', purple: '紫色', blue: '蓝色', brown: '棕色', green: '绿色', red: '红色', black: '黑色' };
// 素材包里的颜色名
BLD.cbCol = c => ({ gray: 'grey', light_gray: 'silver' })[c] || c;          // 混凝土、陶瓦
BLD.glassCol = c => ({ light_gray: 'silver' })[c] || c;                    // 玻璃、玻璃板
BLD.DYE_TEX = { white: 'white', orange: 'orange', magenta: 'magenta', light_blue: 'lightblue', yellow: 'yellow', lime: 'lime', pink: 'pink', gray: 'dark_grey', light_gray: 'grey', cyan: 'cyan', purple: 'violet', blue: 'blue', brown: 'brown', green: 'dark_green', red: 'red', black: 'black' };
BLD.H4 = [[1, 0], [-1, 0], [0, 1], [0, -1]]; // +X -X +Z -Z
const p16 = v => v / 16;

BLD.solidCube = id => { const d = BLOCKS[id]; return !!d && d.shape === 'cube' && d.solid && !d.leaves; };
BLD.isSolid = id => { const d = BLOCKS[id]; return !!d && d.solid; };
// 玩家放置目标格（与核心一致：点中可替换方块则替换它）
BLD.placePos = b => {
  const repl = BLOCKS[b.id].replaceable && !isLiquid(b.id);
  return repl ? [b.x, b.y, b.z] : [b.x + b.n[0], b.y + b.n[1], b.z + b.n[2]];
};
BLD.canReplace = (w, x, y, z) => { if (y < 0 || y >= CH) return false; const c = w.getBlock(x, y, z); return !c || BLOCKS[c].replaceable; };
BLD.yawDir = p => ((Math.round(-p.yaw / (Math.PI / 2)) % 4) + 4) % 4; // 0:-Z 1:+X 2:+Z 3:-X
BLD.place = (game, player, x, y, z, id, meta) => {
  game.world.setBlock(x, y, z, id, meta || 0);
  game.audio.placeSound(id);
  player.consume();
  return true;
};
BLD.chance = p => Math.random() < p;
BLD.ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// ---------------- 物品图标：盒子形状的等轴绘制 ----------------
// def.iconBoxes：[[x0,y0,z0,x1,y1,z1,ext?], ...]（0..1），用于栅栏、墙、地毯、雪层、蛋糕等
BLD.drawBoxes = function (ctx, def, boxes) {
  const s = 21 / 16, vv = 10 / 16, dv = 22 / 16;
  const tintOf = def.tint ? (def.tint === 'grass' ? [0.57, 0.74, 0.35] : [0.47, 0.67, 0.19]) : null;
  const mul = (t, f) => t ? t.map(v => v * f) : [f, f, f];
  const sorted = boxes.slice().sort((a, b) => (a[0] + a[3] + a[2] + a[5] + a[1] + a[4]) - (b[0] + b[3] + b[2] + b[5] + b[1] + b[4]));
  for (const bx of sorted) {
    const [x0, y0, z0, x1, y1, z1] = bx.map(v => v * 16), ext = bx[6];
    const faces = [
      [2, [s, vv, -s, vv, 24, 3 + dv * (16 - y1)], [x0, z0, x1 - x0, z1 - z0], 1],
      [4, [s, vv, 0, dv, 24 - s * z1, 3 + vv * z1], [x0, 16 - y1, x1 - x0, y1 - y0], 0.78],
      [0, [s, -vv, 0, dv, 24 + s * (x1 - 16), 3 + vv * (x1 + 16)], [16 - z1, 16 - y1, z1 - z0, y1 - y0], 0.6],
    ];
    for (const [f, m, dst, shadeF] of faces) {
      if (ext && ext.faces && !ext.faces[f]) continue;
      const t = ext && ext.tex ? ext.tex(f) : texOf(def, f, 0);
      if (t < 0 || t === undefined) continue;
      let src = f === 0 ? [z0, 16 - y1, z1 - z0, y1 - y0] : dst;
      if (ext && ext.uv) { const u = ext.uv(f); if (u) src = [u[0], u[1], u[2] - u[0], u[3] - u[1]]; }
      if (dst[2] <= 0 || dst[3] <= 0 || src[2] <= 0 || src[3] <= 0) continue;
      const img = tileCanvas(t, mul(ext && ext.tint ? ext.tint : tintOf, shadeF));
      ctx.save(); ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
      ctx.drawImage(img, src[0], src[1], src[2], src[3], dst[0], dst[1], dst[2], dst[3]);
      ctx.restore();
    }
  }
};
{
  const origIcon = iconCanvas;
  // eslint-disable-next-line no-global-assign
  iconCanvas = function (name) {
    if (ICON_CANVAS.has(name)) return ICON_CANVAS.get(name);
    const it = ITEMS[name], def = it && it.block !== undefined ? BLOCKS[it.block] : null;
    const packIcon = PACK_READY && it && it.icon && PACK_IMG[it.icon];
    if (!packIcon && def && def.iconBoxes) {
      const cv = document.createElement('canvas'); cv.width = cv.height = IS;
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      BLD.drawBoxes(ctx, def, typeof def.iconBoxes === 'function' ? def.iconBoxes() : def.iconBoxes);
      ICON_CANVAS.set(name, cv); return cv;
    }
    if (it && it.iconTint && packIcon) {
      // 灰度素材（藤蔓等）按颜色染色后作为图标
      const cv = document.createElement('canvas'); cv.width = cv.height = IS;
      const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
      const fr = new Uint8ClampedArray(packFrame(it.icon, 0));
      for (let i = 0; i < fr.length; i += 4) { fr[i] *= it.iconTint[0]; fr[i + 1] *= it.iconTint[1]; fr[i + 2] *= it.iconTint[2]; }
      const c16 = document.createElement('canvas'); c16.width = c16.height = 16;
      c16.getContext('2d').putImageData(new ImageData(fr, 16, 16), 0, 0);
      ctx.drawImage(c16, 0, 0, IS, IS);
      ICON_CANVAS.set(name, cv); return cv;
    }
    return origIcon(name);
  };
}

// ---------------- 连接形状 ----------------
function bldFenceConn(id) { const d = BLOCKS[id]; return !!d && (d.fence || d.fenceGate || BLD.solidCube(id)); }
function bldWallConn(id) { const d = BLOCKS[id]; return !!d && (d.wall || d.pane || d.fenceGate || BLD.solidCube(id)); }
function bldPaneConn(id) { const d = BLOCKS[id]; return !!d && (d.pane || d.wall || BLD.solidCube(id)); }

function bldFenceBoxes(meta, nb, id, tall) {
  const out = [[6 / 16, 0, 6 / 16, 10 / 16, tall ? 1.5 : 1, 10 / 16]];
  const rails = tall ? [[0, 1.5]] : [[6 / 16, 9 / 16], [12 / 16, 15 / 16]];
  const w0 = tall ? 6 / 16 : 7 / 16, w1 = tall ? 10 / 16 : 9 / 16;
  for (const [dx, dz] of BLD.H4) {
    if (!bldFenceConn(nb(dx, 0, dz))) continue;
    for (const [y0, y1] of rails) {
      if (dx === 1) out.push([10 / 16, y0, w0, 1, y1, w1]);
      else if (dx === -1) out.push([0, y0, w0, 6 / 16, y1, w1]);
      else if (dz === 1) out.push([w0, y0, 10 / 16, w1, y1, 1]);
      else out.push([w0, y0, 0, w1, y1, 6 / 16]);
    }
  }
  return out;
}
function bldWallBoxes(meta, nb, id, tall) {
  const [e, w, s, n] = BLD.H4.map(([dx, dz]) => bldWallConn(nb(dx, 0, dz)));
  const h = tall ? 1.5 : 14 / 16, top = tall ? 1.5 : 1;
  const above = nb(0, 1, 0);
  const straight = (e && w && !s && !n) || (s && n && !e && !w);
  if (straight && !(above && BLOCKS[above].wall)) return e ? [[0, 0, 5 / 16, 1, h, 11 / 16]] : [[5 / 16, 0, 0, 11 / 16, h, 1]];
  const out = [[4 / 16, 0, 4 / 16, 12 / 16, top, 12 / 16]];
  if (e) out.push([12 / 16, 0, 5 / 16, 1, h, 11 / 16]);
  if (w) out.push([0, 0, 5 / 16, 4 / 16, h, 11 / 16]);
  if (s) out.push([5 / 16, 0, 12 / 16, 11 / 16, h, 1]);
  if (n) out.push([5 / 16, 0, 0, 11 / 16, h, 4 / 16]);
  return out;
}
// 玻璃板/铁栏杆：broad 为大面纹理，edge 为边缘纹理
function bldPaneBoxes(nb, broad, edge) {
  const [e, w, s, n] = BLD.H4.map(([dx, dz]) => bldPaneConn(nb(dx, 0, dz)));
  const a = 7 / 16, b = 9 / 16, out = [];
  const tz = { tex: f => (f === 0 || f === 1) ? TEX[broad] : TEX[edge] };   // 沿 Z 的板：±X 为大面
  const tx = { tex: f => (f === 4 || f === 5) ? TEX[broad] : TEX[edge] };   // 沿 X 的板
  const zAxis = n || s, xAxis = e || w;
  if (!zAxis && !xAxis) return [[a, 0, a, b, 1, b, { tex: f => f === 2 || f === 3 ? TEX[edge] : TEX[broad] }]];
  if (zAxis) out.push([a, 0, n ? 0 : a, b, 1, s ? 1 : b, tz]);
  if (xAxis) {
    if (zAxis) {
      if (w) out.push([0, 0, a, a, 1, b, { tex: tx.tex, faces: [false, true, true, true, true, true] }]);
      if (e) out.push([b, 0, a, 1, 1, b, { tex: tx.tex, faces: [true, false, true, true, true, true] }]);
    } else out.push([w ? 0 : a, 0, a, e ? 1 : b, 1, b, tx]);
  }
  return out;
}

// 贴墙方块（梯子、藤蔓）：meta 0..3 表示墙在 +X -X +Z -Z
const BLD_WALL_BOX = [
  [15 / 16, 0, 0, 1, 1, 1], [0, 0, 0, 1 / 16, 1, 1], [0, 0, 15 / 16, 1, 1, 1], [0, 0, 0, 1, 1, 1 / 16],
];
BLD.wallMetaFromNormal = n => n[0] === 1 ? 1 : n[0] === -1 ? 0 : n[2] === 1 ? 3 : n[2] === -1 ? 2 : -1;
BLD.wallMetaFromYaw = yd => [3, 0, 2, 1][yd];

// ---------------- 下落的雪球 ----------------
class BldSnowball extends Entity {
  constructor(game, owner) {
    const e = owner.eye(), d = owner.lookDir();
    super(game, e.x + d.x * 0.4, e.y + d.y * 0.4 - 0.1, e.z + d.z * 0.4);
    this.owner = owner; this.w = 0.1; this.h = 0.1; this.stepH = 0;
    this.vel.set(d.x * 30, d.y * 30, d.z * 30);
    this.mesh = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(this.item || 'snowball'), transparent: true, alphaTest: 0.3 }));
    this.mesh.scale.setScalar(0.3);
    game.scene.add(this.mesh);
  }
  update(dt) {
    this.age += dt;
    if (this.age > 10) { this.dead = true; return; }
    this.vel.y -= 14 * dt;
    const steps = 4;
    for (let s = 0; s < steps; s++) {
      const nx = this.pos.x + this.vel.x * dt / steps, ny = this.pos.y + this.vel.y * dt / steps, nz = this.pos.z + this.vel.z * dt / steps;
      const id = this.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (id && BLOCKS[id].solid) { this.pop(); return; }
      this.pos.set(nx, ny, nz);
      for (const m of this.game.mobs) {
        if (m.dead || m.def.vehicle) continue;
        if (Math.abs(m.pos.x - nx) < m.w + 0.1 && Math.abs(m.pos.z - nz) < m.w + 0.1 && ny > m.pos.y && ny < m.pos.y + m.h) {
          if (m.type === 'blaze') m.hurt(3, 'snowball', this.owner);
          else { const l = Math.hypot(this.vel.x, this.vel.z) || 1; m.vel.x += this.vel.x / l * 3; m.vel.z += this.vel.z / l * 3; m.vel.y = 3; m.hurtTime = 0.2; }
          this.pop(); return;
        }
      }
    }
    this.mesh.position.copy(this.pos);
    const b = this.lightAt(); this.mesh.material.color.setRGB(b, b, b);
  }
  pop() { this.dead = true; this.game.particles.burst(this.pos.x, this.pos.y, this.pos.z, [240, 240, 250], 8, 1.2); }
}

// ---------------- 方块定义 ----------------
BLD.WOODS = { oak: '橡木', birch: '白桦木', spruce: '云杉木', cherry: '樱花木', pale_oak: '苍白橡木', poplar: '杨木' };
BLD.STONES = {
  andesite: ['安山岩', 'mcl_core_andesite'], polished_andesite: ['磨制安山岩', 'mcl_core_andesite_smooth'],
  diorite: ['闪长岩', 'mcl_core_diorite'], polished_diorite: ['磨制闪长岩', 'mcl_core_diorite_smooth'],
  granite: ['花岗岩', 'mcl_core_granite'], polished_granite: ['磨制花岗岩', 'mcl_core_granite_smooth'],
};
BLD.COPPER = [
  ['copper_block', 'exposed_copper', 'weathered_copper', 'oxidized_copper'],
  ['cut_copper', 'exposed_cut_copper', 'weathered_cut_copper', 'oxidized_cut_copper'],
];

function bldBlocks() {
  const def = (n, zh, o) => {
    const d = defBlock(n, zh, o);
    if (ITEMS[n] && o.icon) ITEMS[n].icon = o.icon;
    if (ITEMS[n] && o.iconTint) ITEMS[n].iconTint = o.iconTint;
    return d;
  };
  BLD.def = def;
  // ---- 栅栏 ----
  const fenceIcon = [[1 / 16, 0, 6 / 16, 5 / 16, 1, 10 / 16], [11 / 16, 0, 6 / 16, 15 / 16, 1, 10 / 16], [0, 6 / 16, 7 / 16, 1, 9 / 16, 9 / 16], [0, 12 / 16, 7 / 16, 1, 15 / 16, 9 / 16]];
  for (const w in BLD.WOODS) {
    def(w + '_fence', BLD.WOODS[w] + '栅栏', {
      shape: 'boxes', tex: w + '_planks', opaque: false, hard: 2, tool: 'axe', fuel: 300, fence: true, tall: true, bldKind: 'conn',
      boxes: (m, nb, id) => bldFenceBoxes(m, nb, id, false), collide: (m, nb, id) => bldFenceBoxes(m, nb, id, true), iconBoxes: fenceIcon,
    });
  }
  // ---- 墙 ----
  const walls = { cobblestone: ['圆石墙', 'cobblestone'], mossy_cobblestone: ['苔石墙', 'mossy_cobblestone'], cobbled_deepslate: ['深板岩圆石墙', 'cobbled_deepslate'], andesite: ['安山岩墙', 'mcl_core_andesite'], diorite: ['闪长岩墙', 'mcl_core_diorite'], granite: ['花岗岩墙', 'mcl_core_granite'] };
  const wallIcon = [[4 / 16, 0, 4 / 16, 12 / 16, 1, 12 / 16], [0, 0, 5 / 16, 4 / 16, 13 / 16, 11 / 16], [12 / 16, 0, 5 / 16, 1, 13 / 16, 11 / 16]];
  for (const k in walls) {
    def(k + '_wall', walls[k][0], {
      shape: 'boxes', tex: walls[k][1], opaque: false, hard: 2, tool: 'pickaxe', tier: 1, blast: 6, wall: true, tall: true, bldKind: 'conn',
      boxes: (m, nb, id) => bldWallBoxes(m, nb, id, false), collide: (m, nb, id) => bldWallBoxes(m, nb, id, true), iconBoxes: wallIcon,
    });
  }
  // ---- 玻璃板、铁栏杆、染色玻璃 ----
  def('glass_pane', '玻璃板', {
    shape: 'boxes', tex: 'glass', texNames: ['xpanes_top_glass_natural'], opaque: false, render: 'cutout', hard: 0.3, drop: null, pane: true, sound: 'glass', bldKind: 'conn',
    boxes: (m, nb) => bldPaneBoxes(nb, 'glass', 'xpanes_top_glass_natural'), icon: 'default_glass',
  });
  def('iron_bars', '铁栏杆', {
    shape: 'boxes', tex: 'xpanes_pane_iron', texNames: ['xpanes_top_iron'], opaque: false, render: 'cutout', hard: 5, tool: 'pickaxe', tier: 1, pane: true, sound: 'metal', bldKind: 'conn',
    boxes: (m, nb) => bldPaneBoxes(nb, 'xpanes_pane_iron', 'xpanes_top_iron'),
  });
  for (const c of BLD.COLORS) {
    const g = 'mcl_core_glass_' + BLD.glassCol(c), top = 'xpanes_top_glass_' + BLD.glassCol(c), zh = BLD.ZH[c];
    def(c + '_stained_glass', zh + '染色玻璃', { tex: g, opaque: false, render: 'blend', hard: 0.3, drop: null, sound: 'glass' });
    def(c + '_stained_glass_pane', zh + '染色玻璃板', {
      shape: 'boxes', tex: g, texNames: [top], opaque: false, render: 'blend', hard: 0.3, drop: null, pane: true, sound: 'glass', bldKind: 'conn',
      boxes: (m, nb) => bldPaneBoxes(nb, g, top),
    });
  }
  // ---- 混凝土、混凝土粉末、陶瓦、地毯 ----
  for (const c of BLD.COLORS) {
    const zh = BLD.ZH[c], cb = BLD.cbCol(c);
    def(c + '_concrete', zh + '混凝土', { tex: 'mcl_colorblocks_concrete_' + cb, hard: 1.8, tool: 'pickaxe', tier: 1, blast: 6 });
    def(c + '_concrete_powder', zh + '混凝土粉末', { tex: 'mcl_colorblocks_concrete_powder_' + cb, hard: 0.5, tool: 'shovel', gravity: true, sound: 'sand', bldKind: 'powder', concrete: c + '_concrete' });
    def(c + '_terracotta', zh + '陶瓦', { tex: 'hardened_clay_stained_' + cb, hard: 1.25, tool: 'pickaxe', tier: 1, blast: 4 });
    def(c + '_carpet', zh + '地毯', {
      shape: 'boxes', tex: c + '_wool', opaque: false, hard: 0.1, fuel: 67, sound: 'wool', bldKind: 'carpet',
      boxes: () => [[0, 0, 0, 1, 1 / 16, 1]], iconBoxes: [[0, 0, 0, 1, 1 / 16, 1]],
    });
  }
  // ---- 梯子、藤蔓 ----
  def('ladder', '梯子', {
    shape: 'boxes', tex: 'default_ladder', solid: false, opaque: false, render: 'cutout', climbable: true, hard: 0.4, tool: 'axe', fuel: 300, bldKind: 'wallAttach',
    boxes: m => [BLD_WALL_BOX[m & 3]], icon: 'default_ladder',
  });
  def('vine', '藤蔓', {
    shape: 'boxes', tex: 'mcl_core_vine', solid: false, opaque: false, render: 'cutout', climbable: true, replaceable: true, hard: 0.2, tool: 'shears', tint: 'foliage', drop: null, bldKind: 'wallAttach', bldTick: 'vine',
    boxes: m => [BLD_WALL_BOX[m & 3]], icon: 'mcl_core_vine', iconTint: [0.42, 0.66, 0.2],
  });
  // ---- 雪层 ----
  def('snow', '雪', {
    shape: 'boxes', tex: 'snow', opaque: false, hard: 0.1, tool: 'shovel', tier: 1, sound: 'snow', bldKind: 'snow',
    boxes: m => [[0, 0, 0, 1, ((m & 7) + 1) / 8, 1]], collide: m => (m & 7) ? [[0, 0, 0, 1, (m & 7) / 8, 1]] : null,
    drop: m => ['snowball', (m & 7) + 1], iconBoxes: [[0, 0, 0, 1, 2 / 16, 1]],
  });
  BLOCKS[B.snow_block].drop = () => ['snowball', 4];
  BLOCKS[B.snow_block].tier = 1;
  // ---- 灯笼、锁链 ----
  const lanternExt = (uv) => ({ tex: f => TEX.mcl_lanterns_lantern, uv: f => uv[f] });
  const side = [0, 2, 6, 9], topUv = [0, 9, 6, 15], hside = [1, 0, 5, 2], htop = [1, 10, 5, 14];
  const bodyUv = [side, side, topUv, topUv, side, side], headUv = [hside, hside, htop, htop, hside, hside];
  const chainExt = { tex: f => f === 2 || f === 3 ? -1 : TEX.bld_chain, uv: f => f < 2 ? [5, 0, 8, 16] : [8, 0, 11, 16] };
  def('lantern', '灯笼', {
    shape: 'boxes', tex: 'mcl_lanterns_lantern', texNames: ['bld_chain'], opaque: false, render: 'cutout', hard: 3.5, tool: 'pickaxe', emit: 15, sound: 'metal', bldKind: 'lantern',
    boxes: m => (m & 1)
      ? [[5 / 16, 1 / 16, 5 / 16, 11 / 16, 8 / 16, 11 / 16, lanternExt(bodyUv)], [6 / 16, 8 / 16, 6 / 16, 10 / 16, 10 / 16, 10 / 16, lanternExt(headUv)], [6.5 / 16, 10 / 16, 6.5 / 16, 9.5 / 16, 1, 9.5 / 16, chainExt]]
      : [[5 / 16, 0, 5 / 16, 11 / 16, 7 / 16, 11 / 16, lanternExt(bodyUv)], [6 / 16, 7 / 16, 6 / 16, 10 / 16, 9 / 16, 10 / 16, lanternExt(headUv)]],
    icon: 'mcl_lanterns_lantern_inv',
  });
  def('chain', '锁链', {
    shape: 'boxes', tex: 'bld_chain', opaque: false, render: 'cutout', hard: 5, tool: 'pickaxe', tier: 1, sound: 'metal',
    boxes: () => [[6.5 / 16, 0, 6.5 / 16, 9.5 / 16, 1, 9.5 / 16, chainExt]], icon: 'mcl_lanterns_chain_inv',
  });
  // ---- 海绵、海晶石 ----
  def('sponge', '海绵', { tex: 'mcl_sponges_sponge', hard: 0.6, tool: 'hoe', sound: 'grass', bldKind: 'sponge' });
  def('wet_sponge', '湿海绵', { tex: 'mcl_sponges_sponge_wet', hard: 0.6, tool: 'hoe', sound: 'grass' });
  def('prismarine', '海晶石', { tex: 'mcl_ocean_prismarine_anim', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  def('prismarine_bricks', '海晶石砖', { tex: 'mcl_ocean_prismarine_bricks', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  def('dark_prismarine', '暗海晶石', { tex: 'mcl_ocean_prismarine_dark', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  def('sea_lantern', '海晶灯', { tex: 'mcl_ocean_sea_lantern', hard: 0.3, emit: 15, sound: 'glass', drop: () => ['prismarine_crystals', 2 + Math.floor(Math.random() * 2)] });
  // ---- 石材 ----
  for (const k in BLD.STONES) def(k, BLD.STONES[k][0], { tex: BLD.STONES[k][1], hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  def('tuff', '凝灰岩', { tex: 'mcl_deepslate_tuff', hard: 1.5, tool: 'pickaxe', tier: 1, blast: 6 });
  def('calcite', '方解石', { tex: 'mcl_amethyst_calcite_block', hard: 0.75, tool: 'pickaxe', tier: 1 });
  for (const k in BLD.STONES) {
    const [zh, t] = BLD.STONES[k];
    def(k + '_slab', zh + '台阶', { tex: t, shape: 'slab', hard: 2, tool: 'pickaxe', tier: 1 });
    def(k + '_stairs', zh + '楼梯', { tex: t, shape: 'stairs', hard: 2, tool: 'pickaxe', tier: 1 });
  }
  // ---- 紫水晶 ----
  def('amethyst_block', '紫水晶块', { tex: 'mcl_amethyst_amethyst_block', hard: 1.5, tool: 'pickaxe', sound: 'glass' });
  def('budding_amethyst', '紫水晶母岩', { tex: 'mcl_amethyst_budding_amethyst', hard: 1.5, tool: 'pickaxe', drop: null, noSilk: true, sound: 'glass', bldTick: 'budding' });
  const buds = [['small_amethyst_bud', '小型紫水晶芽', 'mcl_amethyst_amethyst_bud_small', 1], ['medium_amethyst_bud', '中型紫水晶芽', 'mcl_amethyst_amethyst_bud_medium', 2], ['large_amethyst_bud', '大型紫水晶芽', 'mcl_amethyst_amethyst_bud_large', 4], ['amethyst_cluster', '紫水晶簇', 'mcl_amethyst_amethyst_cluster', 5]];
  for (const [n, zh, t, e] of buds) {
    def(n, zh, { shape: 'cross', tex: t, hard: 1.5, tool: 'pickaxe', emit: e, sound: 'glass', drop: n === 'amethyst_cluster' ? () => ['amethyst_shard', 4] : null, bldKind: 'bud' });
  }
  def('tinted_glass', '遮光玻璃', { tex: 'mcl_amethyst_tinted_glass', opaque: false, render: 'blend', atten: 15, hard: 0.3, sound: 'glass' });
  // ---- 铜 ----
  const cuZh = ['', '斑驳的', '锈蚀的', '氧化的'];
  const cuTex = [['mcl_copper_block', 'mcl_copper_exposed', 'mcl_copper_weathered', 'mcl_copper_oxidized'], ['mcl_copper_block_cut', 'mcl_copper_exposed_cut', 'mcl_copper_weathered_cut', 'mcl_copper_oxidized_cut']];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    const n = BLD.COPPER[r][i];
    if (B[n] === undefined) def(n, cuZh[i] + (r ? '切制铜块' : '铜块'), { tex: cuTex[r][i], hard: 3, tool: 'pickaxe', tier: 2, blast: 6, sound: 'metal' });
  }
  for (const row of BLD.COPPER) row.forEach((n, i) => { BLOCKS[B[n]].bldTick = 'copper'; BLOCKS[B[n]].cuStage = i; BLOCKS[B[n]].cuRow = row; });
}

function bldItems() {
  const I = (n, zh, o) => ITEMS[n] ? ITEMS[n] : defItem(n, zh, o);
  for (const c of BLD.COLORS) I(c + '_dye', BLD.ZH[c] + '染料', { icon: 'mcl_dye_' + BLD.DYE_TEX[c] });
  I('ink_sac', '墨囊', { icon: 'mcl_mobitems_ink_sac' });
  I('cocoa_beans', '可可豆', { icon: 'mcl_cocoa_beans' });
  I('snowball', '雪球', { stack: 16, icon: 'mcl_throwing_snowball' });
  I('iron_nugget', '铁粒', { icon: 'mcl_core_iron_nugget' });
  I('amethyst_shard', '紫水晶碎片', { icon: 'mcl_amethyst_amethyst_shard' });
  I('prismarine_shard', '海晶碎片', { icon: 'mcl_ocean_prismarine_shard' });
  I('prismarine_crystals', '海晶砂粒', { icon: 'mcl_ocean_prismarine_crystals' });
  for (const c of BLD.COLORS) ITEMS[c + '_stained_glass_pane'].icon = 'mcl_core_glass_' + BLD.glassCol(c);
  ITEMS.iron_bars.icon = 'xpanes_pane_iron';
  // 剪羊毛/羊死亡掉落羊身颜色的羊毛；僵尸稀有掉落胡萝卜/马铃薯
  if (MOB_DEFS.sheep && !MOB_DEFS.sheep._bldWrap) {
    const orig = MOB_DEFS.sheep.drops;
    MOB_DEFS.sheep.drops = m => orig(m).map(d => d && d[0] === 'white_wool' && m.woolColor && ITEMS[m.woolColor + '_wool'] ? [m.woolColor + '_wool', d[1]] : d);
    MOB_DEFS.sheep._bldWrap = true;
  }
}

function bldRecipes() {
  // 额外的配方标签：任意颜色地毯
  if (!tagMatch._bld) {
    const orig = tagMatch;
    // eslint-disable-next-line no-global-assign
    tagMatch = function (tag, name) {
      if (tag === '#carpet') return !!name && name.endsWith('_carpet');
      return orig(tag, name);
    };
    tagMatch._bld = true;
  }
  for (const w in BLD.WOODS) shaped(['PSP', 'PSP'], { P: w + '_planks', S: 'stick' }, w + '_fence', 3);
  const wallSrc = { cobblestone: 'cobblestone', mossy_cobblestone: 'mossy_cobblestone', cobbled_deepslate: 'cobbled_deepslate', andesite: 'andesite', diorite: 'diorite', granite: 'granite' };
  for (const k in wallSrc) shaped(['XXX', 'XXX'], { X: wallSrc[k] }, k + '_wall', 6);
  shaped(['GGG', 'GGG'], { G: 'glass' }, 'glass_pane', 16);
  shaped(['III', 'III'], { I: 'iron_ingot' }, 'iron_bars', 16);
  // 染料
  const flower = { poppy: 'red', dandelion: 'yellow', cornflower: 'blue', allium: 'magenta', orange_tulip: 'orange', oxeye_daisy: 'light_gray', bone_meal: 'white', lapis_lazuli: 'blue', ink_sac: 'black', cocoa_beans: 'brown' };
  for (const k in flower) shapeless([k], flower[k] + '_dye', 1);
  if (ITEMS.beetroot) shapeless(['beetroot'], 'red_dye', 1);
  const D = c => c + '_dye';
  shapeless([D('red'), D('yellow')], D('orange'), 2);
  shapeless([D('purple'), D('pink')], D('magenta'), 2);
  shapeless([D('blue'), D('red'), D('pink')], D('magenta'), 3);
  shapeless([D('blue'), D('red'), D('red'), D('white')], D('magenta'), 4);
  shapeless([D('blue'), D('white')], D('light_blue'), 2);
  shapeless([D('green'), D('white')], D('lime'), 2);
  shapeless([D('red'), D('white')], D('pink'), 2);
  shapeless([D('black'), D('white')], D('gray'), 2);
  shapeless([D('gray'), D('white')], D('light_gray'), 2);
  shapeless([D('black'), D('white'), D('white')], D('light_gray'), 3);
  shapeless([D('blue'), D('green')], D('cyan'), 2);
  shapeless([D('blue'), D('red')], D('purple'), 2);
  SMELT.cactus = 'green_dye';
  // 染色
  for (const c of BLD.COLORS) {
    const d = D(c);
    shapeless([d, '#wool'], c + '_wool', 1);
    shaped(['GGG', 'GDG', 'GGG'], { G: 'glass', D: d }, c + '_stained_glass', 8);
    shaped(['GGG', 'GGG'], { G: c + '_stained_glass' }, c + '_stained_glass_pane', 16);
    shaped(['PPP', 'PDP', 'PPP'], { P: 'glass_pane', D: d }, c + '_stained_glass_pane', 8);
    shapeless([d, 'sand', 'sand', 'sand', 'sand', 'gravel', 'gravel', 'gravel', 'gravel'], c + '_concrete_powder', 8);
    shaped(['TTT', 'TDT', 'TTT'], { T: 'terracotta', D: d }, c + '_terracotta', 8);
    shaped(['WW'], { W: c + '_wool' }, c + '_carpet', 3);
    shaped(['CCC', 'CDC', 'CCC'], { C: '#carpet', D: d }, c + '_carpet', 8);
  }
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
  shapeless(['iron_ingot'], 'iron_nugget', 9);
  shaped(['NNN', 'NNN', 'NNN'], { N: 'iron_nugget' }, 'iron_ingot', 1);
  shaped(['NNN', 'NTN', 'NNN'], { N: 'iron_nugget', T: 'torch' }, 'lantern', 1);
  shaped(['N', 'I', 'N'], { N: 'iron_nugget', I: 'iron_ingot' }, 'chain', 1);
  shaped(['SS', 'SS'], { S: 'snowball' }, 'snow_block', 1);
  shaped(['BBB'], { B: 'snow_block' }, 'snow', 6);
  SMELT.wet_sponge = 'sponge';
  shaped(['SS', 'SS'], { S: 'prismarine_shard' }, 'prismarine', 1);
  shaped(['SSS', 'SSS', 'SSS'], { S: 'prismarine_shard' }, 'prismarine_bricks', 1);
  shaped(['SSS', 'SDS', 'SSS'], { S: 'prismarine_shard', D: 'black_dye' }, 'dark_prismarine', 1);
  shaped(['SCS', 'CCC', 'SCS'], { S: 'prismarine_shard', C: 'prismarine_crystals' }, 'sea_lantern', 1);
  // 石材
  shapeless(['diorite', 'cobblestone'], 'andesite', 2);
  if (ITEMS.quartz) { shaped(['CQ', 'QC'], { C: 'cobblestone', Q: 'quartz' }, 'diorite', 2); shapeless(['diorite', 'quartz'], 'granite', 1); }
  for (const k of ['andesite', 'diorite', 'granite']) shaped(['XX', 'XX'], { X: k }, 'polished_' + k, 4);
  for (const k in BLD.STONES) { shaped(['XXX'], { X: k }, k + '_slab', 6); shaped(['X  ', 'XX ', 'XXX'], { X: k }, k + '_stairs', 4); }
  shaped(['SS', 'SS'], { S: 'amethyst_shard' }, 'amethyst_block', 1);
  shaped([' S ', 'SGS', ' S '], { S: 'amethyst_shard', G: 'glass' }, 'tinted_glass', 2);
  for (const row of BLD.COPPER) for (let i = 1; i < 4; i++) if (row === BLD.COPPER[0]) shaped(['XX', 'XX'], { X: row[i] }, BLD.COPPER[1][i], 4);
  shaped(['XX', 'XX'], { X: 'copper_block' }, 'cut_copper', 4);
}

function bldTextures() {
  // 锁链：两条竖向链环（第 5..7 列与 8..10 列）
  defTex('bld_chain', p => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, [0, 0, 0], 0);
    const dark = [44, 48, 58], light = [86, 92, 106];
    for (let y = 0; y < 16; y++) {
      const ring = Math.floor(y / 4) % 2;
      for (const ox of [5, 8]) {
        const alt = ox === 5 ? ring : 1 - ring;
        if (alt) { p.set(ox, y, dark); p.set(ox + 2, y, dark); if (y % 4 === 0 || y % 4 === 3) p.set(ox + 1, y, light); }
        else p.set(ox + 1, y, (y % 2) ? dark : light);
      }
    }
  });
}

// ---------------- 方块更新 / 随机刻 ----------------
function bldWallAttachOk(w, x, y, z, id) {
  const m = w.getMeta(x, y, z) & 3, [dx, dz] = BLD.H4[m];
  if (BLD.isSolid(w.getBlock(x + dx, y, z + dz)) && BLOCKS[w.getBlock(x + dx, y, z + dz)].shape !== 'boxes') return true;
  if (id === B.vine) { const a = w.getBlock(x, y + 1, z); return a === B.vine && (w.getMeta(x, y + 1, z) & 3) === m; }
  return false;
}
function bldSpongeAbsorb(w, x, y, z) {
  const q = [[x, y, z, 0]], seen = new Set([x + ',' + y + ',' + z]);
  let n = 0;
  for (let i = 0; i < q.length && n < 65; i++) {
    const [cx, cy, cz, d] = q[i];
    for (const [dx, dy, dz] of DIRS) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = nx + ',' + ny + ',' + nz;
      if (seen.has(k)) continue; seen.add(k);
      if (w.getBlock(nx, ny, nz) !== B.water) continue;
      w.setBlock(nx, ny, nz, 0, 0, { noUpdate: true }); n++;
      if (d < 6) q.push([nx, ny, nz, d + 1]);
      if (n >= 65) break;
    }
  }
  if (!n) return false;
  w.setBlock(x, y, z, B.wet_sponge);
  // 让边界的水重新计算流动
  for (const k of seen) { const [a, b, c] = k.split(',').map(Number); if (w.getBlock(a, b, c) === B.water) w.schedule(a, b, c, 5); }
  if (w.hooks.sound) w.hooks.sound('bucket', x, y, z);
  return true;
}

function bldBlockUpdate(w, x, y, z, id) {
  const d = BLOCKS[id];
  switch (d.bldKind) {
    case 'powder':
      for (const [dx, dy, dz] of DIRS) {
        if (dy === -1) continue;
        if (w.getBlock(x + dx, y + dy, z + dz) === B.water) { w.setBlock(x, y, z, B[d.concrete]); return true; }
      }
      return false;
    case 'carpet':
      if (!w.getBlock(x, y - 1, z)) { w.breakBlock(x, y, z, true); }
      return true;
    case 'wallAttach':
      if (!bldWallAttachOk(w, x, y, z, id)) w.breakBlock(x, y, z, id === B.ladder);
      return true;
    case 'snow': {
      const bl = w.getBlock(x, y - 1, z), bd = BLOCKS[bl];
      if (!(bd.solid && (bd.shape === 'cube' || bl === B.snow && (w.getMeta(x, y - 1, z) & 7) === 7)) || bl === B.ice || bl === B.packed_ice) w.setBlock(x, y, z, 0);
      return true;
    }
    case 'lantern': {
      const hang = w.getMeta(x, y, z) & 1;
      const s = hang ? w.getBlock(x, y + 1, z) : w.getBlock(x, y - 1, z), sd = BLOCKS[s];
      if (!(sd.solid || sd.fence || sd.wall || s === B.chain)) w.breakBlock(x, y, z, true);
      return true;
    }
    case 'sponge':
      for (const [dx, dy, dz] of DIRS) if (w.getBlock(x + dx, y + dy, z + dz) === B.water) { bldSpongeAbsorb(w, x, y, z); break; }
      return true;
    case 'bud':
      if (!BLD.isSolid(w.getBlock(x, y - 1, z))) w.breakBlock(x, y, z, false);
      return true;
  }
  return false;
}

function bldRandomTick(w, x, y, z, id) {
  const d = BLOCKS[id];
  if (!d.bldTick) return false;
  if (d.bldTick === 'copper') {
    if (d.cuStage < 3 && Math.random() < 0.03) w.setBlock(x, y, z, B[d.cuRow[d.cuStage + 1]]);
    return true;
  }
  if (d.bldTick === 'vine') {
    if (Math.random() < 0.15 && y > 1 && w.getBlock(x, y - 1, z) === 0) {
      let n = 0; while (n < 8 && w.getBlock(x, y + n + 1, z) === B.vine) n++;
      if (n < 6) w.setBlock(x, y - 1, z, B.vine, w.getMeta(x, y, z) & 3);
    }
    return true;
  }
  if (d.bldTick === 'budding') {
    if (Math.random() < 0.2) {
      const a = w.getBlock(x, y + 1, z);
      const stages = [B.small_amethyst_bud, B.medium_amethyst_bud, B.large_amethyst_bud, B.amethyst_cluster];
      if (a === 0 || a === B.water) w.setBlock(x, y + 1, z, stages[0]);
      else { const i = stages.indexOf(a); if (i >= 0 && i < 3) w.setBlock(x, y + 1, z, stages[i + 1]); }
    }
    return true;
  }
  return false;
}

// ---------------- 右键交互 ----------------
function bldUseBlock(game, player, b, held) {
  const w = game.world, d = BLOCKS[b.id];
  // 斧头刮除铜的氧化层
  if (held && ITEMS[held.id] && ITEMS[held.id].tool && ITEMS[held.id].tool.type === 'axe' && d.bldTick === 'copper' && d.cuStage > 0) {
    w.setBlock(b.x, b.y, b.z, B[d.cuRow[d.cuStage - 1]]);
    game.particles.burst(b.x + 0.5, b.y + 0.5, b.z + 0.5, [120, 210, 190], 14, 1.5);
    game.audio.digSound(b.id, 1); player.damageHeld(1); player.swing = 1;
    return true;
  }
  return false;
}

function bldUseItem(game, player, b, held) {
  if (!held) return false;
  const w = game.world, id = held.id;
  if (id === 'snowball') {
    if (b && !player.sneaking && BLOCKS[b.id].interact) return false;
    game.entities.push(new BldSnowball(game, player));
    game.audio.play('bow', player.pos);
    player.consume();
    return true;
  }
  if (!b) return false;
  if (id === 'ladder' || id === 'vine') {
    const [x, y, z] = BLD.placePos(b);
    if (!BLD.canReplace(w, x, y, z)) return true;
    let m = BLD.wallMetaFromNormal(b.n);
    if (m < 0) m = BLD.wallMetaFromYaw(BLD.yawDir(player));
    const bid = B[id];
    w.setBlock(x, y, z, bid, m, { noUpdate: true });
    if (!bldWallAttachOk(w, x, y, z, bid)) { w.setBlock(x, y, z, 0, 0, { noUpdate: true }); return true; }
    w.setBlock(x, y, z, bid, m);
    game.audio.placeSound(bid); player.consume();
    return true;
  }
  if (id === 'snow' && b.id === B.snow) {
    const m = w.getMeta(b.x, b.y, b.z) & 7;
    if (m < 7) { w.setMeta(b.x, b.y, b.z, m + 1); game.audio.placeSound(B.snow); player.consume(); }
    return true;
  }
  if (id === 'lantern') {
    const [x, y, z] = BLD.placePos(b);
    if (!BLD.canReplace(w, x, y, z)) return true;
    const below = BLOCKS[w.getBlock(x, y - 1, z)], above = BLOCKS[w.getBlock(x, y + 1, z)];
    const okBelow = below.solid || below.fence || below.wall, okAbove = above.solid || above.id === B.chain;
    let hang = b.n[1] === -1 ? 1 : 0;
    if (hang && !okAbove) hang = 0;
    if (!hang && !okBelow) { if (okAbove) hang = 1; else return true; }
    return BLD.place(game, player, x, y, z, B.lantern, hang);
  }
  if (BLOCKS[B[id]] && BLOCKS[B[id]].bldKind === 'bud') {
    const [x, y, z] = BLD.placePos(b);
    if (!BLD.canReplace(w, x, y, z) || !BLD.isSolid(w.getBlock(x, y - 1, z))) return true;
    return BLD.place(game, player, x, y, z, B[id], 0);
  }
  if (BLOCKS[B[id]] && BLOCKS[B[id]].bldKind === 'carpet') {
    const [x, y, z] = BLD.placePos(b);
    if (!BLD.canReplace(w, x, y, z) || !w.getBlock(x, y - 1, z)) return true;
    return BLD.place(game, player, x, y, z, B[id], 0);
  }
  return false;
}

function bldUseMob(game, player, mob, held) {
  if (mob.type !== 'sheep' || !held) return false;
  if (held.id.endsWith('_dye') && BLD.COLORS.includes(held.id.slice(0, -4))) {
    const c = held.id.slice(0, -4);
    if (mob.sheared || (mob.woolColor || 'white') === c) return true;
    mob.woolColor = c;
    if (mob.setWoolColor) mob.setWoolColor(c);
    player.consume();
    game.particles.burst(mob.pos.x, mob.pos.y + mob.h, mob.pos.z, [255, 255, 255], 6, 1);
    return true;
  }
  if (held.id === 'shears' && !mob.sheared && !mob.small) {
    mob.setSheared(true);
    game.dropItem(mob.pos.x, mob.pos.y + 1, mob.pos.z, (mob.woolColor || 'white') + '_wool', 1 + rnd(2));
    game.audio.play('shear'); player.damageHeld(1);
    return true;
  }
  return false;
}

function bldDrops(game, player, id, meta, drops) {
  const h = player.held();
  if (id === B.vine && h && h.id === 'shears') return [['vine', 1]];
  if (id === B.amethyst_cluster) { const t = h && ITEMS[h.id] && ITEMS[h.id].tool; if (!t || t.type !== 'pickaxe') return [['amethyst_shard', 2]]; }
  return drops;
}

// ---------------- 世界生成 ----------------
function bldBlob(ch, r, cx, cy, cz, rx, ry, rz, id, from) {
  let n = 0;
  for (let y = Math.max(1, Math.floor(cy - ry)); y <= Math.min(CH - 2, Math.ceil(cy + ry)); y++)
    for (let x = Math.max(0, Math.floor(cx - rx)); x <= Math.min(15, Math.ceil(cx + rx)); x++)
      for (let z = Math.max(0, Math.floor(cz - rz)); z <= Math.min(15, Math.ceil(cz + rz)); z++) {
        const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
        if (d > 1 - r() * 0.15) continue;
        const i = idx3(x, y, z);
        if (from.includes(ch.blocks[i])) { ch.blocks[i] = id; n++; }
      }
  return n;
}
function bldGeode(w, ch, r) {
  const cx = 5 + Math.floor(r() * 6), cz = 5 + Math.floor(r() * 6), cy = 12 + Math.floor(r() * 26);
  const b = ch.blocks, R = 4.6;
  for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++) for (let z = cz - 5; z <= cz + 5; z++) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 2) continue;
    const d = Math.hypot(x - cx, (y - cy) * 1.1, z - cz) + r() * 0.3;
    if (d > R) continue;
    const i = idx3(x, y, z);
    if (b[i] === B.bedrock || b[i] === B.water || b[i] === B.lava) continue;
    if (d > R - 1) { if (b[i]) b[i] = B.calcite; }
    else if (d > R - 2) b[i] = r() < 0.12 ? B.budding_amethyst : B.amethyst_block;
    else b[i] = 0;
  }
  // 空腔里的晶簇
  for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) for (let z = cz - 4; z <= cz + 4; z++) {
    if (x < 0 || x > 15 || z < 0 || z > 15 || y < 3) continue;
    const i = idx3(x, y, z);
    if (b[i] !== 0 || b[idx3(x, y - 1, z)] !== B.budding_amethyst) continue;
    const k = r(); b[i] = k < 0.35 ? B.amethyst_cluster : k < 0.6 ? B.large_amethyst_bud : k < 0.8 ? B.medium_amethyst_bud : B.small_amethyst_bud;
  }
}
function bldGenChunk(w, ch, cols) {
  const r = mulberry32(hash3(w.seed, ch.cx, 7717, ch.cz)), stone = [B.stone];
  // 安山岩/闪长岩/花岗岩团
  for (const id of [B.andesite, B.diorite, B.granite]) {
    for (let k = 0; k < 2; k++) {
      const cx = r() * 16, cz = r() * 16, cy = 8 + r() * 64, s = 2 + r() * 1.8;
      bldBlob(ch, r, cx, cy, cz, s * (0.9 + r() * 0.4), s * (0.7 + r() * 0.3), s * (0.9 + r() * 0.4), id, stone);
    }
  }
  // 深层凝灰岩团
  for (let k = 0; k < 2; k++) bldBlob(ch, r, r() * 16, 2 + r() * 16, r() * 16, 2.5, 2, 2.5, B.tuff, [B.deepslate, B.stone]);
  // 稀有紫水晶晶洞
  if (r() < 1 / 32) bldGeode(w, ch, r);
  // 森林树干上的藤蔓
  const bio = ch.biome[8 * 16 + 8];
  if (bio === 'forest' || bio === 'dappled_forest' || bio === 'birch_forest') {
    const b = ch.blocks;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) for (let y = 64; y < 112; y++) {
      if (b[idx3(x, y, z)] !== B.oak_log) continue;
      for (let m = 0; m < 4; m++) {
        const [dx, dz] = BLD.H4[m], nx = x - dx, nz = z - dz;   // 藤蔓所在格，墙在 +H4[m]
        if (nx < 0 || nx > 15 || nz < 0 || nz > 15 || r() > 0.09) continue;
        const len = 1 + Math.floor(r() * 4);
        for (let k = 0; k < len; k++) { const i = idx3(nx, y - k, nz); if (b[i] !== 0) break; b[i] = B.vine; ch.meta[i] = m; }
      }
    }
  }
}

// ---------------- 降雪积累 ----------------
function bldSnowTick(game) {
  const w = game.world;
  if (w.dim !== 'overworld' || !game.isRaining() || w.tick % 10) return;
  const p = game.player;
  for (let k = 0; k < 6; k++) {
    const x = Math.floor(p.pos.x + (Math.random() - 0.5) * 64), z = Math.floor(p.pos.z + (Math.random() - 0.5) * 64);
    if (!w.isLoaded(x, z)) continue;
    const bio = BIOMES[w.biomeAt(x, z)];
    if (!bio || !bio.snowy) continue;
    let y = CH - 2; while (y > 1 && w.getBlock(x, y, z) === 0) y--;
    const id = w.getBlock(x, y, z);
    if (id === B.snow || !BLD.solidCube(id) || BLOCKS[id].render !== 'opaque' || id === B.ice || id === B.packed_ice) continue;
    if (w.skyLight(x, y + 1, z) < 15) continue;
    w.setBlock(x, y + 1, z, B.snow, 0);
  }
}

FEATURES.push({
  name: 'building',
  blocks: bldBlocks,
  items: bldItems,
  recipes: bldRecipes,
  textures: bldTextures,
  genChunk: bldGenChunk,
  blockUpdate: bldBlockUpdate,
  randomTick: bldRandomTick,
  useBlock: bldUseBlock,
  useItem: bldUseItem,
  useMob: bldUseMob,
  drops: bldDrops,
  tick: bldSnowTick,
});
