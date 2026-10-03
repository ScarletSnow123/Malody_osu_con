# Verification data

All tests below are reproducible from the repository. Some require a local osu! library.

## Round-trip results

| Test | Scale | Result |
| --- | --- | --- |
| Malody original → osz → mcz round trip | 5,483 notes | Notes/holds/columns/hold flags **all identical**; max time deviation 0.947ms, mean 0.021ms; BGM offset restored exactly |
| osu! library batch round trip (osu → mc → osu) | 45 sets / 258 charts / **661,862 notes** | 703,008 time-deviation comparisons: max **2ms**, mean **0.21ms**, >5ms **0**; column mismatches **0**; hold-flag mismatches **0**; structural issues **0** |
| Green line (SV) round trip | 6,842 entries | Scroll multipliers **all identical**, mismatches **0** |
| Custom hitsound round trip | — | osu `hitSample` filename ⇄ Malody `note.sound` preserved both ways (tap and hold verified separately) |
| Output `.mcz` structure | 258 charts | Top-level keys, meta keys, `mode=0`, `mode_ext.column`, BGM `type=1` match real Malody charts; zero negative measures; every denominator divides 288 |
| ZIP integrity | — | Python `zipfile.testzip()` CRC passes for all |
| Web app inlined core | — | **Character-identical** to `core.mjs`; forward output **byte-identical** to the CLI; reverse output **semantically identical** |

## How to reproduce

```bash
# osu! library batch (requires a local osu! library)
node batch_test.mjs "D:\osu!\Songs" 45
```

The script prints a full breakdown (note count, hold-end comparisons, green-line entries,
mismatch counts) rather than a single total — every number can be checked item by item.

Chinese version: [`testing.zh-CN.md`](testing.zh-CN.md)
