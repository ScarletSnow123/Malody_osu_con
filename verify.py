#!/usr/bin/env python3
"""校验转换产出的 .osz：ZIP 完整性 + osu!mania 谱面结构。

用法:
    python verify.py <file.osz>
    python verify.py <file.osz> --original <source.mc|source.mcz>

--original 会额外核对「源 Malody 谱面」与「产出 osu 谱面」的音符数与列分布是否一致。
"""
import sys
import os
import json
import struct
import zipfile
import collections


# ---------------------------------------------------------------- Malody 侧

def load_mc(path):
    """从 .mc 或 .mcz 读出一个谱面 JSON，返回 (mc, 名称)。"""
    if path.lower().endswith('.mcz') or zipfile.is_zipfile(path):
        zf = zipfile.ZipFile(path)
        names = sorted(n for n in zf.namelist() if n.lower().endswith('.mc'))
        if not names:
            raise SystemExit('压缩包里没有 .mc：%s' % path)
        return json.loads(zf.read(names[0]).decode('utf-8')), names[0]
    with open(path, encoding='utf-8') as f:
        return json.load(f), os.path.basename(path)


def parse_beat(t):
    """Malody 拍三分量 [a,b,c] → a + b/c"""
    return t[0] + t[1] / t[2]


def tempo_ms(points):
    """已按拍排序的 (beat, bpm) → 每个变速点对应的毫秒"""
    ms = [0.0]
    for i in range(1, len(points)):
        b0, bpm0 = points[i - 1]
        ms.append(ms[-1] + (points[i][0] - b0) * 60000.0 / bpm0)
    return ms


def beat_to_ms(points, ms, beat):
    if beat <= points[0][0]:
        return (beat - points[0][0]) * 60000.0 / points[0][1]
    for i in range(1, len(points)):
        if beat <= points[i][0]:
            b0, bpm0 = points[i - 1]
            return ms[i - 1] + (beat - b0) * 60000.0 / bpm0
    b0, bpm0 = points[-1]
    return ms[-1] + (beat - b0) * 60000.0 / bpm0


# ---------------------------------------------------------------- osu! 侧

def kv(lines):
    out = {}
    for line in lines:
        if ':' in line:
            k, v = line.split(':', 1)
            out[k.strip()] = v.strip()
    return out


def parse_osu(text):
    sections, cur = collections.OrderedDict(), None
    for line in text.split('\n'):
        s = line.strip()
        if s.startswith('[') and s.endswith(']'):
            cur = s
            sections[cur] = []
        elif cur:
            sections[cur].append(line)

    gen = kv(sections.get('[General]', []))
    diff = kv(sections.get('[Difficulty]', []))
    meta = kv(sections.get('[Metadata]', []))

    tps = []
    for l in sections.get('[TimingPoints]', []):
        f = l.split(',')
        if len(f) >= 2 and f[0].strip():
            tps.append((float(f[0]), float(f[1])))

    objs = []
    for l in sections.get('[HitObjects]', []):
        f = l.strip().split(',')
        if len(f) >= 4:
            t = float(f[2])
            typ = int(f[3])
            end = None
            if typ & 128 and len(f) > 5:
                end = float(f[5].split(':')[0])
            objs.append((int(f[0]), t, typ, end))
    return gen, diff, meta, tps, objs, sections


def ogg_duration(data):
    segs = data[26]
    pkt = data[27 + segs:27 + segs + 30]
    if pkt[1:7] != b'vorbis':
        return None
    sr = struct.unpack('<I', pkt[12:16])[0]
    idx = data.rfind(b'OggS')
    return struct.unpack('<q', data[idx + 6:idx + 14])[0] / sr


# ---------------------------------------------------------------- 主流程

