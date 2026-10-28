@echo off
chcp 65001 >nul
title Türkdc - Site Versiyonu
color 0B

echo ===============================================
echo    🌐 Türkdc Site Versiyonu Başlatılıyor...
echo ===============================================
echo.

cd /d "%~dp0"

:: Bağımlılıklar kurulu mu kontrol et
if not exist "node_modules" (
    echo 📦 Bağımlılıklar kuruluyor... ^(ilk seferde^)
    echo.
    npm install
    echo.
)

echo 🚀 Sunucu başlatılıyor...
echo.
echo    Tarayıcınızda açın: http://localhost:3000
echo    Kapatmak için bu pencereyi kapatın.
echo ===============================================
echo.

node server.js

pause
