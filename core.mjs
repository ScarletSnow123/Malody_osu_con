/**
 * core.mjs — Malody (.mcz / .mc) → osu!mania (.osz / .osu) 转换核心
 *
 * 零依赖：只用标准 Web API（DecompressionStream / CompressionStream / TextEncoder / DataView），
 * 因此在现代浏览器和 Node.js 18+ 中都能直接运行。
 *
 * 格式依据（对真实谱面逆向 + 与 rmstZ 参考实现交叉验证）：
 *   - beat 三元组 [a,b,c] 表示 a + b/c 拍   （rmstZ: b.fAdd(c.fDiv(d))）
 *   - 键数取 meta.mode_ext.column
 *   - note[] 中 type==1 且无 column 的条目是 BGM 音频事件，其 offset → osu AudioLeadIn
 *   - 长按用 endbeat 表示，输出 osu mania 的 type 128
 */

/* ------------------------------------------------------------------ *
 * CRC32
 * ------------------------------------------------------------------ */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ *
 * deflate / inflate（走浏览器与 Node 都有的原生压缩流）
 * ------------------------------------------------------------------ */
export async function inflateRaw(u8) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前环境不支持 DecompressionStream，请使用较新的 Chrome / Edge / Firefox');
  }
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function deflateRaw(u8) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* ------------------------------------------------------------------ *
 * 极简 ZIP 读写
 * ------------------------------------------------------------------ */
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/**
 * 解压安全上限。真实谱面包（谱面 JSON + 音频 + 背景，通常几 MB）离这些数量级差得很远，
 * 设限只为防住恶意构造的「解压炸弹」——几十 KB 的条目解压后膨胀到几个 GB，把内存吃光。
 * 这是可覆盖的配置对象，程序化调用方若确有大包需求可自行调高。
 * （条目数不必设限：EOCD 里的 count 是 uint16，最多 65535，本身撑不出内存问题。）
 */
export const READ_LIMITS = {
  maxEntryBytes: 512 * 1024 * 1024, // 单条目解压后 ≤ 512 MB
  maxTotalBytes: 4 * 1024 * 1024 * 1024, // 整包解压后合计 ≤ 4 GB
};

function fmtBytes(n) {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
  return (n / 1024).toFixed(1) + ' KB';
}

function findEOCD(u8, dv) {
  const min = Math.max(0, u8.length - 22 - 0xffff);
  for (let i = u8.length - 22; i >= min; i--) {
    if (dv.getUint32(i, true) === SIG_EOCD) return i;
  }
  return -1;
}

/** 读取 ZIP，返回 Map<文件名, {name, data:Uint8Array, dir:boolean}> */
export async function readZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = findEOCD(u8, dv);
  if (eocd < 0) throw new Error('不是有效的 ZIP/MCZ 文件（找不到中央目录结尾标记）');

  const count = dv.getUint16(eocd + 10, true);
  const cdOff = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const files = new Map();
  let total = 0;

  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== SIG_CENTRAL) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const uncompSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));

    // 先用中央目录里声明的大小做一次廉价检查，不必等真解压出来才发现是炸弹
    if (uncompSize > READ_LIMITS.maxEntryBytes || total + uncompSize > READ_LIMITS.maxTotalBytes) {
      throw new Error(
        `ZIP 条目解压后过大（${name}，声明 ${fmtBytes(uncompSize)}），已拒绝处理以防解压炸弹`
      );
    }

    if (dv.getUint32(localOff, true) !== SIG_LOCAL) {
      throw new Error('ZIP 结构损坏：本地文件头签名不正确 (' + name + ')');
    }
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > u8.length) {
      throw new Error('ZIP 结构损坏：条目数据超出文件范围 (' + name + ')');
    }
    const raw = u8.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error('不支持的 ZIP 压缩方式 ' + method + '（' + name + '）');

    // 声明的大小可能是假的，解压后再按真实长度核一次
    if (data.length > READ_LIMITS.maxEntryBytes || total + data.length > READ_LIMITS.maxTotalBytes) {
      throw new Error(
        `ZIP 条目解压后过大（${name}，实际 ${fmtBytes(data.length)}），已拒绝处理以防解压炸弹`
      );
    }
    total += data.length;

    files.set(name, { name, method, data, dir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (files.size === 0) throw new Error('ZIP 中没有可用条目');
  return files;
}

/** 写出 ZIP。compress=false 时全部使用 stored（无压缩），兼容性最好 */
export async function writeZip(entries, opts = {}) {
  const compress = opts.compress !== false;
  const enc = new TextEncoder();
  const localChunks = [];
  const centralMeta = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const data = e.data instanceof Uint8Array ? e.data : new Uint8Array(e.data);
    const crc = crc32(data);

    let method = 0;
    let payload = data;
    if (compress && data.length > 64) {
      const def = await deflateRaw(data);
      if (def && def.length < data.length) {
        method = 8;
        payload = def;
      }
    }

    const lh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lh.buffer);
    ldv.setUint32(0, SIG_LOCAL, true);
    ldv.setUint16(4, 20, true);
    ldv.setUint16(6, 0x0800, true); // UTF-8 文件名
    ldv.setUint16(8, method, true);
    ldv.setUint16(10, 0, true);
    ldv.setUint16(12, 0x21, true); // 1980-01-01
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, payload.length, true);
    ldv.setUint32(22, data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    ldv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localChunks.push(lh, payload);
    centralMeta.push({ nameBytes, method, crc, compSize: payload.length, uncompSize: data.length, offset });
    offset += lh.length + payload.length;
  }

  const cdChunks = [];
  let cdLen = 0;
  for (const c of centralMeta) {
    const ch = new Uint8Array(46 + c.nameBytes.length);
    const cdv = new DataView(ch.buffer);
    cdv.setUint32(0, SIG_CENTRAL, true);
    cdv.setUint16(4, 20, true);
    cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0x0800, true);
    cdv.setUint16(10, c.method, true);
    cdv.setUint16(12, 0, true);
    cdv.setUint16(14, 0x21, true);
    cdv.setUint32(16, c.crc, true);
    cdv.setUint32(20, c.compSize, true);
    cdv.setUint32(24, c.uncompSize, true);
    cdv.setUint16(28, c.nameBytes.length, true);
    cdv.setUint32(42, c.offset, true);
    ch.set(c.nameBytes, 46);
    cdChunks.push(ch);
    cdLen += ch.length;
  }

  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, SIG_EOCD, true);
  edv.setUint16(8, centralMeta.length, true);
  edv.setUint16(10, centralMeta.length, true);
  edv.setUint32(12, cdLen, true);
  edv.setUint32(16, offset, true);

  const all = localChunks.concat(cdChunks, [eocd]);
  const total = all.reduce((s, x) => s + x.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const x of all) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 时间轴
 * ------------------------------------------------------------------ */
