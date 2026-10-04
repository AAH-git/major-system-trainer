@echo off
rem Double-click this file to rebuild manifest.js from the images folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-manifest.ps1"
pause
