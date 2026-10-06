p="core.mjs"
$s=[regex]::Replace((Get-Content -LiteralPath $p -Encoding utf8 -Raw), "(?m)^\/\/ 先定出音频与背景.*`r?`nlet audioName = opts\.audioName \|\| audioNames\[0\] \|\| "";`r?`nlet bgName = opts\.backgroundName \|\| "";", "// 先定出音频与背景（多难度共用）`nlet audioName = "";`nlet bgName = "";")
Set-Content -LiteralPath $p -Encoding utf8 -Value $s