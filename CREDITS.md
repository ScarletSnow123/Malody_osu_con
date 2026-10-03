# 致谢与第三方说明

本项目的谱面格式逆向工作参考了以下第三方资料。

> **转换逻辑（`core.mjs`）为独立实现，未直接复制任何一方的代码。**
> ZIP 读写使用浏览器原生 `DecompressionStream` / `CompressionStream`；
> 时间轴积分、负小节平移、音画同步模型均为独立推导，并用真实谱面做了双向验证。

---

## rmstZ —— 主要参考

|  |  |
| --- | --- |
| 项目 | **rmstZ** —— *TransData for Music Games* |
| 作者 | **lrfasd** |
| 项目主页 | <https://lrfasd.github.io/rmstZ/> |
| 源码仓库 | <https://github.com/lrfasd/lrfasd.github.io> |
| 版权署名 | `Copyright © 心のsky Group` |
| 本文件版本 | [rmstZ_20221022.html](https://lrfasd.github.io/rmstZ/rmstZ_20221022.html) |
| 更新历史 | <https://lrfasd.github.io/rmstZ/WHATSNEW.html> |

一个在浏览器里运行的音游谱面转换工具，覆盖 30 余种谱面格式的读写、
包文件资源提取、音频波形采谱、谱面绘图等。本次逆向主要参考它确认 Malody 侧的格式语义。

### 具体参考到的内容

| 内容 | rmstZ 中的对应实现 |
| --- | --- |
| Malody 拍的取值语义 `a + b/c` | `fromBeatArray()` 里的 `b.fAdd(c.fDiv(d))` |
| 列号 ⇄ x 坐标换算 | `trackToX()` = `(column*2+1)/(key*2)` |
| 长按与 BGM 事件的判定 | `type == 1` 且无 `column` 的条目视为音频事件 |
| BGM `offset` 与 osu `AudioLeadIn` 的写法 | `toOsuText()` |
| 写出 `.mc` 时的拍分母策略 | `toBeatArray()` 取 768 再按 2、3 约分（本项目改用实测更常见的 288） |
| 各格式输入/输出能力的边界 | `SupportFile` / `SupportAudio` / `SupportImage` / `SupportPkg` 列表 |

### ⚠️ 关于转载

- rmstZ 的仓库**未附带任何 LICENSE**：GitHub API 查询 license 返回 **404**，仓库元数据 `license: null`
- 文件内署名为 `Copyright © 心のsky Group`（该署名也会被绘制进生成的谱面预览图）
- 作者主页表述为「代码开源，避免后门，保证使用安全」，即本意为公开可查阅
- 仓库话题标签：`rmstz`、`musicgame`

**因此本项目不转载、不分发 rmstZ 的 HTML 文件。** 需要使用请前往
[官方页面](https://lrfasd.github.io/rmstZ/) 获取。

另外该文件运行时还依赖同目录的 `search.js` / `fileInfo.js` / `addin.js` / `imd.js`，
单独一份 HTML 并不完整。

> 补充：`github.com/mirrorange/lrfasd` 经 API 查证**只是 fork**（`"fork": true`，2023-10-05 创建、未修改），不是源头。

---

## rconv —— Malody 格式类型定义

[Nim](https://nim-lang.org/) 编写的音游谱面转换库。其 Malody 类型定义是本次逆向的重要旁证
（rmstZ 侧重实现，rconv 侧重类型声明，两者交叉验证）。

- 文档：<https://prefixaut.github.io/rconv/rconv/malody.html>
- 源码：<https://github.com/prefixaut/rconv>

| 内容 | 用于确认 |
| --- | --- |
| `Beat = array[3, int]`（小节 / snap 索引 / snap 大小） | 拍三分量的语义 |
| `SoundCueType`：`Effect=0` / `Song=1` / `KeySound=2` | BGM 事件 `type: 1` 的含义 |
| `ChartMode`：`Key=0`、`Catch=3`、`Pad=4`、`Taiko=5`、`Ring=6`、`Slide=7` | 模式编号 |
| `SongData`：`title` / `titleorg`、`artist` / `artistorg` | 「罗马音 / 原文」的区分 |
| `ModeData.bar_begin` | 「首个音符索引 − 1，或 0」 |
| `EmptyBeat = [-1, 0, 0]` | 负小节风险的判断依据 |

---

## 其他

### osu! 谱面格式

`.osu` 的 `[General]` / `[TimingPoints]` / `[HitObjects]` 字段、
mania 长按的 `type 128` + `endTime` 编码、列坐标 `floor(x * key / 512)` 等，
依据 osu! 公开格式说明与本地实测样本（`D:\OSU!\Songs` 下 1539 个 mania 谱面）。

### 谱面样本

格式逆向所用的 4 个真实 `.mcz` 由项目作者本地收集，时间跨度 2025-11 ~ 2026-09，
共 9 个 `.mc`。正是这批样本暴露了格式存在 A / B 两种方言。

### 兼容性实测环境

- **MalodyV**（Steam 版）：确认真机导入成功、原样接收未改写
- **Malody 4.3.7**：确认真机导入成功（4K 5 个 + 7K 6 个难度）；其曲库 61 个 `.mc`
  与可执行文件字符串用于格式吻合度静态核对

### 参考实现的已知差异

本项目在以下方面**有意不采用** rmstZ 的做法：

| 项目 | rmstZ | 本项目 | 原因 |
| --- | --- | --- | --- |
| 音画同步 | BGM `offset` 仅写入 osu 的 `AudioLeadIn`，不做时间平移 | 按「音频位置 = 谱面时间 − offset」整体换算 | 实测 Malody 导出的 osu 一律 `AudioLeadIn: 0` + 负 T0，说明 offset 应以时间轴平移表达 |
| 拍分母 | 768 | 288 | 4 个真实 `.mcz` 共 9 个谱面里 288 是出现频率最高的 snap 大小 |
| 负拍处理 | 未特殊处理 | 整小节平移 + 在 beat 0 补 BPM 点 | Malody 的 `[-1,0,0]` 是 `EmptyBeat` 哨兵，负小节有风险 |
