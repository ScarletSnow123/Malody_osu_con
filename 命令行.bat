@echo off
chcp 65001 >nul
title Malody Converter - Command Line
cd /d "%~dp0"

echo ============================================================
echo   Malody  to  osu!mania  Converter   -   Command Line
echo ============================================================
echo.
echo   Usage:
echo     node cli.mjs "INPUT" [-o OUTPUT] [--key N] [--shift MS]
echo                        [--denom N] [--no-sync] [--no-compress]
echo.
echo   INPUT can be a file or a folder:
echo     .mcz                      -^> .osz   (for osu!)
echo     .osz / .zip / folder      -^> .mcz   (for Malody editor)
echo     .osu                      -^> .mc
echo.
echo   Examples:
echo     node cli.mjs "D:\osu!\Songs\SomeSong"
echo     node cli.mjs "some-pack.mcz" -o "out.osz"
echo.
echo   Working directory is already set to this folder.
echo ============================================================
echo.

cmd /k
