# Malody <-> osu!mania 转换器 —— 图形界面版
#
# 由「GUI.bat」启动（双击即可）。带 -SelfTest / -TestConvert 便于自动化校验。

[CmdletBinding()]
param(
    [switch]$SelfTest,
    [switch]$TestConvert,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Paths
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Cli = Join-Path $Here 'cli.mjs'

function Find-Node {
    $c = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $cands = @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:USERPROFILE '.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe')
    )
    foreach ($p in $cands) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }
    return $null
}

$NodeExe = Find-Node
$Script:CliOk = Test-Path -LiteralPath $Cli
$Script:NodeOk = [bool]$NodeExe

# ---------------------------------------------------------------- 颜色/字体
$FontUI = New-Object System.Drawing.Font('Microsoft YaHei UI', 9)
$FontMono = New-Object System.Drawing.Font('Consolas', 9)
$FontTitle = New-Object System.Drawing.Font('Microsoft YaHei UI', 13, [System.Drawing.FontStyle]::Bold)

# ---------------------------------------------------------------- 主窗体
$form = New-Object System.Windows.Forms.Form
$form.Text = 'Malody  <->  osu!mania  转换器'
$form.ClientSize = New-Object System.Drawing.Size(740, 660)
$form.StartPosition = 'CenterScreen'
$form.Font = $FontUI
$form.MinimumSize = New-Object System.Drawing.Size(756, 699)
$form.AllowDrop = $true

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = 'Malody  <->  osu!mania'
$lblTitle.Font = $FontTitle
$lblTitle.Location = New-Object System.Drawing.Point(14, 12)
$lblTitle.Size = New-Object System.Drawing.Size(400, 28)
$form.Controls.Add($lblTitle)

$lblSub = New-Object System.Windows.Forms.Label
$lblSub.Text = '.mcz → .osz（拿去 osu! 玩）    .osz / osu! 歌曲文件夹 → .mcz（拿去 Malody 编辑）'
$lblSub.ForeColor = [System.Drawing.Color]::FromArgb(96, 96, 96)
$lblSub.Location = New-Object System.Drawing.Point(16, 42)
$lblSub.Size = New-Object System.Drawing.Size(700, 20)
$form.Controls.Add($lblSub)

# ---------------------------------------------------------------- 列表
$lblList = New-Object System.Windows.Forms.Label
$lblList.Text = '待转换的项目（可把文件或文件夹直接拖进下面的列表）：'
$lblList.Location = New-Object System.Drawing.Point(14, 70)
$lblList.Size = New-Object System.Drawing.Size(500, 20)
$form.Controls.Add($lblList)

$list = New-Object System.Windows.Forms.ListBox
$list.Location = New-Object System.Drawing.Point(14, 92)
$list.Size = New-Object System.Drawing.Size(712, 150)
$list.SelectionMode = 'MultiExtended'
$list.AllowDrop = $true
$list.HorizontalScrollbar = $true
$form.Controls.Add($list)

function Add-Item([string]$p) {
    if (-not $p) { return }
    $p = $p.Trim('"').Trim()
    if (-not $p) { return }
    if (-not (Test-Path -LiteralPath $p)) { return }
    foreach ($x in $list.Items) { if ($x -eq $p) { return } }
    [void]$list.Items.Add($p)
}

$btnAddFiles = New-Object System.Windows.Forms.Button
$btnAddFiles.Text = '添加文件…'
$btnAddFiles.Location = New-Object System.Drawing.Point(14, 250)
$btnAddFiles.Size = New-Object System.Drawing.Size(104, 30)
$form.Controls.Add($btnAddFiles)

$btnAddDir = New-Object System.Windows.Forms.Button
$btnAddDir.Text = '添加文件夹…'
$btnAddDir.Location = New-Object System.Drawing.Point(124, 250)
$btnAddDir.Size = New-Object System.Drawing.Size(116, 30)
$form.Controls.Add($btnAddDir)

$btnRemove = New-Object System.Windows.Forms.Button
$btnRemove.Text = '移除选中'
$btnRemove.Location = New-Object System.Drawing.Point(246, 250)
$btnRemove.Size = New-Object System.Drawing.Size(96, 30)
$form.Controls.Add($btnRemove)

