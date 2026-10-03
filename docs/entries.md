# Entry points and Node.js setup

This document covers the prerequisites and goes into detail about the four ways to use the
converter. If you just want to convert a pack or two, the short README is enough.

## Node.js prerequisites

`GUI.bat`, `转换.bat` and `命令行.bat` are shells; the actual conversion runs in
`core.mjs`. **`OsuToMalody.html` needs nothing** — the whole core is inlined in the page.

### Finding Node automatically

`gui.ps1` and `convert.ps1` look for Node in this order:

1. `node` on your system PATH
2. `C:\Program Files\nodejs\node.exe`
3. `C:\Program Files (x86)\nodejs\node.exe`
4. `%LOCALAPPDATA%\Programs\nodejs\node.exe`
5. If none is found → a dialog tells you to install the LTS from <https://nodejs.org>

Just check yourself with `node -v` — a version number is enough.

## GUI — `GUI.bat` (recommended)

### Starting it

1. Open the tool folder
2. **Double-click `GUI.bat`** — a black console window flashes for an instant (that's the
   launcher), then the app window appears, title `Malody  <->  osu!mania  Converter`
3. Choose files or a folder and click **Start**

That black window is `GUI.bat` itself; it does one thing: start `gui.ps1` hidden, so no
orphan console windows are left behind.

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

1. **Add what you want to convert** (any of these):
   - Click **Add files…** → native file dialog, multi-select, filters `.mcz / .osz / .zip / .osu`
   - Click **Add folder…** → native folder dialog
   - Or **drag files/folders into the list** (multiple at once is fine)
2. **Confirm the output folder** (desktop by default). Click "Browse…" to change it
3. **Adjust options if needed** — defaults are fine, see below
4. Click **Start**
5. Watch the **log**: one line per output, `√ generated xxx.mcz (1.85 MB)`
6. When done, click **Open output folder**

### Options

| Option | Default | Notes |
| --- | --- | --- |
| Keys | Auto | Rarely needed; only set manually if the chart's key count is wrong (4K–10K) |
| Time shift (ms) | 0 | Use when the result is uniformly early/late; positive = later |
| Compress output | On | Turning it off maximizes compatibility but increases size |
| Audio sync via Malody offset | On | The key switch for audio alignment (see docs/format-spec.md). Uncheck if the result is uniformly offset |
| Output style | Full | Output format style (see docs/compatibility.md); `Minimal` as a fallback |
| Output directory | Desktop | Where the products go |
| Output format | Full | `Minimal` is the backup shape — both Malody versions have been tested with `Full` |

### About output location

- A single chart set (one osu! song folder) → written straight to the desktop, e.g.
  `SomeTitle.mcz`
- A folder containing multiple packages → a **subfolder with the same name** is created
  inside the output directory and everything goes there
- The log prints full paths

### If the window doesn't appear

- Wait 1–2 seconds (PowerShell startup + WinForms init takes a moment)
- If it never appears: most likely **antivirus blocking the PowerShell script**. Whitelist
  this folder, or use `OsuToMalody.html` instead

## Drag & drop — `转换.bat` (fewest steps)

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

The window shows, in order: the Node runtime it found, the output directory, per-file
details, and finally a summary:

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

Desktop by default. To change it, set the environment variable `MALODY2OSU_OUT` before
running:

```cmd
set MALODY2OSU_OUT=D:\converted
```

### Difference from the GUI

Drag & drop **asks no questions** — everything uses default options. To change options,
use `GUI.bat` or the command line.

## Command line — `命令行.bat`

### Starting it

**Double-click `命令行.bat`** → opens a terminal window with the **working directory
already set to this tool's folder** and the usage text printed.

You can also open a terminal yourself and `cd` here.

### Usage

```bash
node cli.mjs <input> [-o output] [options]
```

> ⚠️ **Always quote paths.** If a path contains spaces or characters that are special to
> cmd (like `&`), it will be truncated without quotes.

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
| `--mc-style full\|minimal` | Output style, default `full` (see docs/compatibility.md) |
| `--no-compress` | Disable compression |
| `-r, --recursive` | Recurse into subdirectories — convert a whole `D:\osu!\Songs` in one go |

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

## Web app — `OsuToMalody.html` (fallback, not recommended)

> [!IMPORTANT]
> **This is a fallback entry point, not the recommended way to convert.** For everyday use
> pick [`GUI.bat`](#gui---guibat-recommended), for drag & drop use
> [`转换.bat`](#drag--drop--转换bat-fewest-steps), and for batch jobs or a whole library
> use [`命令行.bat`](#command-line---命令行bat). The web app is only worth it when you are
> on another machine, cannot install Node.js, and have just one or two packs to convert:
>
> - **It treats one pack as one song — no batch, no recursion.** Do not point it at a whole
>   osu! library such as `D:\osu!\Songs`: if a folder picked with "Choose folder" contains
>   several `.osu` files, they get **merged into a single `.mcz`** instead of being
>   converted one by one.
> - **Everything happens in the browser tab's memory.** The whole pack is read into the page
>   and the output is built there too, so a large pack can make the tab stutter or get
>   killed (the desktop/CLI versions have no such ceiling).
> - **The output location is not yours to choose.** Files go to the browser's download
>   folder, and when several packs are converted at once the browser may ask
>   "allow this site to download multiple files?".
> - **It cannot be scripted.** No recursion, no batch, no `-o`.

### Starting it

**Double-click `OsuToMalody.html`** → opens in your default browser.

**This entry point needs no Node.js and does not depend on any other file in the folder** —
the entire conversion core is inlined into the HTML. You can copy it to a USB stick, another
computer, or send it to someone. Fully offline; nothing is uploaded.

### Steps

1. **Drag `.mcz` / `.osz` / `.zip` into the dashed area**, or click "Choose files" (multi-select)
2. Or click **Choose folder** and pick an osu! song directory (e.g. `D:\OSU!\Songs\SomeSong`)
3. Adjust options on the page as needed (keys / time shift / compression / sync)
4. Results **download automatically**; details and download buttons are listed below

### Difference from the desktop version

| | Desktop (`GUI.bat`) | Web app |
| --- | --- | --- |
| Needs Node.js | Yes | **No** |
| Batch / whole library | Yes (CLI can recurse) | **No** (several songs merge into one pack) |
| Large packs | Written to disk, effectively unlimited | Held in tab memory; big packs stutter or fail |
| Output location | Desktop (configurable) | **Browser download folder** (per browser settings) |
| Folder selection | Native folder dialog | Browser folder picker |
| Multiple downloads | Saved one by one, no prompt | Browser may ask to allow multiple downloads |

---

Chinese version: [`entries.zh-CN.md`](entries.zh-CN.md)
