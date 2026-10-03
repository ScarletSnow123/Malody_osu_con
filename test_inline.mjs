#!/usr/bin/env node
/**
 * test_inline.mjs — 验证网页应用里内联的那份核心代码：
 *   1) 去掉导出前缀与 UI 注释块后，与 core.mjs 逐字符一致
 *   2) 正反两个方向的产物与 CLI 一致
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readZip } from './core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const html = await readFile(join(here, 'Malody2osu.html'), 'utf8');
const full = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

// 切掉 UI 段（含它上面的那块注释）
let coreInline = full;
const uiIdx = coreInline.indexOf('* UI');
if (uiIdx < 0) throw new Error('找不到 UI 分隔注释');
const braceStart = coreInline.lastIndexOf('/*', uiIdx);
coreInline = coreInline.slice(0, braceStart).trim();

const coreStripped = (await readFile(join(here, 'core.mjs'), 'utf8')).replace(/^export\s+/gm, '').trim();

console.log('=== 1) 内联核心 vs core.mjs（去 export）===');
console.log('内联长度  : ' + coreInline.length);
console.log('core 长度 : ' + coreStripped.length);
const same = coreInline === coreStripped;
console.log('逐字符一致: ' + (same ? 'YES ✅' : 'NO ❌'));
if (!same) {
  for (let i = 0; i < Math.max(coreInline.length, coreStripped.length); i++) {
    if (coreInline[i] !== coreStripped[i]) {
      console.log('  首个差异 @' + i);
      console.log('   内联: ' + JSON.stringify(coreInline.slice(i, i + 80)));
      console.log('   core: ' + JSON.stringify(coreStripped.slice(i, i + 80)));
      break;
    }
  }
  process.exitCode = 1;
}

// 用内联核心跑两个方向（不 import core.mjs，避免重复声明）
const runner = join(here, '.inline_runner.mjs');
const harness = `
import { readFile, writeFile } from 'node:fs/promises';
const mode = process.argv[2];
const input = process.argv[3];
const output = process.argv[4];
const buf = new Uint8Array(await readFile(input));
if (mode === 'fwd') {
  const { data } = await convertMczToOsz(buf, {});
  await writeFile(output, data);
} else {
  const { packages } = await convertOszToMcz(buf, {});
  await writeFile(output, packages[0].data);
}
`;
await writeFile(runner, coreInline + '\n' + harness, 'utf8');

const mcz = join(here, 'extract_src.mcz');
const osz = join(here, 'out', 'Echoes Of Memoria.osz');
const tmpFwd = join(here, 'out', '_inline_fwd.osz');
const tmpRev = join(here, 'out', '_inline_rev.mcz');
execFileSync(node, [runner, 'fwd', mcz, tmpFwd]);
execFileSync(node, [runner, 'rev', osz, tmpRev]);

console.log('');
console.log('=== 2) 正向 (.mcz → .osz) 与 CLI 比对 ===');
const A = await readFile(osz);
const B = await readFile(tmpFwd);
const hA = createHash('sha256').update(A).digest('hex');
const hB = createHash('sha256').update(B).digest('hex');
console.log('CLI : ' + A.length + ' B  ' + hA.slice(0, 32));
console.log('内联: ' + B.length + ' B  ' + hB.slice(0, 32));
console.log('字节一致: ' + (hA === hB ? 'YES ✅' : 'NO ❌'));
if (hA !== hB) process.exitCode = 1;

console.log('');
console.log('=== 3) 反向 (.osz → .mcz) 与 CLI 语义比对 ===');
const cliRev = await readFile(join(here, 'out', 'roundtrip.mcz'));
const inlineRev = await readFile(tmpRev);

async function loadMc(buf) {
  const zf = await readZip(buf);
  const name = [...zf.keys()].find((n) => n.endsWith('.mc'));
  const mc = JSON.parse(new TextDecoder('utf-8').decode(zf.get(name).data));
  mc.meta.time = 0; // 时间戳，归一化
  return {
    name: name.replace(/^\d+/, 'TS'),
    entries: [...zf.keys()].map((n) => n.replace(/^\d+/, 'TS')).sort(),
    mc,
  };
}
const c1 = await loadMc(cliRev);
const c2 = await loadMc(inlineRev);
const j1 = JSON.stringify(c1, null, 1);
const j2 = JSON.stringify(c2, null, 1);
const bgm1 = c1.mc.note[c1.mc.note.length - 1];
console.log('CLI  : 音符 ' + (c1.mc.note.length - 1) + '  BPM点 ' + c1.mc.time.length + '  offset ' + bgm1.offset);
console.log('内联 : 音符 ' + (c2.mc.note.length - 1) + '  BPM点 ' + c2.mc.time.length + '  offset ' + c2.mc.note[c2.mc.note.length - 1].offset);
console.log('包内条目: ' + c1.entries.join(', '));
console.log('语义一致: ' + (j1 === j2 ? 'YES ✅' : 'NO ❌'));
if (j1 !== j2) {
  for (let i = 0; i < Math.max(j1.length, j2.length); i++) {
    if (j1[i] !== j2[i]) {
      console.log('  首个差异 @' + i);
      console.log('   CLI : ' + JSON.stringify(j1.slice(Math.max(0, i - 70), i + 70)));
      console.log('   内联: ' + JSON.stringify(j2.slice(Math.max(0, i - 70), i + 70)));
      break;
    }
  }
  process.exitCode = 1;
}
