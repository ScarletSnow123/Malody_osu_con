# Version compatibility (Malody V / 4.x)

**Conclusion: both MalodyV and Malody 4.3.7 have been verified by importing on a real
machine** (see "Current status" below).

## Two format dialects exist

Comparing fields across 4 real `.mcz` files (9 `.mc`, spanning 2025-11 to 2026-09) shows
they are **not a single format dialect** — they likely correspond to different Malody
versions/branches:

| Layer | Dialect A (7 files) | Dialect B (愛属性, 2 files) |
| --- | --- | --- |
| Top-level keys | `meta, time, effect, note, extra` | `meta, time, note` (**no effect / extra**) |
| meta | `$ver, creator, background, version, [preview], id, mode, time, song, mode_ext` | **no `$ver` / `time`**, plus `aimode:""` |
| song | `title, artist, id, [titleorg, artistorg]` | plus `file` (audio name), `bpm` |
| mode_ext | `{column, bar_begin}` | plus `speed: 0` |
| time[] | `{beat, bpm}` | plus `delay: 0` |
| BGM | `{beat, sound, vol, offset, type}` | **no `vol`** |

## How this tool handles it

- **The reader accepts both dialects**: verified against all 4 real `.mcz` files (including
  the dialect B `愛属性.mcz`).
- **The writer defaults to `full`** (dialect A shape) and only writes dialect A fields.
  This shape is **verified compatible with both versions**: dialect B appears 0 times in
  the 4.3.7 library, and MalodyV also accepts this tool's dialect A output.
- **Dialect B-only fields** (`aimode` / `song.file` / `song.bpm`) **are not written by
  default** (neither version's own files contain them).
- **If you hit a version that can't read the output**, switch to `minimal`: it covers every
  field dialect B needs, layer by layer (verified field-by-field, zero missing).
  In the GUI, set "Output style" to "Minimal"; on the CLI, `--mc-style minimal`.

## Current status (both versions verified on a real machine)

### MalodyV: import verified ✓

The library folder `<MalodyV>\chart\` contains this tool's output
`1956659_4K\1791022683.mc` (the filename is the timestamp this tool generated). After
normalizing timestamps it is **field-for-field identical** to the original output (MalodyV
accepted it as-is and did not rewrite it), and the note count 1267 matches the source chart.

### Malody 4.3.7: import verified ✓

Two packages imported by this tool are present under `<4.3.7>\beatmap\`:

| Directory | Contents |
| --- | --- |
| `beatmap\1956659_4K\` | 5 `.mc` + `audio.ogg` + `Nya Background.jpeg` |
| `beatmap\1956659_7K\` | 6 `.mc` + `audio.ogg` + `Nya Background.jpeg` |

The difficulty names are the version names this tool generated (`4K // keksik's Meow :3`,
`7K // Another`, …), and the note counts match the source charts one by one
(4K: 1267/825/1073/532/304; 7K: 1500/346/773/1046/552/1905).

> **Note**: Malody 4.x **groups the song list by key count** (the 4K and 7K versions of a
> song live on different key-count pages), so an imported 7K chart won't appear on the 4K
> page — switch to the 7K page. It is not a failed import.

**Field agreement**: every field this tool writes by default is used by 4.3.7's own files,
and no field used by more than half of 4.3.7's files is missing from this tool's output.

<details>
<summary>Expand the field-by-field table (61 <code>.mc</code> samples)</summary>

Of the 61 parseable `.mc` files under `<4.3.7>\beatmap\`, dialect classification:
**dialect A 60, dialect B 0**.

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

Corroborating evidence: `malody.exe` contains dialect A field names such as `$ver`,
`titleorg`, `artistorg`, while `aimode` does not appear at all.

</details>

## About `--mc-style minimal`

Dialect B (`aimode` / `song.file` / `song.bpm` / `time[].delay` / `mode_ext.speed` / no
`effect`+`extra`) appears **0 times in the 4.3.7 library**, and is not required for
MalodyV to accept this tool's output. So the default `full` is the shape both versions
accept, and `minimal` is kept only as a fallback.

---

Chinese version: [`compatibility.zh-CN.md`](compatibility.zh-CN.md)