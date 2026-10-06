p = "core.mjs"
s = open(p, encoding="utf-8").read()
old = (
    "// 先定出音频与背景（多难度共用）\n"
    "let audioName = opts.audioName || audioNames[0] || '';\n"
    "let bgName = opts.backgroundName || '';\n"
)
new = (
    "// 先定出音频与背景（多难度共用；每个 .mc 内部会独立读取自己的 audioName / backgroundName）\n"
    "let audioName = opts.audioName || audioNames[0] || '';\n"
    "let bgName = opts.backgroundName || '';\n"
)
print("found:", old in s)
if old in s:
    s = s.replace(old, new)
    open(p, "w", encoding="utf-8").write(s)
    print("written")
