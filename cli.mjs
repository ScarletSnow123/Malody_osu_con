#!/usr/bin/env node
/**
 * cli.mjs — 双向转换命令行
 *
 *   node cli.mjs <输入> [-o 输出] [选项]
 *
 * 输入可以是：
 *   .mcz              → .osz        (Malody → osu!mania)
 *   .osz / .zip       → .mcz        (osu!mania → Malody，可编辑)
 *   .osu              → .mc         (单个谱面 → Malody 谱面 JSON)
 *   含 .osu 的目录     → .mcz        (osu! 歌曲文件夹 → Malody)
 *   其它目录           → 目录里的每个 .mcz/.osz/.zip/.osu 逐个转换（两个方向都支持）
 *   --recursive       → 递归子目录（可一次转完整个 osu! Songs 目录树）
 *
 * 输入方向按扩展名/内容自动判定：Malody 谱面包 ↔ osu! 谱面包。
 */
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { dirname, join, basename, resolve, extname } from 'node:path';
import { convertMczToOsz, convertOszToMcz, convertMcToOsu, parseOsu, osuToMc, writeZip } from './core.mjs';

const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|bmp|gif)$/i;
const PACK_EXT = /\.(mcz|osz|zip)$/i;

function parseArgs(argv) {
  const args = {
    input: null, output: null, shiftMs: 0, key: null,
    compress: true, denom: 0, noSync: false, mcStyle: 'full', recursive: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--output') args.output = argv[++i];
    else if (a === '--shift') args.shiftMs = Number(argv[++i]) || 0;
    else if (a === '--key') args.key = Number(argv[++i]) || null;
    else if (a === '--denom') args.denom = Number(argv[++i]) || 0;
    else if (a === '--no-sync') args.noSync = true;
    else if (a === '--mc-style') args.mcStyle = argv[++i] || 'full';
    else if (a === '--no-compress') args.compress = false;
    else if (a === '--recursive' || a === '-r') args.recursive = true;
    else if (!a.startsWith('-')) args.input = a;
  }
  return args;
}

