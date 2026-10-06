/**
 * core.mjs 鈥?Malody (.mcz / .mc) 鈫?osu!mania (.osz / .osu) 杞崲鏍稿績
 *
 * 闆朵緷璧栵細鍙敤鏍囧噯 Web API锛圖ecompressionStream / CompressionStream / TextEncoder / DataView锛夛紝
 * 鍥犳鍦ㄧ幇浠ｆ祻瑙堝櫒鍜?Node.js 18+ 涓兘鑳界洿鎺ヨ繍琛屻€? *
 * 鏍煎紡渚濇嵁锛堝鐪熷疄璋遍潰閫嗗悜 + 涓?rmstZ 鍙傝€冨疄鐜颁氦鍙夐獙璇侊級锛? *   - beat 涓夊厓缁?[a,b,c] 琛ㄧず a + b/c 鎷?  锛坮mstZ: b.fAdd(c.fDiv(d))锛? *   - 閿暟鍙?meta.mode_ext.column
 *   - note[] 涓?type==1 涓旀棤 column 鐨勬潯鐩槸 BGM 闊抽浜嬩欢锛屽叾 offset 鈫?osu AudioLeadIn
 *   - 闀挎寜鐢?endbeat 琛ㄧず锛岃緭鍑?osu mania 鐨?type 128
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
 * deflate / inflate锛堣蛋娴忚鍣ㄤ笌 Node 閮芥湁鐨勫師鐢熷帇缂╂祦锛? * ------------------------------------------------------------------ */
