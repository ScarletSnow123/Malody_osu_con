#!/usr/bin/env node
/**
 * test_inline.mjs — 验证网页应用里内联的那份转换核心与 core.mjs 一致。
 *
 * 用法:
 *   node test_inline.mjs <源.mcz> [该.mcz转出的.osz]
 *
 * 检查项:
 *   1) OsuToMalody.html 内联的核心代码，与 core.mjs（去掉 export）逐字符一致
 *   2) 若给出 .osz：用内联核心重新转换 <源.mcz>，产物应与该 .osz 字节一致
 *   3) 反向：用内联核心把 .osz 转回 .mcz，校验结构有效
 *
 * 例:
 *   node build.mjs
 *   node cli.mjs "源.mcz" -o "源.osz"
 *   node test_inline.mjs "源.mcz" "源.osz"
 */
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readZip } from './core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const mcz = process.argv[2];
const osz = process.argv[3];
if (!mcz) {
  console.error('用法: node test_inline.mjs <源.mcz> [该.mcz转出的.osz]');
  process.exit(2);
}

// ------------------------------------------------ 1) 内联核心与 core.mjs 一致性
const html = await readFile(join(here, 'OsuToMalody.html'), 'utf8');
const full = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
// 切掉内联核心末尾那块 UI 注释——它属于界面部分，core.mjs 里没有
const uiIdx = full.indexOf('* UI');
if (uiIdx < 0) throw new Error('在 OsuToMalody.html 里找不到 UI 分隔注释');
const coreInline = full.slice(0, full.lastIndexOf('/*', uiIdx)).trim();
const coreStripped = (await readFile(join(here, 'core.mjs'), 'utf8')).replace(/^export\s+/gm, '').trim();

console.log('=== 1) 内联核心 vs core.mjs ===');
console.log('  内联长度 : ' + coreInline.length);
console.log('  core长度 : ' + coreStripped.length);
const same = coreInline === coreStripped;
console.log('  逐字符一致: ' + (same ? 'YES' : 'NO'));
if (!same) {
  for (let i = 0; i < Math.max(coreInline.length, coreStripped.length); i++) {
    if (coreInline[i] !== coreStripped[i]) {
      console.log('  首个差异 @' + i);
      console.log('    内联: ' + JSON.stringify(coreInline.slice(i, i + 80)));
      console.log('    core: ' + JSON.stringify(coreStripped.slice(i, i + 80)));
      break;
    }
  }
  process.exitCode = 1;
}

// ------------------------------------------------ 用内联核心跑转换
const runner = join(here, '.inline_runner.mjs');
const harness = `
import { readFile, writeFile } from 'node:fs/promises';
const [mode, input, output] = process.argv.slice(2);
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

const tmpFwd = join(here, '.inline_fwd.osz');
const tmpRev = join(here, '.inline_rev.mcz');
try {
  execFileSync(node, [runner, 'fwd', mcz, tmpFwd]);

  if (osz) {
    console.log('');
    console.log('=== 2) 正向产物与 CLI 比对 ===');
    const a = await readFile(osz);
    const b = await readFile(tmpFwd);
    const ha = createHash('sha256').update(a).digest('hex');
    const hb = createHash('sha256').update(b).digest('hex');
    console.log('  CLI  : ' + a.length + ' B  ' + ha.slice(0, 32));
    console.log('  内联 : ' + b.length + ' B  ' + hb.slice(0, 32));
    console.log('  字节一致: ' + (ha === hb ? 'YES' : 'NO'));
    if (ha !== hb) process.exitCode = 1;

    console.log('');
    console.log('=== 3) 反向（内联核心把 .osz 转回 .mcz）===');
    execFileSync(node, [runner, 'rev', osz, tmpRev]);
    const zf = await readZip(await readFile(tmpRev));
    const mcName = [...zf.keys()].find((n) => n.endsWith('.mc'));
    const mc = JSON.parse(new TextDecoder('utf-8').decode(zf.get(mcName).data));
    const notes = mc.note.filter((n) => n.column !== undefined);
    const holds = notes.filter((n) => n.endbeat);
    console.log('  ' + basename(tmpRev) + ' → ' + mcName);
    console.log('  键数 ' + mc.meta.mode_ext.column + 'K | 音符 ' + notes.length + ' | 长按 ' + holds.length +
      ' | BPM 点 ' + mc.time.length);
    const bad = notes.filter((n) => n.beat[0] < 0 || 288 % n.beat[2] !== 0).length;
    console.log('  结构异常（负小节 / 分母不整除 288）: ' + bad);
    console.log('  结果: ' + (notes.length > 0 && bad === 0 ? '有效' : '异常'));
    if (!(notes.length > 0 && bad === 0)) process.exitCode = 1;
  }
} finally {
  for (const f of [runner, tmpFwd, tmpRev]) await rm(f, { force: true });
}
