'use strict';
// ---------- 环境粒子：仿原版 ClientLevel.animateTick ----------
// 原版每刻在玩家周围 16 格和 32 格内各随机抽 667 个位置，调用方块的 animateTick 冒粒子。
// 这里每帧按 60fps 折算抽样，只处理会冒粒子的方块。
(() => {
  const has = n => B[n] !== undefined;
  const R = (a, b) => a + Math.random() * (b - a);
  const TORCH_TOP = [[0.5, 0.7, 0.5], [1.5 / 16, 0.9, 0.5], [14.5 / 16, 0.9, 0.5], [0.5, 0.9, 1.5 / 16], [0.5, 0.9, 14.5 / 16]];
  const FRONT = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]]; // 与 texOf 的 front 朝向一致
  // 脚本加载时方块还没注册，先记下来，第一帧再按方块 id 建表
  const pending = [], handlers = {};
  let built = false;
  const on = (name, fn) => pending.push([name, fn]);

  // 火把：每次都冒一缕烟 + 一朵火苗
  on('torch', (P, w, x, y, z, m) => {
    const t = TORCH_TOP[m & 7] || TORCH_TOP[0];
    P.spawn('smoke', x + t[0], y + t[1] + 0.05, z + t[2], 0, 0.15, 0, { color: [60, 60, 60], life: R(0.8, 1.6), size: 0.12, drag: 0.5, grav: -0.3 });
    P.spawn('flame', x + t[0], y + t[1], z + t[2], 0, 0, 0, { life: R(0.4, 0.9), size: 0.1, drag: 3 });
  });
  on('redstone_torch', (P, w, x, y, z, m) => {
    if (Math.random() > 0.3) return;
    const t = TORCH_TOP[m & 7] || TORCH_TOP[0];
    P.spawn('generic', x + t[0] + R(-0.1, 0.1), y + t[1] + R(-0.05, 0.1), z + t[2] + R(-0.1, 0.1), 0, 0.1, 0, { color: [255, 30, 20], life: R(0.5, 1), size: 0.08, glow: true });
  });
  // 岩浆：上方是空气时偶尔迸出岩浆粒子
  on('lava', (P, w, x, y, z) => {
    if (w.getBlock(x, y + 1, z) !== 0 || Math.random() > 0.01) return;
    for (let i = 0; i < 3; i++) P.spawn('lava', x + Math.random(), y + 1, z + Math.random(), R(-1, 1), R(2, 4), R(-1, 1), { life: R(0.8, 1.6), size: R(0.12, 0.22), grav: 9, drag: 0.2 });
    if (Math.random() < 0.3 && game) game.audio.play('fizz', new THREE.Vector3(x + 0.5, y + 1, z + 0.5));
  });
  // 火：冒大烟
  const fire = (P, w, x, y, z) => { if (Math.random() < 0.3) P.spawn('smoke', x + Math.random(), y + R(0.5, 1), z + Math.random(), 0, 0.4, 0, { color: [50, 50, 50], life: R(1, 2), size: R(0.3, 0.5), grav: -0.5 }); };
  on('fire', fire); on('soul_fire', fire);
  // 燃烧的熔炉：正面冒烟和火苗
  on('lit_furnace', (P, w, x, y, z, m) => {
    if (Math.random() > 0.3) return;
    const f = FRONT[m & 3], s = R(-0.3, 0.3);
    const px = x + 0.5 + f[0] * 0.52 + (f[2] ? s : 0), pz = z + 0.5 + f[2] * 0.52 + (f[0] ? s : 0), py = y + R(0, 0.4);
    P.spawn('smoke', px, py, pz, 0, 0.1, 0, { color: [60, 60, 60], life: R(0.8, 1.5), size: 0.12, grav: -0.3 });
    P.spawn('flame', px, py, pz, 0, 0, 0, { life: R(0.4, 0.8), size: 0.1, drag: 3 });
  });
  // 下界传送门：每次 4 个紫色粒子朝门面外飘
  on('nether_portal', (P, w, x, y, z) => {
    for (let i = 0; i < 4; i++) {
      const s = Math.random() < 0.5 ? -1 : 1;
      P.spawn('portal', x + Math.random(), y + Math.random(), z + Math.random(), R(-0.5, 0.5) * s, R(-0.5, 0.5), R(-0.5, 0.5) * s,
        { color: [R(150, 230), R(40, 90), 230], life: R(0.6, 1.4), size: R(0.08, 0.16), glow: true, drag: 0.8 });
    }
  });
  // 末地烛：闪烁的白色光点
  on('end_rod', (P, w, x, y, z) => { if (Math.random() < 0.2) P.spawn('end_rod', x + 0.5 + R(-0.2, 0.2), y + R(0.2, 0.9), z + 0.5 + R(-0.2, 0.2), R(-0.1, 0.1), R(-0.1, 0.1), R(-0.1, 0.1), { life: R(1, 2), size: 0.12, drag: 0.5 }); });
  // 营火：一柱缓慢上升的大烟
  on('campfire', (P, w, x, y, z) => { if (Math.random() < 0.2) P.spawn('big_smoke', x + 0.5 + R(-0.3, 0.3), y + 0.5, z + 0.5 + R(-0.3, 0.3), 0, R(0.8, 1.2), 0, { color: [200, 200, 200], alpha: 0.9, life: R(4, 7), size: R(0.6, 0.9), drag: 0.05, fade: true }); });
  // 樱花树叶：底下是空气时飘落花瓣
  on('cherry_leaves', (P, w, x, y, z) => { if (w.getBlock(x, y - 1, z) === 0 && Math.random() < 0.08) P.spawn('cherry', x + Math.random(), y - 0.05, z + Math.random(), R(-0.3, 0.3), -0.4, R(-0.3, 0.3), { life: R(4, 7), size: 0.12, grav: 0.4, drag: 0.6 }); });
  // 哭泣的黑曜石：底面滴紫色泪
  on('crying_obsidian', (P, w, x, y, z) => { if (w.getBlock(x, y - 1, z) === 0 && Math.random() < 0.1) P.spawn('drip', x + R(0.1, 0.9), y - 0.05, z + R(0.1, 0.9), 0, 0, 0, { color: [140, 40, 230], life: 2, size: 0.1, grav: 4, glow: true }); });
  // 水下面是空气（天花板漏水）时滴水
  on('water', (P, w, x, y, z) => {
    if (Math.random() > 0.05) return;
    const below = w.getBlock(x, y - 1, z); if (!below || !BLOCKS[below].solid) return;
    if (w.getBlock(x, y - 2, z) !== 0) return;
    P.spawn('drip', x + R(0.1, 0.9), y - 1.05, z + R(0.1, 0.9), 0, 0, 0, { color: [60, 90, 230], life: 2, size: 0.1, grav: 6 });
  });

  FEATURES.push({
    frame(g, dt) {
      const w = g.world, P = g.particles; if (!w || !P || !P.spawn || g.state === 'title') return;
      if (!built) { built = true; for (const [name, fn] of pending) if (has(name)) handlers[B[name]] = fn; }
      const c = g.player.pos, cx = Math.floor(c.x), cy = Math.floor(c.y), cz = Math.floor(c.z);
      // 原版每刻 2x667 次（20 刻/秒）；按帧时长折算
      const n = Math.min(1500, Math.round(1334 * 20 * dt));
      for (let i = 0; i < n; i++) {
        const r = i & 1 ? 32 : 16;
        const x = cx + Math.floor(Math.random() * r) - Math.floor(Math.random() * r);
        const y = cy + Math.floor(Math.random() * r) - Math.floor(Math.random() * r);
        const z = cz + Math.floor(Math.random() * r) - Math.floor(Math.random() * r);
        if (y < 0 || y >= CH) continue;
        const id = w.getBlock(x, y, z);
        const h = handlers[id];
        if (h) h(P, w, x, y, z, w.getMeta(x, y, z));
      }
    },
  });
})();