def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 2
    path = args[0]
    original = None
    if '--original' in args:
        i = args.index('--original')
        if i + 1 < len(args):
            original = args[i + 1]
    if not os.path.exists(path):
        raise SystemExit('文件不存在：%s' % path)

    print('=' * 72)
    print('校验: %s  (%.2f MB)' % (os.path.basename(path), os.path.getsize(path) / 1048576))
    print('=' * 72)

    zf = zipfile.ZipFile(path)
    bad = zf.testzip()
    print()
    print('[ZIP 完整性]')
    print('  CRC 校验 : %s' % ('全部通过' if bad is None else '失败于 ' + bad))
    for zi in zf.infolist():
        print('    %-56s %10d B' % (zi.filename, zi.file_size))

    osu_names = [n for n in zf.namelist() if n.lower().endswith('.osu')]
    if not osu_names:
        raise SystemExit('包里没有 .osu')
    text = zf.read(osu_names[0]).decode('utf-8', 'replace')
    gen, diff, meta, tps, objs, sections = parse_osu(text)

    key = int(float(diff.get('CircleSize', 4)))
    print()
    print('[谱面]')
    print('  %s' % osu_names[0])
    print('  标题/艺术家/作者/难度 : %s / %s / %s / %s' % (
        meta.get('Title'), meta.get('Artist'), meta.get('Creator'), meta.get('Version')))
    print('  Mode / 键数           : %s / %sK' % (gen.get('Mode'), key))
    print('  AudioFilename         : %s' % gen.get('AudioFilename'))
    print('  AudioLeadIn           : %s ms' % gen.get('AudioLeadIn'))
    print('  音频存在于包内        : %s' % (gen.get('AudioFilename') in zf.namelist()))

    bg = [l for l in sections.get('[Events]', []) if l.strip().startswith('0,0,"')]
    if bg:
        name = bg[0].split('"')[1]
        print('  背景图                : %s  (存在于包内: %s)' % (name, name in zf.namelist()))

    reds = [t for t in tps if t[1] > 0]
    greens = [t for t in tps if t[1] < 0]
    print()
    print('[TimingPoints]  红线 %d 条, 绿线 %d 条' % (len(reds), len(greens)))
    for t, bl in reds[:6]:
        print('    t=%10.0fms  bpm=%8.3f' % (t, 60000 / bl))
    if len(reds) > 6:
        print('    ...（共 %d 条）' % len(reds))

    kinds = collections.Counter(t & 128 and 128 or 1 for _, _, t, _ in objs)
    xs = sorted(set(x for x, _, _, _ in objs))
    cols = collections.Counter(min(key - 1, max(0, x * key // 512)) for x, _, _, _ in objs)
    times = [t for _, t, _, _ in objs]
    holds = [(t, e) for _, t, ty, e in objs if ty & 128 and e is not None]

    print()
    print('[HitObjects]  共 %d 条' % len(objs))
    print('  类型        : %s  (1=单点, 128=长按)' % dict(kinds))
    print('  x 取值      : %s' % xs[:16])
    print('  每列音符数  : %s' % dict(sorted(cols.items())))
    print('  时间有序    : %s' % all(times[i] <= times[i + 1] for i in range(len(times) - 1)))
    print('  时间范围    : %.3fs .. %.3fs' % (min(times) / 1000, max(times) / 1000))
    dups = [k for k, v in collections.Counter((x, t) for x, t, _, _ in objs).items() if v > 1]
    print('  同列同时刻重复 : %d' % len(dups))
    bad_holds = [(a, b) for a, b in holds if b <= a]
    print('  非法长按(end<=start) : %d' % len(bad_holds))
    if holds:
        dl = [b - a for a, b in holds]
        print('  长按时长    : 最短 %.0fms, 最长 %.0fms, 平均 %.0fms' % (
            min(dl), max(dl), sum(dl) / len(dl)))

    audio = gen.get('AudioFilename')
    if audio in zf.namelist() and audio.lower().endswith('.ogg'):
        dur = ogg_duration(zf.read(audio))
        if dur:
            print()
            print('[音画]')
            print('  音频时长 %.3fs   末音符 %.3fs   余量 %.3fs' % (
                dur, max(times) / 1000, dur - max(times) / 1000))

    if original:
        mc, mc_name = load_mc(original)
        src = [n for n in mc.get('note', []) if 'column' in n]
        src_holds = [n for n in src if 'endbeat' in n]
        print()
        print('[与源 Malody 谱面对照]  源: %s' % mc_name)
        print('  音符数  %d → %d   %s' % (
            len(src), len(objs), '一致' if len(src) == len(objs) else '不一致'))
        print('  长按数  %d → %d   %s' % (
            len(src_holds), kinds.get(128, 0),
            '一致' if len(src_holds) == kinds.get(128, 0) else '不一致'))
        src_cols = collections.Counter(n['column'] for n in src)
        if sum(src_cols.values()) == len(objs):
            same = all(src_cols.get(c, 0) == cols.get(c, 0) for c in set(src_cols) | set(cols))
            print('  列分布  %s   %s' % (dict(sorted(src_cols.items())), '一致' if same else '不一致'))

        pts = sorted((parse_beat(t['beat']), t['bpm']) for t in mc['time'] if t['bpm'] > 0)
        ms = tempo_ms(pts)
        # 产出的 osu 时间轴已按 Malody 的 BGM offset 平移过（osu 时间 = 谱面时间 − offset），
        # 这里要把 offset 减回去，才能与源谱面的时间直接比较。
        offset = float(gen.get('AudioLeadIn') or 0)
        src_notes = sorted((parse_beat(n['beat']), n['column']) for n in src)
        note_by_col = collections.defaultdict(list)
        for b, c in src_notes:
            note_by_col[c].append(beat_to_ms(pts, ms, b) - offset)
        # 逐列按时间顺序与产出对照
        out_by_col = collections.defaultdict(list)
        for x, t, _, _ in objs:
            out_by_col[min(key - 1, max(0, x * key // 512))].append(t)
        devs = []
        for c in note_by_col:
            a, b = sorted(note_by_col[c]), sorted(out_by_col.get(c, []))
            for u, v in zip(a, b):
                devs.append(abs(v - u))
        if devs:
            print('  时间偏差  最大 %.3fms, 平均 %.4fms, 样本 %d' % (
                max(devs), sum(devs) / len(devs), len(devs)))

    print()
    print('完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