/** [a,b,c] → a + b/c 拍 */
export function parseBeat(a) {
  if (!Array.isArray(a) || a.length !== 3) return null;
  const b = Number(a[0]);
  const c = Number(a[1]);
  const d = Number(a[2]);
  if (!isFinite(b) || !isFinite(c) || !isFinite(d) || d <= 0) return null;
  return b + c / d;
}

export class TempoMap {
  constructor(timeList) {
    const pts = [];
    // time 字段必须是数组；写成对象/数字时给出可读的错误，而不是 "is not iterable"
    if (timeList != null && !Array.isArray(timeList)) {
      throw new Error('Malody 谱面的 time 字段必须是数组，实际是 ' + typeof timeList);
    }
    for (const t of timeList || []) {
      const b = parseBeat(t && t.beat);
      const bpm = Number(t && t.bpm);
      if (b === null || !isFinite(bpm) || bpm <= 0) continue; // 非正 BPM 是变速(SV)，不是真实 BPM
      const meter = Number(t.signature) > 0 ? Math.round(Number(t.signature)) : 4;
      pts.push([b, bpm, meter]);
    }
    pts.sort((x, y) => x[0] - y[0]);

    const ded = [];
    for (const p of pts) {
      if (ded.length && Math.abs(ded[ded.length - 1][0] - p[0]) < 1e-9) ded[ded.length - 1] = p;
      else ded.push(p);
    }
    if (!ded.length) ded.push([0, 120, 4]);
    if (Math.abs(ded[0][0]) > 1e-9) ded.unshift([0, ded[0][1], ded[0][2]]);

    this.points = ded;
    this.msAt = [0];
    for (let i = 1; i < ded.length; i++) {
      const [b0, bpm0] = ded[i - 1];
      this.msAt.push(this.msAt[i - 1] + ((ded[i][0] - b0) * 60000) / bpm0);
    }
  }

  toMs(beat) {
    const p = this.points;
    if (beat <= p[0][0]) return ((beat - p[0][0]) * 60000) / p[0][1];
    for (let i = 1; i < p.length; i++) {
      if (beat <= p[i][0]) return this.msAt[i - 1] + ((beat - p[i - 1][0]) * 60000) / p[i - 1][1];
    }
    const last = p[p.length - 1];
    return this.msAt[p.length - 1] + ((beat - last[0]) * 60000) / last[1];
  }

  /** 该拍点生效的 BPM（用于生成 osu 的 timing point） */
  bpmAt(beat) {
    const p = this.points;
    let bpm = p[0][1];
    let meter = p[0][2];
    for (let i = 0; i < p.length; i++) {
      if (beat >= p[i][0] - 1e-9) {
        bpm = p[i][1];
        meter = p[i][2];
      } else break;
    }
    return { bpm, meter };
  }
}

/* ------------------------------------------------------------------ *
 * .mc → .osu
 * ------------------------------------------------------------------ */
function fmtNum(v, nd = 12) {
  let s = v.toFixed(nd);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s === '-0' ? '0' : s;
}

