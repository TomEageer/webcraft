# 末地模块（end）开发记录

场景声明：S3 计划功能开发（新功能，按任务书实现，未走完整 BMAD 七阶段；由主代理统一验收）。

## decision-log

- [已拍板] 用户原话："参考现在minecraft的最新的版本，你做一个完全一模一样的游戏……尽可能的还原他的功能和特性"
- [已拍板] 用户原话："做完之后，把剩余的所有的东西都完善"
- [已拍板] 素材使用已打包好的 VoxeLibre（CC BY-SA）开源素材包。
- 本模块取舍：主岛半径取 80～98（任务书写约 100～120）。原因：出生平台固定在 (100,49,0)，岛半径大于 100 时平台会嵌进岛底，实测截图确认后缩小，使平台悬在岛边缘外，与原版一致。
- 末地传送门框架激活不校验朝向（只要 12 个框架都嵌眼即可），比原版宽松。
- 紫珀柱配方用 2 个紫珀块合成 2 个（原版用紫珀台阶，本作暂无紫珀台阶）。

## 新增文件

- `js/feat_end_gen.js`：END 共享状态、要塞布局与区块生成、末地维度 DIM_GEN.end（主岛、外围小岛、紫颂植物、10 根黑曜石柱、返回传送门基岩框架）。
- `js/feat_end_mobs.js`：随机传送工具、占位模型（enderman/endermite/ender_dragon/end_crystal，MODELS 不存在时才注册）、投掷物与特效实体（末影珍珠、末影之眼、龙火球、龙息云、龙死亡动画）、MOB_DEFS 与 AI。
- `js/feat_end.js`：方块/物品/配方/纹理、FEATURE 钩子（genChunk、useBlock、useItem、breakSpeed、damageTaken、spawn、tick、frame、blockUpdate/scheduledTick/randomTick、save/load）、命令。

## 核心文件改动（逐条）

1. `index.html`：main.js 之后加入三个脚本 `feat_end_gen.js`、`feat_end_mobs.js`、`feat_end.js`（顺序有依赖）。
2. `js/entities.js` `Entity.lightAt()` 最后一行：最低亮度由常量 0.06 改为 `DIM_INFO[dim].entityLight || 0.06`。原因：末地无天空光，生物、掉落物、第一人称手持物品全部发黑。字段为可选，其他维度不设置则行为不变。
3. `js/ui.js` `/locate` 分支开头加一行：`/locate structure <名称>` 转发到 `COMMANDS['locate' + 名称]`。原因：让 `/locate structure stronghold` 可用；其他模块（如村庄）可注册 `COMMANDS.locatevillage` 复用。

## 对外接口 / 约定

- 生物类型：`enderman`、`endermite`、`ender_dragon`、`end_crystal`（models 模块可覆盖 MODELS；龙 AI 会使用可选的 `P.wings`、`P.tips`、`P.tail`、`P.jaw`，缺失时跳过）。
- 生物实例标志：末影人 `angry`/`attacking`/`carry`（搬运的方块 id），模型可据此做张嘴等表现。
- 命令：`/locatestronghold`、`/locate structure stronghold`、`/enddragon`（查看龙战状态）。
- 末地传送门框架 meta：低 2 位朝向（0:-Z 1:+X 2:+Z 3:-X），bit 4（值 4）表示已嵌入末影之眼。
- 存档键 `feat.end`：`{killed, everKilled, hp, crystals[10], pending, placed[], respawnT, eggPlaced}`。
- 引用但不定义（归属其他模块）：`blaze_powder`、`blaze_rod`、`ghast_tear`、`iron_bars`（存在才用于牢房与柱顶笼子）、`carved_pumpkin`（戴上后不激怒末影人）、`enchanted_book`（存在才进图书馆战利品）。

## 实测（Chrome DevTools，file:// 打开本副本）

- 要塞：种子 12345，最近要塞传送门房间 (-153,25,711)；截图确认石砖/苔石砖房间、熔岩池、12 个框架（生成时 1 个自带眼）。
- 嵌满 11 个眼后中心 3x3 生成 9 个 end_portal，聊天提示，星空贴图动画。
- 走入传送门 → 末地 (100.5,49,0.5)，脚下黑曜石平台；/dim end 路径也会重建平台。
- 末地俯瞰截图：主岛、黑曜石柱、柱顶水晶、龙与水晶治疗光束、末影人、血条。
- 龙：受 30 伤害血条 85.5%，水晶回血；摧毁水晶 → 爆炸、状态位清零；strafe 喷火球 → 龙息云；charge 撞击玩家 10 伤害并击退。
- 生命设为 1 击杀 → 死亡动画、经验升到 47 级、返回传送门 20 格全部激活、柱顶龙蛋；进入返回门回到主世界出生点，血条隐藏。
- 存档后刷新重载：龙战状态保留，再进末地不刷龙、9 个水晶、传送门仍开启。
- 末影人：注视头部 → 激怒追击，造成 7 伤害；被箭射中取消伤害并传送 15 格；末地大量刷新。
- 末影珍珠落点传送并扣 5 血；末影之眼朝要塞方向飞出后掉落/碎裂；紫颂果随机传送；龙蛋右键/左键传送；末地水晶可放在基岩上。
- 控制台无脚本报错；所有 js 已 `node --check`。

## 已知问题 / 未做

- 龙不破坏飞过的方块；没有末地折跃门、末地城、潜影贝、鞘翅。
- 只有柱顶水晶和玩家放置的水晶会存档；玩家在主世界放的水晶也会存，但仅在相应维度生成。
- 龙在玩家渲染距离以外时会被核心区块卸载清除，随后在中心以保存的血量重新出现。
- 要塞没有铁门（门归 redstone 模块）、没有刷怪笼和蛛网（可选项未做）。
- 末影人手持方块时手臂姿势会被核心 animate 覆盖（待 models 模块处理）。
