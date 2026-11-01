@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo [万构] 清理占用 1420 端口的进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":1420" ^| findstr "LISTENING"') do (
  echo   taskkill PID %%p
  taskkill /F /PID %%p >nul 2>&1
)

echo [万构] 仅浏览器预览（不开桌面窗口）
echo 打开 http://127.0.0.1:1420/
echo 要桌面端请用 启动-桌面端.bat
echo.
call npm run dev
pause
