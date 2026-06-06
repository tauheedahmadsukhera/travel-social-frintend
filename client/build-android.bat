@echo off
setlocal enabledelayedexpansion
cd /d C:\Users\Tauheed\Desktop\final\client
set EAS_SKIP_AUTO_FINGERPRINT=1
eas build --platform android --profile production
pause
