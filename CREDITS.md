**English** | [简体中文](CREDITS.zh-CN.md)

# Credits and Third-Party Notes

The chart-format reverse-engineering in this project referenced the following third-party material.

> **The conversion logic (`core.mjs`) is an independent implementation and does not copy code from
> either party.**
> ZIP reading/writing uses the browser-native `DecompressionStream` / `CompressionStream`;
> the timeline integration, negative-measure shifting and audio-sync model were derived
> independently and verified in both directions against real charts.

---

## rmstZ — the primary reference

|  |  |
| --- | --- |
| Project | **rmstZ** — *TransData for Music Games* |
| Author | **lrfasd** |
| Project page | <https://lrfasd.github.io/rmstZ/> |
| Source repository | <https://github.com/lrfasd/lrfasd.github.io> |
| Copyright notice | `Copyright © 心のsky Group` |
| Version used | [rmstZ_20221022.html](https://lrfasd.github.io/rmstZ/rmstZ_20221022.html) |
| Changelog | <https://lrfasd.github.io/rmstZ/WHATSNEW.html> |

A browser-based rhythm-game chart converter covering read/write for 30+ chart formats, package
resource extraction, waveform-based charting, chart rendering and more. This reverse-engineering
mainly used it to confirm the Malody-side format semantics.

### What was specifically referenced

| Item | Corresponding implementation in rmstZ |
| --- | --- |
| Malody beat value semantics `a + b/c` | `b.fAdd(c.fDiv(d))` inside `fromBeatArray()` |
| Column ⇄ x coordinate conversion | `trackToX()` = `(column*2+1)/(key*2)` |
| Detecting long notes vs BGM events | An entry with `type == 1` and no `column` is an audio event |
| Writing BGM `offset` into osu `AudioLeadIn` | `toOsuText()` |
| Beat denominator strategy when writing `.mc` | `toBeatArray()` uses 768, then reduces by 2 and 3 (this project uses 288, the most common value observed) |
| Boundaries of per-format input/output support | The `SupportFile` / `SupportAudio` / `SupportImage` / `SupportPkg` lists |

### ⚠️ About redistribution

- The rmstZ repository **ships no LICENSE**: the GitHub API returns **404** for its license, and the
  repository metadata has `license: null`
- The in-file notice is `Copyright © 心のsky Group` (that notice is also drawn into the generated
  chart preview images)
- The author's page states the tools are "open source, to avoid backdoors" — i.e. intended to be
  publicly readable
- Repository topics: `rmstz`, `musicgame`

**This project therefore does not redistribute or repackage rmstZ's HTML file.** To use it, get it
from the [official page](https://lrfasd.github.io/rmstZ/).

That file also depends on `search.js` / `fileInfo.js` / `addin.js` / `imd.js` in the same directory,
so a lone copy of the HTML is incomplete.

> Aside: `github.com/mirrorange/lrfasd` was checked via the API and is **only a fork**
> (`"fork": true`, created 2023-10-05, unmodified) — not the origin.

---

## rconv — Malody format type definitions

A rhythm-game chart conversion library written in [Nim](https://nim-lang.org/). Its Malody type
definitions were an important corroborating source for this reverse-engineering (rmstZ leans toward
implementation, rconv toward type declarations; the two were cross-checked).

- Documentation: <https://prefixaut.github.io/rconv/rconv/malody.html>
- Source: <https://github.com/prefixaut/rconv>

| Item | Used to confirm |
| --- | --- |
| `Beat = array[3, int]` (measure / snap index / snap size) | The semantics of the three beat components |
| `SoundCueType`: `Effect=0` / `Song=1` / `KeySound=2` | The meaning of `type: 1` on BGM events |
| `ChartMode`: `Key=0`, `Catch=3`, `Pad=4`, `Taiko=5`, `Ring=6`, `Slide=7` | Mode numbering |
| `SongData`: `title` / `titleorg`, `artist` / `artistorg` | The romanized / original distinction |
| `ModeData.bar_begin` | "Index of the first note minus 1, or 0" |
| `EmptyBeat = [-1, 0, 0]` | The basis for treating negative measures as risky |

---

## Contributor acknowledgements

The following people provided chart material and hands-on testing for this project. Our thanks to them:

| Contributor | Contribution |
| --- | --- |
| **@Hanemi** | Provided some of the Malody chart samples and carried out **Malody-side** testing (import, playback and display verification in the client) |
| **@EbonyVeil** | Carried out **HTML-side** testing (functional and cross-browser verification of the single-file `OsuToMalody.html` build) |

The chart samples served the format reverse-engineering and round-trip consistency checks; the
hands-on testing on both sides covered the key paths — import, playback and display — and was a
major basis for confirming the format semantics and finalising the implementation.

---

## Other

### osu! chart format

The `.osu` `[General]` / `[TimingPoints]` / `[HitObjects]` fields, the mania long-note encoding
(`type 128` + `endTime`), the column coordinate formula `floor(x * key / 512)`, and so on are based
on osu!'s public format documentation, and were batch-verified against 1539 mania charts.

### Chart samples

The 4 real `.mcz` samples used for reverse-engineering span 2025-11 to 2026-09 and contain 9 `.mc`
files in total. It was these samples that revealed the existence of the A / B dialects.
Some of these samples were provided by **@Hanemi**.

### Compatibility verification environment

- **MalodyV** (Steam version): import confirmed, file accepted as-is without rewriting
- **Malody 4.3.7**: import confirmed (4K 5 difficulties + 7K 6 difficulties); its library of 61
  `.mc` files and its executable's strings were used for the field-agreement check

### Known differences from the reference implementation

This project **deliberately does not** follow rmstZ's approach in the following areas:

| Area | rmstZ | This project | Reason |
| --- | --- | --- | --- |
| Audio sync | BGM `offset` is written only into osu's `AudioLeadIn`, with no timeline shift | Converted wholesale under "audio position = chart time − offset" | osu! files exported by Malody are consistently `AudioLeadIn: 0` with a negative T0, indicating offset should be expressed as a timeline shift |
| Beat denominator | 768 | 288 | Across the 9 charts in the 4 real `.mcz` files, 288 is the most frequent snap size |
| Negative beats | Not specially handled | Shift by whole measures + add a BPM point at beat 0 | Malody's `[-1,0,0]` is the `EmptyBeat` sentinel, so negative measures are risky |
