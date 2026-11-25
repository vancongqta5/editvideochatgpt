@echo off
setlocal
title editvideochatgpt - Setup

set "BASE_DIR=%~dp0"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: May tinh chua cai Node.js. Vui long tai va cai dat Node.js truoc!
  pause
  exit /b 1
)

echo ====================================================
echo      CAI DAT THU VIEN CHO EDITVIDEOCHATGPT
echo ====================================================
echo.
echo [1/2] Dang cai dat thu vien cho Server...
cd /d "%BASE_DIR%server"
cmd /c "npm install --no-workspaces"
if not "%ERRORLEVEL%"=="0" goto :error

echo.
echo [2/2] Dang cai dat thu vien cho Remotion Engine...
cd /d "%BASE_DIR%engine"
cmd /c "npm install --no-workspaces"
if not "%ERRORLEVEL%"=="0" goto :error

echo.
echo ====================================================
echo CAI DAT THANH CONG!
echo Hay dong cua so nay va mo file run_dashboard.bat de su dung.
echo ====================================================
pause
exit /b 0

:error
echo.
echo ERROR: Qua trinh cai dat gap loi. Vui long kiem tra lai ket noi mang!
pause
exit /b 1