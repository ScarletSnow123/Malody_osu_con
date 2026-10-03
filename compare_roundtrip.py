#!/usr/bin/env python3
"""对比两个 Malody 谱面（通常是「原始谱面」与「往返转换后的谱面」）。

用法:
    python compare_roundtrip.py <原始.mc|原始.mcz> <往返后.mc|往返后.mcz>

两者都按 a + b/c 的拍定义换算成毫秒，再逐音符比较列号与时间。
"""
import sys
import os
import json
import zipfile
import collections


def load_mc(path):
    """从 .mc 或 .mcz 读出一个谱面 JSON，返回 (mc, 名称)。"""
    if not os.path.exists(path):
        raise SystemExit('文件不存在：%s' % path)
    if path.lower().endswith('.mcz') or zipfile.is_zipfile(path):
        zf = zipfile.ZipFile(path)
        names = sorted(n for n in zf.namelist() if n.lower().endswith('.mc'))
        if not names:
            raise SystemExit('压缩包里没有 .mc：%s' % path)
        return json.loads(zf.read(names[0]).decode('utf-8')), names[0]
    with open(path, encoding='utf-8') as f:
        return json.load(f), os.path.basename(path)


def parse_beat(t):
    return t[0] + t[1] / t[2]


def prepare(mc):
    """→ (变速点, 各点毫秒, 音符列表, BGM 事件)"""
    pts = sorted((parse_beat(t['beat']), t['bpm']) for t in mc.get('time', []) if t.get('bpm', 0) > 0)
    if not pts:
        raise SystemExit('谱面没有有效的 BPM 变速点')
    ms = [0.0]
    for i in range(1, len(pts)):
        ms.append(ms[-1] + (pts[i][0] - pts[i - 1][0]) * 60000.0 / pts[i - 1][1])

    notes, bgm = [], None
    for n in mc.get('note', []):
        if 'column' not in n:
            bgm = n
            continue
        notes.append({
            'beat': parse_beat(n['beat']),
            'col': n['column'],
            'end': parse_beat(n['endbeat']) if 'endbeat' in n else None,
        })
    notes.sort(key=lambda x: (x['beat'], x['col']))
    return pts, ms, notes, bgm


def beat_to_ms(pts, ms, beat):
    if beat <= pts[0][0]:
        return (beat - pts[0][0]) * 60000.0 / pts[0][1]
    for i in range(1, len(pts)):
        if beat <= pts[i][0]:
            return ms[i - 1] + (beat - pts[i - 1][0]) * 60000.0 / pts[i - 1][1]
    return ms[-1] + (beat - pts[-1][0]) * 60000.0 / pts[-1][1]


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2

    a_mc, a_name = load_mc(sys.argv[1])
    b_mc, b_name = load_mc(sys.argv[2])
    print('原始谱面 : %s' % a_name)
    print('往返谱面 : %s' % b_name)
    print()

    a_pts, a_ms, a_notes, a_bgm = prepare(a_mc)
    b_pts, b_ms, b_notes, b_bgm = prepare(b_mc)

    print('=== BPM 变速点 ===')
    print('原始 %d 个, 往返 %d 个' % (len(a_pts), len(b_pts)))
    bad_tp = 0
    for i in range(max(len(a_pts), len(b_pts))):
        x = a_pts[i] if i < len(a_pts) else None
        y = b_pts[i] if i < len(b_pts) else None
        if not (x and y and abs(x[0] - y[0]) < 1e-6 and abs(x[1] - y[1]) < 0.01):
            bad_tp += 1
            print('  ✗ #%d 原始 %s  往返 %s' % (i, x, y))
    print('  差异: %d' % bad_tp)

    print()
    print('=== 音符数量 ===')
    print('原始 %d（长按 %d）' % (len(a_notes), sum(1 for n in a_notes if n['end'] is not None)))
    print('往返 %d（长按 %d）' % (len(b_notes), sum(1 for n in b_notes if n['end'] is not None)))

    if len(a_notes) != len(b_notes):
        print()
        print('!! 数量不一致，无法逐音符对比')
        return 1

    print()
    print('=== 逐音符对比 ===')
    col_bad = [(i, x['col'], y['col']) for i, (x, y) in enumerate(zip(a_notes, b_notes)) if x['col'] != y['col']]
    end_bad = [(i, x['end'], y['end']) for i, (x, y) in enumerate(zip(a_notes, b_notes))
               if (x['end'] is None) != (y['end'] is None)]
    devs = [beat_to_ms(b_pts, b_ms, y['beat']) - beat_to_ms(a_pts, a_ms, x['beat'])
            for x, y in zip(a_notes, b_notes)]

    print('  列不一致     : %d %s' % (len(col_bad), col_bad[:5] if col_bad else ''))
    print('  长按标记不一致: %d %s' % (len(end_bad), end_bad[:5] if end_bad else ''))
    ad = [abs(d) for d in devs]
    print('  时间偏差     : 最大 %.4fms, 平均 %.4fms, 中位 %.4fms' % (
        max(ad), sum(ad) / len(ad), sorted(ad)[len(ad) // 2]))
    zero = sum(1 for d in devs if d == 0)
    print('  完全一致     : %d / %d (%.2f%%)' % (zero, len(devs), 100.0 * zero / len(devs)))
    print('  偏差 >1ms    : %d' % sum(1 for d in ad if d > 1))
    print('  偏差 >5ms    : %d' % sum(1 for d in ad if d > 5))

    edevs = [abs(beat_to_ms(b_pts, b_ms, y['end']) - beat_to_ms(a_pts, a_ms, x['end']))
             for x, y in zip(a_notes, b_notes) if x['end'] is not None and y['end'] is not None]
    if edevs:
        print('  长按结束偏差 : 最大 %.4fms, 平均 %.4fms' % (max(edevs), sum(edevs) / len(edevs)))

    print()
    print('=== BGM 事件 ===')
    print('  原始: %s' % json.dumps(a_bgm, ensure_ascii=False))
    print('  往返: %s' % json.dumps(b_bgm, ensure_ascii=False))
    print('  一致: %s' % (a_bgm == b_bgm))

    print()
    print('=== 元数据 ===')
    for k in ('$ver', 'creator', 'version', 'mode'):
        av, bv = a_mc['meta'].get(k), b_mc['meta'].get(k)
        print('  %-8s 原始=%-34r 往返=%r  %s' % (k, av, bv, '✓' if av == bv else '✗'))
    print('  mode_ext 原始=%s 往返=%s' % (
        json.dumps(a_mc['meta'].get('mode_ext'), sort_keys=True),
        json.dumps(b_mc['meta'].get('mode_ext'), sort_keys=True)))

    print()
    print('=== 拍分母使用 ===')
    print('  原始: %s' % dict(sorted(collections.Counter(n['beat'][2] for n in a_mc['note'] if 'column' in n).items())))
    print('  往返: %s' % dict(sorted(collections.Counter(n['beat'][2] for n in b_mc['note'] if 'column' in n).items())))

    ok = not col_bad and not end_bad and max(ad) <= 5
    print()
    print('结论: %s' % ('往返保真 ✓' if ok else '存在差异，见上'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
