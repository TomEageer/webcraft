# magic 模块（附魔与酿造）开发记录

## decision-log

- [已拍板] 用户需求原话："参考现在minecraft的最新的版本，你做一个完全一模一样的游戏……尽可能的还原他的功能和特性" 以及 "做完之后，把剩余的所有的东西都完善"。素材使用已打包好的 VoxeLibre（CC BY-SA）开源素材包。

## 新增文件

- `js/feat_magic.js`：药水（18 种 × 普通/延长/增强 × 饮用/喷溅/滞留，共 114 个物品）、酿造台（world.tiles 存状态，离开界面继续酿造）、炼药锅（meta=水位 0-3）、玻璃瓶、喷溅/滞留投掷实体与效果云、附魔之瓶与经验球、金苹果、附魔金苹果、奶桶（右键牛挤奶）、蜘蛛眼（包装 MOB_DEFS.spider.drops）、发酵蛛眼、闪烁的西瓜片、金胡萝卜、兔子脚、糖（仅在不存在时定义）；样式通过注入 `<style id="mg-style">`。
- `js/feat_magic_ench.js`：附魔台（Java 版书架计数、选项花费与权重随机算法、玩家附魔种子随存档）、附魔书、铁砧三档（材料修复/同类合并/附魔书合并/冲突与上限/改名/累计修复花费 rc/过于昂贵/12% 损坏）、砂轮（祛魔返还经验、合并耐久）、附魔台漂浮书。
- `index.html`：main.js 之后引入上述两个脚本。

## 核心文件改动（最小化）

1. `js/ui.js` `itemLabel()`：`if (it.food)` 改为 `if (it.food && it.food[0])`。原因：药水/奶桶需要 `food:[0,0]` 才能走核心的饮用流程，避免提示里出现“饥饿值 +0”。
2. `js/ui.js` `closeScreen()` 归还鼠标上物品时补传 `s.ench`（inventory.add 与 dropItem）。原因：关闭任意界面时鼠标上的附魔物品会丢失附魔。
3. `js/main.js` `dropHeld()`：dropItem 补传 `st.ench`。原因：按 Q 丢出附魔物品会丢失附魔。

## 按名字引用（归属其他模块，本模块不定义）

nether_wart、blaze_powder、blaze_rod、magma_cream、ghast_tear、gold_nugget（nether）；carrot、pufferfish、stone_slab（building）；phantom_membrane、dragon_breath（未分配，仅作配方/酿造引用）。

## 已知问题

- 自定义名称（stack.name）与修复花费（stack.rc）在核心 inventory.add / 掉落拾取路径中不保留（核心堆叠接口只有 id/n/dmg/ench）；在界面内移动不受影响。
- 酿造台 shift 点击烈焰粉时按槽位顺序放入，可能先进材料槽而非燃料槽。
- 附魔金苹果暂无战利品来源（无箱子战利品钩子），仅创造模式获得。
- sugar 若 building 模块之后也定义，会出现重复的创造栏条目，合并时需统一。
