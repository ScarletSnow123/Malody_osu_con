import { parseOsu, osuToMc, convertMcToOsu } from './core.mjs';

// SV point at 200ms (before first redline at 500ms? no — redline IS the first TP).
// Redline at 0ms BPM 500. SV at 200ms = -100 scroll (green). Notes at 500ms+ (non-negative).
const text = `
osu file format v14
[General]
Mode: 3
AudioFilename: a.ogg
[Metadata]
Title: T
Artist: A
Creator: C
Version: test
[Difficulty]
CircleSize: 4
[TimingPoints]
0,500,4,2,0,100,1,0
200,-100.0,4,2,0,100,0,0
[HitObjects]
64,192,1000,1,0,0:0:0:0:
`
  .trim() + '\n';

const osu = parseOsu(text);
console.log('input timingPoints:', osu.timingPoints.map((t) => ({ time: t.time, beatLength: t.beatLength, uninherited: t.uninherited })));
const { mc, stats } = osuToMc(osu, { audioName: 'a.ogg', nowSeconds: 0 });
console.log('shift:', stats.beatShift, 'minSection:', stats.minSection);
console.log('mc.effect:', JSON.stringify(mc.effect));

const negGreen = (mc.effect || []).filter((e) => e.beat[0] < 0);
console.log('negative-beat green lines:', negGreen.length, negGreen);

// Reverse: does convertMcToOsu produce the SV point at all?
const res = convertMcToOsu(mc, { audioName: 'a.ogg' });
const b = parseOsu(res.text);
console.log('round-trip timingPoints:', b.timingPoints.map((t) => ({ time: t.time, beatLength: t.beatLength, uninherited: t.uninherited })));
console.log('round-trip notes:', b.hitObjects.map((h) => h.time));
