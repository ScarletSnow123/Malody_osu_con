**[简体中文](README.zh-CN.md)** | English

# Malody ⇄ osu!mania Converter

**Bidirectional conversion — runs locally, zero dependencies, works offline.**

| Direction | Purpose |
| --- | --- |
| `.mcz` → `.osz` | Take Malody charts to play in osu! |
| `.osz` / zip with `.osu` / osu! song folder → `.mcz` | Take osu! charts into Malody editor to modify |

> [!WARNING]
> **This project is in beta (Beta) and may still contain bugs.**
> The conversion core has been round-trip verified on 258 real osu!mania charts
> (**661,862 notes** — reproduce the check below), but osu! charts differ a lot
> between Malody versions, so edge cases remain uncovered. Report any anomalies —
> audio/delay desync, shifted or missing notes, import failures, crashes — in
> [Issues](https://github.com/ScarletSnow123/Malody_osu_con/issues). Attaching the
> problematic chart or the full error message speeds things up a lot.

## Table of contents

- [Quick start](#quick-start)
  - [You need Node.js](#you-need-nodejs)
  - [The four entry points](#the-four-entry-points)
  - [GUI](#gui)
  - [Drag & drop](#drag--drop)
  - [Command line](#command-line)
  - [Web app (fallback)](#web-app-fallback)
- [Format support](#format-support)
- [Quick problems](#quick-problems)
- [Tested & verified](#tested--verified)
- [Known limitations](#known-limitations)
- [Docs](#docs)
- [Files](#files)
- [Credits](#credits)
- [License](#license)

## Quick start

### You need Node.js

`GUI.bat` / `转换.bat` / `命令行.bat` are shells; the actual conversion is done by
`core.mjs`. They need Node.js (LTS). **`OsuToMalody.html` does not** — the whole core is
inlined in the page.

The `.bat` + `.ps1` launchers auto-find Node from PATH, then the usual install locations,
and pop up a dialog if it's missing. Confirm with `node -v`.

### The four entry points

| Entry point | When to use |
| --- | --- |
| [`GUI.bat`](#gui) | Everyday use — a window with all options and a log |
| [`转换.bat`](#drag--drop) | Drag & drop — fewest steps |
| [`命令行.bat`](#command-line) | Batch jobs, recursion, scripting |
| [`OsuToMalody.html`](#web-app-fallback) | Portable / install-free — **fallback, not recommended** |

### GUI

1. Double-click `GUI.bat` and wait 1–2 seconds for the window.
2. Choose files or a folder, tweak options if needed (defaults are fine).
3. Click **Start**, watch the log, then click **Open output folder**.

### Drag & drop

Drag `.mcz` / `.osz` / `.osu` files or folders onto `转换.bat`. No options are asked —
everything uses defaults; open the GUI or CLI to change them.

### Command line

```bash
node cli.mjs "D:\osu!\Songs\SomeSong" -o "out.mcz"
node cli.mjs "some-pack.mcz" -o "out.osz"
node cli.mjs "D:\osu!\Songs" -r -o "D:\converted"     # whole library
```

Path arguments **must be quoted**. Full usage: [`docs/entries.md`](docs/entries.md).

### Web app (fallback)

Double-click `OsuToMalody.html` — opens in your default browser. It needs no Node.js and
no other file from the folder: copy it to a USB stick, another computer, or send it to a
friend. Fully offline, nothing is uploaded.

> [!CAUTION]
> **This is a fallback entry point, not the recommended way to convert.** Use the GUI,
> drag-drop, or CLI for everyday work. The web app is only convenient when you're on a
> machine where you cannot install Node.js and have one or two packs to convert:
>
> - **One pack = one song** — no batch, no recursion. Pointing it at an entire osu!
>   library (e.g. `D:\osu!\Songs`) would **merge all `.osu` files into a single `.mcz`**.
> - **Everything happens in the tab's memory.** The whole pack is read into the page, so a
>   large pack can make the tab stutter or crash (desktop/CLI versions have no such ceiling).
> - **You can't choose the output location** — it goes to the browser's download folder,
>   and converting several packs at once may prompt the browser for permission to download.
> - **It cannot be scripted.** No recursion, no batch, no `-o`.

## Format support

| Input | Output | Long notes | SV scroll (green lines) | Custom hitsounds | Malody offset | Mixed 4K/7K |
| --- | --- | --- | --- | --- | --- | --- |
| `.mcz` | `.osz` | ✓ | ✓ | ✓ | ✓ | — |
| `.osz` / `.zip` with `.osu` | `.mcz` | ✓ | ✓ | ✓ | ✓ | split into `_4K.mcz` / `_7K.mcz` |
| `.osu` (single chart) | `.mc` | ✓ | ✓ | ✓ | ✓ | — |
| osu! song folder | `.mcz` | ✓ | ✓ | ✓ | ✓ | split |

## Quick problems

| Symptom | Cause and fix |
| --- | --- |
| `.bat` flashes black and exits | Node.js isn't installed, or `cli.mjs` isn't in the same folder |
| `GUI.bat` does nothing | Wait 1–2 s; if still nothing, antivirus likely blocks PowerShell — whitelist the folder or use `OsuToMalody.html` |
| Antivirus flags it | `.bat` + `.ps1` + PowerShell is a common false-positive pattern; only `OsuToMalody.html` avoids PowerShell |
| Can't find the output | GUI / drag-drop default to the **desktop**; the web app uses the **browser download folder** |
| Source file vanished after import | Normal Malody behaviour (import deletes source); regenerate if needed |
| 7K difficulty not visible | Malody 4.x **pages songs by key count** — switch to the 7K page |
| Result plays uniformly early/late | Toggle "Audio sync via Malody offset" (CLI: `--no-sync`) |
| A Malody version can't read the output | Switch "Output style" to "Minimal" (CLI: `--mc-style minimal`) |

## Tested & verified

| Test | Scale | Result |
| --- | --- | --- |
| Malody → osz → mcz round trip | 5,483 notes | Notes/holds/columns/hold flags **all identical**; max time deviation 0.947ms, mean 0.021ms |
| osu! library batch (osu → mc → osu) | 45 sets / 258 charts / **661,862 notes** | 703,008 comparisons: max **2ms**, mean **0.21ms**, >5ms **0**; mismatches **0** |
| Green line (SV) round trip | 6,842 entries | Scroll multipliers **all identical** |
| Output structure | 258 charts | Top keys, `mode=0`, `mode_ext.column`, zero negative measures |

Reproducible with `node batch_test.mjs "D:\osu!\Songs" 45`. More detail:
[`docs/testing.md`](docs/testing.md). Both **MalodyV** and **Malody 4.3.7** imported our
output on a real machine — [`docs/compatibility.md`](docs/compatibility.md).

## Known limitations

- **Hitsound types**: osu!'s `hitSound` bitmask (Whistle / Clap / Finish) **cannot be mapped**
  — it says *which kind* of hitsound, Malody's `sound` says *which file*. What *can* map is
  the explicit custom sample filename (⇄ `note.sound`).
- **Mode**: only osu!mania (`Mode: 3`); other modes are skipped with a notice. Output is
  always `mode: 0` on the Malody side.
- **Mixed key counts**: 4K + 7K in one set is split into multiple `.mcz` files.
- **Foreign chart files inside a package**: a `.mcz` only reads `.mc`, an `.osz` only reads
  `.osu`. If the other side's charts are packed in (e.g. a `.osu` inside a `.mcz`, or a `.mc`
  inside an `.osz`) they are **not converted**, but each one is listed in the warnings instead
  of being dropped silently. Use the entry point for that direction to convert them properly.
- **Renaming the extension does not fool the converter**: renaming an `.osz` to `.mcz` (or the
  reverse) fails at the parse stage — no partial or misaligned output is produced.
- Only non-ZIP64 archives are supported.

## Docs

| Docs | Contents |
| --- | --- |
| [`docs/entries.md`](docs/entries.md) | Node.js installation, all four entry points in detail, CLI options |
| [`docs/faq.md`](docs/faq.md) | Full FAQ |
| [`docs/format-spec.md`](docs/format-spec.md) | Format rules (beats, BPM/SV, columns, BGM, offsets) |
| [`docs/compatibility.md`](docs/compatibility.md) | MalodyV / 4.3.7 dialects, `--mc-style` |
| [`docs/testing.md`](docs/testing.md) | Verification data and reproduce commands |

Chinese versions: [`entries.zh-CN.md`](docs/entries.zh-CN.md) ·
[`format-spec.zh-CN.md`](docs/format-spec.zh-CN.md) ·
[`compatibility.zh-CN.md`](docs/compatibility.zh-CN.md) ·
[`testing.zh-CN.md`](docs/testing.zh-CN.md)

## Files

| File | Purpose |
| --- | --- |
| `GUI.bat` / `gui.ps1` | GUI entry point (WinForms window, pickers, log) |
| `转换.bat` / `convert.ps1` | Drag & drop entry point |
| `命令行.bat` | Terminal with the working directory already set |
| `OsuToMalody.html` | Single-file app (build artifact, **fallback, not recommended**) |
| `core.mjs` | Conversion core: ZIP read/write, timeline, both directions — **single source of truth** |
| `cli.mjs` | Command-line entry point |
| `app.template.html` / `build.mjs` | Template with `/*__CORE__*/` placeholder → inlined `OsuToMalody.html` |
| `verify.py` / `compare_roundtrip.py` | `.osz` validator and round-trip comparator |
| `batch_test.mjs` | Batch osu→mc→osu fidelity test over an osu! library |

After editing `core.mjs`, rebuild with: `node build.mjs`

## Credits

Format reverse-engineering referenced **rmstZ** (by [lrfasd](https://lrfasd.github.io/rmstZ/),
`Copyright © 心の sky Group`) and **rconv** ([prefixaut/rconv](https://github.com/prefixaut/rconv)).
`core.mjs` is an **independent implementation, not copied from either**.

Thanks also to **@Hanemi**, who provided some of the Malody chart samples and
ran the Malody-side testing, and to **@EbonyVeil**, who ran the HTML-side testing.

The rmstZ repository ships no LICENSE. This project **does not redistribute** its files; get
them from the [official page](https://lrfasd.github.io/rmstZ/). Full sources, licensing and
known differences: **[CREDITS.md](CREDITS.md)**.

## License

Released under the **MIT License** ([LICENSE](LICENSE)). MIT covers only this project's own
code; third-party sources are documented in [CREDITS.md](CREDITS.md).

```
Copyright (c) 2026 ScarletSnow123
```
