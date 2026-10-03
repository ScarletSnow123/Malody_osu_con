# 格式规则

本文档描述 osu!mania 与 Malody 格式之间转换的精确规则。规则依据真实 `.mcz` 文件、
rmstZ 参考实现与 rconv 的 Malody 类型定义。

除另有说明，所有量都以**毫秒**为单位。

## 拍位置

```
Beat[3] = [小节, snap 索引, snap 大小]   →   a + b/c
```

* `小节`：从 0 开始的小节编号  
* `snap 索引`: 小节内 snap 单位的整数倍
* `snap 大小`: snap 的分母（如十六分音符为 4）

## 键数

从 `meta.mode_ext.column` 读取（回退：从谱面数据自动检测）。

## BPM 变速与拍点

对 `time[].bpm` 分段积分成毫秒；BPM 非正时视作**滚动（SV）变速**。

## 长按

`endbeat` ⇄ osu!mania `type 128`（长按）+ `endTime`。

## 列坐标

```
x = round((column*2+1)/(key*2) * 512)   →   column = floor(x*key/512)
```

结果是 0–512 的整数，与 osu! 内部的列网格一致。

## BGM 事件

`note[]` 中 `type==1` 且无 `column` 的条目（`SoundCueType.Song`）。

## 滚动速度（绿线／SV）

osu! 用**继承型拍点**（`uninherited = 0`，`beatLength` 为负）控制卷速：

```
卷速倍率 = -100 / beatLength
       beatLength = -100 → 1.0×（正常）
                    = -400 → 0.25×
```

这与 Malody 的 `effect[].scroll` 语义一致（`1.0` 为正常速度），因此直接对应：

| 方向 | 换算 |
| --- | --- |
| osu → Malody | `effect.push({ beat, scroll: -100 / beatLength })` |
| Malody → osu | 写一条 `uninherited=0` 的拍点，`beatLength = -100 / scroll` |

只用正 `scroll` 值；MalodyV 里少量**负 scroll** 属非标准效果，不转换成绿线。实测
1601 张 mania 谱面中 **840 张（52.5%）含绿线**，方向覆盖是必要的。

## 自定义音效（`hitSample` ⇄ `note.sound`）

osu! HitObject 第 6 段的 `hitSample` 格式为

```
normalSet:additionSet:index:volume:filename
```

```
单点：  448,192,867,1,0,0:0:0:70:kick.wav
长按：  192,192,1557,128,0,1611:0:0:0:70:snare.wav
```

文件名（最后一段）⇄ Malody 的 `note.sound`。无自定义音效时输出保持 `0:0:0:0:`，
与传统格式一致。

注意：**`hitSound` 位掩码（Whistle/Clap/Finish）不在此列**——它没有文件名可对应，
见主 README「已知限制」。

## 拍分母

288（真实谱面出现频率最高），再按 2、3 约分。

## 包结构

`.mcz` = zip：若干 `<时间戳>.mc` + 音频 + 背景图。

## 音画同步（重要）

Malody 的 BGM `offset` 语义是「延迟多久开始播放音频」，即

```
音频位置 = 谱面时间 − offset
```

（rconv：`cueOffset` = "How much offset in ms it should wait before playing it"）。

### Malody → osu

`osu时间 = 谱面时间 − offset`，同时把 `offset` 写进 `AudioLeadIn` 以保证往返可还原。

### osu → Malody

`offset = 平移量 − T0`（T0 = 首个红线的 osu 时间）。

依据：Malody 导出的 osu 文件一律是 `AudioLeadIn: 0` + 负的 T0，且首个音符精确落在
整数拍（实测 24.000 / 65.001 拍）。若成品进游戏后整体偏移，用 `--no-sync` 或界面上
的「不平移」选项切换。

## 负小节处理

osu! 允许音符早于首个 BPM 点（1539 张 mania 谱面里 14.9% 如此），而 Malody 的 `[-1,0,0]`
是 `EmptyBeat` 哨兵，负小节有风险。

处理方式：**整小节平移**（保证小节线对齐）+ 在 beat 0 补一个同 BPM 的 `time` 点。
微小负拍（量化后落到第 0 拍）不会触发平移。

---

英文版：[`format-spec.md`](format-spec.md)