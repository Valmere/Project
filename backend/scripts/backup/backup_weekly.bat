@echo off
REM ════════════════════════════════════════════════════════════════════
REM  Lanceur hebdomadaire — Valmere & Co
REM ════════════════════════════════════════════════════════════════════
REM  Ce fichier sera exécuté par le Planificateur de tâches Windows
REM  une fois par semaine (par exemple chaque dimanche soir).
REM ════════════════════════════════════════════════════════════════════

setlocal
set "SCRIPT_DIR=%~dp0"
set "PYTHON=C:\Users\rdameus.AIC\Projects\valmere-investor-portal\backend\venv\Scripts\python.exe"
set "LOG_FILE=%SCRIPT_DIR%backup_weekly.log"

echo. >> "%LOG_FILE%"
echo ================================================================ >> "%LOG_FILE%"
echo Sauvegarde WEEKLY lancée le %date% à %time% >> "%LOG_FILE%"
echo ================================================================ >> "%LOG_FILE%"

"%PYTHON%" "%SCRIPT_DIR%backup_valmere.py" --weekly >> "%LOG_FILE%" 2>&1

if %ERRORLEVEL% NEQ 0 (
    echo ECHEC (code %ERRORLEVEL%) >> "%LOG_FILE%"
    exit /b %ERRORLEVEL%
)

echo Termine OK >> "%LOG_FILE%"
endlocal
