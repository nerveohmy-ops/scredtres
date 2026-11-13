@echo off
chcp 65001 > nul
echo ===================================================
echo       SCREDTRES // TELEGRAM BOT DAEMON
echo ===================================================
echo.
echo Запуск бота @scredtres_bot...
echo Бот слушает команды /start и принимает заказы из Mini App.
echo.
cd /d "%~dp0"
node bot.js
pause