function safeFileName(s, fallback = 'unknown') {
  const v = String(s == null ? '' : s).replace(/[\\/:*?"<>|\r\n\t]/g, '_').trim();
  return v || fallback;
}

/**
 * 把单个 .mc 转成 osu!mania 谱面文本
 * @param {object} mc       解析后的 .mc JSON
 * @param {object} ctx      { keyOverride, audioName, backgroundName, shiftMs }
 */
export function convertMcToOsu(mc, ctx = {}) {
  const meta = mc.meta || {};
  const song = meta.song || {};
  const modeExt = meta.mode_ext || {};

  const key = Math.max(1, Math.round(Number(ctx.keyOverride) || Number(modeExt.column) || 4));
  const shift = Number(ctx.shiftMs) || 0;

  const title = song.title || song.titleorg || 'Unknown Title';
  const artist = song.artist || song.artistorg || 'Unknown Artist';
  const creator = meta.creator || 'Unknown';
  const version = meta.version || 'Converted';
  const titleUni = song.titleorg || title;
  const artistUni = song.artistorg || artist;
  const source = song.source || '';
  const tags = ['malody', 'converted'].join(' ');

  const tempo = new TempoMap(mc.time);
  const rawNotes = Array.isArray(mc.note) ? mc.note : [];

  // note[] 里 type==1 且没有 column 的条目是音频/BGM 事件
  const audioName = ctx.audioName || '';
  let audioLeadIn = 0;
  for (const n of rawNotes) {
    if (
      n && parseInt(n.type, 10) === 1 && n.column === undefined &&
      Number.isFinite(Number(n.offset))
    ) {
      audioLeadIn = Math.round(Number(n.offset));
    }
  }

  // Malody 的 BGM offset 语义是「延迟多久开始播放音频」，即
  //     音频位置 = 谱面时间 − offset
  // osu! 的物件时间就是音频位置，因此这里整体前移 offset。
  // （AudioLeadIn 同时保留该值，保证往返转换可还原）
  const timeShift = (ctx.noSync ? 0 : -audioLeadIn) + shift;

  const notes = [];
  let skipped = 0;
  const warnings = [];

  for (const n of rawNotes) {
    if (!n || typeof n !== 'object') continue;
    const beat = parseBeat(n.beat);
    if (beat === null) {
      skipped++;
      continue;
    }

    const type = parseInt(n.type, 10);
    const hasColumn = n.column !== undefined;
    // 有 column 的都是音符（含 BGM 触发事件，带 sound），否则 BGM 事件已单独处理
    if (!hasColumn && type === 1) continue;

    const column = parseInt(n.column, 10);
    if (!isFinite(column) || column < 0 || column >= key) {
      skipped++;
      continue;
    }

    const t = Math.round(tempo.toMs(beat) + timeShift);
    const x = Math.round((((column * 2 + 1) / (key * 2)) * 512));
    const xC = Math.min(511, Math.max(0, x));

    const endBeat = parseBeat(n.endbeat);
    const hit = { x: xC, t, type: 1, end: 0 };
    if (n.sound) hit.sound = n.sound; // 普通音符的自定义 sample → osu HitObject extras
    if (endBeat !== null && endBeat > beat) {
      const tEnd = Math.round(tempo.toMs(endBeat) + timeShift);
      // 亚毫秒长按会被四舍五入压成 0 时长；osu! 里 0 时长 hold 无效，降级为普通音符
      if (tEnd > t) {
        hit.type = 128;
        hit.end = tEnd;
      }
    }
    notes.push(hit);
  }

  if (skipped > 0) {
    warnings.push(`跳过 ${skipped} 个无法解析的音符（beat 字段缺失或列号越界）`);
  }

  notes.sort((a, b) => (a.t - b.t) || (a.x - b.x));

  // ---- 组装 .osu ----
  const L = [];
  L.push('osu file format v14');
  L.push('');
  L.push('[General]');
  L.push('AudioFilename: ' + (audioName || 'audio.mp3'));
  L.push('AudioLeadIn: ' + audioLeadIn);
  L.push('PreviewTime: -1');
  L.push('Countdown: 0');
  L.push('SampleSet: Soft');
  L.push('StackLeniency: 0.7');
  L.push('Mode: 3');
  L.push('LetterboxInBreaks: 0');
  L.push('SpecialStyle: 0');
  L.push('WidescreenStoryboard: 0');
  L.push('EpilepsyWarning: 0');
  L.push('UseSkinSprites: 0');
  L.push('');
  L.push('[Editor]');
  L.push('Bookmarks: ');
  L.push('DistanceSpacing: 1');
  L.push('BeatDivisor: 4');
  L.push('GridSize: 4');
  L.push('TimelineZoom: 1');
  L.push('');
  L.push('[Metadata]');
  L.push('Title:' + title);
  L.push('TitleUnicode:' + titleUni);
  L.push('Artist:' + artist);
  L.push('ArtistUnicode:' + artistUni);
  L.push('Creator:' + creator);
  L.push('Version:' + version);
  L.push('Source:' + source);
  L.push('Tags:' + tags);
  L.push('BeatmapID:0');
  L.push('BeatmapSetID:-1');
  L.push('');
  L.push('[Difficulty]');
  L.push('HPDrainRate:8');
  L.push('CircleSize:' + key);
  L.push('OverallDifficulty:8');
  L.push('ApproachRate:5');
  L.push('SliderMultiplier:1.4');
  L.push('SliderTickRate:1');
  L.push('');
  L.push('[Events]');
  L.push('//Background and Video events');
  if (ctx.backgroundName) L.push('0,0,"' + ctx.backgroundName + '",0,0');
  L.push('//Break Periods');
  L.push('//Storyboard Layer 0 (Background)');
  L.push('//Storyboard Layer 1 (Fail)');
  L.push('//Storyboard Layer 2 (Pass)');
  L.push('//Storyboard Layer 3 (Foreground)');
  L.push('//Storyboard Sound Samples');
  L.push('');
  L.push('[TimingPoints]');
  // 红线（BPM 点）+ 绿线（SV 点）合并为一条时间轴输出
  const tps = [];
  for (const [b, bpm, meter] of tempo.points) {
    const t = Math.round(tempo.toMs(b) + timeShift);
    const msPerBeat = 60000 / bpm;
    tps.push({ time: t, beatLength: msPerBeat, meter: meter, uninherited: true });
  }
  for (const e of mc.effect || []) {
    if (e.scroll == null || typeof e.scroll !== 'number') continue;
    const s = e.scroll;
    if (!isFinite(s) || s <= 0) continue; // 只处理正卷速；负值对应非标准效果
    const b = parseBeat(e.beat);
    if (b === null) continue;
    const t = Math.round(tempo.toMs(b) + timeShift);
    // 卷速 → 绿线 beatLength：scroll = -100 / beatLength
    const beatLength = Math.round(-100.0 / s * 1000) / 1000;
    tps.push({ time: t, beatLength, meter: 4, uninherited: false });
  }
  tps.sort((a, b) => a.time - b.time);
  for (const tp of tps) {
    // 格式：time,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
    const fields = [tp.time, fmtNum(tp.beatLength), tp.meter, 2, 0, 100, tp.uninherited ? 1 : 0, 0];
    L.push(fields.join(','));
  }
  L.push('');
  L.push('[HitObjects]');
  for (const n of notes) {
    // hitSample 格式：normalSet:additionSet:index:volume:filename
    // 无自定义音效时保持与传统输出完全一致（0:0:0:0:，文件名位为空）
    const sampleTail = n.sound ? `0:0:0:70:${n.sound}` : '0:0:0:0:';
    if (n.type === 128) L.push(`${n.x},192,${n.t},128,0,${n.end}:${sampleTail}`);
    else L.push(`${n.x},192,${n.t},1,0,${sampleTail}`);
  }
  L.push('');

  const holdCount = notes.filter((n) => n.type === 128).length;
  const scrollEffects = (mc.effect || []).filter(
    (e) => e && typeof e.scroll === 'number' && isFinite(e.scroll) && e.scroll > 0
  ).length;
  return {
    text: L.join('\n'),
    stats: {
      key,
      notes: notes.length,
      holds: holdCount,
      timingPoints: tempo.points.length,
      greenLines: scrollEffects,
      soundNotes: notes.filter((n) => n.sound).length,
      skipped,
      audioLeadIn,
      firstMs: notes.length ? notes[0].t : 0,
      lastMs: notes.length ? notes[notes.length - 1].t : 0,
      title,
      artist,
      creator,
      version,
    },
    warnings,
  };
}

/* ------------------------------------------------------------------ *
 * .mcz → .osz
 * ------------------------------------------------------------------ */
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|bmp|gif)$/i;

/** 把文件名列表缩成「a, b, c 等 N 个」，用于告警文案 */
function briefList(list, max = 3) {
  if (list.length <= max) return list.join(', ');
  return `${list.slice(0, max).join(', ')} 等 ${list.length} 个`;
}

export async function convertMczToOsz(input, opts = {}) {
  const files = await readZip(input);
  const names = [...files.keys()].filter((n) => !files.get(n).dir);

  const mcNames = names.filter((n) => /\.mc$/i.test(n));
  if (!mcNames.length) throw new Error('压缩包里没有找到 .mc 谱面文件');

  const audioNames = names.filter((n) => AUDIO_EXT.test(n));
  const imageNames = names.filter((n) => IMAGE_EXT.test(n));
  const dec = new TextDecoder('utf-8');

  const outEntries = [];
  const report = { charts: [], audio: '', background: '', warnings: [] };

  // 包里混进了 osu! 侧的文件（例如有人把 .osu / .osz 直接塞进 .mcz）：
  // 它们不是 Malody 谱面，会被静默忽略，这里显式提示，免得用户以为已经转换成功。
  const foreignOsu = names.filter((n) => /\.(osu|osz)$/i.test(n));
  if (foreignOsu.length) {
    report.warnings.push(
      `包里有 ${briefList(foreignOsu)}：不是 Malody 谱面（.mcz 只转换 .mc），已跳过。` +
        `如需转换 osu! 谱面，请把 .osu / .osz 单独作为输入。`
    );
  }

  // 先定出音频与背景（多难度共用）
  let audioName = opts.audioName || audioNames[0] || '';
  let bgName = opts.backgroundName || '';

  const chartResults = [];
  for (const mcName of mcNames) {
    let mc;
    try {
      mc = JSON.parse(dec.decode(files.get(mcName).data));
    } catch (e) {
      report.warnings.push(`${mcName}: JSON 解析失败（${e.message}）`);
      continue;
    }

    const meta = mc.meta || {};
    // BGM 事件里的 sound 字段是最权威的音频名
    if (!opts.audioName && Array.isArray(mc.note)) {
      for (const n of mc.note) {
        if (n && parseInt(n.type, 10) === 1 && n.sound) {
          audioName = String(n.sound);
          break;
        }
      }
    }
    if (!opts.backgroundName && meta.background) bgName = String(meta.background);

    const mode = Number(meta.mode);
    if (isFinite(mode) && ![0, 1, 2, 6].includes(mode)) {
      report.warnings.push(`${mcName}: Malody mode=${mode} 不是键模式，列映射可能不正确`);
    }

    const res = convertMcToOsu(mc, {
      keyOverride: opts.key,
      audioName: audioName ? audioName.split(/[\\/]/).pop() : '',
      backgroundName: bgName ? bgName.split(/[\\/]/).pop() : '',
      shiftMs: opts.shiftMs,
      noSync: opts.noSync,
    });

    const s = res.stats;
    const osuFileName =
      `${safeFileName(s.artist)} - ${safeFileName(s.title)} (${safeFileName(s.creator)}) [${safeFileName(s.version)}].osu`;

    chartResults.push({ osuFileName, text: res.text, stats: s, sourceMc: mcName });
  }

  if (!chartResults.length) throw new Error('所有 .mc 都解析失败，没有生成任何谱面');

  const enc = new TextEncoder();
  for (const c of chartResults) {
    outEntries.push({ name: c.osuFileName, data: enc.encode(c.text) });
    report.charts.push({ file: c.osuFileName, from: c.sourceMc, ...c.stats });
  }

  // 资源原样搬运
  const packIn = (logicalName) => {
    if (!logicalName) return false;
    const short = logicalName.split(/[\\/]/).pop();
    for (const n of names) {
      if (n === logicalName || n.split(/[\\/]/).pop() === short) {
        outEntries.push({ name: short, data: files.get(n).data });
        return true;
      }
    }
    return false;
  };

  // 收集所有被引用的音频/背景（多难度可能各自不同）
  const audioBases = new Set();
  const bgBases = new Set();
  for (const mcName of mcNames) {
    let mc;
    try { mc = JSON.parse(dec.decode(files.get(mcName).data)); } catch { continue; }
    const meta = mc.meta || {};
    for (const n of mc.note || []) {
      if (n && parseInt(n.type, 10) === 1 && n.sound) audioBases.add(String(n.sound).split(/[\\/]/).pop());
    }
    if (meta.background) bgBases.add(String(meta.background).split(/[\\/]/).pop());
  }

  for (const a of audioBases) {
    if (packIn(a)) report.audio = a;
  }
  if (!report.audio) report.warnings.push('没有打包进音频文件，osu! 里将没有声音');

  for (const b of bgBases) {
    if (packIn(b)) report.background = b;
  }
  if (!report.background && imageNames.length) {
    report.background = imageNames[0].split(/[\\/]/).pop();
    packIn(report.background);
  }
  if (!report.background) report.warnings.push('没有打包进背景图');

  const osz = await writeZip(outEntries, { compress: opts.compress });
  return { data: osz, report, entries: outEntries };
}

/* ================================================================== *
 * 反向：osu! (.osu / .osz) → Malody (.mc / .mcz)
 *
 * 依据：
 *   - rconv 的 Malody 类型定义：Beat = [小节, snap索引, snap大小] 即 a + b/c
 *     SoundCueType: Effect=0 / Song=1 / KeySound=2  → BGM 事件 type=1
 *     ChartMode: Key=0, Catch=3, Pad=4, Taiko=5, Ring=6, Slide=7
 *   - 4 个真实 .mcz 的实测结构（数值分母 288 是最常用的 snap 大小）
 * ================================================================== */

const OSU_BEAT_DENOM = 288; // 真实 Malody 谱面里出现频率最高的 snap 大小

/** 解析 .osu 文本 */
export function parseOsu(text) {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = src.split(/\r?\n/);
  const sections = {};
  let cur = null;

  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith('//')) continue;
    if (s.startsWith('[') && s.endsWith(']')) {
      cur = s;
      if (!sections[cur]) sections[cur] = [];
      continue;
    }
    if (cur) sections[cur].push(line);
  }

  const kv = (name) => {
    const out = {};
    for (const l of sections[name] || []) {
      const i = l.indexOf(':');
      if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    }
    return out;
  };

  const timingPoints = [];
  for (const l of sections['[TimingPoints]'] || []) {
    const s = l.trim();
    if (!s) continue;
    const f = s.split(',');
    if (f.length < 2) continue;
    const time = parseFloat(f[0]);
    const beatLength = parseFloat(f[1]);
    if (!isFinite(time) || !isFinite(beatLength) || beatLength === 0) continue;
    const meter = f.length > 2 ? parseInt(f[2], 10) || 4 : 4;
    let uninherited;
    if (f.length > 6 && f[6].trim() !== '') uninherited = parseInt(f[6], 10) === 1;
    else uninherited = beatLength > 0; // 旧格式没有该字段：正 beatLength = 红线
    timingPoints.push({ time, beatLength, meter, uninherited });
  }

  const hitObjects = [];
  for (const l of sections['[HitObjects]'] || []) {
    const s = l.trim();
    if (!s) continue;
    const f = s.split(',');
    if (f.length < 5) continue;
    const x = parseFloat(f[0]);
    const y = parseFloat(f[1]); // y 坐标（manía 里通常不用）
    const time = parseFloat(f[2]);
    const type = parseInt(f[3], 10);
    if (!isFinite(x) || !isFinite(y) || !isFinite(time) || !isFinite(type)) continue;
    let endTime = null;
    let customSample = null;
    if (type & 128) {
      const et = parseFloat(String(f[5] || '').split(':')[0]);
      if (isFinite(et)) endTime = et;
    }
    // 提取自定义 sample 文件名（格式：...:volume:filename.wav，可能带尾随冒号）
    if (f.length > 5) {
      const rest = f.slice(5).join(',');
      const m = /([^:,]+\.(?:wav|ogg|mp3))/gi.exec(rest);
      if (m) customSample = m[0];
    }
    hitObjects.push({ x, y, time, type, endTime, customSample });
  }

  // 背景图：Events 里形如 0,0,"file.jpg",0,0
  let background = '';
  for (const l of sections['[Events]'] || []) {
    const mm = /^\s*0\s*,\s*0\s*,\s*"([^"]+)"/.exec(l);
    if (mm) {
      background = mm[1];
      break;
    }
  }

  return {
    general: kv('[General]'),
    metadata: kv('[Metadata]'),
    difficulty: kv('[Difficulty]'),
    background,
    timingPoints,
    hitObjects,
  };
}

