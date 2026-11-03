@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where cargo >nul 2>&1
if errorlevel 1 (
  echo [万构] 找不到 cargo。请先安装 Rust：https://rustup.rs/
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo [万构] 找不到 node。请先安装 Node.js 18+。
  pause
  exit /b 1
)

echo [万构] 清理可能占用构建锁的进程...
taskkill /F /IM wango.exe >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":1420" ^| findstr "LISTENING"') do (
  echo   结束占用 1420 的 PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
taskkill /F /IM cargo.exe >nul 2>&1
taskkill /F /IM rustc.exe >nul 2>&1
taskkill /F /IM rust-analyzer.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [万构] 开始打安装包: npm run tauri:build:installer
echo 比绿色版更久，请勿关窗。
echo.

call npm run tauri:build:installer
if errorlevel 1 (
  echo.
  echo [万构] 打包失败，请上翻看错误。
  echo 若仍提示 file lock：关掉其它「打包 / 启动-桌面端」窗口后再试。
  pause
  exit /b 1
)

echo.
echo [万构] 完成。安装包一般在：
echo   %~dp0src-tauri\target\release\bundle\
echo.
if exist "%~dp0src-tauri\target\release\bundle" (
  explorer "%~dp0src-tauri\target\release\bundle"
)
pause
