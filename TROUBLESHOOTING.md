# Troubleshooting Guide

## Error Code -102: Connection Refused

This error means the server isn't running. Here's how to fix it:

### Solution 1: Start the Server (Recommended)

**Option A: Double-click the batch file**
1. Double-click `START_SERVER.bat`
2. Keep the window open
3. Open browser to `http://localhost:8000`

**Option B: Command Line**
1. Open PowerShell or Command Prompt in the project folder
2. Run: `python -m http.server 8000`
3. Keep the window open
4. Open browser to `http://localhost:8000`

### Solution 2: Use VS Code Live Server

1. Install "Live Server" extension in VS Code
2. Right-click `index.html`
3. Select "Open with Live Server"

### Solution 3: Use Node.js (if Python doesn't work)

1. Install Node.js from nodejs.org
2. Run: `npx serve -p 8000`
3. Open browser to `http://localhost:8000`

### Solution 4: Use PHP (if installed)

1. Run: `php -S localhost:8000`
2. Open browser to `http://localhost:8000`

## Common Issues

### Port 8000 Already in Use

If you get "Address already in use":
- Use a different port: `python -m http.server 8080`
- Then open: `http://localhost:8080`

### Python Not Found

If Python isn't installed:
1. Download from python.org
2. Or use Node.js: `npx serve`
3. Or use VS Code Live Server

### Browser Shows "Can't Connect"

1. Make sure server is running (check the terminal window)
2. Make sure you're using `http://localhost:8000` (not https)
3. Try `http://127.0.0.1:8000` instead

### Files Not Loading

1. Make sure you're in the project root folder
2. Check that `index.html` exists
3. Check browser console (F12) for errors

## Quick Test

1. Start server: `python -m http.server 8000`
2. Open browser: `http://localhost:8000`
3. You should see the Agrilovers page

---

**Need help?** Make sure the server window stays open while browsing!