/** 把 osu 的毫秒时间轴换算成「拍」 */
export class OsuTempoMap {
  constructor(timingPoints) {
    const byTime = new Map();
    for (const tp of timingPoints || []) {
      if (!tp.uninherited || !(tp.beatLength > 0)) continue; // 只取红线
      if (!isFinite(tp.beatLength) || tp.beatLength < 0.5 || tp.beatLength > 120000) continue;
      // 过滤异常红线：mania SV 谱会把绿线控制点误写进 TimingPoints，产生
      // beatLength 极小（<0.5ms）或极大（>120000ms，甚至 1e15）的伪红线
      byTime.set(tp.time, tp); // 同一时间取最后一条
    }
    const reds = [...byTime.values()].sort((a, b) => a.time - b.time);
    if (!reds.length) reds.push({ time: 0, beatLength: 500, meter: 4 }); // 兜底 120BPM
    this.reds = reds;
    this.beatAt = [0];
    for (let i = 1; i < reds.length; i++) {
      this.beatAt.push(
        this.beatAt[i - 1] + (reds[i].time - reds[i - 1].time) / reds[i - 1].beatLength
      );
    }
  }

  /** 毫秒 → 拍（第一个红线所在时刻定义为第 0 拍） */
  toBeat(ms) {
    const r = this.reds;
    if (ms <= r[0].time) return (ms - r[0].time) / r[0].beatLength;
    for (let i = 1; i < r.length; i++) {
      if (ms <= r[i].time) {
        return this.beatAt[i - 1] + (ms - r[i - 1].time) / r[i - 1].beatLength;
      }
    }
    const last = r.length - 1;
    return this.beatAt[last] + (ms - r[last].time) / r[last].beatLength;
  }
}

