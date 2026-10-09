'use strict';
// ---------- 区块网格生成：面剔除、平滑光照、环境光遮蔽 ----------

// 每个面四个角（从外侧看逆时针：左下、右下、右上、左上）
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], // +X
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], // -X
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], // +Y
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], // -Y
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], // +Z
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], // -Z
];
const FACE_SHADE = [0.6, 0.6, 1.0, 0.5, 0.8, 0.8];
const FACE_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

let OPQ = null, SHAPE = null;
function initMesherTables() {
  OPQ = new Uint8Array(65536); SHAPE = [];
  for (const d of BLOCKS) { OPQ[d.id] = d.opaque ? 1 : 0; SHAPE[d.id] = d.shape; }
}

// 方块的盒子形状。nb(dx,dy,dz) 可选，返回相邻方块 id（用于栅栏、玻璃板、红石线等连接形状）。
// 每个盒子是 [x0,y0,z0,x1,y1,z1, 可选 {tex:(face)=>纹理索引, tint:[r,g,b], uv:(face)=>[px0,py0,px1,py1]}]
function shapeBoxes(id, meta, nb) {
  const s = SHAPE[id];
  switch (s) {
    case 'boxes': return BLOCKS[id].boxes(meta, nb || NB_NONE, id);
    case 'slab': return meta & 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
    case 'stairs': {
      const top = [[0, 0.5, 0.5, 1, 1, 1], [0, 0.5, 0, 0.5, 1, 1], [0, 0.5, 0, 1, 1, 0.5], [0.5, 0.5, 0, 1, 1, 1]][meta & 3];
      return [[0, 0, 0, 1, 0.5, 1], top];
    }
    case 'bed': return [[0, 0, 0, 1, 9 / 16, 1]];
    case 'cushion': return [[1 / 16, 0, 1 / 16, 15 / 16, 5 / 16, 15 / 16]];
    case 'farmland': return [[0, 0, 0, 1, 15 / 16, 1]];
    case 'cactus': return [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]];
    case 'torch': {
      // meta 0 立在地上；1-4 插在墙上（1:墙在 -X 2:+X 3:-Z 4:+Z），离墙 1/16、抬高 3/16
      const m = meta & 7;
      if (!m) return [[7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16]];
      const c = [[1.5 / 16, 8 / 16], [14.5 / 16, 8 / 16], [8 / 16, 1.5 / 16], [8 / 16, 14.5 / 16]][m - 1];
      return [[c[0] - 1 / 16, 3 / 16, c[1] - 1 / 16, c[0] + 1 / 16, 13 / 16, c[1] + 1 / 16]];
    }
    case 'cross': return id === B.campfire ? [[0, 0, 0, 1, 7 / 16, 1]] : [[0.15, 0, 0.15, 0.85, 0.8, 0.85]];
    case 'liquid': return [[0, 0, 0, 1, 0.9, 1]];
    case 'air': return [];
    default: return [[0, 0, 0, 1, 1, 1]];
  }
}
const NB_NONE = () => 0;
function collisionBoxes(id, meta, nb) {
  const d = BLOCKS[id];
  if (d.collide) return d.collide(meta, nb || NB_NONE, id);
  if (!d.solid) return null;
  return shapeBoxes(id, meta, nb);
}
// 世界坐标处的邻居访问器
function worldNB(world, x, y, z) { return (dx, dy, dz) => world.getBlock(x + dx, y + dy, z + dz); }

class MeshBuf {
  constructor() { this.pos = []; this.uv = []; this.light = []; this.ao = []; this.tint = []; this.idx = []; this.n = 0; }
  quad(p, uv, li, ao, tint, flip) {
    const n = this.n;
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k * 3], p[k * 3 + 1], p[k * 3 + 2]);
      this.uv.push(uv[k * 2], uv[k * 2 + 1]);
      this.light.push(li[k * 2], li[k * 2 + 1]);
      this.ao.push(ao[k]);
      this.tint.push(tint[0], tint[1], tint[2]);
    }
    if (flip) this.idx.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
    else this.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
    this.n += 4;
  }
  geometry() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.light, 2));
    g.setAttribute('aAO', new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const PW = 18, PH = CH + 2;
const padB = new Uint16Array(PW * PW * PH), padL = new Uint8Array(PW * PW * PH), padM = new Uint8Array(PW * PW * PH);
const pidx = (x, y, z) => ((y + 1) * PW + (z + 1)) * PW + (x + 1);
const WHITE = [1, 1, 1];

function neighborsReady(world, cx, cz) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (!world.getChunk(cx + dx, cz + dz)) return false;
  return true;
}

