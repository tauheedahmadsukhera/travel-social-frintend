@echo off
setlocal enabledelayedexpansion
cd /d C:\Users\Tauheed\Desktop\final\client
set EAS_SKIP_AUTO_FINGERPRINT=1
echo Starting iOS Build and Auto-Submit to TestFlight...
eas build --platform ios --profile production --auto-submit
pause
