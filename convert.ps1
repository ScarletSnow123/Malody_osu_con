# Malody <-> osu!mania 转换器 —— 拖放 / 双击启动
#
# 用法：
#   1) 把 .mcz / .osz / .zip / .osu 文件，或 osu! 歌曲文件夹，拖到「转换.bat」上
#   2) 直接双击「转换.bat」→ 弹出文件夹选择框
#
# 输出默认放在桌面；可用环境变量 MALODY2OSU_OUT 指定其它目录。

[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Paths)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cli = Join-Path $Here 'cli.mjs'

function Say($msg, $color) { Write-Host $msg -ForegroundColor $color }
function Head($t) { Write-Host ''; Say "== $t" 'Cyan' }
function Ok($t) { Say "  $t" 'Green' }
function Warn($t) { Say "  $t" 'Yellow' }
function Fail($t) { Say "  $t" 'Red' }

if (-not (Test-Path -LiteralPath $Cli)) {
    Fail "找不到 cli.mjs，请确认它和本程序在同一目录："
    Fail "  $Cli"
    Read-Host '按回车退出'
    exit 1
}

function Find-Node {
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $cands = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe'),
        'C:\Program Files\nodejs\node.exe'
    )
    foreach ($p in $cands) {
        if ($p -and (Test-Path -LiteralPath $p)) { return $p }
    }
    return $null
}

$Node = Find-Node
if (-not $Node) {
    Fail '找不到 Node.js 运行时。'
    Fail '请先安装 Node.js（https://nodejs.org，选 LTS 版）再运行本程序。'
    Read-Host '按回车退出'
    exit 1
}

# 没有参数（双击）→ 弹文件夹选择框
if (-not $Paths -or $Paths.Count -eq 0) {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
    $dlg.Description = '选择 osu! 歌曲文件夹（例如 D:\osu!\Songs\某曲目），或含 .osu 的目录'
    $dlg.ShowNewFolderButton = $false
    if ($dlg.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }
    $Paths = @($dlg.SelectedPath)
}

# 输出目录：默认桌面，可用环境变量覆盖
$OutDir = $env:MALODY2OSU_OUT
if (-not $OutDir) { $OutDir = [Environment]::GetFolderPath('Desktop') }
if (-not (Test-Path -LiteralPath $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }

Write-Host ''
Say 'Malody <-> osu!mania 转换器' 'Magenta'
Write-Host "  运行时 : $Node"
Write-Host "  输出到 : $OutDir"

$produced = @()

foreach ($raw in $Paths) {
    $p = $raw.Trim('"').Trim()
    if (-not $p) { continue }
    if (-not (Test-Path -LiteralPath $p)) { Fail "路径不存在：$p"; continue }

    $item = Get-Item -LiteralPath $p
    $isDir = $item.PSIsContainer
    $ext = if ($isDir) { '' } else { $item.Extension.ToLower() }
    $name = if ($isDir) { $item.Name } else { [System.IO.Path]::GetFileNameWithoutExtension($item.Name) }
    $safe = $name -replace '[\\/:*?"<>|]', '_'

    Head $item.Name

    switch ($ext) {
        '.mcz' { $out = Join-Path $OutDir "$safe.osz" }
        '.osu' { $out = Join-Path $OutDir "$safe.mc" }
        default { $out = Join-Path $OutDir $safe }   # 目录 / .osz / .zip → cli 会补 .mcz
    }

    & $Node $Cli $p -o $out
    if ($LASTEXITCODE -ne 0) {
        Fail "转换失败（退出码 $LASTEXITCODE）"
        continue
    }

    if (-not (Test-Path -LiteralPath $out)) { Warn '没有生成新文件'; continue }
    foreach ($f in $after) {
        Ok ("已生成  {0}   ({1} MB)" -f $f.Name, [math]::Round($f.Length / 1MB, 2))
        $produced += $f.FullName
    }
}

Write-Host ''
if ($produced.Count -gt 0) {
    Say "完成：共生成 $($produced.Count) 个文件。" 'Green'
    Say '  .mcz 拖进 Malody 即可导入编辑；.osz 拖进 osu! 窗口即可导入。' 'Green'
    Write-Host ''
    $ans = Read-Host '按回车打开输出目录（输入 n 直接退出）'
    if ($ans -ne 'n' -and $ans -ne 'N') {
        Start-Process explorer.exe ("/select,`"$($produced[0])`"")
    }
}
else {
    Warn '没有生成任何文件。'
    Read-Host '按回车退出'
}
