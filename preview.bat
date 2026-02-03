@echo off
echo ========================================
echo   Agrilovers Preview Server
echo ========================================
echo.
echo Starting local server...
echo.
echo Open your browser to: http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.
echo Generating runtime config...
python generate_env.py
python -m http.server 8000
pause

