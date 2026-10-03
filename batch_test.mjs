#!/usr/bin/env node
/**
 * batch_test.mjs — 在真实 osu! 谱面库上做「osu → mc → osu」批量保真度测试，
 * 并校验产出的 .mc 结构是否符合 Malody 格式。
 *
 * 用法:
 *   node batch_test.mjs <osu!歌曲目录> [最多处理多少个谱面集]
 *
 * 例:
 *   node batch_test.mjs "D:\osu!\Songs" 50
 *
 * 只处理含 osu!mania 谱面（Mode: 3）的目录；非 mania 谱面会跳过。
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertOszToMcz, parseOsu, convertMcToOsu, writeZip, readZip } from './core.mjs';

const AUDIO = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;
const IMAGE = /\.(jpg|jpeg|png|bmp|gif)$/i;

const SONGS = process.argv[2];
if (!SONGS) {
  console.error('用法: node batch_test.mjs <osu!歌曲目录> [最多处理多少个谱面集]');
  process.exit(2);
}
const LIMIT = Number(process.argv[3]) || 50;

let folders = 0;
let charts = 0;
let skippedNonMania = 0;
let failures = 0;
let totalNotes = 0; // 参与比对的对象总数（音符）
let totalHoldEnds = 0; // 其中长按的「结束时间」额外比对的次数
const allDev = [];
const colMismatch = [];
const holdMismatch = [];
const structIssues = [];
const greenMismatch = [];
let greenTotal = 0;
const chartStats = [];

const dirs = (await readdir(SONGS, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

for (const d of dirs) {
  if (folders >= LIMIT) break;
  const dir = join(SONGS, d);
  let files;
  try {
    files = await readdir(dir, { withFileTypes: true });
  } catch {
    continue;
  }

  const wanted = files.filter(
    (f) => f.isFile() && (/\.osu$/i.test(f.name) || AUDIO.test(f.name) || IMAGE.test(f.name))
  );
  if (!wanted.some((f) => /\.osu$/i.test(f.name))) continue;

  const entries = [];
  for (const f of wanted) {
    entries.push({ name: f.name, data: new Uint8Array(await readFile(join(dir, f.name))) });
  }
  const zip = await writeZip(entries, { compress: true });

  let pkg;
  try {
    ({ packages: [pkg] } = await convertOszToMcz(zip, {}));
  } catch (e) {
    if (/没有可转换/.test(e.message)) continue;
    failures++;
    console.log('  ✗ 目录失败: ' + d + ' → ' + e.message);
    continue;
  }
  if (!pkg) continue;
  folders++;

  const origMap = new Map();
  for (const f of wanted) {
    if (!/\.osu$/i.test(f.name)) continue;
    const buf = entries.find((e) => e.name === f.name).data;
    const osu = parseOsu(new TextDecoder('utf-8').decode(buf));
    if (parseInt(osu.general['Mode'] || '0', 10) !== 3) {
      skippedNonMania++;
      continue;
    }
    origMap.set(f.name, osu);
  }

  const outFiles = await readZip(pkg.data);
  const mcNames = [...outFiles.keys()].filter((n) => n.endsWith('.mc'));

  let idx = 0;
  for (const mcName of mcNames) {
    const mc = JSON.parse(new TextDecoder('utf-8').decode(outFiles.get(mcName).data));
    const chart = pkg.report.charts[idx++];
    if (!chart) continue;

    const topKeys = Object.keys(mc).sort().join(',');
    if (topKeys !== 'effect,extra,meta,note,time') structIssues.push(`${mcName}: 顶层键 ${topKeys}`);
    for (const need of ['$ver', 'creator', 'background', 'version', 'id', 'mode', 'time', 'song', 'mode_ext']) {
      if (!(need in mc.meta)) structIssues.push(`${mcName}: meta 缺少 ${need}`);
    }
    if (mc.meta.mode !== 0) structIssues.push(`${mcName}: mode=${mc.meta.mode} 应为 0`);
    if (typeof (mc.meta.mode_ext || {}).column !== 'number') structIssues.push(`${mcName}: mode_ext.column 缺失`);
    if (!Array.isArray(mc.effect)) structIssues.push(`${mcName}: effect 不是数组`);
    const bgm = mc.note.filter((n) => n.column === undefined);
    if (bgm.length !== 1) structIssues.push(`${mcName}: BGM 事件 ${bgm.length} 个（应为 1）`);
    for (const n of mc.note) {
      if (n.beat[0] < 0) structIssues.push(`${mcName}: 负小节 ${JSON.stringify(n.beat)}`);
      if (288 % n.beat[2] !== 0) structIssues.push(`${mcName}: 分母 ${n.beat[2]} 不是 288 的约数`);
    }

    const src = origMap.get(chart.from);
    if (!src) continue;
    const back = convertMcToOsu(mc, { audioName: chart.audio, backgroundName: chart.background, shiftMs: 0 });
    const pb = parseOsu(back.text);
    const a0 = src.hitObjects;
    const b0 = pb.hitObjects;
    charts++;
    if (a0.length !== b0.length) {
      failures++;
      console.log('  ✗ 物件数不一致 %s: %d vs %d', chart.from, a0.length, b0.length);
      continue;
    }

    const key = mc.meta.mode_ext.column;
    const norm = (list) =>
      list
        .map((o) => ({
          t: o.time,
          col: Math.min(key - 1, Math.max(0, Math.floor((o.x * key) / 512))),
          hold: (o.type & 128) !== 0,
          end: o.endTime,
        }))
        .sort((p, q) => p.t - q.t || p.col - q.col);
    const a = norm(a0);
    const b = norm(b0);

    // 列/长按按「就近配对」比较。
    // 时间量化到整数毫秒后，同一毫秒内的多个音符排序顺序可能与源不同，
    // 若按位次逐一对比会把这种情况误报成列不一致。
    // 这里在 ±3 位窗口内寻找时间最近且尚未使用的配对。
    const used = new Uint8Array(b.length);
    let chartMax = 0;
    totalNotes += a.length;
    for (let i = 0; i < a.length; i++) {
      // 候选打分：列相同的优先（权重远大于时间差），其次时间最近
      let pick = -1;
      let bestScore = Infinity;
      let bestD = Infinity;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j < 0 || j >= b.length || used[j]) continue;
        const d = Math.abs(a[i].t - b[j].t);
        if (d > 3) continue;
        const score = (a[i].col === b[j].col ? 0 : 1000) + d;
        if (score < bestScore) {
          bestScore = score;
          bestD = d;
          pick = j;
        }
      }
      if (pick < 0) {
        colMismatch.push(`${chart.from}#${i} 无法配对`);
        continue;
      }
      used[pick] = 1;
      if (a[i].col !== b[pick].col) {
        colMismatch.push(`${chart.from}#${i} col ${a[i].col}->${b[pick].col}`);
      }
      if (a[i].hold !== b[pick].hold) holdMismatch.push(`${chart.from}#${i}`);
      allDev.push(bestD);
      if (bestD > chartMax) chartMax = bestD;
      if (a[i].hold && b[pick].hold && a[i].end != null && b[pick].end != null) {
        const d2 = Math.abs(a[i].end - b[pick].end);
        allDev.push(d2);
        totalHoldEnds++;
        if (d2 > chartMax) chartMax = d2;
      }
    }
    // ---- 绿线 (SV) 往返校验 ----
    // 源绿线：继承型 (uninherited=false) 且 beatLength < 0，卷速 = -100/beatLength
    const greenOf = (osu) =>
      osu.timingPoints
        .filter((t) => t.uninherited === false && t.beatLength < 0)
        .map((t) => Math.round((-100 / t.beatLength) * 1000) / 1000)
        .sort((p, q) => p - q);
    const sg = greenOf(src);
    const bg = greenOf(pb);
    greenTotal += sg.length;
    if (sg.length !== bg.length) {
      greenMismatch.push(`${chart.from}: 绿线数 ${sg.length} vs ${bg.length}`);
    } else {
      for (let i = 0; i < sg.length; i++) {
        if (Math.abs(sg[i] - bg[i]) > 0.002) {
          greenMismatch.push(`${chart.from}: 卷速 ${sg[i]} vs ${bg[i]}`);
          break;
        }
      }
    }

    chartStats.push({ name: chart.from, max: chartMax, n: a.length });
  }
}

let max = 0;
let sum = 0;
let over1 = 0;
let over5 = 0;
for (const d of allDev) {
  if (d > max) max = d;
  sum += d;
  if (d > 1) over1++;
  if (d > 5) over5++;
}

console.log('');
console.log('=========== 批量往返测试结果 ===========');
console.log('处理的谱面集   : ' + folders);
console.log('往返测试的谱面 : ' + charts);
console.log('跳过的非 mania : ' + skippedNonMania);
console.log('失败           : ' + failures);
console.log('');
console.log('比对规模:');
console.log('  音符（列/长按/时间）  : ' + totalNotes + '  ×  每个比对 4 项 = ' + totalNotes * 4);
console.log('  长按结束时间          : ' + totalHoldEnds);
console.log('  绿线条目              : ' + greenTotal);
console.log('  时间偏差比较次数      : ' + allDev.length + '  (音符 ' + totalNotes + ' + 长按结束 ' + totalHoldEnds + ')');
console.log('  合计原子比对次数      : ' + (totalNotes * 4 + totalHoldEnds + greenTotal));
console.log('');
console.log('时间偏差 (osu → mc → osu，单位 ms):');
console.log('  样本数         : ' + allDev.length);
console.log('  最大           : ' + max.toFixed(4));
console.log('  平均           : ' + (allDev.length ? sum / allDev.length : 0).toFixed(4));
console.log('  >1ms 的样本    : ' + over1);
console.log('  >5ms 的样本    : ' + over5);
console.log('');
console.log('列映射不一致   : ' + colMismatch.length + (colMismatch.length ? '  例: ' + colMismatch.slice(0, 3).join(', ') : ''));
console.log('长按标记不一致 : ' + holdMismatch.length + (holdMismatch.length ? '  例: ' + holdMismatch.slice(0, 3).join(', ') : ''));
console.log('绿线 (SV)      : 源共 ' + greenTotal + ' 条，不一致 ' + greenMismatch.length +
  (greenMismatch.length ? '  例: ' + greenMismatch.slice(0, 3).join(' | ') : ''));
console.log('结构问题       : ' + structIssues.length);
for (const s of structIssues.slice(0, 8)) console.log('  ! ' + s);

chartStats.sort((p, q) => q.max - p.max);
if (chartStats.length) {
  console.log('');
  console.log('偏差最大的谱面 (前 5):');
  for (const c of chartStats.slice(0, 5)) {
    console.log('  max=' + c.max.toFixed(0).padStart(6) + 'ms  ' + String(c.n).padStart(5) + '音  ' + c.name);
  }
}
