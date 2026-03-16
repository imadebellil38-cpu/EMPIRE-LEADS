@echo off
title ProspectHunter SaaS
echo Arret des anciens serveurs...
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul
cd /d "C:\Users\imade\Desktop\Nouveau dossier"
echo.
echo  Demarrage de ProspectHunter...
echo  Acces : http://localhost:3000
echo  Pour arreter : ferme cette fenetre
echo.
node server.js
echo.
echo SERVEUR ARRETE
pause
