// 原版主世界地形生成核心：主线程（单点查询）与后台线程（整区块生成）共用
// 由 tools/build_worldgen.mjs 以字符串形式打进 assets/vanilla/worldgen.js；运行时全局有 deepslate（UMD）与 WG_DATA
/* global deepslate, WG_DATA */
var D = deepslate
var gen = null, rs = null, biomes = null, settings = null, finalDensity = null
var MIN_Y = -64, H = 384, CW = 4, CHH = 8, NX = 16 / CW + 1, NY = H / CHH + 1

var registered = false
function init (seed) {
  if (!registered) { registered = true; registerAll() }
  settings = D.NoiseGeneratorSettings.fromJson(WG_DATA.noise_settings)
  biomes = D.MultiNoiseBiomeSource.fromJson(WG_DATA.biome_parameters)
  gen = new D.NoiseChunkGenerator(biomes, settings)
  // Java 的 long 种子：网页世界种子是 32 位整数，直接扩成 BigInt
  rs = new D.RandomState(settings, BigInt(seed))
  // 去掉 Interpolated 节点（外面统一做 4x8x4 格点插值，同原版），也避免它们的缓存无限增长
  finalDensity = rs.router.finalDensity.mapAll({ apply: f => f instanceof D.DensityFunction.Interpolated ? f.input : f })
}
function registerAll () {
  const reg = (obj, fn) => { for (const k in obj) fn(D.Identifier.parse(k), obj[k]) }
  reg(WG_DATA.noise, (id, j) => D.WorldgenRegistries.NOISE.register(id, D.NormalNoise.fromJson(j)))
  reg(WG_DATA.density_function, (id, j) => D.WorldgenRegistries.DENSITY_FUNCTION.register(id, D.DensityFunction.fromJson(j)))
  reg(WG_DATA.material_rule, (id, j) => D.WorldgenRegistries.MATERIAL_RULE.register(id, D.MaterialRule.fromJson(j)))
  reg(WG_DATA.material_condition, (id, j) => D.WorldgenRegistries.MATERIAL_CONDITION.register(id, D.MaterialCondition.fromJson(j)))
  for (const b of WG_DATA.biomes) D.WorldgenRegistries.BIOME.register(D.Identifier.parse(b), {})
}

function biomeOf (qx, qy, qz) { return biomes.getBiome(qx, qy, qz, rs.sampler).toString() }

function genChunk (cx, cz) {
  const chunk = new D.Chunk(MIN_Y, H, D.ChunkPos.create(cx, cz))
  const noiseChunk = gen.createNoiseChunk(rs, chunk)
  const x0 = cx * 16, z0 = cz * 16
  // 1) 格点密度 + 三线性插值 + 含水层
  const corner = new Float64Array(NX * NY * NX)
  for (let ix = 0; ix < NX; ix++) for (let iz = 0; iz < NX; iz++) for (let iy = 0; iy < NY; iy++)
    corner[(ix * NX + iz) * NY + iy] = finalDensity.compute({ x: x0 + ix * CW, y: MIN_Y + iy * CHH, z: z0 + iz * CW })
  const C = (ix, iy, iz) => corner[(ix * NX + iz) * NY + iy]
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const ix = x >> 2, iz = z >> 2, fx = (x & 3) / CW, fz = (z & 3) / CW
    for (let y = H - 1; y >= 0; y--) {
      const iy = y >> 3, fy = (y & 7) / CHH
      const c00 = C(ix, iy, iz) * (1 - fx) + C(ix + 1, iy, iz) * fx, c01 = C(ix, iy, iz + 1) * (1 - fx) + C(ix + 1, iy, iz + 1) * fx
      const c10 = C(ix, iy + 1, iz) * (1 - fx) + C(ix + 1, iy + 1, iz) * fx, c11 = C(ix, iy + 1, iz + 1) * (1 - fx) + C(ix + 1, iy + 1, iz + 1) * fx
      const d = (c00 * (1 - fz) + c01 * fz) * (1 - fy) + (c10 * (1 - fz) + c11 * fz) * fy
      const by = MIN_Y + y
      const st = noiseChunk.aquifer.computeSubstance(x0 + x, by, z0 + z, d) ?? settings.defaultBlock
      if (!st.equals(D.BlockState.AIR)) chunk.getOrCreateSection(chunk.getSectionIndex(by)).setBlockState(x, by & 15, z, st)
    }
  }
  // 2) 地表规则（deepslate 自带的只处理 z=0 一排，这里补全 16x16）；生物群系按 4x4x4 缓存
  const bcache = new Map()
  const biomeAt = (bx, by, bz) => {
    const k = ((bx >> 2) & 3) | (((bz >> 2) & 3) << 2) | (((by >> 2) + 16) << 4)
    let b = bcache.get(k)
    if (!b) { b = biomes.getBiome(bx >> 2, by >> 2, bz >> 2, rs.sampler); bcache.set(k, b) }
    return b
  }
  const sys = rs.surfaceSystem
  const context = new D.MaterialRuleContext(sys, rs, chunk, noiseChunk, { minY: MIN_Y, height: H, seaLevel: settings.seaLevel }, null)
  context.biomeGetter = () => biomeAt(context.blockX, context.blockY, context.blockZ)
  const run = settings.materialRule.compile(context)
  const AIR = D.BlockState.AIR
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    const bx = x0 + x, bz = z0 + z
    context.updateXZ(bx, bz)
    let stoneAbove = 0, waterH = Number.MIN_SAFE_INTEGER, nextCeil = Number.MAX_SAFE_INTEGER
    for (let y = chunk.maxY; y >= chunk.minY; y--) {
      const pos = D.BlockPos.create(bx, y, bz), old = chunk.getBlockState(pos)
      if (old.equals(AIR)) { stoneAbove = 0; waterH = Number.MIN_SAFE_INTEGER; continue }
      if (old.isFluid()) { if (waterH === Number.MIN_SAFE_INTEGER) waterH = y + 1; continue }
      if (nextCeil >= y) {
        nextCeil = Number.MIN_SAFE_INTEGER
        for (let ly = y - 1; ly >= chunk.minY; ly--) { const s = chunk.getBlockState(D.BlockPos.create(bx, ly, bz)); if (s.equals(AIR) || s.isFluid()) { nextCeil = ly + 1; break } }
      }
      stoneAbove++
      context.updateY(stoneAbove, y - nextCeil + 1, waterH, y)
      const st = run(bx, y, bz); if (st) chunk.setBlockState(pos, st)
    }
  }
  // 3) 输出：调色板 + 索引（内部 y = 原版 Y + 64，下标 (y<<8)|(z<<4)|x），每列地表高度与地表/洞穴生物群系
  const palette = ['minecraft:air'], pidx = new Map([['minecraft:air', 0]])
  const data = new Uint16Array(16 * 16 * H), height = new Int16Array(256), surf = new Array(256), cave = new Array(256)
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
    let top = -1
    for (let y = H - 1; y >= 0; y--) {
      const st = chunk.getBlockState(D.BlockPos.create(x0 + x, MIN_Y + y, z0 + z))
      const n = st.getName().toString()
      let i = pidx.get(n); if (i === undefined) { i = palette.length; palette.push(n); pidx.set(n, i) }
      data[(y << 8) | (z << 4) | x] = i
      if (top < 0 && i !== 0) top = y
    }
    height[z * 16 + x] = top
    surf[z * 16 + x] = biomeAt(x0 + x, MIN_Y + Math.max(top, 0), z0 + z).toString()
    cave[z * 16 + x] = biomeAt(x0 + x, -20, z0 + z).toString()
  }
  return { palette, data, height, surf, cave }
}

