'use strict';
// ---------- 游戏主循环、渲染、天空、区块调度、生成、存档 ----------

const VERT = `
attribute vec2 aLight; attribute float aAO; attribute vec3 aTint;
varying vec2 vUv; varying vec2 vLight; varying float vAO; varying vec3 vTint; varying float vDist;
void main() {
  vUv = uv; vLight = aLight; vAO = aAO; vTint = aTint;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D map; uniform float uSkyDarken; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
uniform float uAlphaTest; uniform float uOpacity; uniform float uGamma; uniform float uAmbient;
varying vec2 vUv; varying vec2 vLight; varying float vAO; varying vec3 vTint; varying float vDist;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < uAlphaTest) discard;
  float sl = max(vLight.x * 15.0 - uSkyDarken, 0.0);
  float bl = vLight.y * 15.0;
  float sb = pow(0.82, 15.0 - sl);
  float bb = pow(0.82, 15.0 - bl);
  vec3 lc = max(vec3(sb), vec3(bb, bb * 0.9, bb * 0.75));
  lc = max(lc, vec3(uAmbient));
  lc = mix(lc, sqrt(lc), uGamma);
  vec3 c = t.rgb * vTint * lc * vAO;
  float f = smoothstep(uFogNear, uFogFar, vDist);
  gl_FragColor = vec4(mix(c, uFogColor, f), t.a * uOpacity);
}`;

// 原版物品模型的第一人称右手显示变换（取自 models/item/generated、handheld、handheld_rod、block/block 的 firstperson_righthand）
const HAND_DISPLAY = {
  generated: [[0, -90, 25], [1.13, 3.2, 1.13], 0.68],
  handheld: [[0, -90, 25], [1.13, 3.2, 1.13], 0.68],
  rod: [[0, 90, 25], [0, 1.6, 0.8], 0.68],
  block: [[0, 45, 0], [0, 0, 0], 0.4],
};
const HAND_HANDHELD = /_(sword|pickaxe|axe|shovel|hoe|spear)$|^(stick|blaze_rod|breeze_rod|bone|fishing_rod|carrot_on_a_stick|warped_fungus_on_a_stick|trident|mace|bamboo)$/;
// 原版手持平面物品是 1 像素厚的挤出模型：前后两面 + 每个不透明像素露在外面的侧边
const EXTRUDE_CACHE = new Map();
function extrudedItemMesh(name) {
  let geo = EXTRUDE_CACHE.get(name);
  if (!geo) {
    const cv = iconCanvas(name), N = 16, k = cv.width / N;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const op = (x, y) => x >= 0 && y >= 0 && x < N && y < N && d[(Math.floor(y * k + k / 2) * cv.width + Math.floor(x * k + k / 2)) * 4 + 3] > 127;
    const pos = [], uv = [], idx = [], t = 0.5 / 16;
    const quad = (pts, u, v) => { const n = pos.length / 3; for (let i = 0; i < 4; i++) { pos.push(...pts[i]); uv.push(u[i], v[i]); } idx.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    quad([[-0.5, -0.5, t], [0.5, -0.5, t], [0.5, 0.5, t], [-0.5, 0.5, t]], [0, 1, 1, 0], [0, 0, 1, 1]);
    quad([[0.5, -0.5, -t], [-0.5, -0.5, -t], [-0.5, 0.5, -t], [0.5, 0.5, -t]], [1, 0, 0, 1], [0, 0, 1, 1]);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (!op(x, y)) continue;
      const x0 = x / N - 0.5, x1 = (x + 1) / N - 0.5, y0 = 0.5 - (y + 1) / N, y1 = 0.5 - y / N;
      const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N, U = [u, u, u, u], V = [v, v, v, v];
      if (!op(x - 1, y)) quad([[x0, y0, -t], [x0, y0, t], [x0, y1, t], [x0, y1, -t]], U, V);
      if (!op(x + 1, y)) quad([[x1, y0, t], [x1, y0, -t], [x1, y1, -t], [x1, y1, t]], U, V);
      if (!op(x, y - 1)) quad([[x0, y1, t], [x1, y1, t], [x1, y1, -t], [x0, y1, -t]], U, V);
      if (!op(x, y + 1)) quad([[x0, y0, -t], [x1, y0, -t], [x1, y0, t], [x0, y0, t]], U, V);
    }
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    EXTRUDE_CACHE.set(name, geo);
  }
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: iconTexture(name), transparent: true, alphaTest: 0.3 }));
}

class Game {
  constructor() {
    this.settings = Object.assign({ renderDist: 6, fov: 70, sens: 0.5, gamma: 0.5, vol: 0.6, music: 0.35, bob: true, clouds: true, minimap: true, minimapSize: 'medium', minimapZoom: 1, minimapRotate: false, minimapMobs: true, coords: true, showFps: false, guiScale: 1, particles: 0, autoJump: false, invertY: false, toggleSneak: false, weatherVol: 1 }, this.loadSettings());
    this.stats = {};
    this.input = { keys: new Set(), mouse: [false, false, false], mouseClicked: [false, false, false] };
    this.state = 'title'; this.time = 1000; this.tickAcc = 0; this.fps = 0; this.frames = 0; this.fpsT = 0;
    this.mobs = []; this.entities = []; this.rules = { keepInventory: false };
    this.showDebug = false; this.thirdPerson = false; this.skyDarken = 0; this.chunksRendered = 0;
    this.audio = new SoundSystem(); this.ui = new UI(this);
  }
  loadSettings() { try { return JSON.parse(localStorage.getItem('webcraft.settings') || '{}'); } catch (e) { return {}; } }
  saveSettings() { try { localStorage.setItem('webcraft.settings', JSON.stringify(this.settings)); } catch (e) { } }

