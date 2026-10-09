# WebCraft 架构与扩展接口

纯前端、无构建、无模块系统：所有 `js/*.js` 都是经典脚本，顶层 `const/function/class` 共享全局作用域。
入口 `index.html`，双击即可在 file:// 下运行（因此不能用 fetch，图片只能用 data URL）。

## 加载顺序

`three.min.js` → `assets/pack_tex.js`（`window.PACK_TEX`：素材名→data URL）→ `assets/pack_snd.js`（`PACK_SND`/`PACK_MUSIC`）
→ `util.js` → `pack.js` → `effects.js` → `textures.js` → `blocks.js` → `recipes.js` → `world.js` → `mesher.js`
→ `entities.js` → `player.js` → `icons.js` → `audio.js` → `save.js` → `ui.js` → `main.js` → **功能插件 `feat_*.js`**。

插件脚本只在顶层注册（`FEATURES.push(...)`、往 `MOB_DEFS`/`MODELS`/`SCREENS`/`COMMANDS`/`DIM_GEN`/`DIM_INFO`/`SND_MAP` 里加条目），
真正的初始化发生在 `window.load` 之后的 `game.init()`，顺序：
解码素材 → `initBlocks()` → 各插件 `blocks()` → 各插件 `items()` → `initRecipes()` → 各插件 `recipes()`
→ `buildTextures()` → 各插件 `textures()` → `collectBlockTextures()` → `buildAtlas()`。
**图集生成后不能再加纹理**，所有纹理必须在 `textures()` 钩子里或方块定义的 `tex` 字段里出现。

## 常量与坐标

- 区块 16×16，高 `CH = 384`（内部 y 0..383；主世界显示坐标 = y − 64），海平面 `SEA = 127`（原版 Y 63）。方块 id 是 Uint16，meta 是 Uint8。
- 面编号 face：0 +X，1 −X，2 +Y，3 −Y，4 +Z，5 −Z；`DIRS[face]` 是方向向量。
- 玩家视线：yaw=0 看向 −Z；`player.lookDir()`；水平朝向索引 `((Math.round(-yaw/(π/2))%4)+4)%4`：0:−Z 1:+X 2:+Z 3:−X。

## 方块 `defBlock(name, zh, opts)`（blocks.js）

常用字段：`tex`（字符串或 `{top,bottom,side,front,all}`；纹理名可以是程序纹理名，也可以直接是素材包贴图名如 `'mcl_nether_netherrack'`，会自动入图集），
`texFn(face, meta) => 图集索引`（用 `TEX[name]`，名字须事先 `ensureTex`），
`shape`：`'cube' | 'cross' | 'torch' | 'liquid' | 'slab' | 'stairs' | 'bed' | 'cushion' | 'farmland' | 'cactus' | 'boxes' | 'air'`，
`solid`（碰撞）、`opaque`（遮挡面与光）、`render`：`'opaque' | 'cutout' | 'blend'`，`hard`（-1 不可破坏）、`tool`：`'pickaxe'|'axe'|'shovel'|'hoe'|'shears'`、
`tier`（0 空手 1 木 2 石 3 铁 4 钻石）、`emit`（亮度 0-15）、`atten`（额外光衰减）、`drop`（物品名 / `(meta)=>[name,n]` / `[[n,c],...]` / null）、
`replaceable`、`gravity`、`blast`（>100 抗爆）、`xp`、`fuel`（熔炉燃料刻数）、`interact`（核心识别 'crafting'|'furnace'|'chest'|'bed'|'tnt'）、
`noItem`（不生成同名物品）、`sound`（'stone'|'wood'|'grass'|'dirt'|'sand'|'gravel'|'glass'|'wool'|'snow'|'metal'|'ice'）、
`slip`（冰面滑）、`climbable`（梯子/藤蔓可攀爬，核心已实现攀爬物理）、`leaves`、`plant`、`crop`。

### 盒子形状 `shape: 'boxes'`

```js
boxes(meta, nb, id) => [[x0,y0,z0,x1,y1,z1, ext?], ...]   // 0..1 方块内坐标
// nb(dx,dy,dz) 返回相邻方块 id（渲染时来自区块缓存，碰撞/射线时来自世界）
// ext 可选：{ tex: face => 图集索引(−1 不画), tint: [r,g,b], uv: face => [px0,py0,px1,py1](0..16), faces: [6 个布尔], noCull: true }
collide(meta, nb, id) => 同格式或 null   // 可选：碰撞盒与外形不同时提供（例如打开的门、红石线无碰撞）
```
`boxes` 同时用于渲染、选择框、射线；`solid:true` 时也作为碰撞（除非提供 `collide`）。

## 物品 `defItem(name, zh, opts)`