$btnClear = New-Object System.Windows.Forms.Button
$btnClear.Text = '清空'
$btnClear.Location = New-Object System.Drawing.Point(348, 250)
$btnClear.Size = New-Object System.Drawing.Size(72, 30)
$form.Controls.Add($btnClear)

# ---------------------------------------------------------------- 选项
$grp = New-Object System.Windows.Forms.GroupBox
$grp.Text = '选项'
$grp.Location = New-Object System.Drawing.Point(14, 290)
$grp.Size = New-Object System.Drawing.Size(712, 132)
$form.Controls.Add($grp)

$lblKey = New-Object System.Windows.Forms.Label
$lblKey.Text = '键数'
$lblKey.Location = New-Object System.Drawing.Point(14, 30)
$lblKey.Size = New-Object System.Drawing.Size(40, 20)
$grp.Controls.Add($lblKey)

$cmbKey = New-Object System.Windows.Forms.ComboBox
$cmbKey.DropDownStyle = 'DropDownList'
$cmbKey.Location = New-Object System.Drawing.Point(56, 26)
$cmbKey.Size = New-Object System.Drawing.Size(88, 24)
[void]$cmbKey.Items.AddRange(@('自动', '4K', '5K', '6K', '7K', '8K', '9K', '10K'))
$cmbKey.SelectedIndex = 0
$grp.Controls.Add($cmbKey)

$lblShift = New-Object System.Windows.Forms.Label
$lblShift.Text = '时间微调 (ms)'
$lblShift.Location = New-Object System.Drawing.Point(160, 30)
$lblShift.Size = New-Object System.Drawing.Size(90, 20)
$grp.Controls.Add($lblShift)

$txtShift = New-Object System.Windows.Forms.TextBox
$txtShift.Text = '0'
$txtShift.Location = New-Object System.Drawing.Point(252, 26)
$txtShift.Size = New-Object System.Drawing.Size(64, 24)
$grp.Controls.Add($txtShift)

$chkCompress = New-Object System.Windows.Forms.CheckBox
$chkCompress.Text = '压缩输出'
$chkCompress.Checked = $true
$chkCompress.Location = New-Object System.Drawing.Point(334, 27)
$chkCompress.Size = New-Object System.Drawing.Size(96, 22)
$grp.Controls.Add($chkCompress)

$chkSync = New-Object System.Windows.Forms.CheckBox
$chkSync.Text = '按 Malody offset 换算音画同步'
$chkSync.Checked = $true
$chkSync.Location = New-Object System.Drawing.Point(440, 27)
$chkSync.Size = New-Object System.Drawing.Size(250, 22)
$grp.Controls.Add($chkSync)

$lblOut = New-Object System.Windows.Forms.Label
$lblOut.Text = '输出目录'
$lblOut.Location = New-Object System.Drawing.Point(14, 66)
$lblOut.Size = New-Object System.Drawing.Size(60, 20)
$grp.Controls.Add($lblOut)

$txtOut = New-Object System.Windows.Forms.TextBox
$txtOut.Location = New-Object System.Drawing.Point(76, 62)
$txtOut.Size = New-Object System.Drawing.Size(376, 24)
$outDefault = $env:MALODY2OSU_OUT
if (-not $outDefault) { $outDefault = [Environment]::GetFolderPath('Desktop') }
$txtOut.Text = $outDefault
$grp.Controls.Add($txtOut)

$btnOut = New-Object System.Windows.Forms.Button
$btnOut.Text = '浏览…'
$btnOut.Location = New-Object System.Drawing.Point(458, 61)
$btnOut.Size = New-Object System.Drawing.Size(74, 26)
$grp.Controls.Add($btnOut)

$lblStyle = New-Object System.Windows.Forms.Label
$lblStyle.Text = '输出格式'
$lblStyle.Location = New-Object System.Drawing.Point(544, 66)
$lblStyle.Size = New-Object System.Drawing.Size(60, 20)
$grp.Controls.Add($lblStyle)

$cmbStyle = New-Object System.Windows.Forms.ComboBox
$cmbStyle.DropDownStyle = 'DropDownList'
$cmbStyle.Location = New-Object System.Drawing.Point(606, 62)
$cmbStyle.Size = New-Object System.Drawing.Size(92, 24)
[void]$cmbStyle.Items.AddRange(@('完整', '精简'))
$cmbStyle.SelectedIndex = 0
$grp.Controls.Add($cmbStyle)