  async init() {
    this.ui.loadingEarly('正在载入素材...', 0);
    await loadPackImages(f => this.ui.loadingEarly('正在载入素材...', Math.round(f * 100)));
    initBlocks();
    for (const f of FEATURES) if (f.blocks) f.blocks();
    for (const f of FEATURES) if (f.items) f.items();
    initRecipes();
    for (const f of FEATURES) if (f.recipes) f.recipes();
    buildTextures();
    for (const f of FEATURES) if (f.textures) f.textures();
    collectBlockTextures();
    // 非完整方块一律不遮挡相邻面与光（否则贴着它的方块面会被剔除，出现透视）
    for (const d of BLOCKS) if (d.shape !== 'cube' && d.opaque) d.opaque = false;
    buildAtlas(); initMesherTables();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight); r.autoClear = false;
    document.getElementById('game').appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, innerWidth / innerHeight, 0.05, 1200);
    this.camera.rotation.order = 'YXZ';
    this.scene.fog = new THREE.Fog(0x9cc4ff, 60, 100);
    // 区块材质
    this.uni = { map: { value: ATLAS.texture }, uSkyDarken: { value: 0 }, uFogColor: { value: new THREE.Color(0x9cc4ff) }, uFogNear: { value: 60 }, uFogFar: { value: 100 }, uGamma: { value: 0.5 }, uAmbient: { value: 0.025 } };
    const mk = (alphaTest, opacity, opts) => new THREE.ShaderMaterial(Object.assign({ vertexShader: VERT, fragmentShader: FRAG, uniforms: Object.assign({}, this.uni, { uAlphaTest: { value: alphaTest }, uOpacity: { value: opacity } }) }, opts || {}));
    this.mat = {
      opaque: mk(0.0, 1),
      cutout: mk(0.5, 1, { side: THREE.DoubleSide }),
      // 液体先画且不写深度；冰/玻璃后画并写深度，保证冰盖在水面之上（跨区块也不会错序）
      liquid: mk(0.01, 1, { transparent: true, depthWrite: false }),
      blend: mk(0.01, 1, { transparent: true }),
    };
    // 共享 uniform 对象，更新一处即可
    for (const k in this.mat) for (const u in this.uni) this.mat[k].uniforms[u] = this.uni[u];
    this.buildSky();
    this.buildWeather();
    this.buildHand();
    // 选中框与裂纹
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.selBox = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 }));
    this.selBox.visible = false; this.scene.add(this.selBox);
    this.crackGeo = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    this.crack = new THREE.Mesh(this.crackGeo, new THREE.MeshBasicMaterial({ map: ATLAS.texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    this.crack.visible = false; this.crack.renderOrder = 2; this.scene.add(this.crack);
    this.crackStage = -1;
    this.particles = new Particles(this.scene);
    this.ui.init();
    this.bindInput();
    addEventListener('resize', () => { this.renderer.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.handCam.aspect = this.camera.aspect; this.handCam.updateProjectionMatrix(); });
    addEventListener('beforeunload', () => { if (this.worldMeta && this.state !== 'title') this.save(); });
    this.applySettings();
    this.startTitle();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  // ---------------- 天空 ----------------
  buildSky() {
    const sq = (c1, c2, size) => {
      const cv = document.createElement('canvas'); cv.width = cv.height = 32; const x = cv.getContext('2d');
      x.fillStyle = c2; x.fillRect(0, 0, 32, 32); x.fillStyle = c1; x.fillRect(4, 4, 24, 24);
      const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter;
      return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    };
    this.sun = sq('#fffbe0', 'rgba(255,230,120,0.4)', 60); this.moon = sq('#dfe6f0', 'rgba(160,170,200,0.25)', 40);
    this.sun.renderOrder = this.moon.renderOrder = -1;
    this.scene.add(this.sun); this.scene.add(this.moon);
    const sp = [], r = mulberry32(42);
    for (let i = 0; i < 1500; i++) { const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u); sp.push(s * Math.cos(th) * 500, u * 500, s * Math.sin(th) * 500); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
    this.scene.add(this.stars);
    // 云
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const cx = cv.getContext('2d'), n = new Noise(7);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = n.n2(x / 9, y / 9) + n.n2(x / 4, y / 4) * 0.3;
      if (v > 0.42) { cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.fillRect(x, y, 1, 1); }
    }
    const ct = new THREE.CanvasTexture(cv); ct.magFilter = THREE.NearestFilter; ct.minFilter = THREE.NearestFilter; ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(3, 3);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(1536, 1536), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, opacity: 0.8 }));
    this.clouds.rotation.x = -Math.PI / 2; this.clouds.position.y = 192 + 64; this.scene.add(this.clouds); // 原版云层 Y=192（内部 +64）
  }
  isDay() { const t = this.time % 24000; return t < 12300 || t > 23700; }
  isRaining() { return this.weather && this.weather.rain && this.world && this.world.dim === 'overworld'; }
  updateSky() {
    const info = DIM_INFO[this.world.dim] || DIM_INFO.overworld;
    const t = (this.time % 24000) / 24000, th = t * Math.PI * 2, s = Math.sin(th);
    const day = clamp(s * 2.5 + 0.55, 0, 1);
    const p = this.player, cam = this.camera.position, wl = this.weather.level, tl = this.weather.thunderLevel;
    const rd = this.settings.renderDist * 16;
    let fogC, near = rd * 0.55, far = rd * 0.95, dusk = 0;
    if (info.sky) {
      this.skyDarken = Math.min(12, (1 - day) * 11 + wl * 3 + tl * 2);
      const dayC = new THREE.Color(0x87b4ff), nightC = new THREE.Color(0x05070f), duskC = new THREE.Color(0xe8865a);
      fogC = nightC.clone().lerp(dayC, day);
      dusk = Math.max(0, 1 - Math.abs(s) * 5) * 0.55 * (1 - wl);
      fogC.lerp(duskC, dusk * (day > 0.1 ? 1 : day * 10));
      const g = (fogC.r + fogC.g + fogC.b) / 3;
      fogC.lerp(new THREE.Color(g, g, g), wl * 0.7).multiplyScalar(1 - wl * 0.3 - tl * 0.3);
      if (wl > 0) { near *= 1 - wl * 0.4; far *= 1 - wl * 0.25; }
    } else {
      this.skyDarken = 0;
      fogC = new THREE.Color(info.fog);
      near = rd * (info.fogNear || 0.5); far = rd * (info.fogFar || 1);
    }
    if (this.flash > 0) fogC.lerp(new THREE.Color(0xffffff), Math.min(1, this.flash) * 0.6);
    const eyeId = this.world.getBlock(Math.floor(cam.x), Math.floor(cam.y), Math.floor(cam.z));
    if (eyeId === B.water) { fogC = new THREE.Color(0x0a2a6a).multiplyScalar(0.3 + 0.7 * day); near = 1; far = 28; }
    else if (eyeId === B.lava) { fogC = new THREE.Color(0xc04000); near = 0; far = effLv(p, 'fire_resistance') ? 8 : 2.5; }
    if (effLv(p, 'blindness')) { fogC = new THREE.Color(0); near = 1; far = 7; }
    const nv = effLv(p, 'night_vision');
    this.renderer.setClearColor(fogC);
    this.uni.uFogColor.value.copy(fogC); this.uni.uFogNear.value = near; this.uni.uFogFar.value = far;
    this.uni.uSkyDarken.value = nv ? 0 : this.skyDarken; this.uni.uGamma.value = nv ? 1 : this.settings.gamma;
    this.uni.uAmbient.value = (info.ambient || 0.025) + (nv ? 0.6 : 0) + (this.flash > 0 ? this.flash * 0.3 : 0);
    this.scene.fog.color.copy(fogC); this.scene.fog.near = near; this.scene.fog.far = far;
    const showSky = info.sky && eyeId !== B.water;
    this.sun.visible = this.moon.visible = showSky; this.stars.visible = showSky;
    const dir = new THREE.Vector3(Math.cos(th), Math.sin(th), 0.15).normalize();
    this.sun.position.copy(cam).addScaledVector(dir, 400); this.sun.lookAt(cam);
    this.moon.position.copy(cam).addScaledVector(dir, -400); this.moon.lookAt(cam);
    this.sun.material.opacity = this.moon.material.opacity = 1 - wl;
    this.stars.position.copy(cam); this.stars.rotation.z = th; this.stars.material.opacity = Math.max(0, 1 - day * 1.6) * (1 - wl);
    this.clouds.visible = this.settings.clouds && info.sky;
    this.clouds.position.x = cam.x; this.clouds.position.z = cam.z;
    this.clouds.material.map.offset.set((cam.x + this.time * 0.03) / 512, -cam.z / 512);
    const cb = (0.25 + day * 0.75) * (1 - wl * 0.45); this.clouds.material.color.setRGB(cb, cb, cb * (1 + dusk * 0.1));
    if (info.update) info.update(this);
  }

  // ---------------- 天气：雨、雪、雷暴 ----------------
  buildWeather() {
    this.weather = { rain: false, thunder: false, timer: 12000 + Math.floor(Math.random() * 60000), level: 0, thunderLevel: 0, boltT: 10 };
    // 原版做法：玩家周围半径 10 的每一列立一张贴着降水贴图的竖直面片，贴图向下滚动，越远越淡
    const R = this.precipR = 10, N = (2 * R + 1) * (2 * R + 1);
    const mk = (texName, fallback) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 12), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(N * 8), 2));
      g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(N * 4), 1));
      const idx = new Uint16Array(N * 6);
      for (let i = 0; i < N; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const src = (typeof packCanvas === 'function' && PACK_READY && packCanvas(texName)) || fallback();
      const t = new THREE.CanvasTexture(src); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const mat = new THREE.ShaderMaterial({
        uniforms: { map: { value: t }, uBright: { value: 1 } },
        vertexShader: 'attribute float aAlpha; varying vec2 vUv; varying float vA; void main(){ vUv = uv; vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform float uBright; varying vec2 vUv; varying float vA; void main(){ vec4 c = texture2D(map, vUv); float a = c.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(c.rgb * uBright, a); }',
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.renderOrder = 3; this.scene.add(m);
      m.userData.tex = texName; m.userData.real = !!(typeof packCanvas === 'function' && PACK_READY && packCanvas(texName));
      return m;
    };
    // 没有原版素材时的程序贴图（64x256，与原版同尺寸）
    const procTex = (snow) => () => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 256; const c = cv.getContext('2d'), r = mulberry32(snow ? 77 : 33);
      for (let i = 0; i < (snow ? 160 : 70); i++) {
        const x = Math.floor(r() * 64), y = Math.floor(r() * 256);
        if (snow) { c.fillStyle = `rgba(255,255,255,${0.7 + r() * 0.3})`; const s = r() < 0.3 ? 2 : 1; c.fillRect(x, y, s, s); }
        else { c.fillStyle = 'rgba(150,170,230,0.75)'; c.fillRect(x, y, 1, 6 + Math.floor(r() * 10)); }
      }
      return cv;
    };
    this.rainMesh = mk('weather_rain', procTex(false));
    this.snowMesh = mk('weather_snow', procTex(true));
    this.flash = 0; this.bolts = [];
  }
  tickWeather() {
    const W = this.weather;
    if (--W.timer > 0) return;
    if (W.rain) { W.rain = false; W.thunder = false; W.timer = 12000 + Math.floor(Math.random() * 150000); }
    else { W.rain = true; W.thunder = Math.random() < 0.25; W.timer = 12000 + Math.floor(Math.random() * 12000); }
  }
  setWeather(kind, ticks) {
    const W = this.weather;
    W.rain = kind !== 'clear'; W.thunder = kind === 'thunder'; W.timer = ticks || 6000 + Math.floor(Math.random() * 12000);
  }
  updateWeather(dt) {
    const W = this.weather, p = this.player, w = this.world, cam = this.camera.position;
    const over = w.dim === 'overworld';
    W.level += ((W.rain && over ? 1 : 0) - W.level) * Math.min(1, dt * 0.3);
    W.thunderLevel += ((W.thunder && over ? 1 : 0) - W.thunderLevel) * Math.min(1, dt * 0.3);
    if (W.level < 0.01 && !(W.rain && over)) W.level = 0;
    const exposed = this.updatePrecip(dt, W.level);
    const bio = BIOMES[w.biomeAt(cam.x, cam.z)];
    const cold = bio && bio.snowy, dry = w.biomeAt(cam.x, cam.z) === 'desert';
    const wv = this.settings.weatherVol === undefined ? 1 : this.settings.weatherVol;
    const rainOn = !cold && !dry && W.level > 0.05;
    if (window.VANILLA_SND && window.VANILLA_SND.rain) this.audio.rainTick(dt, rainOn ? W.level * 0.32 * wv : 0, exposed < 8);
    else this.audio.loop('rain', rainOn ? W.level * (exposed > 12 ? 0.5 : 0.15) * wv : 0);
    // 闪电
    if (this.flash > 0) this.flash -= dt * 3;
    for (const bl of this.bolts) { bl.t -= dt; if (bl.t <= 0) { this.scene.remove(bl.mesh); bl.mesh.geometry.dispose(); } }
    this.bolts = this.bolts.filter(bl => bl.t > 0);
    if (W.thunderLevel > 0.5) {
      W.boltT -= dt;
      if (W.boltT <= 0) { W.boltT = 6 + Math.random() * 20; this.lightning(cam.x + (Math.random() - 0.5) * 120, cam.z + (Math.random() - 0.5) * 120); }
    }
  }
  // 按原版 LevelRenderer.renderSnowAndRain 生成降水面片；返回玩家附近露天下雨的列数（用于雨声）
  updatePrecip(dt, level) {
    const w = this.world, cam = this.camera.position, R = this.precipR;
    this.precipTicks = (this.precipTicks || 0) + dt * 20;
    const ticks = this.precipTicks, tk = Math.floor(ticks), part = ticks - tk;
    const cx = Math.floor(cam.x), cy = Math.floor(cam.y), cz = Math.floor(cam.z);
    const meshes = [this.rainMesh, this.snowMesh], n = [0, 0];
    let exposed = 0;
    if (level > 0) for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz; if (d2 > R * R) continue;
      const x = cx + dx, z = cz + dz;
      if (!w.isLoaded(x, z)) continue;
      const bn = w.biomeAt(x, z), bio = BIOMES[bn];
      if (bn === 'desert' || (bio && bio.dry)) continue;
      const kind = bio && bio.snowy ? 1 : 0;
      const top = this.rainTop(w, x, z);
      const y0 = Math.max(cy - R, top), y1 = Math.max(cy + R, top);
      if (y0 === y1) continue;
      if (!kind && Math.abs(dx) < 6 && Math.abs(dz) < 6 && top <= cy + 2) exposed++;
      // 每列固定随机数（原版种子公式）
      const seed = (x * x * 3121 + x * 45238971 ^ z * z * 418711 + z * 13761) | 0;
      const r = mulberry32(seed);
      const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r());
      let u0 = 0, vOff;
      if (!kind) vOff = -(((tk + x * x * 3121 + x * 45238971 + z * z * 418711 + z * 13761) & 31) + part) / 32 * (3 + r());
      else { vOff = -((tk & 511) + part) / 512; u0 = r() + ticks * 0.01 * gauss(); vOff += r() + ticks * gauss() * 0.001; }
      // 面片垂直于「列 -> 玩家」方向，宽 1 格
      const len = Math.hypot(dx, dz);
      let sx = len ? -dz / len : 1, sz = len ? dx / len : 0;
      sx *= 0.5; sz *= 0.5;
      const a = ((1 - d2 / (R * R)) * 0.5 + 0.5) * level * (kind ? 1 : 0.85);
      const m = meshes[kind], i = n[kind]++;
      const P = m.geometry.attributes.position.array, U = m.geometry.attributes.uv.array, A = m.geometry.attributes.aAlpha.array;
      const px = x + 0.5, pz = z + 0.5;
      P.set([px - sx, y1, pz - sz, px + sx, y1, pz + sz, px + sx, y0, pz + sz, px - sx, y0, pz - sz], i * 12);
      // 原版贴图 v 向下增大；上端用 y0、下端用 y1，滚动方向向下（three 的 v 与图片相反，取负）
      const vt = -(y0 * 0.25 + vOff), vb = -(y1 * 0.25 + vOff);
      U.set([u0, vt, u0 + 1, vt, u0 + 1, vb, u0, vb], i * 8);
      A.set([a, a, a, a], i * 4);
    }
    // 素材包在游戏对象创建之后才解码完，届时换成素材包里的降水贴图
    if (PACK_READY) for (const m of meshes) if (!m.userData.real) {
      m.userData.real = true;
      const src = packCanvas(m.userData.tex);
      if (src) { const t = new THREE.CanvasTexture(src); t.magFilter = t.minFilter = THREE.NearestFilter; t.wrapS = t.wrapT = THREE.RepeatWrapping; m.material.uniforms.map.value = t; }
    }
    meshes.forEach((m, k) => {
      const g = m.geometry; g.setDrawRange(0, n[k] * 6); m.visible = n[k] > 0;
      g.attributes.position.needsUpdate = g.attributes.uv.needsUpdate = g.attributes.aAlpha.needsUpdate = true;
    });
    const b = Math.max(0.25, this.player.lightAt());
    this.rainMesh.material.uniforms.uBright.value = b; this.snowMesh.material.uniforms.uBright.value = Math.min(1, b * 1.1 + 0.1);
    // 雨滴落地溅起的小水花（原版 rain splash 粒子）
    if (n[0] && PARTICLE_LEVEL < 2 && Math.random() < dt * 40 * level) {
      const dx = Math.floor(Math.random() * 21) - 10, dz = Math.floor(Math.random() * 21) - 10, x = cx + dx, z = cz + dz;
      const bio = BIOMES[w.biomeAt(x, z)];
      if (!(bio && bio.snowy) && w.isLoaded(x, z)) { const top = this.rainTop(w, x, z); if (Math.abs(top - cam.y) < 12) this.particles.add(x + Math.random(), top + 0.05, z + Math.random(), 0, 0.6, 0, [120, 150, 220], 0.25, 3); }
    }
    return exposed;
  }
  // 降水高度：该列最上面一个会挡雨的方块（有碰撞的方块、液体、树叶）的顶面；台阶/楼梯屋顶也能挡雨
  rainTop(w, x, z) {
    const c = w.getChunk(x >> 4, z >> 4); if (!c) return CH;
    let cache = c.rainTop;
    if (!cache || c.rainMeshes !== c.meshes) {
      cache = c.rainTop = new Int16Array(256); c.rainMeshes = c.meshes;
      for (let lz = 0; lz < 16; lz++) for (let lx = 0; lx < 16; lx++) {
        let y = CH - 1;
        for (; y >= 0; y--) { const id = c.blocks[idx3(lx, y, lz)]; if (!id) continue; const d = BLOCKS[id]; if (d.solid || d.shape === 'liquid' || d.leaves || d.shape === 'slab' || d.shape === 'stairs') break; }
        cache[lz * 16 + lx] = y + 1;
      }
    }
    return cache[(z & 15) * 16 + (x & 15)];
  }
  lightning(x, z) {
    x = Math.floor(x); z = Math.floor(z);
    if (!this.world.isLoaded(x, z)) return;
    const y = this.surfaceAt(x, z); if (y < 0) return;
    const pts = []; let cx = x + 0.5, cz = z + 0.5;
    for (let yy = CH + 10; yy > y; yy -= 4) { const nx = cx + (Math.random() - 0.5) * 3, nz = cz + (Math.random() - 0.5) * 3; pts.push(cx, yy, cz, nx, yy - 4, nz); cx = nx; cz = nz; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xe8eeff, fog: false }));
    this.scene.add(mesh); this.bolts.push({ mesh, t: 0.35 });
    this.flash = 1;
    const pos = new THREE.Vector3(x, y, z), d = pos.distanceTo(this.player.pos);
    setTimeout(() => this.audio.sfx('thunder', null, Math.max(0.2, 1 - d / 200) * (this.settings.weatherVol === undefined ? 1 : this.settings.weatherVol)), Math.min(3000, d * 10));
    for (const e of [this.player, ...this.mobs]) if (!e.dead && e.pos.distanceTo(pos) < 3) { e.hurtTime = 0; e.hurt(5, 'lightning'); e.fire = 8; }
    for (const f of FEATURES) if (f.lightning) f.lightning(this, x, y, z);
  }

  // ---------------- 手持物品（第一人称） ----------------
  buildHand() {
    this.handScene = new THREE.Scene();
    this.handCam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.01, 10);
    this.handGroup = new THREE.Group(); this.handScene.add(this.handGroup);
    this.handHeld = undefined;
  }
  updateHand(dt) {
    const p = this.player, st = p.held(), id = st ? st.id : null;
    if (id !== this.handHeld) {
      this.handHeld = id;
      if (this.handPrev !== undefined) this.equip = 1; // 换物品时先压下再抬起（原版 equipProgress）
      this.handPrev = id;
      while (this.handGroup.children.length) this.handGroup.remove(this.handGroup.children[0]);
      let m, disp = null;
      const it = id && ITEMS[id];
      if (!it) {
        // 空手：玩家皮肤 character 的右臂（feat_models.js），缺素材时退回纯色方块
        m = typeof mcFirstPersonArm === 'function' ? mcFirstPersonArm() : null;
        if (!m) {
          m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.5), new THREE.MeshBasicMaterial({ map: skinTex('steve_arm', [200, 150, 120]) }));
          m.position.set(0.55, -0.52, -1.0); m.rotation.set(0.3, -0.3, 0.1);
        }
        this.handBare = true;
      } else {
        this.handBare = false;
        const def = it.block !== undefined ? BLOCKS[it.block] : null;
        // 原版物品模型的 firstperson_righthand 显示变换：[旋转(度), 平移(像素), 缩放]
        if (def && def.shape !== 'cross' && def.shape !== 'torch') { m = makeBlockMesh(it.block, 1); disp = HAND_DISPLAY.block; }
        else { m = extrudedItemMesh(id); disp = HAND_HANDHELD.test(id) ? (id === 'fishing_rod' || /_on_a_stick$/.test(id) ? HAND_DISPLAY.rod : HAND_DISPLAY.handheld) : HAND_DISPLAY.generated; }
      }
      if (disp) {
        const g = new THREE.Group();
        g.position.set(disp[1][0] / 16, disp[1][1] / 16, disp[1][2] / 16);
        g.rotation.set(disp[0][0] * Math.PI / 180, -disp[0][1] * Math.PI / 180, disp[0][2] * Math.PI / 180, 'XYZ');
        g.scale.setScalar(disp[2]);
        g.add(m); this.handGroup.add(g);
      } else this.handGroup.add(m);
      this.handMesh = m;
    }
    const b = p.lightAt();
    this.handMesh.material.color.setRGB(b, b, b);
    if (st && ITEMS[st.id].block !== undefined && BLOCKS[ITEMS[st.id].block].tint) this.handMesh.material.color.setRGB(0.55 * b, 0.8 * b, 0.4 * b);
    this.equip = Math.max(0, (this.equip || 0) - dt * 6);
    const bob = this.settings.bob ? p.bob : 0;
    const bx = Math.sin(bob) * 0.03, by = -Math.abs(Math.cos(bob)) * 0.03;
    const eat = p.eatT > 0 ? Math.sin(p.eatT * 20) * 0.03 + 0.05 : 0;
    const swing = p.swing > 0 ? 1 - p.swing : 0;
    if (this.handBare) {
      // 空手沿用原来的摆臂
      const a = Math.sin(swing * Math.PI);
      this.handGroup.matrixAutoUpdate = true;
      this.handGroup.position.set(bx - a * 0.25, by + a * 0.15, -a * 0.15);
      this.handGroup.rotation.set(-a * 0.6, a * 0.3, -a * 0.2);
      return;
    }
    // 原版 ItemInHandRenderer：挥动位移 -> applyItemArmTransform(0.56,-0.52,-0.72) -> applyItemArmAttackTransform
    const sq = Math.sqrt(swing), PI = Math.PI, D = PI / 180;
    const M = this.handMat || (this.handMat = new THREE.Matrix4()), T = this.handTmp || (this.handTmp = new THREE.Matrix4());
    M.makeTranslation(bx - 0.4 * Math.sin(sq * PI), by + 0.2 * Math.sin(sq * 2 * PI) - eat, -0.2 * Math.sin(swing * PI) + (p.bowT > 0 ? Math.min(p.bowT, 1) * 0.15 : 0));
    M.multiply(T.makeTranslation(0.56, -0.52 - this.equip * 0.6, -0.72));
    const f = Math.sin(swing * swing * PI), f1 = Math.sin(sq * PI);
    M.multiply(T.makeRotationY((45 + f * -20) * D));
    M.multiply(T.makeRotationZ(f1 * -20 * D));
    M.multiply(T.makeRotationX(f1 * -80 * D));
    M.multiply(T.makeRotationY(-45 * D));
    this.handGroup.matrixAutoUpdate = false;
    this.handGroup.matrix.copy(M);
    this.handGroup.matrixWorldNeedsUpdate = true;
  }

  // ---------------- 输入 ----------------
  lockPointer() {
    const c = this.renderer.domElement;
    if (document.pointerLockElement !== c && c.requestPointerLock) { try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => { }); } catch (e) { } }
  }
  bindInput() {
    const c = this.renderer.domElement, inp = this.input;
    c.addEventListener('mousedown', e => {
      this.audio.init();
      if (this.state === 'playing' && document.pointerLockElement !== c) { this.lockPointer(); return; }
      if (this.state !== 'playing') return;
      inp.mouse[e.button] = true; inp.mouseClicked[e.button] = true;
      if (e.button === 1) this.pickBlock();
    });
    addEventListener('mouseup', e => { inp.mouse[e.button] = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('mousemove', e => {
      if (this.state !== 'playing' || document.pointerLockElement !== c || !this.player) return;
      const s = this.settings.sens * 0.0035;
      this.player.yaw -= e.movementX * s;
      this.player.pitch = clamp(this.player.pitch - e.movementY * s * (this.settings.invertY ? -1 : 1), -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    });
    addEventListener('wheel', e => {
      if (this.state !== 'playing' || !this.player) return;
      this.player.sel = (this.player.sel + (e.deltaY > 0 ? 1 : 8)) % 9;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== c && this.state === 'playing') this.pause();
      if (document.pointerLockElement !== c) { inp.keys.clear(); inp.mouse.fill(false); }
    });
    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      const k = e.code, p = this.player;
      if (['F1', 'F2', 'F3', 'F5', 'Tab', 'Space'].includes(k) || (e.ctrlKey && k === 'KeyW')) e.preventDefault();
      if (this.state === 'playing') {
        if (!e.repeat) inp.keys.add(k);
        if (/^Digit[1-9]$/.test(k)) p.sel = +k.slice(5) - 1;
        else if (k === 'ArrowLeft' || k === 'ArrowRight') { p.sel = (p.sel + (k === 'ArrowRight' ? 1 : 8)) % 9; e.preventDefault(); }
        else if (k === 'KeyE') this.ui.openScreen('inventory');
        else if (k === 'KeyT') { e.preventDefault(); this.ui.openChat(''); }
        else if (k === 'Slash') { e.preventDefault(); this.ui.openChat('/'); }
        else if (k === 'KeyQ') this.dropHeld(e.ctrlKey);
        else if (k === 'F3') this.showDebug = !this.showDebug;
        else if (k === 'F2') this.screenshot = true;
        else if (k === 'F5') this.thirdPerson = !this.thirdPerson;
        else if (k === 'KeyM' && !e.repeat) openBigMap(this);
        else if (k === 'ShiftLeft' && !e.repeat && this.settings.toggleSneak) p.sneakToggled = !p.sneakToggled;
        else if (k === 'KeyW' && !e.repeat) { const now = performance.now(); if (now - p.lastW < 280) p.sprinting = true; p.lastW = now; }
        else if (k === 'Space' && !e.repeat && p.mode === 'creative') { const now = performance.now(); if (now - p.lastSpace < 300) { p.flying = !p.flying; p.vel.y = 0; } p.lastSpace = now; }
      } else if (this.state === 'screen') {
        if (k === 'KeyE' || k === 'Escape') this.ui.closeScreen();
      } else if (this.state === 'paused') {
        if (k === 'Escape') this.resume();
      } else if (this.state === 'map') {
        if (k === 'KeyM' || k === 'Escape') closeBigMap(this);
      }
    });
    addEventListener('keyup', e => { inp.keys.delete(e.code); });
    addEventListener('blur', () => { inp.keys.clear(); inp.mouse.fill(false); });
  }
  pickBlock() {
    const tg = this.player.target(); if (!tg.block) return;
    const name = BLOCKS[tg.block.id].name, p = this.player;
    if (!ITEMS[name]) return;
    const inv = p.inventory.slots;
    for (let i = 0; i < 9; i++) if (inv[i] && inv[i].id === name) { p.sel = i; return; }
    if (p.mode === 'creative') { inv[p.sel] = { id: name, n: 64 }; this.ui.refresh(); }
  }
  dropHeld(all) {
    const p = this.player, st = p.held(); if (!st) return;
    const n = all ? st.n : 1;
    const e = p.eye(), d = p.lookDir();
    const ent = this.dropItem(e.x + d.x * 0.3, e.y - 0.3, e.z + d.z * 0.3, st.id, n, st.dmg, st.ench);
    ent.vel.set(d.x * 6, d.y * 6 + 2, d.z * 6); ent.pickup = 1.5;
    st.n -= n; if (st.n <= 0) p.inventory.slots[p.sel] = null;
    this.ui.refresh();
  }
  reportError(key, err) {
    this.errSeen = this.errSeen || new Set();
    if (this.errSeen.has(key)) return;
    this.errSeen.add(key);
    console.error('[WebCraft] ' + key + ' 更新出错，已跳过：', err);
  }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.ui.showPause(); this.save(); }
  resume() { this.ui.menu(''); this.state = 'playing'; this.lockPointer(); }

  applySettings() {
    const s = this.settings;
    this.camera.fov = s.fov; this.camera.updateProjectionMatrix();
    this.audio.setVolume(s.vol); this.audio.setMusic(s.music);
    this.audio.weatherVol = s.weatherVol === undefined ? 1 : s.weatherVol;
    document.documentElement.style.setProperty('--gui', s.guiScale || 1);
    PARTICLE_LEVEL = s.particles || 0;
    this.saveSettings();
  }

  // ---------------- 世界生命周期 ----------------
  disposeWorld() {
    if (!this.world) return;
    for (const w of Object.values(this.dims || {})) for (const c of w.chunks.values()) this.disposeChunkMesh(c);
    for (const m of this.mobs) m.dispose(); for (const e of this.entities) e.dispose();
    this.mobs = []; this.entities = []; this.world = null; this.player = null; this.dims = {};
    if (this.playerModel) { this.scene.remove(this.playerModel.root); this.playerModel = null; }
  }
  attachHooks(w) {
    w.hooks.fallingBlock = (x, y, z, id) => this.entities.push(new FallingBlock(this, x, y, z, id));
    w.hooks.dropItem = (x, y, z, n, c) => this.dropItem(x, y, z, n, c);
    w.hooks.sound = (n, x, y, z) => this.audio.play(n, new THREE.Vector3(x, y, z));
    w.hooks.removed = (x, y, z, t) => { if (t.items) for (const s of t.items) if (s) this.dropItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.n, s.dmg, s.ench); };
  }
  // savedDims: {dim: Map(key -> {b,m})}；tilesDims: {dim: Map}
  setupWorld(seed, savedDims, tilesDims) {
    this.disposeWorld();
    this.seed = seed; this.savedDims = savedDims || {}; this.tilesDims = tilesDims || {};
    this.dims = {};
    this.world = this.getDim('overworld');
  }
  getDim(dim) {
    if (!this.dims[dim]) {
      const w = new World(this.seed, this.savedDims[dim] || (this.savedDims[dim] = new Map()), this.tilesDims[dim] || (this.tilesDims[dim] = new Map()), dim);
      this.attachHooks(w);
      this.dims[dim] = w;
    }
    return this.dims[dim];
  }
  // 区块存档键：主世界保持旧格式 "cx,cz"，其他维度加前缀 "nether:cx,cz"
  dimKey(dim, k) { return dim === 'overworld' ? k : dim + ':' + k; }
  // 把一个维度里修改过的区块写入内存存档与 IndexedDB；unload=true 时同时卸载全部区块
  flushDim(w, unload) {
    const list = [];
    for (const c of w.chunks.values()) {
      if (c.modified) { const k = ckey(c.cx, c.cz), b = c.blocks.slice(), m = c.meta.slice(); const bi = c.biome.slice(); w.saved.set(k, { b, m, bi }); list.push({ k: this.dimKey(w.dim, k), b, m, bi }); }
      if (unload) this.disposeChunkMesh(c);
    }
    if (unload) { w.chunks.clear(); w._last = null; w.scheduled.clear(); }
    if (this.worldMeta && list.length) return SaveDB.putChunks(this.worldMeta.id, list);
  }
  // 切换维度（传送门）
  changeDimension(dim, x, y, z) {
    const p = this.player;
    if (this.world.dim !== dim) {
      this.flushDim(this.world, true);
      for (const m of this.mobs) m.dispose(); for (const e of this.entities) e.dispose();
      this.mobs = []; this.entities = [];
      this.world = this.getDim(dim);
      p.world = this.world;
      this.ui.chat('进入了' + (DIM_INFO[dim] ? DIM_INFO[dim].zh : dim));
    }
    p.pos.set(x, y, z); p.vel.set(0, 0, 0); p.fallDist = 0;
    this.audio.play('portal');
    this.ui.refresh();
  }
  startTitle() {
    this.state = 'title';
    this.setupWorld(20260915);
    this.titleAngle = 0;
    const sp = this.findSpawn('dappled_forest');
    // 相机抬到树冠以上，环绕俯瞰（原版地形的树更高）
    this.titlePos = new THREE.Vector3(sp[0], sp[1] + 24, sp[2]);
    this.player = new Player(this, sp[0], sp[1] + 24, sp[2]);
    this.player.mode = 'spectator';
    this.time = 1500;
    this.worldMeta = null;
    document.getElementById('hud').style.display = 'none';
    this.ui.showTitle();
  }
  findSpawn(biome) {
    const w = this.world;
    let x = 0, z = 0;
    if (biome) { const r = this.locateBiome(biome, 0, 0); if (r) { x = r[0]; z = r[1]; } }
    for (let i = 0; i < 400; i++) {
      const info = w.columnInfo(x, z);
      if (info.h >= SEA && info.h < SEA + 50 && !info.biome.includes('ocean') && (!biome || info.biome === biome || info.vbiome === biome || i > 200)) return [x + 0.5, info.h + 1, z + 0.5];
      const a = i * 2.4, r = 8 + i * 6; x = Math.round(Math.cos(a) * r) + (biome ? x : 0); z = Math.round(Math.sin(a) * r) + (biome ? z : 0);
    }
    return [0.5, SEA + 17, 0.5];
  }
  locateBiome(target, ox, oz) {
    const w = this.world;
    if (ox === undefined) { ox = Math.floor(this.player.pos.x); oz = Math.floor(this.player.pos.z); }
    if (w.dim === 'overworld' && typeof VWG !== 'undefined' && VWG.ok && vwgInit(w.seed)) return vwgLocate(target, ox, oz);
    for (let r = 0; r <= 4000; r += 32) {
      const n = Math.max(1, Math.floor(2 * Math.PI * r / 32));
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2, x = Math.round(ox + Math.cos(a) * r), z = Math.round(oz + Math.sin(a) * r);
        if (w.columnInfo(x, z).biome === target) return [x, z, Math.round(r)];
      }
    }
    return null;
  }
  async createWorld(name, seed, mode, biome, opts) {
    const id = 'w' + Date.now().toString(36);
    this.ui.loading('正在生成地形...', 5);
    await new Promise(r => setTimeout(r, 30));
    this.setupWorld(seed);
    const sp = this.findSpawn(biome || null);
    const meta = { id, ver: WORLD_VER, name, seed, time: 1000, rules: { keepInventory: false, difficulty: (opts && opts.difficulty) || 'normal', cheats: !opts || opts.cheats !== false }, lastPlayed: Date.now(), tiles: [], player: null, stats: {} };
    this.stats = meta.stats;
    this.player = new Player(this, sp[0], sp[1] + 1, sp[2]);
    this.player.spawn = [sp[0], sp[1] + 1, sp[2]];
    this.player.mode = mode;
    this.time = 1000; this.rules = meta.rules;
    this.worldMeta = meta;
    await this.enterWorld(true);
  }
  async loadWorld(id) {
    this.ui.loading('正在载入世界...', 5);
    const meta = await SaveDB.getWorld(id);
    if (!meta) { this.ui.showWorlds(); return; }
    const saved = await SaveDB.getChunks(id);
    // 按维度前缀拆分区块存档
    const savedDims = { overworld: new Map() };
    for (const [k, v] of saved) { const i = k.indexOf(':'); if (i < 0) savedDims.overworld.set(k, v); else { const d = k.slice(0, i); (savedDims[d] || (savedDims[d] = new Map())).set(k.slice(i + 1), v); } }
    const tilesDims = { overworld: new Map(meta.tiles || []) };
    for (const d in (meta.dimTiles || {})) tilesDims[d] = new Map(meta.dimTiles[d]);
    this.setupWorld(meta.seed, savedDims, tilesDims);
    const p = meta.player;
    if (p.dim && p.dim !== 'overworld') this.world = this.getDim(p.dim);
    this.player = new Player(this, p.pos[0], p.pos[1], p.pos[2]);
    Object.assign(this.player, { yaw: p.yaw, pitch: p.pitch, mode: p.mode, health: p.health, food: p.food, sat: p.sat, xp: p.xp, level: p.level, sel: p.sel || 0, spawn: p.spawn, flying: !!p.flying, absorb: p.absorb || 0 });
    this.player.inventory.slots = p.inv.map(s => s ? Object.assign({}, s) : null);
    if (p.armor) this.player.armor = p.armor.map(s => s ? Object.assign({}, s) : null);
    if (p.effects) this.player.effects = p.effects;
    if (p.spawnDim) this.player.spawnDim = p.spawnDim;
    this.time = meta.time; this.rules = meta.rules || { keepInventory: false };
    if (!this.rules.difficulty) this.rules.difficulty = 'normal';
    this.stats = meta.stats || {};
    if (meta.weather) Object.assign(this.weather, meta.weather);
    this.worldMeta = meta;
    for (const f of FEATURES) if (f.load) f.load(this, (meta.feat || {})[f.name]);
    await this.enterWorld(false);
  }
  async enterWorld(fresh) {
    const p = this.player;
    this.state = 'loading';
    const cx = Math.floor(p.pos.x) >> 4, cz = Math.floor(p.pos.z) >> 4;
    const R = 3, list = [];
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) list.push([cx + dx, cz + dz]);
    // 原版地形在后台线程异步生成：反复请求直到出生点周围的区块都到齐
    for (let tries = 0; tries < 2000; tries++) {
      let done = 0;
      if (typeof vwgTick === 'function' && this.world.dim === 'overworld') vwgTick(cx, cz, R + 4);
      for (const [x, z] of list) if (this.world.getChunk(x, z) || this.world.generateChunk(x, z)) done++;
      this.ui.loading(fresh ? '正在生成地形...' : '正在载入世界...', 10 + done / list.length * 85);
      if (done === list.length) break;
      await new Promise(r => setTimeout(r, 30));
    }
    if (fresh) {
      // 找一块露天的真实地面（避开树冠、水面）
      const ground = new Set([B.grass_block, B.snowy_grass, B.sand, B.dirt, B.stone, B.moss_block, B.gravel, B.snow_block, B.red_sand]);
      const bx = Math.floor(p.pos.x), bz = Math.floor(p.pos.z);
      let best = null;
      for (let r = 0; r <= 24 && !best; r++) for (let dx = -r; dx <= r && !best; dx++) for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = bx + dx, z = bz + dz;
        let y = CH - 2;
        while (y > 1 && this.world.getBlock(x, y, z) === 0) y--;
        if (ground.has(this.world.getBlock(x, y, z)) && !this.world.getBlock(x, y + 1, z) && !this.world.getBlock(x, y + 2, z)) { best = [x + 0.5, y + 1, z + 0.5]; break; }
      }
      if (!best) { let y = CH - 2; while (y > 1 && !BLOCKS[this.world.getBlock(bx, y, bz)].solid) y--; best = [bx + 0.5, y + 1, bz + 0.5]; }
      p.pos.set(best[0], best[1], best[2]); p.spawn = best.slice();
      if (p.mode === 'survival') { }
      this.ui.chat('欢迎来到 WebCraft！按 E 打开物品栏，T 聊天，输入 /help 查看命令。');
      if (p.mode === 'creative') this.ui.chat('创造模式：双击空格飞行，E 打开创造物品栏。');
      this.save();
    }
    document.getElementById('hud').style.display = '';
    this.ui.menu('');
    this.state = 'playing';
    this.ui.refresh();
    this.lockPointer();
  }
  playerJSON() {
    const p = this.player;
    return { pos: [p.pos.x, p.pos.y, p.pos.z], yaw: p.yaw, pitch: p.pitch, mode: p.mode, health: p.health, food: p.food, sat: p.sat, xp: p.xp, level: p.level, inv: p.inventory.slots, sel: p.sel, spawn: p.spawn, flying: p.flying, armor: p.armor, effects: p.effects, absorb: p.absorb, dim: this.world.dim, spawnDim: p.spawnDim };
  }
  async save() {
    if (!this.worldMeta || !this.world) return;
    const dimTiles = {};
    for (const d in this.tilesDims) if (d !== 'overworld') dimTiles[d] = [...this.tilesDims[d].entries()];
    const feat = {};
    for (const f of FEATURES) if (f.save) feat[f.name] = f.save(this);
    const W = this.weather;
    const meta = Object.assign(this.worldMeta, { stats: this.stats, time: this.time, rules: this.rules, lastPlayed: Date.now(), tiles: [...this.tilesDims.overworld.entries()], dimTiles, player: this.playerJSON(), feat, weather: { rain: W.rain, thunder: W.thunder, timer: W.timer } });
    await SaveDB.putWorld(meta);
    for (const w of Object.values(this.dims)) await this.flushDim(w, false);
  }
  async quitToTitle() {
    this.ui.loading('正在保存世界...', 50);
    if (this.ui.screen) this.ui.closeScreen();
    await this.save();
    document.exitPointerLock && document.exitPointerLock();
    this.startTitle();
  }
  setMode(m) {
    const p = this.player; p.mode = m;
    if (m === 'survival') { p.flying = false; }
    if (m === 'spectator') p.flying = true;
    this.ui.barKey = null; this.ui.refresh();
  }

  // ---------------- 区块调度 ----------------
  disposeChunkMesh(c) {
    if (!c.meshes) return;
    for (const m of c.meshes) if (m) { this.scene.remove(m); m.geometry.dispose(); }
    c.meshes = null; c.dirty = true; // 回到视野时必须重建
  }
  updateChunks(budgetMs) {
    const w = this.world, p = this.player, rd = this.state === 'title' ? 4 : this.settings.renderDist;
    const pcx = Math.floor(p.pos.x) >> 4, pcz = Math.floor(p.pos.z) >> 4;
    const t0 = performance.now();
    // 生成（比渲染多一圈）
    const need = [];
    for (let dx = -rd - 1; dx <= rd + 1; dx++) for (let dz = -rd - 1; dz <= rd + 1; dz++) {
      if (dx * dx + dz * dz > (rd + 1.5) * (rd + 1.5)) continue;
      if (!w.getChunk(pcx + dx, pcz + dz)) need.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
    need.sort((a, b) => a[2] - b[2]);
    if (w.dim === 'overworld' && typeof vwgTick === 'function' && VWG.ok) vwgTick(pcx, pcz, rd + 4);
    for (const [cx, cz] of need) { w.generateChunk(cx, cz); if (performance.now() - t0 > budgetMs * 0.6) break; }
    // 网格
    const dirty = [];
    for (const c of w.chunks.values()) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz > (rd + 0.5) * (rd + 0.5)) { if (c.meshes) this.disposeChunkMesh(c); continue; }
      if (c.dirty) dirty.push([c, dx * dx + dz * dz]);
    }
    // 没有网格的区块优先（避免空洞），其次按距离
    dirty.sort((a, b) => (a[0].meshes ? 1 : 0) - (b[0].meshes ? 1 : 0) || a[1] - b[1]);
    for (const [c] of dirty) {
      if (performance.now() - t0 > budgetMs && c.meshes) break;
      if (!neighborsReady(w, c.cx, c.cz)) continue;
      const bufs = buildChunkMesh(w, c);
      this.disposeChunkMesh(c);
      c.meshes = [];
      for (const k of ['opaque', 'cutout', 'liquid', 'blend']) {
        const g = bufs[k].geometry();
        if (!g) continue;
        // 半透明层按物体位置排序远近，用区块中心而不是角点，排序才准
        g.translate(-8, 0, -8);
        const m = new THREE.Mesh(g, this.mat[k]);
        m.position.set(c.cx * 16 + 8, 0, c.cz * 16 + 8);
        if (k === 'liquid') m.renderOrder = 1; else if (k === 'blend') m.renderOrder = 2;
        m.matrixAutoUpdate = false; m.updateMatrix();
        this.scene.add(m); c.meshes.push(m);
      }
      c.dirty = false;
      if (performance.now() - t0 > budgetMs * 1.5) break;
    }
    // 卸载远处区块
    const unload = [];
    for (const c of w.chunks.values()) { const dx = c.cx - pcx, dz = c.cz - pcz; if (Math.abs(dx) > rd + 3 || Math.abs(dz) > rd + 3) unload.push(c); }
    if (unload.length) {
      const list = [];
      for (const c of unload) {
        this.disposeChunkMesh(c);
        if (c.modified) { const k = ckey(c.cx, c.cz), b = c.blocks, m = c.meta; const bi = c.biome.slice(); w.saved.set(k, { b, m, bi }); list.push({ k: this.dimKey(w.dim, k), b, m, bi }); }
        w.chunks.delete(ckey(c.cx, c.cz));
      }
      w._last = null;
      if (this.worldMeta && list.length) SaveDB.putChunks(this.worldMeta.id, list);
      for (const m of this.mobs) if (!w.isLoaded(Math.floor(m.pos.x), Math.floor(m.pos.z))) { m.dead = true; }
    }
    let n = 0; for (const c of w.chunks.values()) if (c.meshes) n++;
    this.chunksRendered = n;
  }

  // ---------------- 游戏刻（20 TPS） ----------------
  tick() {
    const w = this.world, p = this.player;
    this.time++;
    w.tick++;
    w.runScheduled();
    w.randomTicks(p.pos.x, p.pos.z, Math.min(4, this.settings.renderDist));
    this.tickWeather();
    this.tickFurnaces();
    if (w.tick % 20 === 0 && this.player.alive) this.spawnTick();
    for (const f of FEATURES) if (f.tick) f.tick(this);
  }
  tickFurnaces() {
    const w = this.world;
    for (const [k, t] of w.tiles) {
      if (t.type !== 'furnace') continue;
      const [x, y, z] = k.split(',').map(Number);
      if (!w.isLoaded(x, z)) continue;
      const [inp, fuel, out] = t.items;
      const res = inp ? SMELT[inp.id] : null;
      const can = res && (!out || (out.id === res && out.n < ITEMS[res].stack));
      const wasLit = t.burn > 0;
      if (t.burn > 0) t.burn--;
      if (t.burn <= 0 && can && fuel && fuelValue(fuel.id)) {
        t.burn = t.burnMax = fuelValue(fuel.id);
        if (fuel.id === 'lava_bucket') t.items[1] = { id: 'bucket', n: 1 }; else if (--fuel.n <= 0) t.items[1] = null;
        t._dirtyUI = true;
      }
      if (t.burn > 0 && can) {
        t.cook++;
        if (t.cook >= 200) {
          t.cook = 0;
          if (--inp.n <= 0) t.items[0] = null;
          if (t.items[2]) t.items[2].n++; else t.items[2] = { id: res, n: 1 };
          t.xp = (t.xp || 0) + 0.35; t._dirtyUI = true;
        }
      } else t.cook = Math.max(0, t.cook - 2);
      const lit = t.burn > 0, id = w.getBlock(x, y, z);
      if (lit !== wasLit || (lit && id === B.furnace) || (!lit && id === B.lit_furnace)) {
        if (id === B.furnace || id === B.lit_furnace) w.setBlock(x, y, z, lit ? B.lit_furnace : B.furnace, w.getMeta(x, y, z), { keepTile: true, noUpdate: true });
      }
    }
  }
  spawnTick() {
    const w = this.world, p = this.player;
    const hostile = this.mobs.filter(m => m.def.hostile).length, passive = this.mobs.length - hostile;
    // 消失
    for (const m of this.mobs) {
      const d = m.pos.distanceTo(p.pos);
      if (m.def.hostile && !m.def.noDespawn && (this.rules.difficulty === 'peaceful' || d > 96 || (d > 40 && Math.random() < 0.02))) { m.dead = true; m.silent = true; }
    }
    for (const f of FEATURES) if (f.spawn) f.spawn(this);
    if (w.dim !== 'overworld') return;
    if (hostile < 18 && this.rules.difficulty !== 'peaceful') {
      for (let a = 0; a < 6; a++) {
        const ang = Math.random() * Math.PI * 2, r = 24 + Math.random() * 30;
        const x = Math.floor(p.pos.x + Math.cos(ang) * r), z = Math.floor(p.pos.z + Math.sin(ang) * r);
        if (!w.isLoaded(x, z)) continue;
        const sy = this.surfaceAt(x, z);
        const y = Math.random() < 0.5 ? sy : 5 + Math.floor(Math.random() * Math.max(10, (sy > 0 ? sy : SEA) - 5));
        if (y < 1 || y >= CH - 2) continue;
        if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0 || !BLOCKS[w.getBlock(x, y - 1, z)].solid || !BLOCKS[w.getBlock(x, y - 1, z)].opaque) continue;
        if (w.blockLight(x, y, z) > 0 || w.skyLight(x, y, z) - this.skyDarken > 4) continue;
        let type;
        const under = w.getBlock(x, y - 1, z);
        if ((under === B.sulfur || under === B.cinnabar || (!VWG.ok && w.inSulfurRegion(x, z) && y < 58 + 64)) && w.skyLight(x, y, z) === 0 && Math.random() < 0.6) type = 'sulfur_cube';
        else { const r2 = Math.random(); type = r2 < 0.35 ? 'zombie' : r2 < 0.62 ? 'skeleton' : r2 < 0.85 ? 'creeper' : 'spider'; }
        this.spawnMob(type, x + 0.5, y, z + 0.5);
        break;
      }
    }
    if (passive < 14 && Math.random() < 0.3) {
      const ang = Math.random() * Math.PI * 2, r = 20 + Math.random() * 28;
      const x = Math.floor(p.pos.x + Math.cos(ang) * r), z = Math.floor(p.pos.z + Math.sin(ang) * r);
      if (w.isLoaded(x, z)) {
        const y = this.surfaceAt(x, z);
        if (w.getBlock(x, y - 1, z) === B.grass_block || w.getBlock(x, y - 1, z) === B.snowy_grass) {
          const bio = w.biomeAt(x, z);
          const opts = bio === 'taiga' || bio === 'snowy_taiga' || bio === 'snowy_plains' ? ['fox', 'sheep', 'chicken'] : bio === 'dappled_forest' ? ['fox', 'sheep', 'chicken', 'cow', 'pig'] : bio === 'pale_garden' ? [] : ['pig', 'cow', 'sheep', 'chicken'];
          if (opts.length) { const t = opts[Math.floor(Math.random() * opts.length)]; const n = 2 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) this.spawnMob(t, x + 0.5 + Math.random() * 2 - 1, y, z + 0.5 + Math.random() * 2 - 1); }
        }
      }
    }
    // 嘎枝：夜晚在嘎枝之心附近出现
    if (!this.isDay() && w.tick % 100 === 0) {
      const heart = this.findNearby(B.creaking_heart, 20);
      if (heart && !this.mobs.some(m => m.type === 'creaking')) {
        for (let a = 0; a < 10; a++) {
          const x = heart[0] + Math.floor(Math.random() * 13) - 6, z = heart[2] + Math.floor(Math.random() * 13) - 6, y = this.surfaceAt(x, z);
          if (Math.abs(y - heart[1]) < 10 && w.getBlock(x, y + 1, z) === 0) { this.spawnMob('creaking', x + 0.5, y, z + 0.5, { heart }); this.ui.chat('你听到了树枝嘎吱作响的声音……'); break; }
        }
      }
    }
  }
  surfaceAt(x, z) {
    const w = this.world;
    for (let y = CH - 2; y > 0; y--) { const id = w.getBlock(x, y, z); if (id && BLOCKS[id].solid) return y + 1; if (isLiquid(id)) return -1; }
    return -1;
  }
  findNearby(id, r) {
    const w = this.world, p = this.player, px = Math.floor(p.pos.x), py = Math.floor(p.pos.y), pz = Math.floor(p.pos.z);
    for (let y = py - 8; y <= py + 12; y++) for (let x = px - r; x <= px + r; x++) for (let z = pz - r; z <= pz + r; z++) if (w.getBlock(x, y, z) === id) return [x, y, z];
    return null;
  }

  // ---------------- 公共动作 ----------------
  dropItem(x, y, z, name, count, dmg, ench) {
    if (!ITEMS[name] || count <= 0) return null;
    const e = new ItemEntity(this, x, y, z, name, count);
    if (dmg) e.dmg = dmg;
    if (ench) e.ench = ench;
    this.entities.push(e);
    return e;
  }
  spawnMob(type, x, y, z, opts) {
    const m = new Mob(this, type, x, y, z, opts);
    this.mobs.push(m);
    return m;
  }
  shootArrow(from, to) {
    const sx = from.pos.x, sy = from.eyeY, sz = from.pos.z;
    const tx = to.pos.x, ty = to.pos.y + 1.2, tz = to.pos.z;
    const dx = tx - sx, dz = tz - sz, dh = Math.hypot(dx, dz), sp = 24;
    const t = dh / sp;
    const vy = (ty - sy) / t + 10 * t;
    const err = 0.08;
    this.entities.push(new Arrow(this, sx, sy, sz, dx / dh * sp + (Math.random() - 0.5) * sp * err, vy, dz / dh * sp + (Math.random() - 0.5) * sp * err, from, 3));
    this.audio.play('bow', from.pos);
  }
  lineOfSight(a, b) {
    const d = b.clone().sub(a), len = d.length(); d.normalize();
    const h = raycastBlocks(this.world, a, d, len, false);
    return !h || !BLOCKS[h.id].opaque;
  }
  explode(x, y, z, power) {
    const w = this.world, r = power;
    this.audio.play('explode', new THREE.Vector3(x, y, z));
    // 原版：爆炸核心的大火球序列帧 + 四散的烟
    for (let i = 0; i < 16; i++) this.particles.spawn('explosion', x + (Math.random() - 0.5) * r * 1.2, y + (Math.random() - 0.5) * r * 1.2, z + (Math.random() - 0.5) * r * 1.2, 0, 0, 0, { life: 0.3 + Math.random() * 0.3, size: 1.2 + Math.random() * 1.2, drag: 0 });
    for (let i = 0; i < 40; i++) this.particles.spawn('smoke', x + (Math.random() - 0.5) * r, y + (Math.random() - 0.5) * r, z + (Math.random() - 0.5) * r, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, { color: Math.random() < 0.5 ? [240, 240, 240] : [120, 120, 120], life: 0.8 + Math.random(), size: 0.4 + Math.random() * 0.3, grav: -1 });
    const toBreak = [];
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > r * (0.75 + Math.random() * 0.5)) continue;
      const bx = Math.floor(x + dx), by = Math.floor(y + dy), bz = Math.floor(z + dz);
      const id = w.getBlock(bx, by, bz);
      if (!id || isLiquid(id) || BLOCKS[id].blast > 100) continue;
      toBreak.push([bx, by, bz, id]);
    }
    for (const [bx, by, bz, id] of toBreak) {
      if (w.getBlock(bx, by, bz) !== id) continue;
      if (id === B.tnt) { w.setBlock(bx, by, bz, 0); const t = new PrimedTNT(this, bx, by, bz, 0.5 + Math.random()); this.entities.push(t); continue; }
      const meta = w.getMeta(bx, by, bz);
      w.setBlock(bx, by, bz, 0);
      if (Math.random() < 1 / power) for (const [n, c] of blockDrops(id, meta)) this.dropItem(bx + 0.5, by + 0.5, bz + 0.5, n, c);
    }
    const hit = (e) => {
      const ex = e.pos.x - x, ey = e.pos.y + e.h / 2 - y, ez = e.pos.z - z, d = Math.hypot(ex, ey, ez);
      if (d > power * 2) return;
      const imp = 1 - d / (power * 2);
      const dmg = Math.floor((imp * imp + imp) / 2 * 7 * power * 2 + 1);
      if (e.isPlayer) { e.hurtTime = 0; e.hurt(dmg, 'explosion'); } else { e.hurtTime = 0; e.hurt(dmg, 'explosion'); }
      const l = d || 1; e.vel.x += ex / l * imp * 18; e.vel.y += ey / l * imp * 12 + 4 * imp; e.vel.z += ez / l * imp * 18;
    };
    hit(this.player); for (const m of this.mobs) if (!m.dead) hit(m);
    for (const e of this.entities) if (e instanceof ItemEntity) { const d = e.pos.distanceTo(new THREE.Vector3(x, y, z)); if (d < power) e.vel.y += 6; }
  }
  trySleep(b) {
    const p = this.player;
    p.spawn = [b.x + 0.5, b.y + 1, b.z + 0.5];
    if (this.isDay()) { this.ui.chat('你只能在夜间或雷暴中入睡（已设置重生点）'); return; }
    if (this.mobs.some(m => m.def.hostile && m.pos.distanceTo(p.pos) < 10)) { this.ui.chat('附近有怪物在游荡，现在不能休息！'); return; }
    const f = this.ui.el.fade; f.style.opacity = 1;
    setTimeout(() => { this.time = Math.ceil(this.time / 24000) * 24000 + 0; this.ui.chat('早上好！（已设置重生点）'); f.style.opacity = 0; }, 1200);
  }
  highlight(b) {
    if (!b) { this.selBox.visible = false; return; }
    const bx = shapeBoxes(b.id, this.world.getMeta(b.x, b.y, b.z), worldNB(this.world, b.x, b.y, b.z));
    let x0 = 1, y0 = 1, z0 = 1, x1 = 0, y1 = 0, z1 = 0;
    for (const q of bx) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); z0 = Math.min(z0, q[2]); x1 = Math.max(x1, q[3]); y1 = Math.max(y1, q[4]); z1 = Math.max(z1, q[5]); }
    this.selBox.visible = true;
    this.selBox.position.set(b.x + (x0 + x1) / 2, b.y + (y0 + y1) / 2, b.z + (z0 + z1) / 2);
    this.selBox.scale.set(x1 - x0 + 0.004, y1 - y0 + 0.004, z1 - z0 + 0.004);
  }
  setCrack(m, prog) {
    if (!m || prog <= 0) { this.crack.visible = false; this.crackStage = -1; return; }
    const st = Math.min(9, Math.floor(prog * 10));
    this.crack.visible = true; this.crack.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5);
    if (st !== this.crackStage) {
      this.crackStage = st;
      const t = tileUV(TEX['destroy_' + st]), uv = this.crackGeo.attributes.uv;
      for (let f = 0; f < 6; f++) { const c = [[t.u0, t.v1], [t.u1, t.v1], [t.u0, t.v0], [t.u1, t.v0]]; for (let k = 0; k < 4; k++) uv.setXY(f * 4 + k, c[k][0], c[k][1]); }
      uv.needsUpdate = true;
    }
  }

  // ---------------- 主循环 ----------------
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    let dt = (now - this.last) / 1000; this.last = now;
    if (dt > 0.1) dt = 0.1;
    this.frames++; this.fpsT += dt; if (this.fpsT >= 1) { this.fps = this.frames; this.frames = 0; this.fpsT = 0; }
    if (!this.world) return;
    const p = this.player;
    if (this.state === 'title' || (this.state === 'loading' && !this.worldMeta)) {
      this.titleAngle += dt * 0.05;
      this.camera.position.copy(this.titlePos);
      this.camera.rotation.set(-0.15, this.titleAngle, 0);
      p.pos.copy(this.titlePos);
      this.updateChunks(10);
      animateAtlas(now / 1000);
      this.updateSky();
      this.renderer.clear(); this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.state === 'loading') return;
    const active = this.state === 'playing' || this.state === 'screen' || this.state === 'chat' || this.state === 'dead';
    const chunkReady = this.world.getChunk(Math.floor(p.pos.x) >> 4, Math.floor(p.pos.z) >> 4) && this.world.getChunk(Math.floor(p.pos.x) >> 4, Math.floor(p.pos.z) >> 4).meshes;
    if (active) {
      this.tickAcc += dt;
      let n = 0;
      while (this.tickAcc >= 0.05 && n < 5) { this.tickAcc -= 0.05; this.tick(); n++; }
      if (n >= 5) this.tickAcc = 0;
      if (chunkReady) p.update(dt);
      // 单个生物/实体出错时跳过并记录一次，避免异常中断整帧渲染导致画面卡死
      for (const m of this.mobs) if (!m.dead) { try { m.update(dt); } catch (err) { this.reportError('mob:' + m.type, err); } }
      for (const e of this.entities) if (!e.dead) { try { e.update(dt); } catch (err) { this.reportError('entity:' + e.constructor.name, err); e.dead = true; } }
      this.mobs = this.mobs.filter(m => { if (m.dead) m.dispose(); return !m.dead; });
      this.entities = this.entities.filter(e => { if (e.dead) e.dispose(); return !e.dead; });
      this.audio.updateMusic(dt);
    }
    this.updateChunks(this.state === 'playing' ? 6 : 12);
    animateAtlas(now / 1000);
    for (const f of FEATURES) if (f.frame) f.frame(this, dt);
    // 相机
    const eye = p.eye();
    const bobOn = this.settings.bob && p.onGround && !p.flying;
    this.camera.position.set(eye.x, eye.y + (bobOn ? Math.abs(Math.cos(p.bob)) * 0.06 - 0.03 : 0), eye.z);
    this.camera.rotation.set(p.pitch, p.yaw, bobOn ? Math.sin(p.bob) * 0.006 : 0);
    if (p.hurtTime > 0.3) this.camera.rotation.z += (p.hurtTime - 0.3) * 0.2;
    // 水下视角轻微晃动
    if (p.eyeInWater) { const t = now / 1000; this.camera.rotation.z += Math.sin(t * 1.3) * 0.006; this.camera.rotation.x += Math.sin(t * 0.9) * 0.004; }
    if (this.thirdPerson) {
      const d = p.lookDir();
      const back = raycastBlocks(this.world, eye, d.clone().negate(), 4, false);
      const dist = back ? Math.max(0.5, back.t - 0.3) : 4;
      this.camera.position.addScaledVector(d, -dist);
      if (!this.playerModel) { this.playerModel = buildMob('steve'); this.scene.add(this.playerModel.root); }
      this.playerModel.root.visible = true;
      this.playerModel.root.position.copy(p.pos); this.playerModel.root.rotation.y = p.yaw + Math.PI;
      this.playerModel.P.head.rotation.x = -p.pitch;
      const sw = Math.sin(p.bob) * 0.7 * Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 3);
      this.playerModel.P.legs.forEach((l, i) => { l.rotation.x = i ? sw : -sw; });
      // arms = [左臂, 右臂]，legs = [右腿, 左腿]：对侧手脚同相，右臂负责挥动
      this.playerModel.P.arms.forEach((a, i) => { a.rotation.x = (i ? sw : -sw) - (i === 1 ? Math.sin((1 - p.swing) * Math.PI) * 1.2 : 0); });
      const b = p.lightAt(); this.playerModel.mats.forEach(m => m.color.setRGB(b, b, b));
    } else if (this.playerModel) this.playerModel.root.visible = false;
    const targetFov = this.settings.fov * (p.sprinting ? 1.12 : 1) * (p.bowT > 0 ? 1 - Math.min(p.bowT, 1) * 0.15 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.1) { this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 10); this.camera.updateProjectionMatrix(); }
    this.audio.listener = this.camera.position;
    this.updateWeather(dt);
    this.updateSky();
    this.particles.update(dt, p.lightAt());
    this.ui.update(dt);
    hudUpdate(this, dt);
    if (this.state === 'map') drawBigMapThrottled(this, dt);
    if (this.state === 'screen' && document.getElementById('pview')) updatePlayerPreview(this, this.ui.mx, this.ui.my);
    if (this.state === 'playing') this.stats.playTime = (this.stats.playTime || 0) + dt;
    for (let i = 0; i < 3; i++) this.input.mouseClicked[i] = false;
    // 渲染
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (!this.thirdPerson && this.state !== 'dead' && p.mode !== 'spectator') {
      this.updateHand(dt);
      this.renderer.clearDepth();
      this.renderer.render(this.handScene, this.handCam);
    }
    if (this.screenshot) {
      this.screenshot = false;
      const a = document.createElement('a'); a.download = 'webcraft-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
      a.href = this.renderer.domElement.toDataURL('image/png'); a.click();
      this.ui.chat('已保存截图 ' + a.download);
    }
    // 自动保存
    this.autoSaveT = (this.autoSaveT || 0) + dt;
    if (this.autoSaveT > 45 && this.state === 'playing') { this.autoSaveT = 0; this.save(); }
  }
}

const game = new Game();
window.addEventListener('load', () => {
  game.init().catch(e => { console.error(e); document.getElementById('menu').innerHTML = '<div class="box"><h2>启动失败</h2><p>' + esc(e.message) + '</p></div>'; document.getElementById('menu').style.display = 'flex'; });
});
