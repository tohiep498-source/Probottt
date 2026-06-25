@echo off
title LuckyBank Launcher
color 0A
echo ===================================================
echo    KHOI DONG HE THONG LUCKYBANK - CHAY TU DONG
echo ===================================================
echo.

:: Check Node.js installation
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo ERROR: Node.js chua duoc cai dat!
    echo Vui long tai va cai dat Node.js tai https://nodejs.org/ truoc khi tiep tuc.
    echo.
    pause
    exit /b
)

:: Create .env if not exists
if not exist .env (
    echo [i] Dang sao chep file cau hinh .env tu mau mac dinh...
    copy .env.example .env >nul
)

:: Install dependencies if node_modules don't exist
if not exist node_modules (
    echo [i] Chua tim thay thu vien. Dang cai dat cac packages can thiet (npm install)...
    echo Co the mat 1-2 phut trong lan dau tien, vui long cho...
    call npm install
)

echo.
echo ===================================================
echo [OK] He thong da san sang!
echo Dang khoi dong may chu tai http://localhost:3000 ...
echo ===================================================
echo.

:: Open browser automatically
start http://localhost:3000

:: Start the server in dev mode
call npm run dev

pause
