# Agrilovers - Zambian Farmers Network

A modern, production-ready social and market platform connecting Zambian farmers. Built with Supabase, designed for mobile-first, low-bandwidth environments.

## 🌾 Features

### Core Features
- **Farmer Social Feed** - Share knowledge, ask questions, connect with peers
- **Market Intelligence** - Community-reported prices, market information
- **Groups & Cooperatives** - Crop-based, regional, and cooperative groups
- **Real-time Messaging** - 1-to-1 chat between farmers
- **Authentication** - Email/Phone OTP login via Supabase Auth
- **Mobile-First Design** - Optimized for low-end Android devices
- **Offline Support** - PWA with service worker caching
- **Row Level Security** - Secure data access with RLS policies

## 🚀 Quick Start

### Prerequisites
- A Supabase account (free tier works)
- A web server (or use Supabase hosting)

### Setup Steps

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note your project URL and anon key

2. **Configure Supabase**
   - Open `config/supabase-config.js`
   - Replace `YOUR_SUPABASE_URL` with your project URL
   - Replace `YOUR_SUPABASE_ANON_KEY` with your anon key

3. **Set Up Database**
   - In Supabase Dashboard, go to SQL Editor
   - Copy and paste the contents of `database/schema.sql`
   - Run the SQL script to create all tables and policies

4. **Enable Authentication**
   - In Supabase Dashboard, go to Authentication > Providers
   - Enable Email provider (OTP)
   - Optionally enable Phone provider for SMS OTP

5. **Deploy**
   - Upload all files to your web server
   - Ensure HTTPS is enabled (required for PWA)
   - Access via your domain

## 📁 Project Structure

```
AgriLoversFarm/
├── index.html              # Main HTML file
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker
├── config/
│   └── supabase-config.js  # Supabase configuration
├── css/
│   └── styles.css         # Main stylesheet
├── js/
│   ├── app.js             # Main application controller
│   ├── auth.js            # Authentication module
│   ├── posts.js           # Posts/social feed module
│   ├── market.js          # Market intelligence module
│   ├── groups.js          # Groups & cooperatives module
│   └── messaging.js       # Messaging module
├── database/
│   └── schema.sql         # Database schema
└── README.md              # This file
```

## 🗄️ Database Schema

The database includes:
- `profiles` - User profiles (extends auth.users)
- `posts` - Social feed posts
- `post_likes` - Post likes
- `comments` - Post comments
- `markets` - Physical market locations
- `price_reports` - Community price reports
- `groups` - Groups and cooperatives
- `group_members` - Group membership
- `chats` - 1-to-1 conversations
- `messages` - Chat messages
- `blocked_users` - User blocking
- `reports` - Content/user reporting

All tables have Row Level Security (RLS) enabled with appropriate policies.

## 🎨 Design System

### Colors
- **Primary**: Navy Blue (#1e3a5f) & Sky Blue (#4a90e2)
- **Secondary**: Agricultural Green (#2d5016)
- **Neutral**: Gray scale for text and backgrounds

### Typography
- System font stack for performance
- Responsive font sizes
- Clear hierarchy

### Components
- Large tap targets (min 44x44px)
- Icons + text labels
- Clear empty states
- Optimistic, friendly tone

## 📱 PWA Features

- **Installable** - Can be installed on home screen
- **Offline Support** - Caches static assets
- **App-like Experience** - Standalone display mode
- **Fast Loading** - Service worker caching

## 🔒 Security

- Row Level Security (RLS) on all tables
- Users can only access/modify their own data
- Secure authentication via Supabase Auth
- Input sanitization and XSS prevention
- HTTPS required for production

## 🌍 Localization Ready

The platform is designed to support multiple languages:
- English (current)
- Can be extended to Bemba, Nyanja, Tonga, etc.

## 📊 Performance Optimizations

- Minimal JavaScript (vanilla JS, no frameworks)
- CSS-only animations
- Lazy loading for images (future)
- Efficient database queries with indexes
- Cached static assets

## 🚧 Future Enhancements

- Image uploads (Supabase Storage)
- SMS gateway integration
- Push notifications
- Advanced search and filters
- Price trend charts
- Group posts/feeds
- Video/voice messages
- Multi-language support

## 📝 Development Notes

### Adding New Features

1. Create module in `js/` directory
2. Add to `index.html` script tags
3. Initialize in `app.js`
4. Update database schema if needed
5. Add RLS policies for new tables

### Testing

- Test on actual mobile devices
- Test with slow 3G connection
- Test offline functionality
- Verify RLS policies work correctly

## 🤝 Contributing

This is a production platform. All changes should:
- Maintain security (RLS policies)
- Be mobile-first
- Work offline
- Follow existing code style
- Be tested thoroughly

## 📄 License

[Add your license here]

## 🙏 Acknowledgments

Built for Zambian farmers to connect, share knowledge, and access fair markets.

---

**Built with ❤️ for Zambian Farmers**