/** 拍 → Malody 的 [a,b,c]（分母 denom，再按 2、3 约分） */
export function toBeatArray(beat, denom = OSU_BEAT_DENOM) {
  let a = Math.floor(beat);
  let n = Math.round((beat - a) * denom);
  if (n >= denom) {
    a += 1;
    n -= denom;
  }
  if (n < 0) {
    a -= 1;
    n += denom;
  }
  let d = denom;
  for (const f of [2, 3]) {
    while (d > 1 && n % f === 0 && d % f === 0) {
      n /= f;
      d /= f;
    }
  }
  return [a, n, d];
}

function round6(v) {
  return Math.round(v * 1e6) / 1e6;
}

/**
 * 单个 .osu → .mc 对象
 * @param {object} osu  parseOsu 的结果
 * @param {object} ctx  { audioName, backgroundName, denom, nowSeconds, keyOverride }
 */
export function osuToMc(osu, ctx = {}) {
  const g = osu.general;
  const m = osu.metadata;
  const d = osu.difficulty;

  const mode = parseInt(g['Mode'] || '0', 10);
  if (mode !== 3) {
    throw new Error(
      '只支持 osu!mania 谱面（需要 Mode: 3），当前是 Mode: ' + mode +
      (mode === 0 ? '（osu!standard）' : '')
    );
  }

  const key = Math.max(
    1,
    Math.min(18, Math.round(Number(ctx.keyOverride) || parseFloat(d['CircleSize']) || 4))
  );
  const denom = Number(ctx.denom) || OSU_BEAT_DENOM;
  const tempo = new OsuTempoMap(osu.timingPoints);

  // ---- 绿线 (SV) 收集：继承型（uninherited 为 false）且 beatLength < 0 的点控制卷速 ----
  // osu!mania 绿线的 beatLength 为负，卷速倍率 = -100 / beatLength（-100 → 1.0，-400 → 0.25）
  // 与 Malody effect[].scroll 的语义一致（1.0 为正常速度，负值/超大幅度属非标准效果）。
  const greens = [];
  for (const tp of osu.timingPoints || []) {
    if (tp.uninherited === false && tp.beatLength < 0 && isFinite(tp.beatLength)) {
      const scroll = -100.0 / tp.beatLength;
      if (isFinite(scroll) && scroll > 0) {
        greens.push({ time: tp.time, scroll });
      }
    }
  }
  greens.sort((a, b) => a.time - b.time);

  // ---- 收集音符的原始拍值（先不量化）----
  const raw = [];
  for (const o of osu.hitObjects) {
    let col = Math.floor((o.x * key) / 512);
    if (!isFinite(col)) col = 0;
    col = Math.min(key - 1, Math.max(0, col));
    const b = tempo.toBeat(o.time);
    const eb = o.endTime != null && o.endTime > o.time ? tempo.toBeat(o.endTime) : null;
    raw.push({ ms: o.time, col, b, eb, customSample: o.customSample || null });
  }
  raw.sort((a, b) => a.ms - b.ms || a.col - b.col);

  // ---- 若存在早于首个 BPM 点的音符或绿线，整体平移「整数个小节」----
  // osu! 对首个红线之前的区间沿用同一 BPM，而 Malody 的小节索引不应为负
  // （[-1,0,0] 是 Malody 的 EmptyBeat 哨兵）。平移整小节可保持小节线对齐。
  // 注意：先量化再判断——极小的负拍会被 1/288 量化直接吸附到 0，无需平移。
  const firstMeter = tempo.reds[0].meter > 0 ? tempo.reds[0].meter : 4;
  const isNeg = (b) => toBeatArray(b, denom)[0] < 0;
  let needShift = false;
  for (const r of raw) {
    if (isNeg(r.b) || (r.eb != null && isNeg(r.eb))) { needShift = true; break; }
  }
  // 绿线（SV）也要计入：绿线在首个红线之前时会落到负小节
  if (!needShift) {
    for (const g of greens) {
      if (isNeg(tempo.toBeat(g.time))) { needShift = true; break; }
    }
  }
  let minBeat = 0;
  if (needShift) {
    for (const r of raw) {
      if (r.b < minBeat) minBeat = r.b;
      if (r.eb != null && r.eb < minBeat) minBeat = r.eb;
    }
    for (const g of greens) {
      const gb = tempo.toBeat(g.time);
      if (gb < minBeat) minBeat = gb;
    }
  }
  const shift = needShift ? Math.ceil(-minBeat / firstMeter) * firstMeter : 0;

  // ---- time: BPM 变速点 ----
  const timeArr = [];
  if (shift > 0) {
    timeArr.push({ beat: toBeatArray(0, denom), bpm: round6(60000 / tempo.reds[0].beatLength) });
  }
  for (const r of tempo.reds) {
    timeArr.push({
      beat: toBeatArray(tempo.toBeat(r.time) + shift, denom),
      bpm: round6(60000 / r.beatLength),
    });
  }

  // ---- note: 音符与长按（含自定义 sample → Malody note.sound）----
  const notes = raw.map((r) => {
    const beat = toBeatArray(r.b + shift, denom);
    if (r.eb != null) return { beat, endbeat: toBeatArray(r.eb + shift, denom), column: r.col };
    return { beat, column: r.col };
  });
  // 把 osu 自定义 sample 映射到 Malody note.sound（仅对非 BGM 音符）
  for (let i = 0; i < notes.length && i < raw.length; i++) {
    if (raw[i].customSample) notes[i].sound = raw[i].customSample;
  }
  const holdCount = notes.filter((n) => n.endbeat).length;

  let minSection = 0;
  for (const n of notes) {
    const secs = [n.beat[0]];
    if (n.endbeat) secs.push(n.endbeat[0]);
    for (const s of secs) if (s < minSection) minSection = s;
  }

  // ---- BGM 事件放在 note[] 末尾（真实 .mcz 的做法）----
  // offset 要让「音频位置 = 谱面时间 − offset」成立：
  //   谱面时间 = (osu 时间 − T0) + 平移量   →   offset = 平移量 − T0
  // 其中 T0 是首个红线的 osu 时间（即上面时间轴的第 0 拍）。
  // 平移 shift 拍对应的毫秒数：beatLength 就是「每拍毫秒数」(= 60000/BPM)
  const shiftMs = shift * tempo.reds[0].beatLength;
  const bgmOffset = ctx.noSync ? 0 : Math.round(shiftMs - tempo.reds[0].time);
  notes.push({
    beat: [0, 0, 1],
    sound: ctx.audioName || g['AudioFilename'] || '',
    vol: 100,
    offset: bgmOffset,
    type: 1, // SoundCueType.Song
  });

  const title = m['Title'] || m['TitleUnicode'] || 'Unknown Title';
  const artist = m['Artist'] || m['ArtistUnicode'] || 'Unknown Artist';
  const titleOrg = m['TitleUnicode'] || title;
  const artistOrg = m['ArtistUnicode'] || artist;

  // 真实 .mcz 里存在两种格式方言（很可能对应不同 Malody 版本/分支）：
  //   方言 A（多数文件）：顶层 meta/time/effect/note/extra，meta 有 $ver 与 time，
  //                       mode_ext={column,bar_begin}，time[]={beat,bpm}，BGM 带 vol
  //   方言 B（愛属性）：  顶层只有 meta/time/note，meta 无 $ver/time 但有 aimode，
  //                       song 带 file/bpm，mode_ext 多 speed，time[] 多 delay，BGM 不带 vol
  // 默认输出方言 A（已被实际导入验证），并额外补上方言 B 的 song.file/song.bpm
  // —— 这两个键在 song 里，方言 A 的读取器会忽略，但方言 B 的读取器可能靠它定位音频。
  const style = ctx.mcStyle === 'minimal' ? 'minimal' : 'full';
  if (style === 'minimal') {
    // 方言 B 的 time[] 每条都带 delay
    for (const t of timeArr) t.delay = 0;
  }
  const audioRef = baseName(ctx.audioName || g['AudioFilename'] || '');
  const baseBpm = timeArr.length ? timeArr[0].bpm : 120;

  const song = { title, artist, id: 0 };
  if (titleOrg && titleOrg !== title) song.titleorg = titleOrg;
  if (artistOrg && artistOrg !== artist) song.artistorg = artistOrg;
  if (style === 'minimal') {
    // song.file / song.bpm 只有方言 B 用。实测 Malody 4.3.7（61 个 .mc 中 0 个）
    // 与 MalodyV（已成功导入本工具的方言 A 产物）都不需要，故默认不写。
    song.file = audioRef;
    song.bpm = baseBpm;
  }

  const meta = {};
  if (style === 'full') meta.$ver = 0;
  meta.creator = m['Creator'] || 'Unknown';
  meta.background = ctx.backgroundName || osu.background || '';
  meta.version = m['Version'] || key + 'K';
  const preview = parseInt(g['PreviewTime'], 10);
  if (isFinite(preview) && preview > 0) meta.preview = preview;
  meta.id = 0;
  meta.mode = 0; // ChartMode.Key
  if (style === 'full') meta.time = ctx.nowSeconds || Math.floor(Date.now() / 1000);
  meta.song = song;
  meta.mode_ext = style === 'full'
    ? { column: key, bar_begin: 0 }
    : { column: key, bar_begin: 0, speed: 0 };
  if (style === 'minimal') meta.aimode = '';

  // BGM 事件在 minimal 风格下去掉 vol（方言 B 的形态）
  if (style === 'minimal') delete notes[notes.length - 1].vol;

  const mc = { meta, time: timeArr, note: notes };
  if (style === 'full') {
    // 绿线 (SV) 映射为 Malody effect[]：{ beat, scroll }
    const effect = greens.map((g) => ({
      beat: toBeatArray(tempo.toBeat(g.time) + shift, denom),
      scroll: round6(g.scroll),
    }));
    mc.effect = effect;
    mc.extra = { test: { divide: 4, speed: 100, save: 0, lock: 0, edit_mode: 0 } };
  }
  const ordered = style === 'full'
    ? { meta: mc.meta, time: mc.time, effect: mc.effect, note: mc.note, extra: mc.extra }
    : { meta: mc.meta, time: mc.time, note: mc.note };

  return {
    mc: ordered,
    stats: {
      key,
      notes: notes.length - 1,
      holds: holdCount,
      timingPoints: timeArr.length,
      greenLines: greens.length,
      soundNotes: raw.filter((r) => r.customSample).length,
      beatShift: shift,
      minSection,
      title,
      artist,
      creator: meta.creator,
      version: meta.version,
      firstMs: raw.length ? raw[0].ms : 0,
      lastMs: raw.length ? raw[raw.length - 1].ms : 0,
    },
  };
}

