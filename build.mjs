#!/usr/bin/env node
/**
 * build.mjs — 把 core.mjs 内联进 app.template.html，产出单文件应用 OsuToMalody.html
 * 单一事实来源：转换逻辑只写在 core.mjs，CLI 和网页应用共用同一份代码。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const core = await readFile(join(here, 'core.mjs'), 'utf8');
const tpl = await readFile(join(here, 'app.template.html'), 'utf8');

if (!tpl.includes('/*__CORE__*/')) throw new Error('模板里找不到 /*__CORE__*/ 占位符');

// 内联时去掉 ESM 的 export 前缀（内联 <script type="module"> 里不需要）
const inlined = core.replace(/^export\s+/gm, '');

const out = tpl.replace('/*__CORE__*/', inlined.trimEnd());
const outPath = join(here, 'OsuToMalody.html');
await writeFile(outPath, out, 'utf8');

const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log('已生成: ' + outPath + '  (' + kb + ' KB)');
console.log('内联核心行数: ' + inlined.split('\n').length);
