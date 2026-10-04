简体中文 | [English](README.md)

# Malody ⇄ osu!mania 转换器

**双向转换，纯本地运行、零依赖、离线可用。**

| 方向 | 用途 |
| --- | --- |
| `.mcz` → `.osz` | Malody 谱面拿去 osu! 玩 |
| `.osz` / 含 .osu 的 zip / osu! 歌曲文件夹 → `.mcz` | **osu! 谱面拿去 Malody 编辑器修改** |

> [!WARNING]
> **本项目处于测试阶段（Beta），仍可能存在 bug。**
>
> 转换核心已在 258 张真实 osu!mania 谱面、**661,862 个音符**上做过往返比对
> （复现命令见下方「已验证」），但 osu! 谱面与 Malody 各版本的写法差异很大，
> 仍有尚未覆盖的边界情况。遇到任何异常——音画不同步、音符错位或丢失、
> 导入失败、程序崩溃等——都欢迎到
> [Issues](https://github.com/ScarletSnow123/Malody_osu_con/issues) 反馈。
> **附上出问题的谱面或完整错误信息**能大幅加快排查。

## 目录

- [快速开始](#快速开始)
  - [前提：Node.js](#前提nodejs)
  - [四个入口怎么选](#四个入口怎么选)
  - [方式一：图形界面 `GUI.bat`](#方式一图形界面-guibat)
  - [方式二：拖放 `转换.bat`](#方式二拖放-转换bat)
  - [方式三：命令行 `命令行.bat`](#方式三命令行-命令行bat)
  - [方式四：网页应用 `OsuToMalody.html`（备用）](#方式四网页应用-osutomalodyhtml备用)
- [支持的转换](#支持的转换)
- [常见问题速查](#常见问题速查)
- [已验证](#已验证)
- [已知限制](#已知限制)
- [详细文档](#详细文档)
- [文件说明](#文件说明)
- [致谢](#致谢)
- [许可证](#许可证)

## 快速开始

### 前提：Node.js

`GUI.bat` / `转换.bat` / `命令行.bat` 都只是外壳，真正的转换由 `core.mjs` 完成，
所以**这三个入口需要 Node.js**（LTS 版即可）。而 **`OsuToMalody.html` 不需要**——
转换逻辑整个内联在网页里。

`.bat` + `.ps1` 会自动依次从 PATH 和常见安装位置找 node，都找不到就弹窗提示你去
<https://nodejs.org> 装。想自己确认：开个终端敲 `node -v`。

### 四个入口怎么选

| 入口 | 什么时候用 |
| --- | --- |
| [`GUI.bat`](#方式一图形界面-guibat) | 日常使用——窗口界面，选项齐全，带日志 |
| [`转换.bat`](#方式二拖放-转换bat) | 拖放——步骤最少 |
| [`命令行.bat`](#方式三命令行-命令行bat) | 批量、递归、写脚本 |
| [`OsuToMalody.html`](#方式四网页应用-osutomalodyhtml备用) | 便携／免安装——**备用，非推荐** |

### 方式一：图形界面 `GUI.bat`

1. 双击 `GUI.bat`，等 1～2 秒窗口出现
2. 选文件或文件夹，按需调选项（默认值一般够用）
3. 点 **Start**，看日志，完成后点「打开输出目录」

### 方式二：拖放 `转换.bat`

把 `.mcz` / `.osz` / `.osu` 文件或文件夹拖到 `转换.bat` 图标上松手即可。
**不问任何选项**，全部用默认值；要调选项用 GUI 或命令行。

### 方式三：命令行 `命令行.bat`

```bash
node cli.mjs "D:\osu!\Songs\某曲目" -o "out.mcz"
node cli.mjs "某谱面包.mcz" -o "out.osz"
node cli.mjs "D:\osu!\Songs" -r -o "D:\转换输出"     # 整个曲库
```

> ⚠️ **路径务必用双引号包起来**，含空格或 `&` 等字符时会被截断。

完整用法与全部选项见 [`docs/entries.md`](docs/entries.md)。

### 方式四：网页应用 `OsuToMalody.html`（备用）

双击即用浏览器打开。**不需要 Node.js，也不依赖同目录任何文件**——可以单独拷到
U 盘、别的电脑、发给别人用。完全离线，不上传任何文件。

> [!CAUTION]
> **这是备用入口，不是推荐做法。** 日常和批量转换请用上面三个 Node.js 入口。
> 网页版只适合「换了台电脑装不了 Node.js、手头只有一两个包」这种情况：
>
> - **一个包 = 一首歌**，没有批量和递归。用它指向整个 osu! 曲库（如 `D:\osu!\Songs`）
>   会把目录里所有 `.osu` **并进同一个 `.mcz`**，而不是逐首转换。
> - **全部数据都在浏览器标签页内存里**。整包读进页面，包一大就容易卡顿甚至崩溃，
>   桌面版／命令行没有这个上限。
> - **产物位置不可控**。只能落到浏览器下载目录；一次转多个包时，浏览器可能弹
>   「是否允许此网站下载多个文件」。
> - **不能脚本化**。没有递归、批量、`-o` 这类参数。

## 支持的转换

| 输入 | 输出 | 长按 | SV 绿线 | 自定义音效 | offset 换算 | 混合键数 |
| --- | --- | --- | --- | --- | --- | --- |
| `.mcz` | `.osz` | ✓ | ✓ | ✓ | ✓ | — |
| `.osz` / 含 `.osu` 的 `.zip` | `.mcz` | ✓ | ✓ | ✓ | ✓ | 拆成 `_4K.mcz` / `_7K.mcz` |
| `.osu`（单张谱面） | `.mc` | ✓ | ✓ | ✓ | ✓ | — |
| osu! 歌曲文件夹 | `.mcz` | ✓ | ✓ | ✓ | ✓ | 自动拆分 |

## 常见问题速查

| 现象 | 原因与解决 |
| --- | --- |
| 双击 `.bat` 黑窗一闪就没 | 没装 Node.js，或 `cli.mjs` 不在同一目录 |
| `GUI.bat` 双击没反应 | 等 1～2 秒；仍无则多半被杀毒软件拦了 PowerShell 脚本，加白名单或改用 `OsuToMalody.html` |
| 杀软报毒／拦截 | `.bat` + `.ps1` + PowerShell 是常见误报模式。只有 `OsuToMalody.html` 不碰 PowerShell |
| 找不到输出文件 | GUI／拖放默认放**桌面**；网页版在**浏览器下载目录** |
| 导入 Malody 后源文件消失了 | Malody 正常行为（导入即删除），需要时重新生成 |
| 导入后看不到 7K 难度 | Malody 4.x **按键数分页显示**，切到 7K 分页即可 |
| 成品进游戏整体偏早/偏晚 | 切换「按 Malody offset 换算音画同步」（命令行 `--no-sync`） |
| 某个 Malody 版本读不了 | 把「输出格式」改成「精简」（命令行 `--mc-style minimal`） |

## 已验证

| 测试 | 规模 | 结果 |
| --- | --- | --- |
| Malody 原始 → osz → mcz 往返 | 5,483 音符 | 音符/长按/列/长按标记**全部一致**；时间偏差最大 0.947ms、平均 0.021ms |
| osu! 曲库批量往返 | 45 集 / 258 谱 / **661,862 音符** | 703,008 次比较：最大 **2ms**、平均 **0.21ms**、>5ms **0 个**；不一致 **0** |
| 绿线（SV）往返 | 6,842 条 | 卷速倍率**全部一致** |
| 产出结构 | 258 谱 | 顶层键、`mode=0`、`mode_ext.column` 正确，零负小节 |

复现命令：`node batch_test.mjs "D:\osu!\Songs" 45`（需本地有 osu! 曲库）。
详细数据见 [`docs/testing.md`](docs/testing.md)。**MalodyV** 与 **Malody 4.3.7**
均已在真机实测导入通过，见 [`docs/compatibility.md`](docs/compatibility.md)。

## 已知限制

- **音效类型**：osu 的 `hitSound` 位掩码（Whistle / Clap / Finish）**无法映射**——
  它指的是「用哪一类音效」，Malody 的 `sound` 指的是「播放哪个文件」。能映射的是
  谱面里**明确写了文件名**的自定义 sample（⇄ `note.sound`）。
- **模式**：只处理 osu!mania（`Mode: 3`），其它模式会跳过并提示。Malody 侧统一输出 `mode: 0`。
- **混合键数**：同一谱面集含 4K 和 7K 时会自动拆成多个 `.mcz`。
- 只支持非 ZIP64 的压缩包。

## 详细文档

| 文档 | 内容 |
| --- | --- |
| [`docs/entries.zh-CN.md`](docs/entries.zh-CN.md) | Node.js 安装、四个入口详解、命令行全部选项、选项含义对照 |
| [`docs/faq.zh-CN.md`](docs/faq.zh-CN.md) | 完整常见问题 |
| [`docs/format-spec.zh-CN.md`](docs/format-spec.zh-CN.md) | 格式规则（拍、BPM/SV、列、BGM、音画同步、负小节处理） |
| [`docs/compatibility.zh-CN.md`](docs/compatibility.zh-CN.md) | MalodyV / 4.3.7 方言差异、`--mc-style` |
| [`docs/testing.zh-CN.md`](docs/testing.zh-CN.md) | 验证数据与复现命令 |

英文版：[entries](docs/entries.md) · [faq](docs/faq.md) ·
[format-spec](docs/format-spec.md) · [compatibility](docs/compatibility.md) ·
[testing](docs/testing.md)

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `GUI.bat` / `gui.ps1` | 图形界面入口（WinForms 窗口、选择框、日志） |
| `转换.bat` / `convert.ps1` | 拖放程序入口 |
| `命令行.bat` | 打开已设好工作目录的终端 |
| `OsuToMalody.html` | 单文件应用（构建产物，**备用入口，非推荐用法**） |
| `core.mjs` | 转换核心：ZIP 读写 + 时间轴 + 双向转换。**唯一事实来源** |
| `cli.mjs` | 命令行入口（含目录输入） |
| `app.template.html` / `build.mjs` | 界面模板（含 `/*__CORE__*/` 占位符）与构建脚本 |
| `verify.py` / `compare_roundtrip.py` | `.osz` 校验与往返对比 |
| `batch_test.mjs` | osu! 曲库批量保真度测试 |

改完 `core.mjs` 后重新构建：`node build.mjs`

## 致谢

格式逆向工作参考了 **rmstZ**（作者 [lrfasd](https://lrfasd.github.io/rmstZ/)，
`Copyright © 心のsky Group`）与 **rconv**（[prefixaut/rconv](https://github.com/prefixaut/rconv)）。

转换逻辑（`core.mjs`）为**独立实现，未直接复制任何一方的代码**。

此外，**@Hanemi** 提供了部分 Malody 谱面样本并完成 Malody 端测试，
**@EbonyVeil** 完成了 HTML 端测试，谨此致谢。

> ⚠️ rmstZ 仓库未附带 LICENSE，本项目**不转载、不分发**其文件，需要请前往
> [官方页面](https://lrfasd.github.io/rmstZ/) 获取。

完整出处与授权说明见 **[CREDITS.zh-CN.md](CREDITS.zh-CN.md)**。

## 许可证

本项目以 **MIT License** 发布，见 [LICENSE](LICENSE)。MIT 只覆盖本项目自己的代码，
第三方资料的出处与授权情况见 [CREDITS.zh-CN.md](CREDITS.zh-CN.md)。

```
Copyright (c) 2026 ScarletSnow123
```