`stack`、`tool:{type,tier,speed,dmg}`、`durability`、`food:[饥饿值, 饱和度]`、`fuel`、`armor:{slot:'head'|'chest'|'legs'|'feet', points, tough}`、
`icon`（素材包贴图名，作为物品栏图标）、`spawnEgg`（生物类型）、`glint`（附魔光效）、`desc`（提示文字）、
`alwaysEat`（饱食时也能吃/喝）、`drink`（喝的音效）、`eatTime`（秒，默认 1.6）、`onEat(player, stack, game) => 返还物品名或 null`（药水返回 'glass_bottle'、牛奶返回 'bucket'）。
物品堆叠：`{id, n, dmg?, ench?: {附魔id: 等级}, name?}`。

## 配方（recipes.js）

`shaped(['XXX',' S ',' S '], {X:'iron_ingot', S:'stick'}, 'iron_pickaxe', 1)`；`shapeless([...], out, n)`；
标签：`'#planks' '#log' '#wool' '#stone_mat' '#coals'`；熔炼 `SMELT[输入] = 输出`。

## 世界 API（world.js，`game.world` 是当前维度）

`getBlock/getMeta/setMeta/setBlock(x,y,z,id,meta,{noUpdate,keepTile})`、`skyLight/blockLight`、`schedule(x,y,z,delayTicks)`、
`breakBlock(x,y,z,drop)`、`tiles`（Map `"x,y,z"` → 方块实体数据，会存档）、`dim`、`seed`、`columnInfo(x,z)`（主世界地形/群系）、`isLoaded(x,z)`、
`placeTree(chunk,type,x,y,z,rng)`。生成器里直接写 `chunk.blocks[idx3(lx,y,lz)]` / `chunk.meta[...]`，`chunk.biome[lz*16+lx]` 存群系名。

### 维度

- `DIM_GEN[dim] = (world, chunk, fromSave) => {}`：填充区块方块与 `chunk.biome`（fromSave=true 时方块已从存档恢复，只需填 biome）。
- `DIM_INFO[dim] = { zh, sky, fog, ambient, fogNear, fogFar, update?(game) }`（overworld/nether/end 已预置，可修改）。
- `game.changeDimension(dim, x, y, z)` 切换维度（自动存档/卸载旧维度、清空实体）；`game.getDim(dim)` 取得维度 World。
- 跨区块结构：只能写入当前区块范围，按区域确定性种子生成（见 `world.genTrees` 的做法），避免依赖相邻区块。

## 功能插件 `FEATURES.push({...})`

所有钩子可选。返回 `true` 的钩子表示“已处理，跳过默认逻辑”。

| 钩子 | 签名 | 说明 |
|---|---|---|
| name | 字符串 | 必填，存档键 |
| blocks / items / recipes / textures | `()` | 注册阶段 |
| genChunk | `(world, chunk, cols)` | 主世界区块地形完成后（结构、村庄、遗迹）；`cols[(lz+1)*18+lx+1]` = `{h, biome, t, w, mf}` |
| tick | `(game)` | 每游戏刻（20/秒） |
| frame | `(game, dt)` | 每帧 |
| blockUpdate | `(world,x,y,z,id) => bool` | 相邻方块变化时 |
| scheduledTick | `(world,x,y,z,id) => bool` | `world.schedule` 到期 |
| randomTick | `(world,x,y,z,id) => bool` | 随机刻 |
| useMob | `(game, player, mob, held) => bool` | 右键生物 |
| useBlock | `(game, player, hit, held) => bool` | 右键方块（未潜行），hit=`{x,y,z,id,n:[法线],p:[命中点]}` |
| useItem | `(game, player, hit或null, held) => bool` | 右键使用手持物品（对空气时 hit=null） |
| onBreak | `(game,x,y,z,id,meta,player)` | 玩家破坏方块后 |
| drops | `(game,player,id,meta,drops) => drops` | 修改掉落 |
| breakSpeed | `(game,player,id,speed) => speed` | 挖掘速度 |
| attack | `(game,player,mob,dmg) => dmg` | 玩家近战伤害 |
| damageTaken | `(game,entity,dmg,src,attacker) => dmg` | 玩家与生物受伤 |
| spawn | `(game)` | 每秒一次的刷怪（所有维度都会调用；非主世界只调用插件刷怪） |
| lightning | `(game,x,y,z)` | 闪电落地 |
| save / load | `(game) => json` / `(game, json)` | 插件自身存档数据 |
| playerMove | `(game, player, dt, {fw, st, mx, mz, jump, sneak}) => bool` | 返回 true 时跳过玩家默认移动/物理（骑乘等） |

## 生物

`MOB_DEFS[type] = { zh, hp, w(半宽), h, speed, hostile, dmg, undead, arthropod, fireImmune, noDespawn, burns, ranged, food, xp, drops:(mob)=>[[name,n],...], ai:(mob,dt,game)=>false 退回默认, onDeath:(mob,killer) }`。
Mob 实例：`pos vel yaw health onGround inWater horizHit fire effects small model{root,mats,P} attackCd lastAttacker`，
方法 `steer(tx,tz,speed,dt)`、`physics(dt)`、`hurt(dmg,src,attacker)`、`distTo(e)`、`animate(dt,speed)`。
模型：`MODELS[type] = (small) => ({ root: THREE.Group, mats: [MeshBasicMaterial...], P: { head, body, legs: [], arms: [] } })`，
`mats` 用于按光照调色，P.legs/arms 会按 rotation.x 摆动。素材包皮肤用 `packTexture('mobs_mc_zombie')`。
`game.spawnMob(type,x,y,z,opts)`、`game.mobs`、`game.entities`（自定义投射物等：继承 `Entity`，实现 `update(dt)`，需要时 `dispose()`）。