$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Text = '「输出格式」默认「完整」；若某个 Malody 版本读不了，换成「精简」再试。Malody 导入后会删掉源文件，需要时重新生成即可。'
$lblHint.ForeColor = [System.Drawing.Color]::FromArgb(120, 120, 120)
$lblHint.Location = New-Object System.Drawing.Point(14, 98)
$lblHint.Size = New-Object System.Drawing.Size(680, 20)
$grp.Controls.Add($lblHint)

# ---------------------------------------------------------------- 执行区
$btnRun = New-Object System.Windows.Forms.Button
$btnRun.Text = '开始转换'
$btnRun.Location = New-Object System.Drawing.Point(14, 432)
$btnRun.Size = New-Object System.Drawing.Size(150, 36)
$btnRun.Font = New-Object System.Drawing.Font('Microsoft YaHei UI', 10, [System.Drawing.FontStyle]::Bold)
$form.Controls.Add($btnRun)

$btnOpen = New-Object System.Windows.Forms.Button
$btnOpen.Text = '打开输出目录'
$btnOpen.Location = New-Object System.Drawing.Point(172, 432)
$btnOpen.Size = New-Object System.Drawing.Size(130, 36)
$btnOpen.Enabled = $false
$form.Controls.Add($btnOpen)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Text = '就绪'
$lblStatus.Location = New-Object System.Drawing.Point(316, 441)
$lblStatus.Size = New-Object System.Drawing.Size(410, 22)
$form.Controls.Add($lblStatus)

$lblLog = New-Object System.Windows.Forms.Label
$lblLog.Text = '日志：'
$lblLog.Location = New-Object System.Drawing.Point(14, 476)
$lblLog.Size = New-Object System.Drawing.Size(60, 20)
$form.Controls.Add($lblLog)

$log = New-Object System.Windows.Forms.TextBox
$log.Location = New-Object System.Drawing.Point(14, 498)
$log.Size = New-Object System.Drawing.Size(712, 148)
$log.Multiline = $true
$log.ReadOnly = $true
$log.ScrollBars = 'Vertical'
$log.WordWrap = $false
$log.Font = $FontMono
$log.BackColor = [System.Drawing.Color]::FromArgb(250, 250, 250)
$form.Controls.Add($log)

function Write-Log([string]$msg) {
    $log.AppendText($msg + [Environment]::NewLine)
    $log.SelectionStart = $log.TextLength
    $log.ScrollToCaret()
    [System.Windows.Forms.Application]::DoEvents()
}

function Set-Status([string]$msg) {
    $lblStatus.Text = $msg
    [System.Windows.Forms.Application]::DoEvents()
}

# ---------------------------------------------------------------- 事件
$btnAddFiles.Add_Click({
        $dlg = New-Object System.Windows.Forms.OpenFileDialog
        $dlg.Title = '选择要转换的文件'
        $dlg.Multiselect = $true
        $dlg.Filter = '支持的格式 (*.mcz;*.osz;*.zip;*.osu)|*.mcz;*.osz;*.zip;*.osu|Malody 谱面包 (*.mcz)|*.mcz|osu! 谱面包 (*.osz;*.zip)|*.osz;*.zip|osu! 谱面 (*.osu)|*.osu|所有文件 (*.*)|*.*'
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            foreach ($f in $dlg.FileNames) { Add-Item $f }
        }
        $dlg.Dispose()
    })

$btnAddDir.Add_Click({
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = '选择文件夹：osu! 歌曲文件夹（如 D:\osu!\Songs\某曲目）→ 出 .mcz；含 .mcz/.osz 的文件夹 → 逐个转出 .osz'
        $dlg.ShowNewFolderButton = $false
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Add-Item $dlg.SelectedPath }
    })

$btnRemove.Add_Click({
        $sel = @($list.SelectedItems)
        for ($i = $sel.Count - 1; $i -ge 0; $i--) { $list.Items.Remove($sel[$i]) }
    })

$btnClear.Add_Click({ $list.Items.Clear() })

