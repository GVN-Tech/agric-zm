-- ==============================================================================
-- AGRI-LOVERS FARM PLATFORM - UNIFIED DATABASE SETUP SCRIPT
-- ==============================================================================
-- This script combines schema definition, optimization views, and initial setup.
-- Run this entire script in the Supabase SQL Editor to set up the database.
-- ==============================================================================

-- ==============================================================================
-- PART 1: CORE SCHEMA (Tables, Indexes, RLS)
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DATABASE postgres SET row_security = on;

-- ============================================
-- PROFILES TABLE (extends auth.users)
-- ============================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    province TEXT,
    district TEXT,
    farmer_type TEXT CHECK (farmer_type IN ('Smallholder', 'Commercial', 'Emerging', 'Investor')),
    crops TEXT, -- JSON array or comma-separated
    livestock TEXT, -- JSON array or comma-separated
    farm_size_ha NUMERIC(10, 2),
    avatar_url TEXT,
    bio TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for profiles
CREATE INDEX idx_profiles_province ON public.profiles(province);
CREATE INDEX idx_profiles_district ON public.profiles(district);
CREATE INDEX idx_profiles_farmer_type ON public.profiles(farmer_type);

-- ============================================
-- POSTS TABLE
-- ============================================
CREATE TABLE public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    crop_tags TEXT[], -- Array of crop tags
    location_province TEXT,
    location_district TEXT,
    image_urls TEXT[], -- Array of image URLs
    is_market_post BOOLEAN DEFAULT FALSE, -- For market-related posts
    market_type TEXT CHECK (market_type IN ('selling', 'buying', 'price_report', NULL)),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Indexes for posts
CREATE INDEX idx_posts_author ON public.posts(author_id);
CREATE INDEX idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX idx_posts_location_province ON public.posts(location_province);
CREATE INDEX idx_posts_location_district ON public.posts(location_district);
CREATE INDEX idx_posts_crop_tags ON public.posts USING GIN(crop_tags);
CREATE INDEX idx_posts_market ON public.posts(is_market_post) WHERE is_market_post = TRUE;

-- ============================================
-- POST LIKES TABLE
-- ============================================
CREATE TABLE public.post_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id) -- One like per user per post
);

CREATE INDEX idx_post_likes_post ON public.post_likes(post_id);
CREATE INDEX idx_post_likes_user ON public.post_likes(user_id);

-- ============================================
-- COMMENTS TABLE
-- ============================================
CREATE TABLE public.comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_comments_post ON public.comments(post_id);
CREATE INDEX idx_comments_author ON public.comments(author_id);
CREATE INDEX idx_comments_created_at ON public.comments(created_at);

-- ============================================
-- MARKETS TABLE (Physical market locations)
-- ============================================
CREATE TABLE public.markets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    province TEXT NOT NULL,
    district TEXT NOT NULL,
    location_details TEXT,
    latitude NUMERIC(10, 8),
    longitude NUMERIC(11, 8),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_markets_province ON public.markets(province);
CREATE INDEX idx_markets_district ON public.markets(district);

-- ============================================
-- PRICE REPORTS TABLE
-- ============================================
CREATE TABLE public.price_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    market_id UUID REFERENCES public.markets(id) ON DELETE SET NULL,
    crop_or_livestock TEXT NOT NULL,
    unit TEXT NOT NULL, -- kg, bag, head, etc.
    price_per_unit NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'ZMW',
    province TEXT,
    district TEXT,
    quality_grade TEXT, -- Grade A, B, etc.
    notes TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_reports_crop ON public.price_reports(crop_or_livestock);
CREATE INDEX idx_price_reports_province ON public.price_reports(province);
CREATE INDEX idx_price_reports_district ON public.price_reports(district);
CREATE INDEX idx_price_reports_created_at ON public.price_reports(created_at DESC);
CREATE INDEX idx_price_reports_market ON public.price_reports(market_id);

-- ============================================
-- GROUPS TABLE (Crop-based, Regional, Cooperatives)
-- ============================================
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    group_type TEXT CHECK (group_type IN ('crop', 'regional', 'cooperative', 'general')),
    crop_tag TEXT, -- For crop-based groups
    province TEXT, -- For regional groups
    district TEXT,
    is_public BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_type ON public.groups(group_type);
CREATE INDEX idx_groups_crop ON public.groups(crop_tag);
CREATE INDEX idx_groups_province ON public.groups(province);

-- ============================================
-- GROUP MEMBERS TABLE
-- ============================================
CREATE TABLE public.group_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('member', 'moderator', 'admin')) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON public.group_members(group_id);
CREATE INDEX idx_group_members_user ON public.group_members(user_id);

-- ============================================
-- CHATS TABLE (1-to-1 conversations)
-- ============================================
CREATE TABLE public.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user1_id, user2_id),
    CHECK (user1_id != user2_id)
);

CREATE INDEX idx_chats_user1 ON public.chats(user1_id);
CREATE INDEX idx_chats_user2 ON public.chats(user2_id);
CREATE INDEX idx_chats_last_message ON public.chats(last_message_at DESC NULLS LAST);

