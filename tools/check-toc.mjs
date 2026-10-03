// 校验 README 目录里的锚点链接是否都能命中真实标题。
// 使用 GitHub 官方的 slug 规则，并复现其「重复标题自动加 -1/-2 后缀」的行为。
import { readFileSync } from 'node:fs';
import { slug } from './gh-slug.mjs';

const file = process.argv[2] || 'README.md';
const md = readFileSync(file, 'utf8');

// 1) 收集所有标题，按 GitHub 的 Slugger 规则生成唯一锚点
const seen = new Map();
const anchors = new Set();
const headings = [];
for (const m of md.matchAll(/^(#{1,6})\s+(.+?)\s*$/gm)) {
  const text = m[2];
  let s = slug(text);
  if (seen.has(s)) {
    let n = seen.get(s) + 1;
    while (seen.has(s + '-' + n)) n++;
    seen.set(s, n);
    s = s + '-' + n;
  } else {
    seen.set(s, 0);
  }
  anchors.add(s);
  headings.push({ level: m[1].length, text, anchor: s });
}

// 2) 收集文中的页内链接 ](#xxx)
const links = [...md.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);

console.log(`标题数: ${headings.length}    页内锚点链接数: ${links.length}`);
console.log('');

const bad = links.filter((l) => !anchors.has(l));
if (bad.length === 0) {
  console.log('✓ 全部锚点链接都能命中真实标题');
} else {
  console.log(`✗ ${bad.length} 个链接找不到对应标题：`);
  for (const b of bad) {
    console.log(`   #${b}`);
    // 给出最接近的候选
    const near = [...anchors].filter((a) => a.startsWith(slug(b).slice(0, 4))).slice(0, 3);
    if (near.length) console.log(`      相近候选: ${near.map((x) => '#' + x).join('  ')}`);
  }
  process.exitCode = 1;
}

console.log('');
console.log('— 各标题的锚点 —');
for (const h of headings) {
  const linked = links.includes(h.anchor);
  console.log(`  ${'  '.repeat(Math.max(0, h.level - 2))}${linked ? '#' : ' '}${h.anchor}   ⟵ ${h.text}`);
}
