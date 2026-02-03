@echo off
echo ========================================
echo   Starting Agrilovers Server
echo ========================================
echo.
echo Server starting on http://localhost:8000
echo.
echo Keep this window open while using the app
echo Press Ctrl+C to stop the server
echo.
cd /d "%~dp0"
echo Generating runtime config...
python generate_env.py
python -m http.server 8000

