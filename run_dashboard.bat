@echo off
setlocal
title editvideochatgpt - Launcher

:: Tu dong nhan dien thu muc chua file .bat nay tren bat ky may tinh nao
set "BASE_DIR=%~dp0"
set "SERVER=%BASE_DIR%server"
set "REMOTION=%BASE_DIR%engine"
set "PORT=3001"

where node.exe >nul 2>&1
if errorlevel 1 (
  echo ERROR: Khong tim thay Node.js trong PATH. Vui long cai dat Node.js truoc.
  goto :failed
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo ERROR: Khong tim thay npm trong PATH.
  goto :failed
)

if not exist "%SERVER%\index.js" (
  echo ERROR: Khong tim thay %SERVER%\index.js
  goto :failed
)

if not exist "%REMOTION%\package.json" (
  echo ERROR: Khong tim thay %REMOTION%\package.json
  goto :failed
)

:: Kiem tra xem da chay setup.bat chua
if not exist "%BASE_DIR%node_modules" (
  echo ERROR: Chua cai dat thu vien! Vui long chay file setup.bat truoc.
  goto :failed
)

call :portBusy 3001
if errorlevel 1 (
  echo Dang khoi dong Server API...
  start "LOG - Server API 3001" /D "%SERVER%" cmd /k "node index.js"
) else (
  echo Cong 3001 dang duoc su dung. Se kiem tra API.
)

call :portBusy 3000
if errorlevel 1 (
  echo Dang khoi dong Remotion Studio...
  start "LOG - Remotion 3000" /D "%BASE_DIR%" cmd /k "npm run dev --workspace=engine -- --port=3000 --no-open"
) else (
  echo Cong 3000 dang duoc su dung. Se kiem tra Studio.
)

echo.
echo Dang cho API va Studio san sang, toi da khoang 60 giay...

powershell.exe -NoProfile -Command ^
  "$timer = [Diagnostics.Stopwatch]::StartNew();" ^
  "while ($timer.Elapsed.TotalSeconds -lt 60) {" ^
  "  try {" ^
  "    $api = Invoke-RestMethod 'http://127.0.0.1:3001/api/state' -TimeoutSec 2;" ^
  "    if ($null -eq $api.scenes -or $null -eq $api.config) { throw 'API sai dinh dang' };" ^
  "    $studio = Invoke-WebRequest 'http://localhost:3000/MyComposition' -UseBasicParsing -TimeoutSec 2;" ^
  "    if ($studio.StatusCode -eq 200) { exit 0 };" ^
  "  } catch {};" ^
  "  Start-Sleep -Seconds 1;" ^
  "}; exit 1"

if errorlevel 1 (
  echo.
  echo ERROR: API hoac Studio chua san sang.
  echo Kiem tra hai cua so LOG; cong 3000/3001 co the bi ung dung khac chiem.
  goto :failed
)

echo He thong san sang. Dang mo Dashboard...
start "" "http://127.0.0.1:3001"
endlocal
exit /b 0

:portBusy
powershell.exe -NoProfile -Command ^
  "if (Get-NetTCPConnection -LocalPort %1 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
exit /b %errorlevel%

:failed
echo.
pause
endlocal
exit /b 1