$btnOut.Add_Click({
        $dlg = New-Object System.Windows.Forms.FolderBrowserDialog
        $dlg.Description = '选择输出目录'
        $dlg.ShowNewFolderButton = $true
        if (Test-Path -LiteralPath $txtOut.Text) { $dlg.SelectedPath = $txtOut.Text }
        if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $txtOut.Text = $dlg.SelectedPath }
    })

$btnOpen.Add_Click({
        $d = $txtOut.Text
        if (Test-Path -LiteralPath $d) { Start-Process explorer.exe $d }
    })

# 拖放到列表 / 窗体
$dragEnter = {
    param($sender, $e)
    if ($e.Data.GetDataPresent([System.Windows.Forms.DataFormats]::FileDrop)) {
        $e.Effect = [System.Windows.Forms.DragDropEffects]::Copy
    }
    else { $e.Effect = [System.Windows.Forms.DragDropEffects]::None }
}
$dragDrop = {
    param($sender, $e)
    $items = $e.Data.GetData([System.Windows.Forms.DataFormats]::FileDrop)
    foreach ($it in $items) { Add-Item $it }
    Set-Status ('已添加 ' + @($items).Count + ' 项')
}
$list.Add_DragEnter($dragEnter)
$list.Add_DragDrop($dragDrop)
$form.Add_DragEnter($dragEnter)
$form.Add_DragDrop($dragDrop)

# ---------------------------------------------------------------- 转换核心
function Get-OutPath([string]$path, [string]$outDir) {
    $item = Get-Item -LiteralPath $path
    $isDir = $item.PSIsContainer
    $ext = if ($isDir) { '' } else { $item.Extension.ToLower() }
    $name = if ($isDir) { $item.Name } else { [System.IO.Path]::GetFileNameWithoutExtension($item.Name) }
    $safe = $name -replace '[\\/:*?"<>|]', '_'
    switch ($ext) {
        '.mcz' { return (Join-Path $outDir "$safe.osz") }
        '.osu' { return (Join-Path $outDir "$safe.mc") }
        default { return (Join-Path $outDir $safe) }   # 目录 / .osz / .zip → cli 会补 .mcz
    }
}

function Invoke-One([string]$path, [string]$outDir, [int]$key, [int]$shift, [bool]$compress, [bool]$sync, [string]$style) {
    $out = Get-OutPath $path $outDir
    $argv = @($Cli, $path, '-o', $out)
    if ($key -gt 0) { $argv += @('--key', "$key") }
    if ($shift -ne 0) { $argv += @('--shift', "$shift") }
    if (-not $sync) { $argv += '--no-sync' }
    if (-not $compress) { $argv += '--no-compress' }
    if ($style -eq 'minimal') { $argv += @('--mc-style', 'minimal') }

    # 批量转换时产物会落在输出目录的子文件夹里，因此递归查找
    $before = @(Get-ChildItem -LiteralPath $outDir -File -Recurse -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName)

    $text = & $NodeExe @argv 2>&1 | Out-String
    $code = $LASTEXITCODE

    $after = @(Get-ChildItem -LiteralPath $outDir -File -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $before -notcontains $_.FullName })

    return [pscustomobject]@{ Text = $text; Code = $code; New = $after }
}

