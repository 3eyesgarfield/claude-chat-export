@echo off
chcp 65001 >nul
title Claude Conversation Tools - Setup

echo Claude Conversation Tools Setup
echo ==================================
echo.
echo This will install the Claude conversation viewer on this machine.
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not found.
    echo Please install Node.js from https://nodejs.org and run this again.
    echo.
    pause & exit /b 1
)
echo [OK] Node.js found.

:: Check Claude Code
if not exist "%USERPROFILE%\.claude\settings.json" (
    echo ERROR: Claude Code config not found at %USERPROFILE%\.claude
    echo Please run Claude Code at least once first.
    echo.
    pause & exit /b 1
)
echo [OK] Claude Code found.

:: Check that JS files are next to this bat file
set MISSING=
if not exist "%~dp0save-transcript.js" set MISSING=%MISSING% save-transcript.js
if not exist "%~dp0view-transcript.js" set MISSING=%MISSING% view-transcript.js
if not exist "%~dp0export-to-md.js"    set MISSING=%MISSING% export-to-md.js
if not "%MISSING%"=="" (
    echo ERROR: Missing files next to Claude-Setup.bat:
    echo   %MISSING%
    echo.
    echo Copy all of the following files to the same folder:
    echo   - Claude-Setup.bat
    echo   - save-transcript.js
    echo   - view-transcript.js
    echo   - export-to-md.js
    echo   - Claude Conversation Viewer.bat
    echo   - Export to MD.bat
    echo.
    pause & exit /b 1
)

:: Install scripts
if not exist "%USERPROFILE%\.claude\scripts" mkdir "%USERPROFILE%\.claude\scripts"
copy /Y "%~dp0save-transcript.js" "%USERPROFILE%\.claude\scripts\save-transcript.js" >nul
copy /Y "%~dp0view-transcript.js" "%USERPROFILE%\.claude\scripts\view-transcript.js" >nul
copy /Y "%~dp0export-to-md.js"    "%USERPROFILE%\.claude\scripts\export-to-md.js"    >nul
echo [OK] Scripts installed to %USERPROFILE%\.claude\scripts\

:: Create transcripts folder
if not exist "%USERPROFILE%\claude-transcripts" mkdir "%USERPROFILE%\claude-transcripts"
echo [OK] Transcripts folder ready at %USERPROFILE%\claude-transcripts\

:: Update settings.json - add PreCompact hook
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sp = Join-Path $env:USERPROFILE '.claude\settings.json';" ^
  "$sc = (Join-Path $env:USERPROFILE '.claude\scripts\save-transcript.js') -replace '\\\\', '/';" ^
  "$j = Get-Content $sp -Raw | ConvertFrom-Json;" ^
  "if (-not $j.PSObject.Properties['hooks']) { $j | Add-Member -NotePropertyName 'hooks' -NotePropertyValue ([PSCustomObject]@{}) };" ^
  "$cmd = \"node \`\"\`\$sc\`\"\".Replace('\`\$sc', $sc);" ^
  "$entry = [PSCustomObject]@{ hooks = @([PSCustomObject]@{ type='command'; command=$cmd }) };" ^
  "$j.hooks | Add-Member -NotePropertyName 'PreCompact' -NotePropertyValue @($entry) -Force;" ^
  "$out = $j | ConvertTo-Json -Depth 10;" ^
  "Set-Content -Path $sp -Value $out -Encoding UTF8;" ^
  "Write-Host '[OK] PreCompact hook added to settings.json'"

if %errorlevel% neq 0 (
    echo ERROR: Failed to update settings.json
    pause & exit /b 1
)

echo.
echo ==================================
echo Setup complete!
echo.
echo - View conversations : double-click "Claude Conversation Viewer.bat"
echo - Export to markdown : double-click "Export to MD.bat"
echo - Transcripts saved to: %USERPROFILE%\claude-transcripts\
echo ==================================
echo.
pause
