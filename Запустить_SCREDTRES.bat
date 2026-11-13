@echo off
chcp 65001 > nul
echo ===================================================
echo     SCREDTRES // DARKWEAR ARCHIVE TELEGRAM MINI APP
echo ===================================================
echo.
echo Запуск локального сервера разработки Vite...
echo Mini App будет доступен по адресу: http://localhost:3000
echo.
cd /d "%~dp0"
call npm run dev
pause