// 单点查询：某一列的地面高度（原版 Y，含义同 heightmap OCEAN_FLOOR：最高的非空气非流体方块）与地表生物群系
// 与原版找结构位置的 getBaseHeight 同法：沿这一列在 8 格间隔上自上而下算最终密度，找到由负转正处再线性插值
function column (x, z) {
  let prev = null, prevY = 0
  for (let y = 320; y >= MIN_Y; y -= CHH) {
    const d = finalDensity.compute({ x, y, z })
    if (d > 0) {
      let h = y
      if (prev !== null && prev <= 0) h = Math.floor(y + (CHH * d) / (d - prev))
      return { h, biome: biomeOf(x >> 2, Math.max(h, 63) >> 2, z >> 2) }
    }
    prev = d; prevY = y
  }
  return { h: MIN_Y, biome: biomeOf(x >> 2, 16, z >> 2) }
}

// 找最近的某种生物群系（/locate biome 与选出生点用）：按 32 格步长螺旋搜索地表高度附近
function locate (target, x, z, radius) {
  const set = new Set(Array.isArray(target) ? target : [target])
  for (let r = 0; r <= radius; r += 32) {
    for (let dx = -r; dx <= r; dx += 32) for (const dz of (Math.abs(dx) === r ? range(-r, r, 32) : [-r, r])) {
      const bx = x + dx, bz = z + dz
      const b = biomeOf(bx >> 2, 16, bz >> 2)
      if (set.has(b)) return { x: bx, z: bz, biome: b }
    }
  }
  return null
}
function range (a, b, s) { const o = []; for (let v = a; v <= b; v += s) o.push(v); return o }

if (typeof window === 'undefined') self.onmessage = (e) => {
  const m = e.data
  try {
    if (m.type === 'init') { init(m.seed); self.postMessage({ type: 'ready' }); return }
    if (m.type === 'gen') {
      const r = genChunk(m.cx, m.cz)
      self.postMessage({ type: 'chunk', id: m.id, cx: m.cx, cz: m.cz, ...r }, [r.data.buffer, r.height.buffer])
      return
    }
    if (m.type === 'biome') { self.postMessage({ type: 'biome', id: m.id, biome: biomeOf(m.x >> 2, m.y >> 2, m.z >> 2) }); return }
    if (m.type === 'locate') { self.postMessage({ type: 'locate', id: m.id, result: locate(m.target, m.x, m.z, m.radius || 3200) }); return }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.stack || err) })
  }
}
