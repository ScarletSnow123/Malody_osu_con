# Format specification

This document describes the exact rules used when converting between osu!mania and Malody
formats. It follows the real `.mcz` files, the rmstZ reference implementation, and rconv's
Malody type definitions.

All quantities are in **milliseconds** unless otherwise noted.

## Beat position

```
Beat[3] = [measure, snap index, snap size]   →   a + b/c
```

* `measure`  : 0-based measure number  
* `snap index`: integer multiple of the snap unit inside the measure  
* `snap size`: denominator of the snap (e.g. 4 for sixteenth notes)

## Key count

Read from `meta.mode_ext.column` (fallback: auto-detect from chart data).

## BPM changes and timing points

Integrate `time[].bpm` segment by segment into milliseconds; non-positive BPM is treated as
a **scroll (SV)** change.

## Long notes

`endbeat` ⇄ osu!mania `type 128` (hold) + `endTime`.

## Column position

```
x = round((column*2+1)/(key*2) * 512)   →   column = floor(x*key/512)
```

Result is an integer 0–512 matching osu!'s internal column grid.

## BGM event

The entry in `note[]` with `type==1` and no `column` (`SoundCueType.Song`).

## Scroll speed (green lines / SV)

osu! uses an **inherited timing point** (`uninherited = 0`, negative `beatLength`):

```
scroll multiplier = -100 / beatLength
     beatLength = -100 → 1.0× (normal)
                    = -400 → 0.25×
```

Malody's `effect[].scroll` uses the same semantics (`1.0` = normal), so they map directly:

| Direction | Conversion |
| --- | --- |
| osu → Malody | `effect.push({ beat, scroll: -100 / beatLength })` |
| Malody → osu | Write an `uninherited=0` timing point with `beatLength = -100 / scroll` |

Only positive `scroll` values are used; the few **negative scroll** values in MalodyV are
non-standard effects and are **not** converted to green lines. Of 1601 mania charts scanned,
**840 (52.5%) contain green lines**, so covering this matters.

## Custom hitsounds (`hitSample` ⇄ `note.sound`)

The `hitSample` field (6th field of an osu! HitObject) has the form

```
normalSet:additionSet:index:volume:filename
```

```
tap:  448,192,867,1,0,0:0:0:70:kick.wav
hold: 192,192,1557,128,0,1611:0:0:0:70:snare.wav
```

The **filename** (last segment) ⇄ Malody's `note.sound`. When there is no custom hitsound
the output stays `0:0:0:0:`, matching the traditional format.

**Note**: The `hitSound` bitmask (Whistle/Clap/Finish) is **not covered** — it has no
filename to map to; see "Known limitations" in the README.

## Beat denominator

288 (most common in real charts), then reduced by 2 and 3.

## Package layout

`.mcz` = ZIP archive: several `<timestamp>.mc` files + audio + background image.

## Audio sync (important)

Malody's BGM `offset` means "how long to wait before playing the audio", i.e.

```
audio position = chart time − offset
```

(rconv: `cueOffset` = "How much offset in ms it should wait before playing it").

### Malody → osu
`osu time = chart time − offset`, and `offset` is also written into `AudioLeadIn`
so the round trip can be restored exactly.

### osu → Malody
`offset = shift amount − T0` (T0 = osu time of the first red line).

Evidence: osu! files exported by Malody are consistently `AudioLeadIn: 0` with a negative
T0, and the first note lands exactly on an integer beat (24.000 / 65.001 observed). If the
result is uniformly offset in-game, switch with `--no-sync` or the "no shift" option in the
UI.

## Negative measures

osu! allows notes before the first BPM point (14.9% of the 1539 mania charts scanned),
while Malody's `[-1,0,0]` is the `EmptyBeat` sentinel, so negative measures are risky.

**Handling**: shift by **whole measures** (keeping measure lines aligned) + add a `time`
point with the same BPM at beat 0. Tiny negative beats (which quantize to beat 0) do not
trigger the shift.

---

Chinese version: [`format-spec.zh-CN.md`](format-spec.zh-CN.md)
