# How to Preview Agrilovers

## Quick Preview (Before Supabase Setup)

You can preview the UI and structure, but features won't work until Supabase is configured.

### Option 1: Simple HTTP Server

**Python 3:**
```bash
# Navigate to project folder
cd AgriLoversFarm

# Start server
python -m http.server 8000

# Open browser to:
# http://localhost:8000
```

**Node.js:**
```bash
# Install serve globally (if not installed)
npm install -g serve

# Navigate to project folder
cd AgriLoversFarm

# Start server
serve

# Or specify port:
serve -p 8000
```

**PHP:**
```bash
# Navigate to project folder
cd AgriLoversFarm

# Start server
php -S localhost:8000
```

**VS Code Live Server:**
1. Install "Live Server" extension
2. Right-click `index.html`
3. Select "Open with Live Server"

### Option 2: Direct File Open (Limited)

You can open `index.html` directly in your browser, but:
- ⚠️ Some features may not work (CORS issues)
- ⚠️ Service worker won't register
- ⚠️ Supabase won't connect without HTTPS (in some cases)

## Full Preview (With Supabase)

For full functionality, you need Supabase configured:

### Step 1: Set Up Supabase (5 minutes)

1. Go to [supabase.com](https://supabase.com)
2. Create account/login
3. Create new project
4. Wait for project to be ready (~2 minutes)

### Step 2: Get Credentials

1. In Supabase dashboard → Settings → API
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key

### Step 3: Configure App

1. Open `config/supabase-config.js`
2. Replace:
   ```javascript
   url: 'YOUR_SUPABASE_URL',
   anonKey: 'YOUR_SUPABASE_ANON_KEY',
   ```
3. With your actual values

### Step 4: Set Up Database

1. In Supabase dashboard → SQL Editor
2. Open `database/schema.sql`
3. Copy ALL contents
4. Paste into SQL Editor
5. Click **Run**

### Step 5: Enable Authentication

1. In Supabase dashboard → Authentication → Providers
2. Enable **Email** provider
3. Save

### Step 6: Preview

1. Start local server (see Option 1 above)
2. Open `http://localhost:8000`
3. Try to register/login
4. Test features!

## What You'll See

### Without Supabase Configured:
- ✅ Beautiful UI loads
- ✅ Navigation works
- ✅ Views switch
- ❌ Login won't work
- ❌ Posts won't load
- ❌ Database errors in console

### With Supabase Configured:
- ✅ Everything works!
- ✅ Login/Register
- ✅ Create posts
- ✅ View feed
- ✅ Market prices
- ✅ Groups
- ✅ Messaging

## Troubleshooting Preview

### "Failed to initialize app"
- Check browser console (F12)
- Verify Supabase config is correct
- Check network tab for API errors

### "CORS error"
- Use a local server (not file://)
- Check Supabase CORS settings
- Verify Supabase URL is correct

### "Service worker registration failed"
- Must use HTTP server (not file://)
- HTTPS preferred (but HTTP works locally)
- Check browser console for errors

### Blank page
- Check browser console for errors
- Verify all files are in correct locations
- Check network tab for failed file loads

## Browser Compatibility

Tested and works on:
- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile browsers (Android/iOS)

## Quick Test Checklist

After setup, test:
- [ ] Page loads without errors
- [ ] Can click "Account" button
- [ ] Login modal appears
- [ ] Can enter email/phone
- [ ] OTP form appears (after sending)
- [ ] Can create profile
- [ ] Can view feed
- [ ] Can create post
- [ ] Can like post
- [ ] Can add comment

## Production Preview

For production-like preview:
1. Deploy to Netlify/Vercel (free)
2. Or use Supabase Hosting
3. Or use your own server with HTTPS

---

**Quick Start:** Run `python -m http.server 8000` and open `http://localhost:8000` 🌾

