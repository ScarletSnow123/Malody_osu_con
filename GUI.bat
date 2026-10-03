@echo off
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0gui.ps1" %*
exit
