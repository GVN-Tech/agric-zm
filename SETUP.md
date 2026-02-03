# Agrilovers Setup Guide

## Step-by-Step Setup Instructions

### 1. Supabase Project Setup

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in:
   - **Name**: Agrilovers (or your choice)
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to Zambia (e.g., Europe West)
4. Wait for project to be created (~2 minutes)

### 2. Get Supabase Credentials

1. In your Supabase project dashboard
2. Go to **Settings** > **API**
3. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon public** key (starts with `eyJ...`)

### 3. Configure Application

1. Open `config/supabase-config.js`
2. Replace:
   ```javascript
   url: 'YOUR_SUPABASE_URL',
   anonKey: 'YOUR_SUPABASE_ANON_KEY',
   ```
3. With your actual values:
   ```javascript
   url: 'https://xxxxx.supabase.co',
   anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
   ```

### 4. Set Up Database

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Open `database/schema.sql` file
4. Copy ALL contents and run it
5. Open `database/optimization.sql` file
6. Copy ALL contents and run it (This creates performance views)
7. Wait for success message

### 5. Configure Authentication

1. In Supabase dashboard, go to **Authentication** > **Providers**
2. Enable **Email** provider:
   - Toggle "Enable Email provider"
   - Enable "Confirm email" (optional, recommended)
   - Save
3. (Optional) Enable **Phone** provider:
   - Toggle "Enable Phone provider"
   - Configure SMS provider (Twilio, etc.)
   - Save

### 6. Set Up Storage (Optional - for future image uploads)

1. Go to **Storage**
2. Create bucket: `avatars`
   - Public: Yes
   - File size limit: 2MB
3. Create bucket: `post-images`
   - Public: Yes
   - File size limit: 5MB

### 7. Test Locally

1. Use a local server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js
   npx serve
   
   # PHP
   php -S localhost:8000
   ```
2. Open `http://localhost:8000` in browser
3. Try to register/login
4. Check Supabase dashboard > **Authentication** > **Users** to see if user was created

### 8. Deploy to Production

#### Option A: Supabase Hosting (Recommended)
1. In Supabase dashboard, go to **Hosting**
2. Connect your GitHub repository
3. Deploy automatically

#### Option B: Traditional Web Hosting
1. Upload all files to your web server
2. Ensure HTTPS is enabled (required for PWA)
3. Set up domain name
4. Test all features

#### Option C: Netlify/Vercel
1. Connect GitHub repository
2. Build command: (none needed - static files)
3. Publish directory: `/`
4. Deploy

### 9. Verify Setup

Checklist:
- [ ] Database tables created (check Supabase > Table Editor)
- [ ] RLS policies active (check Supabase > Authentication > Policies)
- [ ] Authentication works (try login)
- [ ] Can create posts
- [ ] Can view feed
- [ ] PWA installable (check browser install prompt)

### 10. Seed Initial Data (Optional)

Run this SQL in Supabase SQL Editor to add sample markets:

```sql
INSERT INTO public.markets (name, province, district, is_active) VALUES
('Lusaka Central Market', 'Lusaka', 'Lusaka', TRUE),
('Kitwe Central Market', 'Copperbelt', 'Kitwe', TRUE),
('Ndola Central Market', 'Copperbelt', 'Ndola', TRUE),
('Livingstone Market', 'Southern', 'Livingstone', TRUE),
('Chipata Market', 'Eastern', 'Chipata', TRUE)
ON CONFLICT DO NOTHING;
```

## Troubleshooting

### "Failed to initialize app"
- Check Supabase config in `config/supabase-config.js`
- Verify URL and anon key are correct
- Check browser console for errors

### "User must be authenticated"
- Make sure you've logged in
- Check Supabase > Authentication > Users
- Try logging out and back in

### "RLS policy violation"
- Check RLS policies in Supabase dashboard
- Verify user is authenticated
- Check table policies match your use case

### PWA not installing
- Must be served over HTTPS
- Check `manifest.json` exists
- Verify service worker is registered
- Check browser console for errors

### Database errors
- Verify schema.sql ran successfully
- Check table names match code
- Verify RLS is enabled on tables

## Security Checklist

Before going live:
- [ ] Change default Supabase project settings
- [ ] Enable email confirmation (optional but recommended)
- [ ] Set up rate limiting (Supabase dashboard)
- [ ] Review RLS policies
- [ ] Enable HTTPS only
- [ ] Set up monitoring/alerts
- [ ] Backup database regularly

## Support

For issues:
1. Check browser console for errors
2. Check Supabase dashboard logs
3. Review RLS policies
4. Verify database schema matches code

---

**Ready to connect Zambian farmers!** 🌾