function buildChunkMesh(world, ch) {
  const cx = ch.cx, cz = ch.cz;
  // 填充带一圈邻居的数据
  for (let z = -1; z <= 16; z++) for (let x = -1; x <= 16; x++) {
    const c = world.getChunk(cx + (x < 0 ? -1 : x > 15 ? 1 : 0), cz + (z < 0 ? -1 : z > 15 ? 1 : 0));
    const lx = x & 15, lz = z & 15;
    let p = pidx(x, -1, z);
    padB[p] = B.bedrock; padL[p] = 0; padM[p] = 0;
    for (let y = 0; y < CH; y++) {
      p = pidx(x, y, z); const i = idx3(lx, y, lz);
      padB[p] = c.blocks[i]; padL[p] = c.light[i]; padM[p] = c.meta[i];
    }
    p = pidx(x, CH, z); padB[p] = 0; padL[p] = world.hasSky ? 0xf0 : 0; padM[p] = 0;
  }
  const bufs = { opaque: new MeshBuf(), cutout: new MeshBuf(), liquid: new MeshBuf(), blend: new MeshBuf() };
  const P = new Float32Array(12), UV = new Float32Array(8), LI = new Float32Array(8), AO = new Float32Array(4);
  const SY = PW * PW, SZ = PW;
  const strideOf = [1, -1, SY, -SY, SZ, -SZ];

  ch.bes = []; // 方块实体（箱子等）不进区块网格，由独立模型渲染
  for (let y = 0; y < CH; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const p = pidx(x, y, z), id = padB[p];
    if (!id) continue;
    const def = BLOCKS[id], shape = def.shape, meta = padM[p];
    if (def.be) { ch.bes.push([ch.cx * 16 + x, y, ch.cz * 16 + z, id, meta]); continue; }
    const buf = bufs[def.render] || bufs.opaque;
    const biome = BIOMES[ch.biome[z * 16 + x]] || BIOMES.plains;
    let tint = WHITE;
    if (def.tint === 'foliage') tint = biome.foliage.map(v => v / 255 * 1.15);
    else if (def.tint === 'grass') tint = biome.grass.map(v => v / 255 * 1.12);

    if (shape === 'cube') {
      for (let f = 0; f < 6; f++) {
        const np = p + strideOf[f], nid = padB[np];
        if (OPQ[nid]) continue;
        if (nid === id) continue;
        // 半透明方块之间不画接触面；但冰/玻璃贴着液体时要画（液体那侧不画，见 emitLiquid）
        if (!def.opaque && nid && BLOCKS[nid].render === def.render && def.render === 'blend' && BLOCKS[nid].shape !== 'liquid') continue;
        const t = texOf(def, f, meta);
        const uv = tileUV(t);
        const faceTint = (def.tint === 'grass' && f !== 2) ? WHITE : tint;
        const fc = FACE_CORNERS[f], dir = DIRS[f];
        const nAxis = f >> 1;
        const ua = nAxis === 0 ? 1 : 0, va = nAxis === 2 ? 1 : 2;
        for (let k = 0; k < 4; k++) {
          const c = fc[k];
          P[k * 3] = x + c[0]; P[k * 3 + 1] = y + c[1]; P[k * 3 + 2] = z + c[2];
          UV[k * 2] = FACE_UV[k][0] ? uv.u1 : uv.u0; UV[k * 2 + 1] = FACE_UV[k][1] ? uv.v1 : uv.v0;
          // AO 与平滑光照
          const su = c[ua] ? 1 : -1, sv = c[va] ? 1 : -1;
          const o = [0, 0, 0]; o[ua] = su;
          const o2 = [0, 0, 0]; o2[va] = sv;
          const bx = x + dir[0], by = y + dir[1], bz = z + dir[2];
          const p1 = pidx(bx + o[0], by + o[1], bz + o[2]);
          const p2 = pidx(bx + o2[0], by + o2[1], bz + o2[2]);
          const p3 = pidx(bx + o[0] + o2[0], by + o[1] + o2[1], bz + o[2] + o2[2]);
          const s1 = OPQ[padB[p1]], s2 = OPQ[padB[p2]], s3 = OPQ[padB[p3]];
          const occ = s1 && s2 ? 3 : s1 + s2 + s3;
          AO[k] = (1 - occ * 0.2) * FACE_SHADE[f];
          let sl = padL[np] >> 4, bl = padL[np] & 15, cnt = 1;
          if (!s1) { sl += padL[p1] >> 4; bl += padL[p1] & 15; cnt++; }
          if (!s2) { sl += padL[p2] >> 4; bl += padL[p2] & 15; cnt++; }
          if (!s3 && !(s1 && s2)) { sl += padL[p3] >> 4; bl += padL[p3] & 15; cnt++; }
          LI[k * 2] = sl / cnt / 15; LI[k * 2 + 1] = bl / cnt / 15;
        }
        const flip = AO[0] + AO[2] < AO[1] + AO[3];
        buf.quad(P, UV, LI, AO, faceTint, flip);
      }
    } else if (shape === 'cross') {
      const t = texOf(def, 0, meta), uv = tileUV(t);
      const sl = (padL[p] >> 4) / 15, bl = Math.max(padL[p] & 15, def.emit) / 15;
      // 草花随机偏移更自然；甘蔗等逐格叠高的植物不偏移
      const jit = def.plant && !def.crop && id !== B.sugar_cane && !def.noOffset;
      const ox = jit ? (rand3(7, x + cx * 16, y, z + cz * 16) - 0.5) * 0.3 : 0;
      const oz = jit ? (rand3(9, x + cx * 16, y, z + cz * 16) - 0.5) * 0.3 : 0;
      const h = id === B.campfire ? 0.9 : 1;
      const quads = [[[0.15, 0, 0.15], [0.85, 0, 0.85]], [[0.85, 0, 0.15], [0.15, 0, 0.85]]];
      for (const [a, b] of quads) {
        P.set([x + a[0] + ox, y, z + a[2] + oz, x + b[0] + ox, y, z + b[2] + oz, x + b[0] + ox, y + h, z + b[2] + oz, x + a[0] + ox, y + h, z + a[2] + oz]);
        UV.set([uv.u0, uv.v0, uv.u1, uv.v0, uv.u1, uv.v1, uv.u0, uv.v1]);
        for (let k = 0; k < 4; k++) { LI[k * 2] = sl; LI[k * 2 + 1] = bl; AO[k] = 0.9; }
        buf.quad(P, UV, LI, AO, tint, false);
      }
    } else if (shape === 'liquid') {
      emitLiquid(bufs.liquid, x, y, z, p, id, def, P, UV, LI, AO);
    } else {
      // 其余非完整方块：按盒子绘制
      const nb = (dx, dy, dz) => padB[p + dx + dy * SY + dz * SZ];
      const boxes = shapeBoxes(id, meta, nb);
      for (const bx of boxes) emitBox(buf, x, y, z, p, def, meta, bx, P, UV, LI, AO, tint);
    }
  }
  return bufs;
}

