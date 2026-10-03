@echo off
chcp 65001 >nul
title Malody - osu!mania Converter
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0convert.ps1" %*
