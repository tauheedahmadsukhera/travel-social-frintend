@echo off
setlocal enabledelayedexpansion
cd /d C:\Users\Tauheed\Desktop\final\client
set EAS_SKIP_AUTO_FINGERPRINT=1
echo Starting Android Production APK Build...
eas build --platform android --profile production-apk
pause