function emitBox(buf, x, y, z, p, def, meta, b, P, UV, LI, AO, tint) {
  const [x0, y0, z0, x1, y1, z1] = b;
  const ext = b[6];
  if (ext && ext.tint) tint = ext.tint;
  const strideOf = [1, -1, PW * PW, -PW * PW, PW, -PW];
  for (let f = 0; f < 6; f++) {
    const atEdge = (f === 0 && x1 === 1) || (f === 1 && x0 === 0) || (f === 2 && y1 === 1) || (f === 3 && y0 === 0) || (f === 4 && z1 === 1) || (f === 5 && z0 === 0);
    const np = p + strideOf[f];
    if (atEdge && OPQ[padB[np]] && !(ext && ext.noCull)) continue;
    if (ext && ext.faces && !ext.faces[f]) continue;
    const t = ext && ext.tex ? ext.tex(f) : texOf(def, f, meta);
    if (t < 0) continue;
    let px0, px1, py0, py1;
    if (f < 2) { px0 = z0 * 16; px1 = z1 * 16; py0 = (1 - y1) * 16; py1 = (1 - y0) * 16; }
    else if (f < 4) { px0 = x0 * 16; px1 = x1 * 16; py0 = z0 * 16; py1 = z1 * 16; }
    else { px0 = x0 * 16; px1 = x1 * 16; py0 = (1 - y1) * 16; py1 = (1 - y0) * 16; }
    if (def.shape === 'torch') {
      if (f >= 2 && f < 4) { px0 = 7; px1 = 9; py0 = 6; py1 = 8; } else { px0 = 7; px1 = 9; py0 = 6; py1 = 16; }
    }
    if (ext && ext.uv) { const u = ext.uv(f); if (u) { px0 = u[0]; py0 = u[1]; px1 = u[2]; py1 = u[3]; } }
    const uv = tileUV(t, px0, py0, px1, py1);
    const lp = atEdge && !OPQ[padB[np]] ? np : p;
    const sl = Math.max(padL[lp] >> 4, padL[p] >> 4) / 15, bl = Math.max(padL[lp] & 15, padL[p] & 15, def.emit) / 15;
    const fc = FACE_CORNERS[f];
    for (let k = 0; k < 4; k++) {
      const c = fc[k];
      P[k * 3] = x + (c[0] ? x1 : x0); P[k * 3 + 1] = y + (c[1] ? y1 : y0); P[k * 3 + 2] = z + (c[2] ? z1 : z0);
      UV[k * 2] = FACE_UV[k][0] ? uv.u1 : uv.u0; UV[k * 2 + 1] = FACE_UV[k][1] ? uv.v1 : uv.v0;
      LI[k * 2] = sl; LI[k * 2 + 1] = bl; AO[k] = FACE_SHADE[f];
    }
    buf.quad(P, UV, LI, AO, tint, false);
  }
}

