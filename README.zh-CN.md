<div align="center">

<img src="assets/icon.svg" width="120" alt="WebCraft 图标">

# WebCraft

**在浏览器里跑的方块沙盒游戏——双击 `index.html` 就能玩**

无限地形、洞穴矿石、下界与末地（含末影龙之战）、红石、村庄交易、附魔酿造——<br>
纯 JavaScript + Three.js，不用构建、不用服务器、不用安装，存档就在浏览器里。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![素材: CC BY-SA](https://img.shields.io/badge/素材-CC%20BY--SA%20(VoxeLibre)-lightgrey)](assets/CREDITS.md)
[![在线试玩](https://img.shields.io/badge/在线-试玩-brightgreen)](https://tomeageer.com/zh/projects/webcraft/)
[![无构建](https://img.shields.io/badge/构建-无-brightgreen)](#快速开始)
[![埋点](https://img.shields.io/badge/埋点-无-success)](#隐私)

[**▶ 在线试玩**](https://tomeageer.com/zh/projects/webcraft/) · [快速开始](#快速开始) · [工作原理](#工作原理) · [常见问题](#常见问题) · [**English**](README.md)

<img src="docs/images/world.webp" width="720" alt="WebCraft——清晨的海岸线，带 HUD 与小地图">

</div>

---

> WebCraft 是受 Minecraft 启发的非官方同人作品，与 Mojang、Microsoft 无关，也未经其认可；
> **不包含任何 Mojang 素材**——贴图、音效与音乐全部来自开源游戏 [VoxeLibre](https://github.com/VoxeLibre/VoxeLibre)。
> 「Minecraft」是 Mojang Synergies AB 的商标。

## 为什么做 WebCraft

网页上的方块游戏大多停在 2009 年那种「放方块、拆方块」的演示。WebCraft 想要完整的生存循环，同时保持好改：

- 🌍 **真正的生存游戏**——无限地形、洞穴矿石与深板岩层，昼夜、雨雪雷暴，饥饿、饱和、氧气、经验、摔落伤害、繁殖、睡觉跳夜
- 🔥 **三个维度**——下界（五种群系、熔岩海、下界要塞、废弃传送门、坐标 8:1）与末地（要塞与末影之眼、黑曜石柱、末地水晶、末影龙首领战、龙蛋）
- ⚡ **能算东西的红石**——0–15 级功率、红石火把、中继器、比较器、侦测器、活塞与粘性活塞、漏斗、发射器、投掷器、音符盒、阳光探测器、TNT
- 🏘 **村庄**——四种风格村庄、职业村民与五级交易、铁傀儡、各类职业方块（含锻造台下界合金升级）、带刷怪笼的地牢
- ✨ **附魔与酿造**——附魔台与书架加成、铁砧、砂轮、18 种药水（延长/增强/喷溅/滞留）、六档盔甲与全部附魔效果
- 🧩 **插件化架构**——每个大系统都是一个 `js/feat_*.js` 插件，通过文档化的钩子注册方块、物品、配方、生物、模型、界面、命令和维度生成器
- 📦 **零配置**——经典脚本，不打包、无模块、无服务器，`file://` 直接跑；世界存在 IndexedDB
- 🆓 **开放**——代码 MIT，素材 CC BY-SA，约 16,600 行可读的 JavaScript

|  | WebCraft | Minecraft Classic（网页版） | ClassiCube | VoxeLibre |
|---|---|---|---|---|
| 浏览器直接玩、免安装 | **是** | 是 | 是（网页客户端） | 否——需要 Luanti |
| 源码 | **开源（MIT）** | 闭源 | 开源（BSD 类） | 开源（GPLv3） |
| 内容 | **生存：下界、末地、红石、村庄、附魔、酿造** | 2009 年 Classic：32 种方块、创造模式 | Classic 时代方块 | 完整生存游戏 |
| 语言 | JavaScript + Three.js | JavaScript | C | Lua |
| 素材许可 | **CC BY-SA（VoxeLibre）** | Mojang | 社区 Classic 风格素材 | CC BY-SA |

## 快速开始

```bash
git clone https://github.com/TomEageer/webcraft.git
open webcraft/index.html          # macOS——或者直接双击
```

任何现代桌面浏览器都行（Chrome、Edge、Safari、Firefox）。也可以不下载，直接[**在线试玩**](https://tomeageer.com/zh/projects/webcraft/)。

**操作：** WASD 移动 · 空格跳跃（创造模式双击飞行）· Shift 潜行 · Ctrl 疾跑 · 鼠标左键挖掘/攻击 ·
右键放置/使用（按住吃东西、拉弓）· 1–9/滚轮 切换物品 · E 物品栏 · Q 丢弃 · T 聊天 · / 命令 · M 地图 ·
F3 调试信息 · F2 截图 · F5 切换视角 · ESC 暂停

## 工作原理

<p align="center"><img src="docs/images/redstone.webp" width="720" alt="红石展示：活塞、中继器、红石灯与门"></p>

| 部分 | 文件 | 作用 |
|---|---|---|
| 核心 | `world.js`、`mesher.js`、`player.js`、`entities.js`、`main.js` | 16×16×384 区块、面剔除网格 + 平滑光照与 AO、天空光与方块光、流体、物理、生物 |
| 内容数据 | `blocks.js`、`recipes.js`、`textures.js`、`icons.js` | 方块定义（`defBlock`）、配方、启动时生成的贴图图集、物品图标 |
| 插件 | `feat_*.js`（19 个） | 下界、末地、红石、村庄、附魔酿造、建筑与交通、粒子、生物模型 |
| 界面与存档 | `ui.js`、`hud.js`、`creative.js`、`save.js` | 标题画面与菜单、HUD 与小地图、创造物品栏、IndexedDB 存档 |
| 素材 | `assets/pack_tex.js`、`assets/sounds`、`assets/music` | 由 `tools/build_pack.py` 从 VoxeLibre 生成；因为 `file://` 不能 fetch，贴图以 data URL 内嵌 |

所有脚本共享一个全局作用域、按固定顺序加载；插件只在顶层登记条目，真正的初始化在 `window.load` 之后。
完整的钩子说明（方块、盒子形状、生物、模型、界面、命令、维度生成器）见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，
各模块的说明与已知问题见 `docs/NOTES_*.md`。

### 可选：用你自己的原版素材

如果你拥有 Minecraft Java 版，可以用 `tools/build_vanilla.py`（贴图与音效）和 `tools/build_worldgen.mjs`
（借助 [deepslate](https://github.com/misode/deepslate) 生成原版主世界地形）从**你自己本机安装的客户端**生成一个
**仅限本地使用**的覆盖包到 `assets/vanilla/`。游戏会自动加载它；没有时回到 VoxeLibre 素材和自带的地形生成器。
这个目录已被 git 忽略：**不要提交或分发**——那些文件版权属于 Mojang。

## 隐私

不用注册、没有统计、没有网络请求。世界和设置都存在浏览器的 IndexedDB 里，不会离开你的电脑。

## 常见问题

**这是 Minecraft 吗？** 不是。这是一个以原作规则和内容为参考、独立重写的实现，只使用开放许可的素材。

**贴图为什么和原版不一样？** 因为 Mojang 的素材有版权。WebCraft 用的是 VoxeLibre 的素材，主要基于 Pixel Perfection 材质包（CC BY-SA 4.0）。

**手机能玩吗？** 暂时不能，需要键盘和鼠标。

**能联机吗？** 暂时不能。局域网联机有原型，还没发布。

**还有什么没做？** 多人联机、末地城与鞘翅、海底神殿、林地府邸、告示牌与旗帜、命令方块。

## 运行要求

支持 WebGL 的桌面浏览器。支持直接从磁盘打开 `index.html`。

## 支持

WebCraft 免费。如果你玩得开心，见 [DONATE.md](DONATE.md)。

## 致谢

- 贴图、音效与音乐：[VoxeLibre](https://github.com/VoxeLibre/VoxeLibre) 及其贡献者——完整署名见 [assets/CREDITS.md](assets/CREDITS.md)
- 渲染：[Three.js](https://threejs.org) r128（MIT）

## 联系

[tomeageer@gmail.com](mailto:tomeageer@gmail.com) · [tomeageer.com](https://tomeageer.com)

## 许可

代码：[MIT](LICENSE)。`assets/` 下的素材：沿用其原始许可（主要为 CC BY-SA 3.0 / 4.0），见 [assets/CREDITS.md](assets/CREDITS.md)。
