# 版本兼容（MalodyV / 4.x）

**结论：两个版本均已实机导入验证通过**（详见下方「现状」）。

## 存在两种格式方言

对 4 个真实 `.mcz`（9 个 `.mc`，时间跨度 2025-11 ~ 2026-09）做字段对比后发现，
它们**不是同一种格式方言**，很可能对应不同 Malody 版本/分支：

| 层 | 方言 A（7 个文件） | 方言 B（愛属性，2 个文件） |
| --- | --- | --- |
| 顶层键 | `meta, time, effect, note, extra` | `meta, time, note`（**无 effect / extra**） |
| meta | `$ver, creator, background, version, [preview], id, mode, time, song, mode_ext` | **无 `$ver` / `time`**，多 `aimode:""` |
| song | `title, artist, id, [titleorg, artistorg]` | 多 `file`（音频名）、`bpm` |
| mode_ext | `{column, bar_begin}` | 多 `speed: 0` |
| time[] | `{beat, bpm}` | 多 `delay: 0` |
| BGM | `{beat, sound, vol, offset, type}` | **无 `vol`** |

## 本工具的处理

- **读取端两种方言都能吃**：已用 4 个真实 `.mcz` 全部实测通过（含方言 B 的 `愛属性.mcz`）。
- **写出端默认 `full`（方言 A 形态）**，且只写方言 A 的字段。
  这是**两个版本都实测兼容**的形态：4.3.7 的曲库里方言 B 出现 0 次，而 MalodyV 也接受了
  本工具的方言 A 产物。
- **方言 B 专用的字段**（`aimode` / `song.file` / `song.bpm`）**默认不写**（两个版本自己的
  文件里都没有）。
- **若将来遇到读不了的版本**，可切到 `minimal`：它逐层覆盖方言 B 所需的全部字段
  （已逐层对比验证，零缺失）。界面：GUI 里「输出格式」改成「精简」；命令行：`--mc-style minimal`。

## 现状（两个版本均已实机验证通过）

### MalodyV：实机导入已验证 ✓

曲库 `<MalodyV>\chart\` 里有本工具产物的落盘文件
`1956659_4K\1791022683.mc`（文件名即本工具生成的时间戳），归一化时间戳后与原始产物
**逐字段完全一致**（MalodyV 原样接收、未改写），音符数 1267 与源谱面一致。

### Malody 4.3.7：实机导入已验证 ✓

曲库 `<4.3.7>\beatmap\` 下已出现本工具导入的两个包：

| 目录 | 内容 |
| --- | --- |
| `beatmap\1956659_4K\` | 5 个 `.mc` + `audio.ogg` + `Nya Background.jpeg` |
| `beatmap\1956659_7K\` | 6 个 `.mc` + `audio.ogg` + `Nya Background.jpeg` |

难度名就是本工具生成的版本名（`4K // keksik's Meow :3`、`7K // Another` …），
音符数与源谱面逐一吻合（4K: 1267/825/1073/532/304；7K: 1500/346/773/1046/552/1905）。

> 注意：Malody 4.x 的选歌界面**按键数分组显示**（同一首歌的 4K 与 7K 在不同键数分页里），
> 所以导入 7K 后不会出现在 4K 那一页 —— 切到 7K 分页即可看到，不是导入失败。

**格式吻合度**：本工具默认写出的每个字段，4.3.7 自己的文件都在用；4.3.7 半数以上文件
使用的字段，本工具一个都没漏。

<details>
<summary>展开逐字段核对表（61 个 <code>.mc</code> 样本）</summary>

`<4.3.7>\beatmap\` 下 61 个可解析的 `.mc`，方言判定：**方言 A 60 个、方言 B 0 个**。

| 字段 | 4.3.7 使用率 | 本工具是否写出 |
| --- | --- | --- |
| `meta.time` | 61/61 | ✓ |
| `meta.creator` / `background` / `version` / `id` / `mode` / `song` / `mode_ext` | 61/61 | ✓ |
| `song.title` / `artist` / `id` | 61/61 | ✓ |
| `time[].beat` / `bpm` | 61/61 | ✓ |
| `note.beat` / `column` | 61/61 | ✓ |
| `top.meta` / `time` / `note` | 61/61 | ✓ |
| `top.extra` | 55/61 | ✓ |
| `bgm.sound` / `type` | 56/61 | ✓ |
| `bgm.vol` | 55/61 | ✓ |
| `note.endbeat`（长按） | 43/61 | ✓ |
| `bgm.offset` | 37/61 | ✓ |
| `meta.$ver` | 30/61 | ✓ |
| `top.effect` | 30/61 | ✓ |
| `meta.preview` | 23/61 | ✓（有预览点时） |
| `song.titleorg` / `artistorg` | 14/61 | ✓（与原文不同时） |
| `mode_ext.bar_begin` | 6/61 | ✓ |
| `mode_ext.speed` | 13/61 | ✗（未写，4.3.7 多数文件也没有） |
| `aimode` / `song.file` / `song.bpm` / `noteref` | **0/61** | ✗（方言 B 专用，默认不写） |

旁证：`malody.exe` 中含 `$ver`、`titleorg`、`artistorg` 等方言 A 的字段名，而 `aimode`
完全不出现。

</details>

## 关于 `--mc-style minimal`

方言 B（`aimode` / `song.file` / `song.bpm` / `time[].delay` / `mode_ext.speed` / 无
`effect`+`extra`）在 **4.3.7 曲库中出现 0 次**，也不是 MalodyV 接受本工具产物所必需。
因此默认 `full` 就是两个版本通用的形态，`minimal` 仅作为备用保留。

---

英文版：[`compatibility.md`](compatibility.md)