function liquidHeightAt(p, id) {
  if (padB[p] !== id) return -1;
  if (padB[p + PW * PW] === id) return 1;
  const m = padM[p];
  if (m & 8) return 0.92;
  const l = m & 7;
  return l === 0 ? 0.89 : Math.max(0.12, (8 - l) / 9);
}

function emitLiquid(buf, x, y, z, p, id, def, P, UV, LI, AO) {
  const SY = PW * PW;
  const above = padB[p + SY] === id;
  // 四个角的高度：取共享该角的 4 个格子的平均
  const ch = (dx, dz) => {
    if (above) return 1;
    let s = 0, n = 0;
    for (const [ox, oz] of [[0, 0], [dx, 0], [0, dz], [dx, dz]]) {
      const q = p + ox + oz * PW;
      if (padB[q + SY] === id) return 1;
      const h = liquidHeightAt(q, id);
      if (h >= 0) { s += h; n++; } else if (!OPQ[padB[q]]) { n += 0.25; }
    }
    return n ? s / n : 0.89;
  };
  const h00 = ch(-1, -1), h10 = ch(1, -1), h11 = ch(1, 1), h01 = ch(-1, 1);
  const uv = tileUV(texOf(def, 2, 0));
  const strideOf = [1, -1, SY, -SY, PW, -PW];
  for (let f = 0; f < 6; f++) {
    const np = p + strideOf[f], nid = padB[np];
    if (nid === id) continue;
    if (f !== 2 && OPQ[nid]) continue;
    if (f === 2 && above) continue;
    const sl = (padL[np] >> 4) / 15, bl = Math.max(padL[np] & 15, def.emit) / 15;
    const fc = FACE_CORNERS[f];
    for (let k = 0; k < 4; k++) {
      const c = fc[k];
      let hy = c[1];
      if (c[1] === 1) hy = c[0] ? (c[2] ? h11 : h10) : (c[2] ? h01 : h00);
      P[k * 3] = x + c[0]; P[k * 3 + 1] = y + hy; P[k * 3 + 2] = z + c[2];
      UV[k * 2] = FACE_UV[k][0] ? uv.u1 : uv.u0;
      UV[k * 2 + 1] = f === 2 || f === 3 ? (FACE_UV[k][1] ? uv.v1 : uv.v0) : uv.v0 + (uv.v1 - uv.v0) * hy;
      LI[k * 2] = sl; LI[k * 2 + 1] = bl; AO[k] = FACE_SHADE[f];
    }
    buf.quad(P, UV, LI, AO, WHITE, false);
    // 半透明材质只画正面：液体额外补一份反面，水下往外看也能看到水面
    for (let k = 0; k < 2; k++) {
      const a = k, b = 3 - k;
      for (let j = 0; j < 3; j++) { const t = P[a * 3 + j]; P[a * 3 + j] = P[b * 3 + j]; P[b * 3 + j] = t; }
      for (let j = 0; j < 2; j++) { let t = UV[a * 2 + j]; UV[a * 2 + j] = UV[b * 2 + j]; UV[b * 2 + j] = t; t = LI[a * 2 + j]; LI[a * 2 + j] = LI[b * 2 + j]; LI[b * 2 + j] = t; }
      const t = AO[a]; AO[a] = AO[b]; AO[b] = t;
    }
    buf.quad(P, UV, LI, AO, WHITE, false);
  }
}