-- ============================================
-- MESSAGES TABLE
-- ============================================
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id UUID NOT NULL REFERENCES public.chats(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_chat ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- PROFILES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- POSTS
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Posts are viewable by everyone"
    ON public.posts FOR SELECT
    USING (deleted_at IS NULL);

CREATE POLICY "Users can insert their own posts"
    ON public.posts FOR INSERT
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own posts"
    ON public.posts FOR UPDATE
    USING (auth.uid() = author_id);

CREATE POLICY "Users can delete (soft delete) own posts"
    ON public.posts FOR UPDATE
    USING (auth.uid() = author_id);

-- COMMENTS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments are viewable by everyone"
    ON public.comments FOR SELECT
    USING (deleted_at IS NULL);

CREATE POLICY "Authenticated users can comment"
    ON public.comments FOR INSERT
    WITH CHECK (auth.uid() = author_id);

-- POST LIKES
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Likes are viewable by everyone"
    ON public.post_likes FOR SELECT
    USING (true);

CREATE POLICY "Authenticated users can like"
    ON public.post_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike"
    ON public.post_likes FOR DELETE
    USING (auth.uid() = user_id);

-- MARKETS & PRICE REPORTS
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Markets viewable by everyone" ON public.markets FOR SELECT USING (true);
CREATE POLICY "Price reports viewable by everyone" ON public.price_reports FOR SELECT USING (true);
CREATE POLICY "Auth users can add price reports" ON public.price_reports FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- GROUPS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public groups are viewable by everyone"
    ON public.groups FOR SELECT
    USING (is_public = TRUE OR EXISTS (
        SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid()
    ));

CREATE POLICY "Auth users can create groups"
    ON public.groups FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- GROUP MEMBERS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members viewable by group members"
    ON public.group_members FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.groups g WHERE g.id = group_id AND (g.is_public = TRUE OR g.created_by = auth.uid())
    ) OR user_id = auth.uid());

CREATE POLICY "Users can join public groups"
    ON public.group_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- CHATS & MESSAGES
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chats"
    ON public.chats FOR SELECT
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create chats"
    ON public.chats FOR INSERT
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can view messages in their chats"
    ON public.messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.chats c WHERE c.id = chat_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    ));

CREATE POLICY "Users can send messages to their chats"
    ON public.messages FOR INSERT
    WITH CHECK (auth.uid() = sender_id);


-- ==============================================================================
-- PART 2: OPTIMIZED VIEWS (Performance)
-- ==============================================================================

-- 1. POSTS WITH STATS VIEW
-- Solves N+1 problem for fetching posts with author info, likes count, comments count, and user_liked status
CREATE OR REPLACE VIEW public.posts_with_stats AS
SELECT 
    p.id,
    p.author_id,
    p.content,
    p.crop_tags,
    p.location_province,
    p.location_district,
    p.image_urls,
    p.is_market_post,
    p.market_type,
    p.created_at,
    p.updated_at,
    
    -- Author info (joined directly)
    pr.first_name,
    pr.last_name,
    pr.avatar_url,
    pr.province as author_province,
    pr.district as author_district,
    pr.farmer_type,

    -- Computed stats
    (SELECT COUNT(*)::int FROM public.post_likes pl WHERE pl.post_id = p.id) as likes_count,
    (SELECT COUNT(*)::int FROM public.comments c WHERE c.post_id = p.id AND c.deleted_at IS NULL) as comments_count,
    
    -- Current user context
    EXISTS (
        SELECT 1 FROM public.post_likes pl 
        WHERE pl.post_id = p.id AND pl.user_id = auth.uid()
    ) as user_liked

FROM 
    public.posts p
JOIN 
    public.profiles pr ON p.author_id = pr.id
WHERE 
    p.deleted_at IS NULL;

GRANT SELECT ON public.posts_with_stats TO anon, authenticated, service_role;

-- 2. GROUPS WITH STATS VIEW
-- Includes member counts and current user role
CREATE OR REPLACE VIEW public.groups_with_stats AS
SELECT 
    g.id,
    g.name,
    g.description,
    g.group_type,
    g.crop_tag,
    g.province,
    g.district,
    g.is_public,
    g.created_by,
    g.created_at,
    g.updated_at,
    
    -- Creator info
    pr.first_name as creator_first_name,
    pr.last_name as creator_last_name,
    pr.avatar_url as creator_avatar_url,

    -- Computed stats
    (SELECT COUNT(*)::int FROM public.group_members gm WHERE gm.group_id = g.id) as members_count,
    
    -- Current user membership (requires auth.uid())
    (SELECT role FROM public.group_members gm WHERE gm.group_id = g.id AND gm.user_id = auth.uid()) as user_role

FROM 
    public.groups g
JOIN 
    public.profiles pr ON g.created_by = pr.id;

GRANT SELECT ON public.groups_with_stats TO anon, authenticated, service_role;

-- 3. CHATS WITH META VIEW
-- Includes user details and unread counts
CREATE OR REPLACE VIEW public.chats_with_meta AS
SELECT 
    c.id,
    c.user1_id,
    c.user2_id,
    c.last_message_at,
    c.created_at,
    
    -- User 1 info
    u1.first_name as user1_first_name,
    u1.last_name as user1_last_name,
    u1.avatar_url as user1_avatar_url,
    u1.province as user1_province,
    
    -- User 2 info
    u2.first_name as user2_first_name,
    u2.last_name as user2_last_name,
    u2.avatar_url as user2_avatar_url,
    u2.province as user2_province,

    -- Unread count for the *current viewer* (auth.uid())
    (
        SELECT COUNT(*)::int 
        FROM public.messages m 
        WHERE m.chat_id = c.id 
        AND m.is_read = FALSE 
        AND m.sender_id != auth.uid() -- Only count messages sent by others
    ) as unread_count

FROM 
    public.chats c
JOIN 
    public.profiles u1 ON c.user1_id = u1.id
JOIN 
    public.profiles u2 ON c.user2_id = u2.id
WHERE
    c.user1_id = auth.uid() OR c.user2_id = auth.uid();

GRANT SELECT ON public.chats_with_meta TO authenticated, service_role;

-- ==============================================================================
-- PART 3: ADDITIONAL INDEXES (Performance Tuning)
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);

-- End of Script
