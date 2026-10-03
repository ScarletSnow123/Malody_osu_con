**English** | [简体中文](README.zh-CN.md)

# Malody ⇄ osu!mania Converter

Two-way conversion. Runs entirely offline, zero dependencies.

| Direction | What it's for |
| --- | --- |
| `.mcz` → `.osz` | Play a Malody chart in osu! |
| `.osz` / zip containing `.osu` / osu! song folder → `.mcz` | **Edit an osu! chart in the Malody editor** |

> [!WARNING]
> **This project is in beta — expect bugs.**
>
> The conversion core has been round-trip tested against 258 real osu!mania charts
> (**661,862 notes**) — reproduction command in [Verified](#verified) below — but osu!
> charts and Malody versions vary a lot, so edge cases remain.
> If you hit anything odd — audio desync, misplaced or missing notes, import failures,
> crashes — please [open an issue](https://github.com/ScarletSnow123/Malody_osu_con/issues).
> **Attaching the chart that failed, or the full error message**, speeds up diagnosis a lot.
> Thanks!

## Contents

- [Why reverse conversion](#why-reverse-conversion)
- [Which entry point to use](#which-entry-point-to-use)
- [Prerequisite: Node.js](#prerequisite-nodejs)
- [Option 1: GUI — `GUI.bat`](#option-1-gui--guibat-recommended)
- [Option 2: Drag & drop — `转换.bat`](#option-2-drag--drop--转换bat-fewest-steps)
- [Option 3: Web app — `Malody2osu.html`](#option-3-web-app--malody2osuhtml)
- [Option 4: Command line — `命令行.bat`](#option-4-command-line--命令行bat)
- [Comparing the four entry points](#comparing-the-four-entry-points)
- [FAQ](#faq)
- [Files](#files)
- [Format notes](#format-notes)
- [Version compatibility (Malody V / 4.x)](#version-compatibility-malody-v--4x)
- [Verified](#verified)
- [Known limitations](#known-limitations)
- [Credits](#credits)
- [License](#license)

## Why reverse conversion

Malody can **read** osu! charts directly to play them, but it **cannot edit** them — these are two
separate code paths. Reading goes through the osu! import channel (parse and play, read-only), while
the editor only understands Malody's own `.mc` chart model
(`meta / time / effect / note / extra` + `Beat[a,b,c]`). There is no write-back path for osu! data.
So to make an osu! chart editable, it has to be converted to `.mc` first.

This direction **is not unique to this project** — general-purpose converters such as rmstZ also
support osu → mc, and cover many more formats. What this project aims at is making that direction a
one-click, scriptable tool: direct package-to-package conversion, four entry points, batch and
recursive conversion of a whole library, with the audio-sync math calibrated against real charts.
See "Known differences from the reference implementation" in [CREDITS.md](CREDITS.md).

## Which entry point to use

| Your situation | Use | Why |
| --- | --- | --- |
| Everyday conversion, want to pick files/folders in a window | `GUI.bat` | Has a UI, all options exposed, shows a log |
| Can't be bothered with a UI, just want to drop files | `转换.bat` | Fewest steps — drop and you're done |
| Want to carry it on a USB stick, or install nothing | `Malody2osu.html` | A single HTML file, opens in a browser, **no Node.js needed** |
| Converting dozens of songs / a whole library / scripting | `命令行.bat` | Supports recursion and batch, keeps output organized |

> The `.bat` launchers are Windows-only. `Malody2osu.html` works on any OS with a browser, and
> `cli.mjs` (with Node.js) works cross-platform.

## Prerequisite: Node.js

The `GUI.bat` / `转换.bat` / `命令行.bat` entry points are just shells — the actual conversion is
done by `cli.mjs` + `core.mjs`, so **they need Node.js**. **`Malody2osu.html` does not** — the whole
conversion core is inlined into the page.

**No manual configuration needed**: `gui.ps1` and `convert.ps1` look for node automatically, in order:

1. `node.exe` on the system `PATH`
2. `C:\Program Files\nodejs\node.exe`
3. `C:\Program Files (x86)\nodejs\node.exe`
4. `%LOCALAPPDATA%\Programs\nodejs\node.exe`
5. If none are found → a dialog points you to <https://nodejs.org> for the LTS build

To check yourself, open a terminal and run `node -v` — any version number is fine.

---

## Option 1: GUI — `GUI.bat` (recommended)

### Starting it

1. Open the folder containing this tool
2. **Double-click `GUI.bat`**
3. A black window **flashes briefly** (that's the launcher), then the app window opens

> That black window is `GUI.bat` itself. It does one thing: launch `gui.ps1` hidden, so no leftover
> console window stays around.

**Alternative**: **drag files or folders onto the `GUI.bat` icon** and release — when the window
opens, those items are already in the list.

### The interface

```
┌─ Malody  <->  osu!mania  Converter ──────────────────────┐
│  Malody  <->  osu!mania                                  │
│  .mcz → .osz (play in osu!)   .osz/folder → .mcz (edit)  │
│                                                          │
│  Items to convert (you can also drag files in):          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ D:\OSU!\Songs\226766 Sound Piercer ESPITZ...       │ │
│  └────────────────────────────────────────────────────┘ │
│  [Add files…] [Add folder…] [Remove selected] [Clear]    │
│                                                          │
│  ┌ Options ─────────────────────────────────────────┐   │
│  │ Keys [Auto▾]  Time shift (ms) [0]  ☑Compress     │   │
│  │ ☑ Audio sync via Malody offset                   │   │
│  │ Output dir [C:\Users\...\Desktop    ] [Browse…]  │   │
│  │              Output style [Full▾]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  [ Start ]  [Open output folder]        Ready            │
│  Log:                                                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │ [1/2] D:\OSU!\Songs\...                            │ │
│  │     √ generated xxx.mcz  (1.85 MB)                 │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Steps

1. **Add what you want to convert** (any of these)
   - Click **Add files…** → native file dialog, multi-select, filters `.mcz / .osz / .zip / .osu`
   - Click **Add folder…** → native folder dialog
   - Or **drag files/folders into the list** (multiple at once is fine)
2. **Confirm the output folder** (desktop by default). Click "Browse…" to change it
3. **Adjust options if needed** (defaults are fine — see the table below)
4. Click **Start**
5. Watch the **log**: one line per output, `√ generated xxx.mcz (1.85 MB)`
6. When done, click **Open output folder**

### Options

| Option | Default | Notes |
| --- | --- | --- |
| Keys | Auto | Rarely needed; only set manually if the chart's key count is wrong (4K–10K) |
| Time shift (ms) | 0 | Use when the result is uniformly early/late; positive = later |
| Compress output | On | Turning it off maximizes compatibility but increases size |
| Audio sync via Malody offset | On | The key switch for audio alignment (see "Audio sync" below). Uncheck if the result is uniformly offset |

### About output location

- A single chart set (one osu! song folder) → written straight to the desktop, e.g. `SomeTitle.mcz`
- A folder containing multiple packages → a **subfolder with the same name** is created inside the
  output directory and everything goes there
- The log prints full paths

### If the window doesn't appear

- Wait 1–2 seconds (PowerShell startup + WinForms init takes a moment)
- If it never appears: most likely **antivirus blocking the PowerShell script**. Whitelist this
  folder, or use `Malody2osu.html` instead

---

## Option 2: Drag & drop — `转换.bat` (fewest steps)

### Starting it

**Way A (drag & drop, recommended)**

1. Select one or more files/folders
2. Drag them onto the `转换.bat` icon and release
3. A **console window** opens showing progress

**Way B (double-click)**

1. **Double-click `转换.bat`** (with nothing attached)
2. A **folder picker** appears → choose a directory
3. Conversion starts

### During and after

The window shows, in order: the Node runtime it found, the output directory, per-file details, and
finally a summary:

```
  generated  xxx.mcz   (1.85 MB)
Done: 1 file generated.
  Drag .mcz into Malody to import and edit; drag .osz into the osu! window to import.

Press Enter to open the output folder (type n to quit)
```

Press **Enter** → Explorer opens with the output selected. Type `n` → quit.

### Supported inputs (multiple at once is fine)

| Drop in | You get |
| --- | --- |
| `.mcz` (Malody chart package) | `.osz` |
| `.osz` / `.zip` (osu! beatmap package) | `.mcz` (mixed key counts split into `_4K.mcz` / `_7K.mcz`) |
| `.osu` (single chart) | `.mc` (note: no audio/background included) |
| **A folder containing `.osu`** (osu! song folder) | `.mcz` |
| **A folder containing `.mcz`** | Each becomes `.osz`, collected into one subfolder |

### Output location

Desktop by default. To change it, set the environment variable `MALODY2OSU_OUT` before running:

```cmd
set MALODY2OSU_OUT=D:\converted
```

### Difference from the GUI

Drag & drop **asks no questions** — everything uses default options. To change options, use `GUI.bat`
or the command line.

---

## Option 3: Web app — `Malody2osu.html`

### Starting it

**Double-click `Malody2osu.html`** → opens in your default browser.

**This entry point needs no Node.js and does not depend on any other file in the folder** — the
entire conversion core is inlined into the HTML. You can copy it to a USB stick, another computer,
or send it to someone. Fully offline; nothing is uploaded.

### Steps

1. **Drag `.mcz` / `.osz` / `.zip` into the dashed area**, or click "Choose files" (multi-select)
2. Or click **Choose folder** and pick an osu! song directory (e.g. `D:\OSU!\Songs\SomeSong`)
3. Adjust options on the page as needed (keys / time shift / compression / sync)
4. Results **download automatically**; details and download buttons are listed below

### Difference from the desktop version

| | Desktop (`GUI.bat`) | Web app |
| --- | --- | --- |
| Needs Node.js | Yes | **No** |
| Output location | Desktop (configurable) | **Browser download folder** (per browser settings) |
| Folder selection | Native folder dialog | Browser folder picker |

---

## Option 4: Command line — `命令行.bat`

### Starting it

**Double-click `命令行.bat`** → opens a terminal window with the **working directory already set to
this tool's folder** and the usage text printed.

You can also open a terminal yourself and `cd` here.

### Usage

```bash
node cli.mjs <input> [-o output] [options]
```

> ⚠️ **Always quote paths.** If a path contains spaces or characters that are special to cmd (like
> `&`), it will be truncated without quotes.

### Inputs

| Input | Output |
| --- | --- |
| `.mcz` | `.osz` |
| `.osz` / `.zip` | `.mcz` |
| `.osu` | `.mc` |
| A directory containing `.osu` | `.mcz` (mixed key counts are split automatically) |
| Any other directory | Every `.mcz` / `.osz` / `.zip` / `.osu` inside, converted individually — **both directions supported** |

### Options

| Option | Notes |
| --- | --- |
| `-o, --output` | Output path (used as the output directory for directory input) |
| `--key N` | Force key count (default: read from the chart) |
| `--shift MS` | Global time shift; positive = later |
| `--denom N` | Malody beat denominator (default 288) |
| `--no-sync` | Skip sync conversion (use when the result is uniformly offset) |
| `--mc-style full\|minimal` | Output style, default `full` (see "Version compatibility") |
| `--no-compress` | Disable compression |
| `-r, --recursive` | Recurse into subdirectories — convert a whole `D:\OSU!\Songs` in one go |

### Examples

```bash
:: One osu! song folder → .mcz
node cli.mjs "D:\osu!\Songs\SomeSong" -o "out.mcz"

:: A Malody chart package → .osz
node cli.mjs "some-pack.mcz" -o "out.osz"

:: Batch: an entire osu! library → .mcz, collected into D:\converted
node cli.mjs "D:\osu!\Songs" -r -o "D:\converted"

:: A folder full of .mcz → each becomes .osz
node cli.mjs "D:\malody-packs" -o "D:\osz-out"
```

---

## Comparing the four entry points

|  | Needs Node.js | Needs sibling files | In-UI selection | Output location | Best at |
| --- | --- | --- | --- | --- | --- |
| `GUI.bat` | Yes | `gui.ps1` `cli.mjs` `core.mjs` | ✅ native dialogs | Configurable (desktop default) | Everyday use |
| `转换.bat` | Yes | `convert.ps1` `cli.mjs` `core.mjs` | Folder picker only | Desktop / env var | Least effort |
| `Malody2osu.html` | **No** | **None** | In-browser | Browser download folder | Portable / install-free |
| `命令行.bat` | Yes | `cli.mjs` `core.mjs` | ✗ | Via `-o` | Batch / scripting |

## FAQ

| Symptom | Cause and fix |
| --- | --- |
| Double-clicking a `.bat` flashes a black window and nothing happens | Usually Node.js isn't installed, or `cli.mjs` isn't in the same folder. The script shows a dialog; you can also run `命令行.bat` to see the actual error |
| `GUI.bat` doesn't respond | Wait 1–2 seconds; if it still doesn't, antivirus is probably blocking the PowerShell script — whitelist the folder, or use `Malody2osu.html` |
| Antivirus flags it | `.bat` + `.ps1` + PowerShell is a common false-positive pattern. You can use only `Malody2osu.html`, which never touches PowerShell |
| Can't find the output | GUI / drag-drop default to the **desktop**; the web app uses the **browser download folder**. In the GUI you can click "Open output folder" |
| The source file disappeared after importing into Malody | Normal Malody behaviour (import deletes the source). Regenerate with the same steps if needed |
| The 7K difficulty isn't visible after import | Malody 4.x **pages the song list by key count**; switch to the 7K page. It's not a failed import |
| The result plays uniformly early/late | Toggle "Audio sync via Malody offset" (CLI: `--no-sync`) |
| A particular Malody version can't read the output | Switch "Output style" to "Minimal" (CLI: `--mc-style minimal`) and retry |

## Files

| File | Purpose |
| --- | --- |
| `GUI.bat` | **GUI entry point**: double-click to open the window and pick files/folders |
| `gui.ps1` | GUI logic (WinForms window, pickers, log, calls the core) |
| `转换.bat` | Drag & drop entry point |
| `命令行.bat` | Opens a terminal with the working directory already set |
| `convert.ps1` | Drag & drop logic (parse args, locate Node, summarize, open output folder) |
| `Malody2osu.html` | Single-file app (build artifact, safe to redistribute) |
| `core.mjs` | Conversion core: ZIP read/write + timeline + both directions. **Single source of truth** |
| `cli.mjs` | Command-line entry point (including directory input) |
| `app.template.html` | UI template (contains the `/*__CORE__*/` placeholder) |
| `build.mjs` | Inlines `core.mjs` into the template → `Malody2osu.html` |
| `verify.py` | Validates an `.osz`: ZIP integrity, note count, column mapping, timeline, audio headroom |
| `compare_roundtrip.py` | Compares two `.mc` / `.mcz` (original vs round-tripped), prints per-note deviation |
| `batch_test.mjs` | Batch osu→mc→osu fidelity test over an osu! library |
| `tools/gh-slug.mjs` | Computes heading anchors using GitHub's own rules |
| `tools/check-toc.mjs` | Checks that every TOC anchor resolves to a real heading |

After editing `core.mjs`, rebuild with: `node build.mjs`

## Format notes

Reverse-engineered from 4 real `.mcz` files and cross-checked against the rmstZ reference
implementation and rconv's Malody type definitions:

| Item | Rule |
| --- | --- |
| Beat position | `Beat[3] = [measure, snap index, snap size]`, i.e. `a + b/c` |
| Key count | `meta.mode_ext.column` |
| BPM changes | Integrate `time[].bpm` segment by segment into milliseconds; non-positive BPM is treated as a scroll (SV) change |
| Long notes | `endbeat` ⇄ osu!mania `type 128` + `endTime` |
| Column position | `x = round((column*2+1)/(key*2) * 512)`; inverse `column = floor(x*key/512)` |
| BGM event | The entry in `note[]` with `type==1` and no `column` (`SoundCueType.Song`) |
| Scroll speed | osu! green line (inherited point) `scroll = -100 / beatLength` ⇄ Malody `effect[].scroll` |
| Custom hitsounds | osu! HitObject `hitSample` filename ⇄ Malody `note.sound` |
| Beat denominator | 288 (most common in real charts), then reduced by 2 and 3 |
| Package layout | `.mcz` = zip: several `<timestamp>.mc` + audio + background image |

### Audio sync (important)

Malody's BGM `offset` means "how long to wait before playing the audio", i.e.
**audio position = chart time − offset** (rconv: `cueOffset` = "How much offset in ms it should wait
before playing it").

- **Malody → osu**: `osu time = chart time − offset`, and `offset` is also written into `AudioLeadIn`
  so the round trip can be restored exactly
- **osu → Malody**: `offset = shift amount − T0` (T0 = osu time of the first red line)

Evidence: osu! files exported by Malody are consistently `AudioLeadIn: 0` with a negative T0, and the
first note lands exactly on an integer beat (24.000 / 65.001 observed). If the result is uniformly
offset in-game, switch with `--no-sync` or the "no shift" option in the UI.

### Negative measures

osu! allows notes before the first BPM point (14.9% of the 1539 mania charts scanned), while Malody's
`[-1,0,0]` is the `EmptyBeat` sentinel, so negative measures are risky.
Handling: **shift by whole measures** (keeping measure lines aligned) + add a `time` point with the
same BPM at beat 0. Tiny negative beats (which quantize to beat 0) do not trigger the shift.

### Scroll speed (SV / green lines)

osu!mania controls scroll speed with **inherited timing points** (`uninherited = 0`, negative
`beatLength`):

```
scroll multiplier = -100 / beatLength      beatLength = -100 → 1.0x (normal)
                                           beatLength = -400 → 0.25x
```

This matches the semantics of Malody's `effect[].scroll` (`1.0` = normal), so they map directly:

| Direction | Conversion |
| --- | --- |
| osu → Malody | `effect.push({ beat, scroll: -100 / beatLength })` |
| Malody → osu | Write an `uninherited=0` timing point with `beatLength = -100 / scroll` |

Only positive `scroll` values are used; the few **negative scroll** values in MalodyV are
non-standard effects and are not converted to green lines.
Of 1601 mania charts scanned, **840 (52.5%) contain green lines**, so covering this matters.

### Custom hitsounds (hitSample ⇄ note.sound)

The `hitSample` field (6th field of an osu! HitObject) has the form
`normalSet:additionSet:index:volume:filename`:

```
tap:  448,192,867,1,0,0:0:0:70:kick.wav
hold: 192,192,1557,128,0,1611:0:0:0:70:snare.wav
```

The filename (last segment) ⇄ Malody's `note.sound`. When there is no custom hitsound the output
stays `0:0:0:0:`, matching the traditional format.
Note that the **`hitSound` bitmask (Whistle/Clap/Finish) is not covered** — it has no filename to map
to; see "Known limitations".

## Version compatibility (Malody V / 4.x)

**Conclusion: both MalodyV and Malody 4.3.7 have been verified by importing on a real machine** (see
"Current status" below).

Comparing fields across 4 real `.mcz` files (9 `.mc`, spanning 2025-11 to 2026-09) shows they are
**not a single format dialect** — they likely correspond to different Malody versions/branches:

| Layer | Dialect A (7 files) | Dialect B (愛属性, 2 files) |
| --- | --- | --- |
| Top-level keys | `meta, time, effect, note, extra` | `meta, time, note` (**no effect / extra**) |
| meta | `$ver, creator, background, version, [preview], id, mode, time, song, mode_ext` | **no `$ver` / `time`**, plus `aimode:""` |
| song | `title, artist, id, [titleorg, artistorg]` | plus `file` (audio name), `bpm` |
| mode_ext | `{column, bar_begin}` | plus `speed: 0` |
| time[] | `{beat, bpm}` | plus `delay: 0` |
| BGM | `{beat, sound, vol, offset, type}` | **no `vol`** |

### How this tool handles it

- **The reader accepts both dialects**: verified against all 4 real `.mcz` files (including the
  dialect B `愛属性.mcz`).
- **The writer defaults to `full`** (dialect A shape) and only writes dialect A fields. This shape is
  **verified compatible with both versions**: dialect B appears 0 times in the 4.3.7 library, and
  MalodyV also accepts this tool's dialect A output.
- **Dialect B-only fields** (`aimode` / `song.file` / `song.bpm`) **are not written by default**
  (neither version's own files contain them).
- **If you hit a version that can't read the output**, switch to `minimal`: it covers every field
  dialect B needs, layer by layer (verified field-by-field, zero missing).
  In the GUI, set "Output style" to "Minimal"; on the CLI, `--mc-style minimal`.

### Current status (both versions verified on a real machine)

**MalodyV: import verified ✓**
The library folder `<MalodyV>\chart\` contains this tool's output `1956659_4K\1791022683.mc` (the
filename is the timestamp this tool generated). After normalizing timestamps it is **field-for-field
identical** to the original output (MalodyV accepted it as-is and did not rewrite it), and the note
count 1267 matches the source chart.

**Malody 4.3.7: import verified ✓**
Two packages imported by this tool are present under `<4.3.7>\beatmap\`:

| Directory | Contents |
| --- | --- |
| `beatmap\1956659_4K\` | 5 `.mc` + `audio.ogg` + `Nya Background.jpeg` |
| `beatmap\1956659_7K\` | 6 `.mc` + `audio.ogg` + `Nya Background.jpeg` |

The difficulty names are the version names this tool generated (`4K // keksik's Meow :3`,
`7K // Another`, …), and the note counts match the source charts one by one (4K: 1267/825/1073/532/304;
7K: 1500/346/773/1046/552/1905).

> Note: Malody 4.x **groups the song list by key count** (the 4K and 7K versions of a song live on
> different key-count pages), so an imported 7K chart won't appear on the 4K page — switch to the 7K
> page. It is not a failed import.

**Field agreement**: every field this tool writes by default is used by 4.3.7's own files, and no
field used by more than half of 4.3.7's files is missing from this tool's output.

<details>
<summary>Expand the field-by-field table (61 <code>.mc</code> samples)</summary>

Of the 61 parseable `.mc` files under `<4.3.7>\beatmap\`, dialect classification: **dialect A 60,
dialect B 0**.

| Field | 4.3.7 usage | Written by this tool |
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
| `note.endbeat` (long notes) | 43/61 | ✓ |
| `bgm.offset` | 37/61 | ✓ |
| `meta.$ver` | 30/61 | ✓ |
| `top.effect` | 30/61 | ✓ |
| `meta.preview` | 23/61 | ✓ (when a preview point exists) |
| `song.titleorg` / `artistorg` | 14/61 | ✓ (when different from the romanized name) |
| `mode_ext.bar_begin` | 6/61 | ✓ |
| `mode_ext.speed` | 13/61 | ✗ (not written; most 4.3.7 files lack it too) |
| `aimode` / `song.file` / `song.bpm` / `noteref` | **0/61** | ✗ (dialect B only, not written by default) |

Corroborating evidence: `malody.exe` contains dialect A field names such as `$ver`, `titleorg`,
`artistorg`, while `aimode` does not appear at all.

</details>

### About `--mc-style minimal`

Dialect B (`aimode` / `song.file` / `song.bpm` / `time[].delay` / `mode_ext.speed` / no
`effect`+`extra`) appears **0 times in the 4.3.7 library**, and is not required for MalodyV to accept
this tool's output. So the default `full` is the shape both versions accept, and `minimal` is kept
only as a fallback.

## Verified

| Test | Scale | Result |
| --- | --- | --- |
| Malody original → osz → mcz round trip | 5,483 notes | Notes / holds / columns / hold flags **all identical**; max time deviation 0.947ms, mean 0.021ms; BGM offset restored exactly |
| osu! library batch round trip (osu → mc → osu) | 45 sets / 258 charts / **661,862 notes** | 703,008 time-deviation comparisons: max **2ms**, mean **0.21ms**, >5ms **0**; column mismatches **0**; hold-flag mismatches **0**; structural issues **0** |
| Green line (SV) round trip | 6,842 entries | Scroll multipliers **all identical**, mismatches **0** |
| Custom hitsound round trip | — | osu `hitSample` filename ⇄ Malody `note.sound` preserved both ways (tap and hold verified separately) |
| Output `.mcz` structure | 258 charts | Top-level keys, meta keys, `mode=0`, `mode_ext.column`, BGM `type=1` match real Malody charts; zero negative measures; every denominator divides 288 |
| ZIP integrity | — | Python `zipfile.testzip()` passes for all CRCs |
| Web app inlined core | — | **Character-identical** to `core.mjs`; forward output **byte-identical** to the CLI; reverse output **semantically identical** |

Rows 2, 3 and 5 can be reproduced with the script in this repository (requires a local osu! library):

```bash
node batch_test.mjs "D:\osu!\Songs" 45
```

The script prints a full breakdown (note count, hold-end comparisons, green-line entries, mismatch
counts) rather than a single total — every number can be checked item by item.

## Known limitations

- **Hitsound types**: osu!'s `hitSound` bitmask (Whistle / Clap / Finish) **cannot be mapped** — it
  says *which kind* of hitsound to use, whereas Malody's `sound` says *which file* to play. They are
  different concepts, and without a sample bank there is no correspondence.
  What *can* be mapped is the custom sample where the osu! HitObject **names a file explicitly**
  (⇄ `note.sound`).
- **Mode**: only osu!mania (`Mode: 3`) is handled; other modes (standard/taiko/catch) are skipped with
  a notice. On the Malody side the output is always `mode: 0` (key mode).
- **Mixed key counts**: a chart set containing both 4K and 7K is split into multiple `.mcz` files.
- Only non-ZIP64 archives are supported (chart packages are far below 4GB in practice).

## Credits

The format reverse-engineering in this project referenced **rmstZ** (by
[lrfasd](https://lrfasd.github.io/rmstZ/), `Copyright © 心のsky Group`) and **rconv**
([prefixaut/rconv](https://github.com/prefixaut/rconv)).

The conversion logic (`core.mjs`) is an **independent implementation and does not copy code from
either**.

Full sources, the specific implementations referenced, licensing notes and known differences are in
**[CREDITS.md](CREDITS.md)**.

> ⚠️ The rmstZ repository ships no LICENSE. This project **does not redistribute** that HTML file; get
> it from the [official page](https://lrfasd.github.io/rmstZ/).

## License

Released under the **MIT License**, see [LICENSE](LICENSE).

```
Copyright (c) 2026 ScarletSnow123
```

MIT covers only this project's own code. For third-party sources and their licensing, see
[CREDITS.md](CREDITS.md):

- **rmstZ** ships no LICENSE; this project neither redistributes nor repackages its files, and only
  credits it in the documentation
- **rconv** is an independent third-party project; this project only references its public format
  type definitions