$btnRun.Add_Click({
        if (-not $Script:NodeOk) {
            [void][System.Windows.Forms.MessageBox]::Show(
                "找不到 Node.js 运行时。`n`n请先安装 Node.js（https://nodejs.org，选 LTS 版），或把本程序放在完整的转换器目录里。",
                '缺少运行时', 'OK', 'Error')
            return
        }
        if (-not $Script:CliOk) {
            [void][System.Windows.Forms.MessageBox]::Show(
                "找不到 cli.mjs，请确认它和本程序在同一目录：`n$Cli",
                '缺少文件', 'OK', 'Error')
            return
        }
        if ($list.Items.Count -eq 0) {
            [void][System.Windows.Forms.MessageBox]::Show('请先添加要转换的文件或文件夹。', '提示', 'OK', 'Information')
            return
        }
        $outDir = $txtOut.Text.Trim()
        if (-not $outDir) { $outDir = [Environment]::GetFolderPath('Desktop') }
        if (-not (Test-Path -LiteralPath $outDir)) {
            try { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }
            catch {
                [void][System.Windows.Forms.MessageBox]::Show("无法创建输出目录：`n$outDir", '错误', 'OK', 'Error')
                return
            }
        }

        $key = 0
        if ($cmbKey.SelectedIndex -gt 0) { $key = [int]($cmbKey.SelectedItem -replace 'K', '') }
        $shift = 0
        [void][int]::TryParse($txtShift.Text.Trim(), [ref]$shift)
        $compress = $chkCompress.Checked
        $sync = $chkSync.Checked
        $style = if ($cmbStyle.SelectedIndex -eq 1) { 'minimal' } else { 'full' }

        $btnRun.Enabled = $false
        $log.Clear()
        Write-Log ('输出目录: ' + $outDir)
        Write-Log ('运行时  : ' + $NodeExe)
        Write-Log ('')
        $produced = @()
        $n = $list.Items.Count
        $i = 0
        foreach ($p in @($list.Items)) {
            $i++
            Set-Status ("转换中 $i / $n …")
            Write-Log ('[' + $i + '/' + $n + '] ' + $p)
            try {
                $r = Invoke-One $p $outDir $key $shift $compress $sync $style
            }
            catch {
                Write-Log ('    × 出错: ' + $_.Exception.Message)
                continue
            }
            foreach ($line in ($r.Text -split "`r?`n")) {
                if ($line.Trim()) { Write-Log ('    ' + $line.TrimEnd()) }
            }
            if ($r.Code -ne 0) { Write-Log ('    × 转换失败（退出码 ' + $r.Code + '）') }
            elseif ($r.New.Count -eq 0) { Write-Log '    ! 没有生成新文件' }
            else {
                foreach ($f in $r.New) {
                    Write-Log ('    √ 已生成 ' + $f.Name + '  (' + [math]::Round($f.Length / 1MB, 2) + ' MB)')
                    $produced += $f.FullName
                }
            }
            Write-Log ''
        }

        $btnRun.Enabled = $true
        if ($produced.Count -gt 0) {
            Set-Status ('完成：生成 ' + $produced.Count + ' 个文件')
            $btnOpen.Enabled = $true
        }
        else { Set-Status '没有生成任何文件' }
    })

# 预置路径（从命令行/拖到 GUI.bat 上的参数）
foreach ($p in $Paths) { Add-Item $p }

# ---------------------------------------------------------------- 自检 / 无头测试
if ($SelfTest) {
    $names = @('list', 'cmbKey', 'txtShift', 'chkCompress', 'chkSync', 'txtOut', 'cmbStyle', 'log', 'btnRun', 'btnOpen')
    $missing = @()
    foreach ($n in $names) {
        if (-not (Get-Variable -Name $n -Scope Script -ErrorAction SilentlyContinue)) { $missing += $n }
    }
    Write-Host ('控件数量      : ' + $form.Controls.Count)
    Write-Host ('列表/选项/日志: ' + $(if ($missing.Count -eq 0) { '全部就位' } else { '缺失 ' + ($missing -join ',') }))
    Write-Host ('Node 运行时   : ' + $(if ($NodeOk) { $NodeExe } else { '未找到' }))
    Write-Host ('cli.mjs       : ' + $(if ($CliOk) { $Cli } else { '未找到' }))
    Write-Host ('默认输出目录  : ' + $outDefault)
    Write-Host ('SelfTest      : OK')
    $form.Dispose()
    exit 0
}

if ($TestConvert) {
    foreach ($p in $Paths) { Add-Item $p }
    $dir = if ($env:MALODY2OSU_OUT) { $env:MALODY2OSU_OUT } else { [Environment]::GetFolderPath('Desktop') }
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-Host ('输出目录: ' + $dir)
    foreach ($p in @($list.Items)) {
        Write-Host ('--- ' + $p)
        $r = Invoke-One $p $dir 0 0 $true $true 'full'
        foreach ($line in ($r.Text -split "`r?`n")) { if ($line.Trim()) { Write-Host ('    ' + $line.TrimEnd()) } }
        foreach ($f in $r.New) { Write-Host ('    √ ' + $f.Name + '  ' + [math]::Round($f.Length / 1MB, 2) + ' MB') }
    }
    $form.Dispose()
    exit 0
}

[void]$form.ShowDialog()
$form.Dispose()