## 玩家

`player.inventory.add(name,n,dmg,ench)`、`player.held()`、`player.consume(n)`、`player.damageHeld(n)`、`player.armor[4]`、`player.effects`、
`player.health/food/sat/xp/level/addXp(n)`、`player.hurt(dmg,src,attacker)`、`player.eye()`、`player.lookDir()`、`player.mode`。

### 状态效果与附魔（effects.js）

`applyEffect(entity, id, 秒, 等级从0起)`、`effLv(entity, id)`（I 级返回 1，无效果 0）、`clearEffects(e)`；`EFFECTS` 列表。
附魔存于堆叠 `stack.ench`，`enchLv(stack,id)`、`enchApplies(itemName, enchId)`、`ENCHANTS`、`ENCH_CONFLICT`、`enchText(stack)`；
核心已实现所有附魔的效果（锋利、保护、效率、时运、精准采集、耐久、力量、火矢、无限等）。

## 界面

`SCREENS[name] = { title, wide, noInv, render(ui,arg)=>html, open(ui,arg), close(ui), update(ui,dt), after(ui),
containers: { 名称: { get(ui)=>数组, accept(ui,i,stack)=>bool, output:true, take(ui,i,shift)=>stack|null, quick:true } } }`。
`ui.openScreen(name, arg)`；格子 HTML：`ui.slotHTML(容器名, 索引, stack, 额外class)`；`ui.refresh()` 重新渲染。
`COMMANDS[name] = (args, ui, game) => {}`；`ui.chat(文字)`；`ui.bossBar(名称, 0..1)` / `ui.bossBar(null)`。

## 音效与素材

`game.audio.play(事件, pos)`：先查 `SND_MAP[事件]`（素材包键，可为数组），再退回合成音；`game.audio.sfx(事件,pos,音量,音高)` 只播素材包。
插件可直接 `SND_MAP['ghast.say'] = 'mobs_eerie'`。素材包键名见 `assets/pack_snd.js`，贴图名见 `assets/pack_tex.js`（键名即 VoxeLibre 文件名去扩展名）。

原版素材覆盖包（可选，仅本机个人使用，勿分发）：`python3 tools/build_vanilla.py <客户端解包目录>/assets/minecraft` 生成 `assets/vanilla/`。
- `tex.js` 的 `VANILLA_TEX` 键沿用 VoxeLibre 贴图名，加载时 `applyVanillaPack()` 覆盖进 `PACK_TEX`；对照表在脚本的 `MANUAL`，其余按名字自动匹配 `block/`、`item/`。
- 生物皮肤只在 `entity/` 下同名且尺寸一致时替换（26.x 的猪/牛/鸡等换了模型布局，保持 VoxeLibre）。
- `snd.js` 的 `VANILLA_SND` 以游戏事件名为键（`dig.stone`、`pig.hurt`…），`packSound` 优先查它；`VANILLA_MUSIC` 替换背景音乐。
- `packOverrides()` 里手绘的贴图只在原版缺失时生效。删掉 `assets/vanilla/` 即回到 VoxeLibre。

## 原版地形（js/worldgen_vanilla.js）

- 世界高度 `CH = 384`；主世界内部 y = 原版 Y + 64（`dispY(w, y)` 换算显示），海平面 `SEA = 127`；下界/末地仍只用 0..127。
- 数据：`node tools/build_worldgen.mjs <解包>/data/minecraft/worldgen <biome_parameters/overworld.json>` 生成 `assets/vanilla/worldgen.js`（deepslate 源码字符串 + 原版 worldgen 数据 + `tools/worldgen_core.js` 生成核心）。生物群系参数表由原版数据生成器导出：`tools/datagen`（Java 25 + Mojang 依赖库，`net.minecraft.data.Main --reports`）。
- 后台线程（Blob Worker，file:// 可用）生成原始地形（4x8x4 格点插值 + 含水层 + 地表规则），主线程 `generateVanilla` 等 3x3 原始地形齐了才放矿石/花草/树/结构；`columnInfo(x,z)` 有原始地形读真值，否则主线程沿列算密度估算（结构选址用）。
- `columnInfo().biome` 是本作装饰类别（BIOMES[原版名].cat），`.vbiome` 是原版名；区块 `biome[]` 存原版名（草色、HUD）。
- 没有原版数据时退回旧程序地形（整体抬高 64 格）。存档格式 2（`WORLD_VER`），旧格式自动删除。

## 约定

- 界面文字中文，**不用 emoji**；代码 2 空格缩进，注释中文且克制。
- 新功能放进 `js/feat_<名称>.js`，在 index.html 的 `main.js` 之后引入。
