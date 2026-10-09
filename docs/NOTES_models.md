# 生物模型（models）模块说明

## decision-log

- [已拍板] 用户原话："参考现在minecraft的最新的版本，你做一个完全一模一样的游戏……尽可能的还原他的功能和特性" 以及 "做完之后，把剩余的所有的东西都完善"。素材使用已打包好的 VoxeLibre（CC BY-SA）开源素材包。
- 模型尺寸/关节按 Java 版实体模型（ModelPart 的 texOffs/addBox/offset/rotation）逐个移植；坐标换算：本作 = (x, 24 - y, -z)，旋转 (rx, -ry, -rz)，欧拉顺序 ZYX（MC 模型空间与本作相差绕 X 轴 180°）。
- 苦力怕：VoxeLibre 的 vl_stalker_default 是 16x16 青色迷彩贴图（"潜伏者"），不是苦力怕外观，改为程序生成 64x32 MC 布局绿色皮肤。烈焰人无贴图，同样程序生成。
- 史莱姆/岩浆怪素材是 MC 布局的 2 倍分辨率（128x64），按逻辑尺寸 64x32 取 UV；史莱姆眼嘴画在左上角空白处，用自定义面矩形取。恶魂素材是 80x72 十字展开，底面用自定义矩形。
- 鸡腿素材只在一列像素里画了细腿，腿改为 1 像素粗细杆 + 脚趾薄片。

## 新增文件

- `js/feat_models.js`：box-UV 构建器（mcBoxGeo，支持 mirror/inflate/自定义面）、MCModel 部件构建类、各生物模型、第一人称手臂 mcFirstPersonArm。
  覆盖的 MODELS：steve pig cow sheep chicken wolf creeper zombie skeleton wither_skeleton spider cave_spider endermite
  villager witch iron_golem enderman piglin zombified_piglin ghast blaze slime magma_cube ender_dragon。fox/sulfur_cube/creaking 保留 entities.js 原程序模型。
- `index.html`：在 `js/main.js` 之后引入 `js/feat_models.js`（其他 feat_*.js 合并时也要放在它们之后）。

## 模型对象约定（给其他模块）

`MODELS[type](small) => { root, mats, P, tick? }`
- `P.head / P.body / P.legs / P.arms`：legs = [右, 左]（四足为 [右后, 左后, 右前, 左前]），arms = [左臂, 右臂]，与 Mob.animate 的相位配合成对侧手脚同步。
- `tick(dt, mob, sp)`：每帧在 Mob.animate 末尾调用（头部看向玩家、额外动画）。
- 生物实例字段（由各功能模块设置，模型自动响应）：
  `sheared`（羊毛层隐藏）、`woolColor`（16 色染料名）、`profession`（farmer librarian armorer weaponsmith toolsmith butcher leatherworker cleric shepherd fletcher cartographer mason fisherman nitwit none）、
  `nod/trading/shake`（村民点头/摇头）、`saddled`（猪鞍）、`angry/tamed/owner`（狼贴图与尾巴）、`angry/screaming/aggro`（末影人张嘴）、`carried/carry`（末影人搬方块姿势）、
  `angry/angerT`（僵尸猪灵举臂）、`firing/charging`（恶魂张嘴贴图）、`flapSpeed`（末影龙扇翅速度）、`attackCd`（僵尸/铁傀儡/凋灵骷髅攻击动作）。
- 史莱姆/岩浆怪按 `mob.h` 缩放（模型 8 像素 = 0.5 格），不同大小只需改 h/w。
- 恶魂整体 4.5 倍（与 MC 一致，触手垂在碰撞箱下方）；凋灵骷髅 1.2 倍；洞穴蜘蛛 0.7 倍。
- P.wings / P.wingTips / P.neck / P.tail / P.jaw（末影龙），P.tentacles（恶魂），P.rods（烈焰人），P.slices（岩浆怪），P.wool（绵羊）。

## 对核心文件的改动（逐条）

1. `js/entities.js` `Mob.setSheared`：若 `model.P.wool` 存在则只切换羊毛层可见性并返回（原逻辑改 body 材质贴图，会破坏皮肤模型）。没有羊毛层的旧模型仍走原逻辑。
2. `js/entities.js` `Mob.animate` 末尾：增加 `if (this.model.tick) this.model.tick(dt, this, sp);`，放在光照调色之后，让发光生物（烈焰人）和额外动画能覆盖默认值。
3. `js/main.js` `updateHand` 空手分支：优先用 `mcFirstPersonArm()`（character 皮肤右臂盒子），缺素材时退回原纯色方块。
4. `js/main.js` 第三人称 playerModel：手臂摆动相位从 `(i ? -sw : sw)` 改为 `(i ? sw : -sw)`，配合新模型 arms=[左, 右] 的顺序，保持对侧手脚同步、右臂（arms[1]）挥动。

## 实测（file:// + chrome-devtools）

- 各生物正/侧/背三向截图核对：脸朝 +Z，背部/尾部贴图在后，腿位置正确，无镜像错误。
- mob.steer 向 +X 行走 2.5 秒：yaw=π/2，模型面朝行进方向。
- 绵羊：白/剪毛/红/淡蓝/黑/粉色幼崽对比正确；村民 none/farmer/librarian/cleric 外观各不相同；末影龙两次截图翅膀上扬/下压。
- 第三人称背面、steve 正侧背、第一人称手臂截图正常；30 只混合生物约 116 FPS；控制台无报错。

## 已知问题

- 生物手持物品（骷髅的弓、铁傀儡的花、女巫的药水）未渲染。
- 末影龙脖子/尾巴为程序化摆动，不跟随历史轨迹（MC 用 latency pos）；扇翅/下颚开合已做。
- 恶魂触手贴图取自十字展开图中的条纹区域，与原版细节略有差异。