/** 取路径的文件名部分（保留原始大小写） */
const baseName = (s) => String(s || '').replace(/\\/g, '/').split('/').pop();
/** 仅用于大小写不敏感的比对 */
const norm = (s) => baseName(s).toLowerCase();

function findEntry(names, wanted) {
  if (!wanted) return null;
  const w = norm(wanted);
  for (const n of names) if (norm(n) === w) return n;
  return null;
}

/**
 * .osz（或任何含 .osu 的 zip）→ .mcz
 * 按键数分组：同键数的难度打进同一个 .mcz（混键数会拆成多个包）
 */
export async function convertOszToMcz(input, opts = {}) {
  const files = await readZip(input);
  const names = [...files.keys()].filter((n) => !files.get(n).dir && !n.endsWith('/'));
  const osuNames = names.filter((n) => /\.osu$/i.test(n));
  if (!osuNames.length) throw new Error('压缩包里没有找到 .osu 谱面文件');

  const dec = new TextDecoder('utf-8');
  const parsed = [];
  const warnings = [];
  const groupWarningsAll = []; // 每组警告的集合，最后附加到全局 warnings
  let nonMania = 0;

  // 包里混进了 Malody 谱面（例如有人把 .mc / .mcz 塞进 .osz）：
  // 它们不是 osu! 谱面，会被静默忽略，这里显式提示，免得用户以为已经转换成功。
  const foreignMc = names.filter((n) => /\.(mc|mcz)$/i.test(n));
  if (foreignMc.length) {
    warnings.push(
      `包里有 ${briefList(foreignMc)}：不是 osu! 谱面（.osz 只转换 .osu），已跳过。` +
        `如需转换 Malody 谱面，请把 .mcz / .mc 单独作为输入。`
    );
  }
  for (const n of osuNames) {
    try {
      const osu = parseOsu(dec.decode(files.get(n).data));
      // Malody 的「键模式」只对应 osu!mania；其他模式跳过而不是让整批失败
      if (parseInt(osu.general['Mode'] || '0', 10) !== 3) {
        nonMania++;
        continue;
      }
      parsed.push({ name: n, osu });
    } catch (e) {
      warnings.push(`${n}: 解析失败（${e.message}）`);
    }
  }
  if (nonMania) {
    warnings.push(`跳过 ${nonMania} 个非 osu!mania 谱面（Malody 键模式对应 osu!mania，即 Mode: 3）`);
  }
  if (!parsed.length) throw new Error('压缩包里没有可转换的 osu!mania 谱面（需要 Mode: 3）');

  // 按键数分组（与 osuToMc 的 [1,18] clamp 保持一致，否则组标签与实际列数会对不上）
  const groups = new Map();
  const clampKey = (raw) => Math.max(1, Math.min(18, Math.round(raw)));
  for (const p of parsed) {
    let key = 4;
    try {
      key = clampKey(Number(p.osu.difficulty['CircleSize']) || 4);
      if (Math.round(Number(p.osu.difficulty['CircleSize']) || 4) > 18) {
        warnings.push(`${p.name}: 键数 ${p.osu.difficulty['CircleSize']} 超出 Malody 上限，已按 18K 转换`);
      }
    } catch (e) {
      /* 保持默认 */
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const enc = new TextEncoder();
  const now = Math.floor(Date.now() / 1000);
  const packages = [];

  for (const [key, list] of groups) {
    const entries = [];
    const charts = [];
    const nowSec = opts.nowSeconds || now;
    let ts = nowSec;
    const groupWarnings = []; // 本组的警告，只出现在本 package 的 report 里

    for (const p of list) {
      // 该谱面的音频 / 背景，必须真实存在于包里
      const audioWanted = p.osu.general['AudioFilename'] || '';
      const audioEntry = findEntry(names, audioWanted);
      const bgWanted = p.osu.background || '';
      const bgEntry = findEntry(names, bgWanted);

      if (!audioEntry) groupWarnings.push(`${p.name}: 找不到音频 ${audioWanted || '(未指定)'}`);

      const { mc, stats } = osuToMc(p.osu, {
        audioName: audioEntry ? baseName(audioEntry) : baseName(audioWanted),
        backgroundName: bgEntry ? baseName(bgEntry) : bgWanted,
        denom: opts.denom,
        nowSeconds: nowSec,
        noSync: opts.noSync,
        mcStyle: opts.mcStyle,
      });

      if (stats.beatShift > 0) {
        groupWarnings.push(
          `${p.name}: 有音符早于首个 BPM 点，已整体后移 ${stats.beatShift} 拍（整数小节，保持小节线对齐）`
        );
      }
      if (stats.minSection < 0) {
        groupWarnings.push(`${p.name}: 仍存在负小节 ${stats.minSection}，Malody 里可能需要手动调整`);
      }

      ts += 1;
      const mcName = `${ts}.mc`;
      entries.push({ name: mcName, data: enc.encode(JSON.stringify(mc)) });
      charts.push({ file: mcName, from: p.name, audio: audioEntry || audioWanted, background: bgEntry || bgWanted, ...stats });

      if (audioEntry && !entries.some((e) => e.name === baseName(audioEntry))) {
        entries.push({ name: baseName(audioEntry), data: files.get(audioEntry).data });
      }
      if (bgEntry && !entries.some((e) => e.name === baseName(bgEntry))) {
        entries.push({ name: baseName(bgEntry), data: files.get(bgEntry).data });
      }
    }

    const data = await writeZip(entries, { compress: opts.compress });
    packages.push({
      data,
      entries,
      report: {
        key,
        charts,
        warnings: groupWarningsAll, // 本组的警告，只出现在本 package 的 report 里
        mczName: list[0].name.replace(/\.osu$/i, '').replace(/.*[\\/]/, '') || 'converted',
      },
    });
    groupWarningsAll.push(...groupWarnings);
  }

  return { packages, warnings };
}
