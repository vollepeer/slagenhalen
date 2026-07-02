@echo off
set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = $env:SCRIPT_DIR; $ws = New-Object -ComObject WScript.Shell; $shortcut = $ws.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Filip Kaartavond.lnk')); $shortcut.TargetPath = Join-Path $dir 'Start Filip Kaartavond.bat'; $shortcut.WorkingDirectory = $dir; $shortcut.IconLocation = Join-Path $dir 'node\node.exe'; $shortcut.Save()"
echo Snelkoppeling aangemaakt op het bureaublad.
pause
