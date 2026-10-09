# 村庄模块（village）开发记录

## decision-log

- [已拍板] 用户需求原话："参考现在minecraft的最新的版本，你做一个完全一模一样的游戏……尽可能的还原他的功能和特性" 以及 "做完之后，把剩余的所有的东西都完善"。素材使用已打包好的 VoxeLibre（CC BY-SA）开源素材包。
- 锻造台只有「基础物品 + 下界合金锭」两格，不要求下界合金升级锻造模板（本作无模板物品）。
- 门属于 redstone 模块且 meta 格式未知，房屋一律只留 2 格高门洞。
- 武器匠工作站点是砂轮（magic 模块）：`B.grindstone` 不存在时铁匠铺改放锻造台（工具匠）；牧师（酿造台）、皮匠（炼药锅）同理，方块不存在则不生成对应建筑/职业。

## 文件

- `js/feat_village.js`：土径、堆肥桶、讲台、锻造台、木桶、切石机、制图台、制箭台、织布机、烟熏炉/高炉（含燃烧态）、钟、刷怪笼；下界合金工具（未定义时）；配方；界面 SCREENS.smoker / blast_furnace / barrel / smithing / stonecutter；烟熏炉高炉 tick、刷怪笼刷怪 + 旋转虚影；锹把草方块变土径、锄把土径变耕地。
- `js/feat_village_gen.js`：按 512×512 区域、40% 概率规划村庄（plains/desert/taiga/snowy_plains/savanna），区域种子决定中心、主干道 + 支路、房屋（小屋/大屋/图书馆/铁匠铺/屠夫屋/神殿/农田）、路灯、水井和钟；每个区块只写自己范围内的方块。地牢（9×9 外壳、7×7 内室、刷怪笼 + 1~2 战利品箱）、沙漠水井。`/locatevillage [tp]`。
- `js/feat_village_mobs.js`：村民（MOB_DEFS.villager + ai，mob.profession 见 `mob.vrec.prof`）、交易界面 SCREENS.trade（5 级、补货、玩家/村民经验）、铁傀儡（hp 100、击飞、掉铁锭与虞美人、搭建召唤）、僵尸以村民为目标、村庄记录存档（save/load）、占位模型 MODELS.villager / iron_golem（仅在未定义时注册）。

## 对外接口（供其他模块/测试）

`window.VILLAGE`：`locate(world,x,z)`、`regionPlan(world,rx,rz)`、`plansNear`、`records`、`ringBell`、`selectOffer(ui,i)`、`doTrade`、`tryBuildGolem`、`spawnVillager`、`spawnGolem`、`jobOfBlock`、`dungeons`（本会话生成的地牢列表）。

## 核心文件改动

- 仅 `index.html`：在 `main.js` 之后加入三个 `<script>`。未改任何 `js/` 核心文件。
- 样式通过 JS 注入 `<style id="village-css">`，不改 index.html 的 CSS。

## 已知限制

- `mob.profession` 是只读 getter，指向 `mob.vrec.prof`（职业记录随村庄存档）。
- 寻路为直线转向 + 进出门洞的路点，复杂地形可能卡住（卡住时随机绕行）。
- 繁殖为简化版：农民收割成熟作物积累村庄食物，有空床且食物 ≥6 时约每分钟有一半概率生一个小村民。
- 交易数量受物品存在与否影响（如土豆/附魔书由其他模块定义，存在后自动出现）。
- 讲台、制图台、织布机无专属界面（制图台/织布机右键提示）。
