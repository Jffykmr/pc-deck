@echo off
rem Supervisor for the PC Deck process. Started hidden at logon by the Startup
rem folder shortcut (PCDeckHostAgent.vbs). The agent writes its own rotating
rem log to deck.log; this file only records starts and unexpected exits.
cd /d "%~dp0"
:loop
echo [%date% %time%] deck starting >> "launcher.log"
".venv\Scripts\pythonw.exe" "agent.py"
echo [%date% %time%] deck exited with code %errorlevel%, restarting in 3s >> "launcher.log"
timeout /t 3 /nobreak >nul
goto loop
