// 把原版主世界 worldgen 数据 + deepslate + tools/worldgen_worker.js 拼成后台线程源码字符串
// 用法：node tools/build_worldgen.mjs <客户端解包目录>/data/minecraft/worldgen <biome_parameters/overworld.json>
// 产物：assets/vanilla/worldgen.js（window.WORLDGEN_WORKER_SRC），仅本机个人使用
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'
const here = path.dirname(fileURLToPath(import.meta.url)), root = path.dirname(here)
const WG = process.argv[2], PARAMS = process.argv[3]
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])
const collect = (sub) => { const o = {}; for (const f of walk(path.join(WG, sub))) if (f.endsWith('.json')) o['minecraft:' + path.relative(path.join(WG, sub), f).slice(0, -5)] = JSON.parse(fs.readFileSync(f, 'utf8')); return o }
const data = {
  noise: collect('noise'), density_function: collect('density_function'),
  material_rule: collect('material_rule'), material_condition: collect('material_condition'),
  biomes: Object.keys(collect('biome')),
  noise_settings: JSON.parse(fs.readFileSync(path.join(WG, 'noise_settings/overworld.json'), 'utf8')),
  biome_parameters: JSON.parse(fs.readFileSync(PARAMS, 'utf8')),
}
const ds = fs.readFileSync(path.join(here, 'node_modules/deepslate/dist/deepslate.umd.cjs'), 'utf8')
const core = fs.readFileSync(path.join(here, 'worldgen_core.js'), 'utf8')
const out = path.join(root, 'assets/vanilla/worldgen.js')
// 三段：deepslate 源码（字符串，主线程 eval / 后台线程拼进 Blob）、原版数据（对象）、生成核心（字符串）
fs.writeFileSync(out, '// 自动生成：原版主世界地形生成（deepslate + 本机客户端 worldgen 数据，仅限个人本地使用）\n' +
  'window.WG_DEEPSLATE_SRC = ' + JSON.stringify(ds) + ';\nwindow.WG_DATA = ' + JSON.stringify(data) + ';\nwindow.WG_CORE_SRC = ' + JSON.stringify(core) + ';\n')
console.log('worldgen.js', (fs.statSync(out).size / 1024).toFixed(0), 'KB')