export async function inflateRaw(u8) {
  if (typeof DecompressionStream !== 'function') {
    throw new Error('褰撳墠鐜涓嶆敮鎸?DecompressionStream锛岃浣跨敤杈冩柊鐨?Chrome / Edge / Firefox');
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
 * 鏋佺畝 ZIP 璇诲啓
 * ------------------------------------------------------------------ */
const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/**
 * 瑙ｅ帇瀹夊叏涓婇檺銆傜湡瀹炶氨闈㈠寘锛堣氨闈?JSON + 闊抽 + 鑳屾櫙锛岄€氬父鍑?MB锛夌杩欎簺鏁伴噺绾у樊寰楀緢杩滐紝
 * 璁鹃檺鍙负闃蹭綇鎭舵剰鏋勯€犵殑銆岃В鍘嬬偢寮广€嶁€斺€斿嚑鍗?KB 鐨勬潯鐩В鍘嬪悗鑶ㄨ儉鍒板嚑涓?GB锛屾妸鍐呭瓨鍚冨厜銆? * 杩欐槸鍙鐩栫殑閰嶇疆瀵硅薄锛岀▼搴忓寲璋冪敤鏂硅嫢纭湁澶у寘闇€姹傚彲鑷璋冮珮銆? * 锛堟潯鐩暟涓嶅繀璁鹃檺锛欵OCD 閲岀殑 count 鏄?uint16锛屾渶澶?65535锛屾湰韬拺涓嶅嚭鍐呭瓨闂銆傦級
 */
export const READ_LIMITS = {
  maxEntryBytes: 512 * 1024 * 1024, // 鍗曟潯鐩В鍘嬪悗 鈮?512 MB
  maxTotalBytes: 4 * 1024 * 1024 * 1024, // 鏁村寘瑙ｅ帇鍚庡悎璁?鈮?4 GB
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

/** 璇诲彇 ZIP锛岃繑鍥?Map<鏂囦欢鍚? {name, data:Uint8Array, dir:boolean}> */
export async function readZip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const eocd = findEOCD(u8, dv);
  if (eocd < 0) throw new Error('涓嶆槸鏈夋晥鐨?ZIP/MCZ 鏂囦欢锛堟壘涓嶅埌涓ぎ鐩綍缁撳熬鏍囪锛?);

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

    // 鍏堢敤涓ぎ鐩綍閲屽０鏄庣殑澶у皬鍋氫竴娆″粔浠锋鏌ワ紝涓嶅繀绛夌湡瑙ｅ帇鍑烘潵鎵嶅彂鐜版槸鐐稿脊
    if (uncompSize > READ_LIMITS.maxEntryBytes || total + uncompSize > READ_LIMITS.maxTotalBytes) {
      throw new Error(
        `ZIP 鏉＄洰瑙ｅ帇鍚庤繃澶э紙${name}锛屽０鏄?${fmtBytes(uncompSize)}锛夛紝宸叉嫆缁濆鐞嗕互闃茶В鍘嬬偢寮筦
      );
    }

    if (dv.getUint32(localOff, true) !== SIG_LOCAL) {
      throw new Error('ZIP 缁撴瀯鎹熷潖锛氭湰鍦版枃浠跺ご绛惧悕涓嶆纭?(' + name + ')');
    }
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    if (dataStart + compSize > u8.length) {
      throw new Error('ZIP 缁撴瀯鎹熷潖锛氭潯鐩暟鎹秴鍑烘枃浠惰寖鍥?(' + name + ')');
    }
    const raw = u8.subarray(dataStart, dataStart + compSize);

    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error('涓嶆敮鎸佺殑 ZIP 鍘嬬缉鏂瑰紡 ' + method + '锛? + name + '锛?);

    // 澹版槑鐨勫ぇ灏忓彲鑳芥槸鍋囩殑锛岃В鍘嬪悗鍐嶆寜鐪熷疄闀垮害鏍镐竴娆?    if (data.length > READ_LIMITS.maxEntryBytes || total + data.length > READ_LIMITS.maxTotalBytes) {
      throw new Error(
        `ZIP 鏉＄洰瑙ｅ帇鍚庤繃澶э紙${name}锛屽疄闄?${fmtBytes(data.length)}锛夛紝宸叉嫆缁濆鐞嗕互闃茶В鍘嬬偢寮筦
      );
    }
    total += data.length;

    files.set(name, { name, method, data, dir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (files.size === 0) throw new Error('ZIP 涓病鏈夊彲鐢ㄦ潯鐩?);
  return files;
}

/** 鍐欏嚭 ZIP銆俢ompress=false 鏃跺叏閮ㄤ娇鐢?stored锛堟棤鍘嬬缉锛夛紝鍏煎鎬ф渶濂?*/
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
    ldv.setUint16(6, 0x0800, true); // UTF-8 鏂囦欢鍚?    ldv.setUint16(8, method, true);
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
 * 鏃堕棿杞? * ------------------------------------------------------------------ */
/** [a,b,c] 鈫?a + b/c 鎷?*/
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
    for (const t of timeList || []) {
      const b = parseBeat(t && t.beat);
      const bpm = Number(t && t.bpm);
      if (b === null || !isFinite(bpm) || bpm <= 0) continue; // 闈炴 BPM 鏄彉閫?SV)锛屼笉鏄湡瀹?BPM
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

  /** 璇ユ媿鐐圭敓鏁堢殑 BPM锛堢敤浜庣敓鎴?osu 鐨?timing point锛?*/
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
 * .mc 鈫?.osu
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
 * 鎶婂崟涓?.mc 杞垚 osu!mania 璋遍潰鏂囨湰
 * @param {object} mc       瑙ｆ瀽鍚庣殑 .mc JSON
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

  // note[] 閲?type==1 涓旀病鏈?column 鐨勬潯鐩槸闊抽/BGM 浜嬩欢
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

  // Malody 鐨?BGM offset 璇箟鏄€屽欢杩熷涔呭紑濮嬫挱鏀鹃煶棰戙€嶏紝鍗?  //     闊抽浣嶇疆 = 璋遍潰鏃堕棿 鈭?offset
  // osu! 鐨勭墿浠舵椂闂村氨鏄煶棰戜綅缃紝鍥犳杩欓噷鏁翠綋鍓嶇Щ offset銆?  // 锛圓udioLeadIn 鍚屾椂淇濈暀璇ュ€硷紝淇濊瘉寰€杩旇浆鎹㈠彲杩樺師锛?  const timeShift = (ctx.noSync ? 0 : -audioLeadIn) + shift;

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
    // 鏈?column 鐨勯兘鏄煶绗︼紙鍚?BGM 瑙﹀彂浜嬩欢锛屽甫 sound锛夛紝鍚﹀垯 BGM 浜嬩欢宸插崟鐙鐞?    if (!hasColumn && type === 1) continue;

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
    if (n.sound) hit.sound = n.sound; // 鏅€氶煶绗︾殑鑷畾涔?sample 鈫?osu HitObject extras
    if (endBeat !== null && endBeat > beat) {
      const tEnd = Math.round(tempo.toMs(endBeat) + timeShift);
      hit.type = 128;
      hit.end = tEnd;
    }
    notes.push(hit);
  }

  if (skipped > 0) {
    warnings.push(`璺宠繃 ${skipped} 涓棤娉曡В鏋愮殑闊崇锛坆eat 瀛楁缂哄け鎴栧垪鍙疯秺鐣岋級`);
  }

  notes.sort((a, b) => (a.t - b.t) || (a.x - b.x));

  // ---- 缁勮 .osu ----
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
  // 绾㈢嚎锛圔PM 鐐癸級+ 缁跨嚎锛圫V 鐐癸級鍚堝苟涓轰竴鏉℃椂闂磋酱杈撳嚭
  const tps = [];
  for (const [b, bpm, meter] of tempo.points) {
    const t = Math.round(tempo.toMs(b) + timeShift);
    const msPerBeat = 60000 / bpm;
    tps.push({ time: t, beatLength: msPerBeat, meter: meter, uninherited: true });
  }
  for (const e of mc.effect || []) {
    if (e.scroll == null || typeof e.scroll !== 'number') continue;
    const s = e.scroll;
    if (!isFinite(s) || s <= 0) continue; // 鍙鐞嗘鍗烽€燂紱璐熷€煎搴旈潪鏍囧噯鏁堟灉
    const b = parseBeat(e.beat);
    if (b === null) continue;
    const t = Math.round(tempo.toMs(b) + timeShift);
    // 鍗烽€?鈫?缁跨嚎 beatLength锛歴croll = -100 / beatLength
    const beatLength = Math.round(-100.0 / s * 1000) / 1000;
    tps.push({ time: t, beatLength, meter: 4, uninherited: false });
  }
  tps.sort((a, b) => a.time - b.time);
  for (const tp of tps) {
    // 鏍煎紡锛歵ime,beatLength,meter,sampleSet,sampleIndex,volume,uninherited,effects
    const fields = [tp.time, fmtNum(tp.beatLength), tp.meter, 2, 0, 100, tp.uninherited ? 1 : 0, 0];
    L.push(fields.join(','));
  }
  L.push('');
  L.push('[HitObjects]');
  for (const n of notes) {
    // hitSample 鏍煎紡锛歯ormalSet:additionSet:index:volume:filename
    // 鏃犺嚜瀹氫箟闊虫晥鏃朵繚鎸佷笌浼犵粺杈撳嚭瀹屽叏涓€鑷达紙0:0:0:0:锛屾枃浠跺悕浣嶄负绌猴級
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
 * .mcz 鈫?.osz
 * ------------------------------------------------------------------ */
const AUDIO_EXT = /\.(mp3|ogg|wav|m4a|aac|flac)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|bmp|gif)$/i;

/** 鎶婃枃浠跺悕鍒楄〃缂╂垚銆宎, b, c 绛?N 涓€嶏紝鐢ㄤ簬鍛婅鏂囨 */
function briefList(list, max = 3) {
  if (list.length <= max) return list.join(', ');
  return `${list.slice(0, max).join(', ')} 绛?${list.length} 涓猔;
}

export async function convertMczToOsz(input, opts = {}) {
  const files = await readZip(input);
  const names = [...files.keys()].filter((n) => !files.get(n).dir);

  const mcNames = names.filter((n) => /\.mc$/i.test(n));
  if (!mcNames.length) throw new Error('鍘嬬缉鍖呴噷娌℃湁鎵惧埌 .mc 璋遍潰鏂囦欢');

  const audioNames = names.filter((n) => AUDIO_EXT.test(n));
  const imageNames = names.filter((n) => IMAGE_EXT.test(n));
  const dec = new TextDecoder('utf-8');

  const outEntries = [];
  const report = { charts: [], audio: '', background: '', warnings: [] };

  // 鍖呴噷娣疯繘浜?osu! 渚х殑鏂囦欢锛堜緥濡傛湁浜烘妸 .osu / .osz 鐩存帴濉炶繘 .mcz锛夛細
  // 瀹冧滑涓嶆槸 Malody 璋遍潰锛屼細琚潤榛樺拷鐣ワ紝杩欓噷鏄惧紡鎻愮ず锛屽厤寰楃敤鎴蜂互涓哄凡缁忚浆鎹㈡垚鍔熴€?  const foreignOsu = names.filter((n) => /\.(osu|osz)$/i.test(n));
  if (foreignOsu.length) {
    report.warnings.push(
      `鍖呴噷鏈?${briefList(foreignOsu)}锛氫笉鏄?Malody 璋遍潰锛?mcz 鍙浆鎹?.mc锛夛紝宸茶烦杩囥€俙 +
        `濡傞渶杞崲 osu! 璋遍潰锛岃鎶?.osu / .osz 鍗曠嫭浣滀负杈撳叆銆俙
    );
  }

  // 鍏堝畾鍑洪煶棰戜笌鑳屾櫙锛堝闅惧害鍏辩敤锛?  let audioName = opts.audioName || audioNames[0] || '';
  let bgName = opts.backgroundName || '';

  const chartResults = [];
  for (const mcName of mcNames) {
    let mc;
    try {
      mc = JSON.parse(dec.decode(files.get(mcName).data));
    } catch (e) {
      report.warnings.push(`${mcName}: JSON 瑙ｆ瀽澶辫触锛?{e.message}锛塦);
      continue;
    }

    const meta = mc.meta || {};
    // BGM 浜嬩欢閲岀殑 sound 瀛楁鏄渶鏉冨▉鐨勯煶棰戝悕
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
      report.warnings.push(`${mcName}: Malody mode=${mode} 涓嶆槸閿ā寮忥紝鍒楁槧灏勫彲鑳戒笉姝ｇ‘`);
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

  if (!chartResults.length) throw new Error('鎵€鏈?.mc 閮借В鏋愬け璐ワ紝娌℃湁鐢熸垚浠讳綍璋遍潰');

  const enc = new TextEncoder();
  for (const c of chartResults) {
    outEntries.push({ name: c.osuFileName, data: enc.encode(c.text) });
    report.charts.push({ file: c.osuFileName, from: c.sourceMc, ...c.stats });
  }

  // 璧勬簮鍘熸牱鎼繍
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

  const audioBase = audioName ? audioName.split(/[\\/]/).pop() : '';
  const bgBase = bgName ? bgName.split(/[\\/]/).pop() : '';

  if (audioBase && packIn(audioBase)) report.audio = audioBase;
  else report.warnings.push('娌℃湁鎵撳寘杩涢煶棰戞枃浠讹紝osu! 閲屽皢娌℃湁澹伴煶');

  if (bgBase && packIn(bgBase)) report.background = bgBase;
  else if (imageNames.length && packIn(imageNames[0])) report.background = imageNames[0].split(/[\\/]/).pop();
  else report.warnings.push('娌℃湁鎵撳寘杩涜儗鏅浘');

  const osz = await writeZip(outEntries, { compress: opts.compress });
  return { data: osz, report, entries: outEntries };
}

/* ================================================================== *
 * 鍙嶅悜锛歰su! (.osu / .osz) 鈫?Malody (.mc / .mcz)
 *
 * 渚濇嵁锛? *   - rconv 鐨?Malody 绫诲瀷瀹氫箟锛欱eat = [灏忚妭, snap绱㈠紩, snap澶у皬] 鍗?a + b/c
 *     SoundCueType: Effect=0 / Song=1 / KeySound=2  鈫?BGM 浜嬩欢 type=1
 *     ChartMode: Key=0, Catch=3, Pad=4, Taiko=5, Ring=6, Slide=7
 *   - 4 涓湡瀹?.mcz 鐨勫疄娴嬬粨鏋勶紙鏁板€煎垎姣?288 鏄渶甯哥敤鐨?snap 澶у皬锛? * ================================================================== */

const OSU_BEAT_DENOM = 288; // 鐪熷疄 Malody 璋遍潰閲屽嚭鐜伴鐜囨渶楂樼殑 snap 澶у皬

/** 瑙ｆ瀽 .osu 鏂囨湰 */
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
    else uninherited = beatLength > 0; // 鏃ф牸寮忔病鏈夎瀛楁锛氭 beatLength = 绾㈢嚎
    timingPoints.push({ time, beatLength, meter, uninherited });
  }

  const hitObjects = [];
  for (const l of sections['[HitObjects]'] || []) {
    const s = l.trim();
    if (!s) continue;
    const f = s.split(',');
    if (f.length < 5) continue;
    const x = parseFloat(f[0]);
    const y = parseFloat(f[1]); // y 鍧愭爣锛坢an铆a 閲岄€氬父涓嶇敤锛?    const time = parseFloat(f[2]);
    const type = parseInt(f[3], 10);
    if (!isFinite(x) || !isFinite(y) || !isFinite(time) || !isFinite(type)) continue;
    let endTime = null;
    let customSample = null;
    if (type & 128) {
      const et = parseFloat(String(f[5] || '').split(':')[0]);
      if (isFinite(et)) endTime = et;
    }
    // 鎻愬彇鑷畾涔?sample 鏂囦欢鍚嶏紙鏍煎紡锛?..:volume:filename.wav锛屽彲鑳藉甫灏鹃殢鍐掑彿锛?    if (f.length > 5) {
      const rest = f.slice(5).join(',');
      const m = /([^:,]+\.(?:wav|ogg|mp3))/gi.exec(rest);
      if (m) customSample = m[0];
    }
    hitObjects.push({ x, y, time, type, endTime, customSample });
  }

  // 鑳屾櫙鍥撅細Events 閲屽舰濡?0,0,"file.jpg",0,0
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

/** 鎶?osu 鐨勬绉掓椂闂磋酱鎹㈢畻鎴愩€屾媿銆?*/
export class OsuTempoMap {
  constructor(timingPoints) {
    const byTime = new Map();
    for (const tp of timingPoints || []) {
      if (!tp.uninherited || !(tp.beatLength > 0)) continue; // 鍙彇绾㈢嚎
      if (!isFinite(tp.beatLength) || tp.beatLength < 0.5 || tp.beatLength > 120000) continue;
      // 杩囨护寮傚父绾㈢嚎锛歮ania SV 璋变細鎶婄豢绾挎帶鍒剁偣璇啓杩?TimingPoints锛屼骇鐢?      // beatLength 鏋佸皬锛?0.5ms锛夋垨鏋佸ぇ锛?120000ms锛岀敋鑷?1e15锛夌殑浼孩绾?      byTime.set(tp.time, tp); // 鍚屼竴鏃堕棿鍙栨渶鍚庝竴鏉?    }
    const reds = [...byTime.values()].sort((a, b) => a.time - b.time);
    if (!reds.length) reds.push({ time: 0, beatLength: 500, meter: 4 }); // 鍏滃簳 120BPM
    this.reds = reds;
    this.beatAt = [0];
    for (let i = 1; i < reds.length; i++) {
      this.beatAt.push(
        this.beatAt[i - 1] + (reds[i].time - reds[i - 1].time) / reds[i - 1].beatLength
      );
    }
  }

  /** 姣 鈫?鎷嶏紙绗竴涓孩绾挎墍鍦ㄦ椂鍒诲畾涔変负绗?0 鎷嶏級 */
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

/** 鎷?鈫?Malody 鐨?[a,b,c]锛堝垎姣?denom锛屽啀鎸?2銆? 绾﹀垎锛?*/
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
 * 鍗曚釜 .osu 鈫?.mc 瀵硅薄
 * @param {object} osu  parseOsu 鐨勭粨鏋? * @param {object} ctx  { audioName, backgroundName, denom, nowSeconds, keyOverride }
 */
export function osuToMc(osu, ctx = {}) {
  const g = osu.general;
  const m = osu.metadata;
  const d = osu.difficulty;

  const mode = parseInt(g['Mode'] || '0', 10);
  if (mode !== 3) {
    throw new Error(
      '鍙敮鎸?osu!mania 璋遍潰锛堥渶瑕?Mode: 3锛夛紝褰撳墠鏄?Mode: ' + mode +
      (mode === 0 ? '锛坥su!standard锛? : '')
    );
  }

  const key = Math.max(
    1,
    Math.min(18, Math.round(Number(ctx.keyOverride) || parseFloat(d['CircleSize']) || 4))
  );
  const denom = Number(ctx.denom) || OSU_BEAT_DENOM;
  const tempo = new OsuTempoMap(osu.timingPoints);

  // ---- 缁跨嚎 (SV) 鏀堕泦锛氱户鎵垮瀷锛坲ninherited 涓?false锛変笖 beatLength < 0 鐨勭偣鎺у埗鍗烽€?----
  // osu!mania 缁跨嚎鐨?beatLength 涓鸿礋锛屽嵎閫熷€嶇巼 = -100 / beatLength锛?100 鈫?1.0锛?400 鈫?0.25锛?  // 涓?Malody effect[].scroll 鐨勮涔変竴鑷达紙1.0 涓烘甯搁€熷害锛岃礋鍊?瓒呭ぇ骞呭害灞為潪鏍囧噯鏁堟灉锛夈€?  const greens = [];
  for (const tp of osu.timingPoints || []) {
    if (tp.uninherited === false && tp.beatLength < 0 && isFinite(tp.beatLength)) {
      const scroll = -100.0 / tp.beatLength;
      if (isFinite(scroll) && scroll > 0) {
        greens.push({ time: tp.time, scroll });
      }
    }
  }
  greens.sort((a, b) => a.time - b.time);

  // ---- 鏀堕泦闊崇鐨勫師濮嬫媿鍊硷紙鍏堜笉閲忓寲锛?---
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

  // ---- 鑻ュ瓨鍦ㄦ棭浜庨涓?BPM 鐐圭殑闊崇锛屾暣浣撳钩绉汇€屾暣鏁颁釜灏忚妭銆?----
  // osu! 瀵归涓孩绾夸箣鍓嶇殑鍖洪棿娌跨敤鍚屼竴 BPM锛岃€?Malody 鐨勫皬鑺傜储寮曚笉搴斾负璐?  // 锛圼-1,0,0] 鏄?Malody 鐨?EmptyBeat 鍝ㄥ叺锛夈€傚钩绉绘暣灏忚妭鍙繚鎸佸皬鑺傜嚎瀵归綈銆?  // 娉ㄦ剰锛氬厛閲忓寲鍐嶅垽鏂€斺€旀瀬灏忕殑璐熸媿浼氳 1/288 閲忓寲鐩存帴鍚搁檮鍒?0锛屾棤闇€骞崇Щ銆?  const firstMeter = tempo.reds[0].meter > 0 ? tempo.reds[0].meter : 4;
  const isNeg = (b) => toBeatArray(b, denom)[0] < 0;
  let needShift = false;
  for (const r of raw) {
    if (isNeg(r.b) || (r.eb != null && isNeg(r.eb))) {
      needShift = true;
      break;
    }
  }
  let minBeat = 0;
  if (needShift) {
    for (const r of raw) {
      if (r.b < minBeat) minBeat = r.b;
      if (r.eb != null && r.eb < minBeat) minBeat = r.eb;
    }
  }
  const shift = needShift ? Math.ceil(-minBeat / firstMeter) * firstMeter : 0;

  // ---- time: BPM 鍙橀€熺偣 ----
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

  // ---- note: 闊崇涓庨暱鎸夛紙鍚嚜瀹氫箟 sample 鈫?Malody note.sound锛?---
  const notes = raw.map((r) => {
    const beat = toBeatArray(r.b + shift, denom);
    if (r.eb != null) return { beat, endbeat: toBeatArray(r.eb + shift, denom), column: r.col };
    return { beat, column: r.col };
  });
  // 鎶?osu 鑷畾涔?sample 鏄犲皠鍒?Malody note.sound锛堜粎瀵归潪 BGM 闊崇锛?  for (let i = 0; i < notes.length && i < raw.length; i++) {
    if (raw[i].customSample) notes[i].sound = raw[i].customSample;
  }
  const holdCount = notes.filter((n) => n.endbeat).length;

  let minSection = 0;
  for (const n of notes) {
    const secs = [n.beat[0]];
    if (n.endbeat) secs.push(n.endbeat[0]);
    for (const s of secs) if (s < minSection) minSection = s;
  }

  // ---- BGM 浜嬩欢鏀惧湪 note[] 鏈熬锛堢湡瀹?.mcz 鐨勫仛娉曪級----
  // offset 瑕佽銆岄煶棰戜綅缃?= 璋遍潰鏃堕棿 鈭?offset銆嶆垚绔嬶細
  //   璋遍潰鏃堕棿 = (osu 鏃堕棿 鈭?T0) + 骞崇Щ閲?  鈫?  offset = 骞崇Щ閲?鈭?T0
  // 鍏朵腑 T0 鏄涓孩绾跨殑 osu 鏃堕棿锛堝嵆涓婇潰鏃堕棿杞寸殑绗?0 鎷嶏級銆?  // 骞崇Щ shift 鎷嶅搴旂殑姣鏁帮細beatLength 灏辨槸銆屾瘡鎷嶆绉掓暟銆?= 60000/BPM)
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

  // 鐪熷疄 .mcz 閲屽瓨鍦ㄤ袱绉嶆牸寮忔柟瑷€锛堝緢鍙兘瀵瑰簲涓嶅悓 Malody 鐗堟湰/鍒嗘敮锛夛細
  //   鏂硅█ A锛堝鏁版枃浠讹級锛氶《灞?meta/time/effect/note/extra锛宮eta 鏈?$ver 涓?time锛?  //                       mode_ext={column,bar_begin}锛宼ime[]={beat,bpm}锛孊GM 甯?vol
  //   鏂硅█ B锛堟剾灞炴€э級锛? 椤跺眰鍙湁 meta/time/note锛宮eta 鏃?$ver/time 浣嗘湁 aimode锛?  //                       song 甯?file/bpm锛宮ode_ext 澶?speed锛宼ime[] 澶?delay锛孊GM 涓嶅甫 vol
  // 榛樿杈撳嚭鏂硅█ A锛堝凡琚疄闄呭鍏ラ獙璇侊級锛屽苟棰濆琛ヤ笂鏂硅█ B 鐨?song.file/song.bpm
  // 鈥斺€?杩欎袱涓敭鍦?song 閲岋紝鏂硅█ A 鐨勮鍙栧櫒浼氬拷鐣ワ紝浣嗘柟瑷€ B 鐨勮鍙栧櫒鍙兘闈犲畠瀹氫綅闊抽銆?  const style = ctx.mcStyle === 'minimal' ? 'minimal' : 'full';
  if (style === 'minimal') {
    // 鏂硅█ B 鐨?time[] 姣忔潯閮藉甫 delay
    for (const t of timeArr) t.delay = 0;
  }
  const audioRef = baseName(ctx.audioName || g['AudioFilename'] || '');
  const baseBpm = timeArr.length ? timeArr[0].bpm : 120;

  const song = { title, artist, id: 0 };
  if (titleOrg && titleOrg !== title) song.titleorg = titleOrg;
  if (artistOrg && artistOrg !== artist) song.artistorg = artistOrg;
  if (style === 'minimal') {
    // song.file / song.bpm 鍙湁鏂硅█ B 鐢ㄣ€傚疄娴?Malody 4.3.7锛?1 涓?.mc 涓?0 涓級
    // 涓?MalodyV锛堝凡鎴愬姛瀵煎叆鏈伐鍏风殑鏂硅█ A 浜х墿锛夐兘涓嶉渶瑕侊紝鏁呴粯璁や笉鍐欍€?    song.file = audioRef;
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

  // BGM 浜嬩欢鍦?minimal 椋庢牸涓嬪幓鎺?vol锛堟柟瑷€ B 鐨勫舰鎬侊級
  if (style === 'minimal') delete notes[notes.length - 1].vol;

  const mc = { meta, time: timeArr, note: notes };
  if (style === 'full') {
    // 缁跨嚎 (SV) 鏄犲皠涓?Malody effect[]锛歿 beat, scroll }
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

/** 鍙栬矾寰勭殑鏂囦欢鍚嶉儴鍒嗭紙淇濈暀鍘熷澶у皬鍐欙級 */
const baseName = (s) => String(s || '').replace(/\\/g, '/').split('/').pop();
/** 浠呯敤浜庡ぇ灏忓啓涓嶆晱鎰熺殑姣斿 */
const norm = (s) => baseName(s).toLowerCase();

function findEntry(names, wanted) {
  if (!wanted) return null;
  const w = norm(wanted);
  for (const n of names) if (norm(n) === w) return n;
  return null;
}

/**
 * .osz锛堟垨浠讳綍鍚?.osu 鐨?zip锛夆啋 .mcz
 * 鎸夐敭鏁板垎缁勶細鍚岄敭鏁扮殑闅惧害鎵撹繘鍚屼竴涓?.mcz锛堟贩閿暟浼氭媶鎴愬涓寘锛? */
export async function convertOszToMcz(input, opts = {}) {
  const files = await readZip(input);
  const names = [...files.keys()].filter((n) => !files.get(n).dir && !n.endsWith('/'));
  const osuNames = names.filter((n) => /\.osu$/i.test(n));
  if (!osuNames.length) throw new Error('鍘嬬缉鍖呴噷娌℃湁鎵惧埌 .osu 璋遍潰鏂囦欢');

  const dec = new TextDecoder('utf-8');
  const parsed = [];
  const warnings = [];
  let nonMania = 0;

  // 鍖呴噷娣疯繘浜?Malody 璋遍潰锛堜緥濡傛湁浜烘妸 .mc / .mcz 濉炶繘 .osz锛夛細
  // 瀹冧滑涓嶆槸 osu! 璋遍潰锛屼細琚潤榛樺拷鐣ワ紝杩欓噷鏄惧紡鎻愮ず锛屽厤寰楃敤鎴蜂互涓哄凡缁忚浆鎹㈡垚鍔熴€?  const foreignMc = names.filter((n) => /\.(mc|mcz)$/i.test(n));
  if (foreignMc.length) {
    warnings.push(
      `鍖呴噷鏈?${briefList(foreignMc)}锛氫笉鏄?osu! 璋遍潰锛?osz 鍙浆鎹?.osu锛夛紝宸茶烦杩囥€俙 +
        `濡傞渶杞崲 Malody 璋遍潰锛岃鎶?.mcz / .mc 鍗曠嫭浣滀负杈撳叆銆俙
    );
  }
  for (const n of osuNames) {
    try {
      const osu = parseOsu(dec.decode(files.get(n).data));
      // Malody 鐨勩€岄敭妯″紡銆嶅彧瀵瑰簲 osu!mania锛涘叾浠栨ā寮忚烦杩囪€屼笉鏄鏁存壒澶辫触
      if (parseInt(osu.general['Mode'] || '0', 10) !== 3) {
        nonMania++;
        continue;
      }
      parsed.push({ name: n, osu });
    } catch (e) {
      warnings.push(`${n}: 瑙ｆ瀽澶辫触锛?{e.message}锛塦);
    }
  }
  if (nonMania) {
    warnings.push(`璺宠繃 ${nonMania} 涓潪 osu!mania 璋遍潰锛圡alody 閿ā寮忓搴?osu!mania锛屽嵆 Mode: 3锛塦);
  }
  if (!parsed.length) throw new Error('鍘嬬缉鍖呴噷娌℃湁鍙浆鎹㈢殑 osu!mania 璋遍潰锛堥渶瑕?Mode: 3锛?);

  // 鎸夐敭鏁板垎缁?  const groups = new Map();
  for (const p of parsed) {
    let key = 4;
    try {
      key = Math.round(parseFloat(p.osu.difficulty['CircleSize']) || 4);
    } catch (e) {
      /* 淇濇寔榛樿 */
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

    for (const p of list) {
      // 璇ヨ氨闈㈢殑闊抽 / 鑳屾櫙锛屽繀椤荤湡瀹炲瓨鍦ㄤ簬鍖呴噷
      const audioWanted = p.osu.general['AudioFilename'] || '';
      const audioEntry = findEntry(names, audioWanted);
      const bgWanted = p.osu.background || '';
      const bgEntry = findEntry(names, bgWanted);

      if (!audioEntry) warnings.push(`${p.name}: 鎵句笉鍒伴煶棰?${audioWanted || '(鏈寚瀹?'}`);

      const { mc, stats } = osuToMc(p.osu, {
        audioName: audioEntry ? baseName(audioEntry) : baseName(audioWanted),
        backgroundName: bgEntry ? baseName(bgEntry) : bgWanted,
        denom: opts.denom,
        nowSeconds: nowSec,
        noSync: opts.noSync,
        mcStyle: opts.mcStyle,
      });

      if (stats.beatShift > 0) {
        warnings.push(
          `${p.name}: 鏈夐煶绗︽棭浜庨涓?BPM 鐐癸紝宸叉暣浣撳悗绉?${stats.beatShift} 鎷嶏紙鏁存暟灏忚妭锛屼繚鎸佸皬鑺傜嚎瀵归綈锛塦
        );
      }
      if (stats.minSection < 0) {
        warnings.push(`${p.name}: 浠嶅瓨鍦ㄨ礋灏忚妭 ${stats.minSection}锛孧alody 閲屽彲鑳介渶瑕佹墜鍔ㄨ皟鏁碻);
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
        warnings: warnings.filter(() => true),
        mczName: list[0].name.replace(/\.osu$/i, '').replace(/.*[\\/]/, '') || 'converted',
      },
    });
  }

  return { packages, warnings };
}
