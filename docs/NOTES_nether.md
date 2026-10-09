# 下界（nether）模块说明

场景声明：S3 计划功能开发（由编排方派发，需求已拍板）。

## decision-log

- [已拍板] 用户原话："参考现在minecraft的最新的版本，你做一个完全一模一样的游戏……尽可能的还原他的功能和特性"
- [已拍板] 用户原话："做完之后，把剩余的所有的东西都完善"
- [已拍板] 素材使用已打包好的 VoxeLibre（CC BY-SA）开源素材包。
- 猪灵（piglin）未设 fireImmune：原版猪灵会被火/熔岩伤害；其余五种下界生物 fireImmune:true。
- 传送门联通用"已点亮传送门登记表"（插件存档 `feat.nether.portals`），不做全区块扫描，避免切换维度时同步生成上百个区块。
- 下界合金工具/装备只提供物品定义，锻造台升级配方归 village 模块（smithing_table）。

## 文件

- `js/feat_nether.js`：方块/物品/配方、火（蔓延/烧毁/熄灭/接触伤害）、下界传送门（检测框、点亮、破坏消失、跨维度传送与生成）、骨粉/种植/打火石/火焰弹/水在下界蒸发/床在下界爆炸、灵魂沙减速、岩浆块伤害、群系雾色、死亡后回出生维度。
- `js/feat_nether_gen.js`：`DIM_GEN.nether`（3D 噪声洞穴、y≤31 熔岩海、五群系、荧石、矿脉、远古残骸、巨型菌、骨块化石）、下界要塞（每 384×384 区域一个，桥/走廊/烈焰人平台/下界疣房/箱子）、主世界废弃传送门（genChunk）、命令 `/locatefortress`（别名 `/locate_fortress`）、`/locatenether <群系>`。
- `js/feat_nether_mobs.js`：6 种生物的 MOB_DEFS + ai、`NetherFireball` 投射物（左键可打回）、按群系/要塞刷怪、猪灵以物易物、僵尸猪灵群体仇恨、占位模型（仅在 `MODELS[type]` 不存在时注册）。

## 对其他模块的约定

- 岩浆怪：模型按 1 格大小（size 2）构建，体型由本模块设置 `mob.mesh.scale = size/2`，`mob.size ∈ {1,2,4}`。
- 恶魂 h=4、w=2；占位模型内部放大 4 倍。烈焰人模型若提供 `P.rods`（Group）会被旋转。
- 引用但不定义：`ender_pearl`、`iron_nugget`、`spectral_arrow`、`saddle`、`*_horse_armor`、`golden_apple`、`enchanted_golden_apple`、`glistering_melon_slice`、`golden_carrot`、`clock`、`bell`、`enderman`、`hoglin`，均做了存在性判断。
- 全局函数供他人使用：`netherPlaceFire(world,x,y,z)`（含点亮传送门）、`netherFlammable(id)`、`netherFortressNear(world,x,z)`。

## 核心文件改动

无。全部通过钩子与注册表扩展（index.html 在 main.js 之后加了 3 个 script 标签）。

## 已知问题

- 下界传送门方块可被准星选中（核心射线不区分），会挡住对其后方块的点击。
- 玩家死亡信息里火焰伤害显示为"死了"（核心消息表没有 'fire'/'fireball'）。
- 火的蔓延概率为近似值，比原版略慢。
- 群系为 2D 噪声（原版下界群系是 3D）。
