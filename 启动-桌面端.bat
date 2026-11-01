@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [万构] 清理占用 1420 端口的进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":1420" ^| findstr "LISTENING"') do (
  echo   taskkill PID %%p
  taskkill /F /PID %%p >nul 2>&1
)

echo [万构] 清理可能残留的桌面进程...
taskkill /F /IM wango.exe >nul 2>&1

echo [万构] 启动桌面端: npm run tauri:dev
echo 首次编译 Rust 会较慢，请等待窗口弹出。
echo.
call npm run tauri:dev
pause
