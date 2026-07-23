@echo off
setlocal enabledelayedexpansion
cd /d c:\Users\tauhe\Desktop\trips\travel-social-frintend\client
set EAS_SKIP_AUTO_FINGERPRINT=1
echo Starting iOS Build and Auto-Submit to TestFlight...
npx eas-cli build --platform ios --profile production --auto-submit
pause

