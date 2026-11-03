@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 保证能找到 cargo / rustc（新开 cmd 有时没进 PATH）
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

where cargo >nul 2>&1
if errorlevel 1 (
  echo [万构] 找不到 cargo。请先安装 Rust：https://rustup.rs/
  echo 安装后重新打开本窗口再运行。
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
REM 正在跑的万构桌面端
taskkill /F /IM wango.exe >nul 2>&1
REM 开发态占用 1420 的前端/tauri
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":1420" ^| findstr "LISTENING"') do (
  echo   结束占用 1420 的 PID %%p
  taskkill /F /PID %%p >nul 2>&1
)
REM 其它 cargo / rustc 会锁 target 目录（仅本机构建万构时建议关其它 Rust 编译）
taskkill /F /IM cargo.exe >nul 2>&1
taskkill /F /IM rustc.exe >nul 2>&1
taskkill /F /IM rust-analyzer.exe >nul 2>&1
REM 等锁文件释放
timeout /t 2 /nobreak >nul

echo [万构] cargo:
cargo -V
echo [万构] node:
node -v
echo.
echo [万构] 开始打包绿色版（无安装包）: npm run tauri:build
echo 首次 / 大改后会较久，请勿关窗。
echo.

call npm run tauri:build
if errorlevel 1 (
  echo.
  echo [万构] 打包失败，请上翻看错误。
  echo 若仍提示 file lock：关掉其它「打包 / 启动-桌面端」窗口后再试。
  pause
  exit /b 1
)

echo.
echo [万构] 完成。可执行文件一般在：
echo   %~dp0src-tauri\target\release\wango.exe
echo.
if exist "%~dp0src-tauri\target\release\wango.exe" (
  explorer /select,"%~dp0src-tauri\target\release\wango.exe"
)
pause