/** 从 Malody meta 或文件名构造安全的 osu! 文件名 */
function safeOsuName(mc) {
  const meta = mc.meta || {};
  const song = meta.song || {};
  let name = String(song.title || meta.creator || '').replace(/[\\/:*?"<>|]/g, '_');
  name = name.replace(/\s+/g, ' ') + ' ' + String(meta.version || '4K').replace(/[\\/:*?"<>|]/g, '_');
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

const mb = (n) => (n / 1048576).toFixed(2) + ' MB';
const stripKnownExt = (p) => p.replace(/\.(mcz|osz|zip|osu|mc)$/i, '');

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error('用法: node cli.mjs <输入> [-o 输出] [--key N] [--shift ms] [--denom N]');
  console.error('                    [--mc-style full|minimal] [--no-sync] [--no-compress] [-r]');
  process.exit(2);
}

const inputPath = resolve(args.input);
const st = await stat(inputPath);
const convOpts = {
  shiftMs: args.shiftMs,
  key: args.key,
  compress: args.compress,
  noSync: args.noSync,
  mcStyle: args.mcStyle,
  denom: args.denom || undefined,
};

/** 把 osu! 歌曲目录打包成内存 zip，复用 .osz 的处理链路 */
async function zipDirectory(dir) {
  const files = await readdir(dir, { withFileTypes: true });
  const entries = [];
  for (const f of files) {
    if (!f.isFile()) continue;
    if (!/\.osu$/i.test(f.name) && !AUDIO_EXT.test(f.name) && !IMAGE_EXT.test(f.name)) continue;
    entries.push({ name: f.name, data: new Uint8Array(await readFile(join(dir, f.name))) });
  }
  if (!entries.length) throw new Error('目录里没有找到 .osu / 音频 / 图片');
  return { zip: await writeZip(entries, { compress: true }), count: entries.length };
}

/** 把「含 .osu 的目录」当成一个 osu! 歌曲文件夹 → .mcz（可能拆成多个键数包） */
async function convertSongDir(dir, outBase, verbose) {
  const { zip, count } = await zipDirectory(dir);
  if (verbose) console.log('收集文件: ' + count + ' 个，临时包 ' + mb(zip.length));
  const { packages, warnings } = await convertOszToMcz(zip, convOpts);
  const produced = [];
  for (const pkg of packages) {
    const out = packages.length === 1 ? outBase + '.mcz' : outBase + '_' + pkg.report.key + 'K.mcz';
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, pkg.data);
    if (verbose) printReport(out, pkg);
    else console.log('  → ' + basename(out) + '  (' + mb(pkg.data.length) + ')');
    produced.push(out);
  }
  if (verbose) printWarnings(warnings);
  return produced;
}

/** 转换单个文件（.mcz / .osz / .zip / .osu）。outBase 为不含扩展名的输出前缀 */
async function convertOneFile(srcPath, outBase, verbose, explicitOut) {
  const ext = extname(srcPath).toLowerCase();
  const produced = [];

  if (ext === '.mcz') {
    const buf = await readFile(srcPath);
    if (verbose) console.log('输入: ' + srcPath + '  (' + mb(buf.length) + ')');
    const { data, report, entries } = await convertMczToOsz(buf, convOpts);
    const outPath = outBase + '.osz';
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, data);
    if (verbose) {
      console.log('');
      console.log('输出: ' + outPath + '  (' + mb(data.length) + ')');
      console.log('包内条目: ' + entries.map((e) => e.name).join(', '));
      console.log('');
      console.log('谱面:');
      for (const c of report.charts) {
        console.log(`  ${c.file}`);
        console.log(`    来源 ${c.from} | ${c.key}K | 音符 ${c.notes} 长按 ${c.holds} | BPM点 ${c.timingPoints}`);
        console.log(`    首/末 ${(c.firstMs / 1000).toFixed(3)}s / ${(c.lastMs / 1000).toFixed(3)}s | AudioLeadIn ${c.audioLeadIn}ms`);
      }
      console.log('音频: ' + (report.audio || '(无)'));
      console.log('背景: ' + (report.background || '(无)'));
      printWarnings(report.warnings);
    } else {
      console.log('  → ' + basename(outPath) + '  (' + mb(data.length) + ')');
    }
    produced.push(outPath);
  } else if (ext === '.osz' || ext === '.zip') {
    const buf = await readFile(srcPath);
    if (verbose) console.log('输入: ' + srcPath + '  (' + mb(buf.length) + ')');
    const { packages, warnings } = await convertOszToMcz(buf, convOpts);
    for (const pkg of packages) {
      const out = packages.length === 1 ? outBase + '.mcz' : outBase + '_' + pkg.report.key + 'K.mcz';
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, pkg.data);
      if (verbose) printReport(out, pkg);
      else console.log('  → ' + basename(out) + '  (' + mb(pkg.data.length) + ')');
      produced.push(out);
    }
    if (verbose) printWarnings(warnings);
  } else if (ext === '.osu') {
    const text = await readFile(srcPath, 'utf8');
    const osu = parseOsu(text);
    const { mc, stats } = osuToMc(osu, {
      ...convOpts,
      keyOverride: args.key,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    const outPath = outBase + '.mc';
    const json = JSON.stringify(mc);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, json);
    if (verbose) {
      console.log('输入: ' + srcPath);
      console.log('输出: ' + outPath + '  (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');
      console.log('');
      console.log(`  ${stats.key}K | 音符 ${stats.notes} 长按 ${stats.holds} | BPM点 ${stats.timingPoints} | 绿线 ${stats.greenLines} | 自定义音效 ${stats.soundNotes}`);
      console.log(`  首/末 ${(stats.firstMs / 1000).toFixed(3)}s / ${(stats.lastMs / 1000).toFixed(3)}s`);
      console.log('  注意: 单文件输出不含音频/背景，需自行放入 Malody 谱面包');
    } else {
      console.log('  → ' + basename(outPath) + '  (' + (Buffer.byteLength(json) / 1024).toFixed(1) + ' KB)');
    }
    produced.push(outPath);
  } else if (ext === '.mc') {
    const buf = await readFile(srcPath);
    if (verbose) console.log('输入: ' + srcPath + '  (' + mb(buf.length) + ')');
    const mc = JSON.parse(new TextDecoder('utf-8').decode(buf));
    const osuName = safeOsuName(mc);
    const res = convertMcToOsu(mc, {
      audioName: convOpts.audioName || '',
      backgroundName: '',
      shiftMs: convOpts.shiftMs,
      noSync: convOpts.noSync,
      keyOverride: args.key,
    });
    const outPath = (explicitOut ? outBase : join(dirname(outBase), osuName)) + '.osu';
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, res.text);
    if (verbose) {
      console.log('输出: ' + outPath + '  (' + mb(Buffer.byteLength(res.text)) + ')');
      const s = res.stats;
      console.log(`  ${s.key}K | 音符 ${s.notes} 长按 ${s.holds} | BPM点 ${s.timingPoints} | 绿线 ${s.greenLines} | 自定义音效 ${s.soundNotes}`);
      if (res.warnings && res.warnings.length) printWarnings(res.warnings);
      console.log('  注意: 单文件输出不含音频/背景，需自行放入 osu! 歌曲文件夹');
    } else {
      console.log('  → ' + basename(outPath) + '  (' + mb(Buffer.byteLength(res.text)) + ')');
    }
    produced.push(outPath);
  } else {
    console.error('  跳过无法识别的类型: ' + ext);
  }
  return produced;
}

/**
 * 扫描目录，判断每一项该怎么处理：
 *   songdir — 目录里有 .osu，当成一个 osu! 歌曲文件夹
 *   pack    — .mcz / .osz / .zip 谱面包，单独转换
 *   osu     — 孤立的 .osu（所在目录没有其它 .osu）
 */
async function collectTargets(dir, recursive) {
  const list = await readdir(dir, { withFileTypes: true });
  const files = list.filter((e) => e.isFile()).map((e) => e.name);
  const targets = [];
  const osuNames = files.filter((n) => /\.osu$/i.test(n));

  if (osuNames.length) targets.push({ type: 'songdir', dir });
  for (const n of files) {
    if (PACK_EXT.test(n)) targets.push({ type: 'pack', path: join(dir, n) });
    else if (/\.osu$/i.test(n) && !osuNames.length) targets.push({ type: 'osu', path: join(dir, n) });
  }
  if (recursive) {
    for (const e of list) {
      if (e.isDirectory()) targets.push(...(await collectTargets(join(dir, e.name), true)));
    }
  }
  return targets;
}

const t0 = Date.now();

if (st.isDirectory()) {
  console.log('输入目录: ' + inputPath);
  const single = !args.recursive;
  const targets = await collectTargets(inputPath, args.recursive);

  if (!targets.length) {
    console.error('目录里没有找到 .osu / .mcz / .osz / .zip');
    process.exit(1);
  }

  if (single && targets.length === 1 && targets[0].type === 'songdir') {
    // 单个 osu! 歌曲文件夹：输出放在输入旁边（或 -o 指定）
    const outBase = args.output
      ? stripKnownExt(resolve(args.output))
      : join(dirname(inputPath), basename(inputPath).replace(/[\\/:*?"<>|]/g, '_'));
    await convertSongDir(inputPath, outBase, true);
  } else {
    // 批量：所有产物集中到一个目录，避免污染 osu! 曲库
    const outDir = args.output
      ? resolve(args.output)
      : join(dirname(inputPath), basename(inputPath).replace(/[\\/:*?"<>|]/g, '_') + '_converted');
    await mkdir(outDir, { recursive: true });
    console.log('共 ' + targets.length + ' 项待转换，输出目录: ' + outDir);
    let done = 0;
    let failed = 0;
    const usedOutNames = new Set();
function uniqueOutName(base) {
  const safe = base.replace(/[\\/:*?"<>|]/g, '_');
  if (!usedOutNames.has(safe)) { usedOutNames.add(safe); return safe; }
  const [n, ...rest] = safe.split('_');
  const num = rest.length ? Number(rest.join('_')) + 1 : 1;
  const dup = `${n}_${num}`;
  usedOutNames.add(dup);
  return dup;
}

for (const t of targets) {
      const name = t.type === 'songdir' ? basename(t.dir) : basename(t.path).replace(/\.[^.]+$/, '');
      const safe = uniqueOutName(name);
      console.log('');
      console.log('[' + (++done) + '/' + targets.length + '] ' + t.type + '  ' + (t.dir || t.path));
      try {
        if (t.type === 'songdir') await convertSongDir(t.dir, join(outDir, safe), false);
        else await convertOneFile(t.path, join(outDir, safe), false);
      } catch (e) {
        failed++;
        console.error('  × 失败: ' + (e && e.message ? e.message : e));
      }
    }
    console.log('');
    console.log('批量完成: 成功 ' + (targets.length - failed) + ' / ' + targets.length +
      (failed ? '，失败 ' + failed : ''));
  }
} else {
  const ext = extname(inputPath).toLowerCase();
  if (!/\.(mcz|osz|zip|osu|mc)$/i.test(ext)) {
    console.error('无法识别的输入类型: ' + ext);
    process.exit(2);
  }
  const outBase = args.output ? stripKnownExt(resolve(args.output)) : stripKnownExt(inputPath);
  try {
    await convertOneFile(inputPath, outBase, true, !!args.output);
  } catch (e) {
    // 单文件模式给出干净的错误信息，而不是抛裸堆栈
    console.error('转换失败: ' + (e && e.message ? e.message : e));
    process.exit(1);
  }
}

console.log('');
console.log('耗时 ' + (Date.now() - t0) + ' ms');

function printReport(out, pkg) {
  console.log('');
  console.log('输出: ' + out + '  (' + mb(pkg.data.length) + ')');
  console.log('包内条目: ' + pkg.entries.map((e) => e.name).join(', '));
  console.log('谱面 (' + pkg.report.key + 'K):');
  for (const c of pkg.report.charts) {
    console.log(`  ${c.file}  ← ${c.from}`);
    console.log(`    ${c.notes} 音符 / ${c.holds} 长按 / ${c.timingPoints} 个 BPM 点`);
    console.log(`    音频 ${c.audio || '(无)'} | 背景 ${c.background || '(无)'}`);
  }
}

function printWarnings(list) {
  const w = (list || []).filter(Boolean);
  if (!w.length) return;
  console.log('');
  console.log('警告:');
  for (const x of w) console.log('  ! ' + x);
}
