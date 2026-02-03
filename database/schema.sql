-- Agrilovers Supabase Database Schema
-- Production-ready schema for Zambian farmers platform

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

CREATE INDEX idx_messages_chat ON public.messages(chat_id, created_at);
CREATE INDEX idx_messages_sender ON public.messages(sender_id);
CREATE INDEX idx_messages_unread ON public.messages(is_read) WHERE is_read = FALSE;

-- ============================================
-- BLOCKED USERS TABLE
-- ============================================
CREATE TABLE public.blocked_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_blocked_blocker ON public.blocked_users(blocker_id);
CREATE INDEX idx_blocked_blocked ON public.blocked_users(blocked_id);

-- ============================================
-- REPORTS TABLE (for reporting inappropriate content/users)
-- ============================================
CREATE TABLE public.reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_type TEXT CHECK (reported_type IN ('user', 'post', 'comment', 'message')),
    reported_id UUID NOT NULL,
    reason TEXT NOT NULL,
    status TEXT CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reports_status ON public.reports(status);
CREATE INDEX idx_reports_reporter ON public.reports(reporter_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES RLS POLICIES
-- ============================================
-- Anyone can read profiles
CREATE POLICY "Profiles are viewable by everyone"
    ON public.profiles FOR SELECT
    USING (true);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- ============================================
-- POSTS RLS POLICIES
-- ============================================
-- Anyone can read non-deleted posts
CREATE POLICY "Posts are viewable by everyone"
    ON public.posts FOR SELECT
    USING (deleted_at IS NULL);

-- Users can create posts
CREATE POLICY "Users can create posts"
    ON public.posts FOR INSERT
    WITH CHECK (auth.uid() = author_id);

-- Users can update their own posts
CREATE POLICY "Users can update own posts"
    ON public.posts FOR UPDATE
    USING (auth.uid() = author_id AND deleted_at IS NULL);

-- Users can soft-delete their own posts
CREATE POLICY "Users can delete own posts"
    ON public.posts FOR UPDATE
    USING (auth.uid() = author_id)
    WITH CHECK (deleted_at IS NOT NULL);

-- ============================================
-- POST LIKES RLS POLICIES
-- ============================================
-- Anyone can read likes
CREATE POLICY "Likes are viewable by everyone"
    ON public.post_likes FOR SELECT
    USING (true);

-- Users can like posts
CREATE POLICY "Users can like posts"
    ON public.post_likes FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can unlike their own likes
CREATE POLICY "Users can unlike posts"
    ON public.post_likes FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- COMMENTS RLS POLICIES
-- ============================================
-- Anyone can read non-deleted comments
CREATE POLICY "Comments are viewable by everyone"
    ON public.comments FOR SELECT
    USING (deleted_at IS NULL);

-- Users can create comments
CREATE POLICY "Users can create comments"
    ON public.comments FOR INSERT
    WITH CHECK (auth.uid() = author_id);

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
    ON public.comments FOR UPDATE
    USING (auth.uid() = author_id AND deleted_at IS NULL);

-- Users can delete their own comments
CREATE POLICY "Users can delete own comments"
    ON public.comments FOR UPDATE
    USING (auth.uid() = author_id)
    WITH CHECK (deleted_at IS NOT NULL);

-- ============================================
-- MARKETS RLS POLICIES
-- ============================================
-- Anyone can read active markets
CREATE POLICY "Markets are viewable by everyone"
    ON public.markets FOR SELECT
    USING (is_active = TRUE);

-- ============================================
-- PRICE REPORTS RLS POLICIES
-- ============================================
-- Anyone can read price reports
CREATE POLICY "Price reports are viewable by everyone"
    ON public.price_reports FOR SELECT
    USING (true);

-- Users can create price reports
CREATE POLICY "Users can create price reports"
    ON public.price_reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

-- Users can update their own price reports
CREATE POLICY "Users can update own price reports"
    ON public.price_reports FOR UPDATE
    USING (auth.uid() = reporter_id);

-- ============================================
-- GROUPS RLS POLICIES
-- ============================================
-- Anyone can read public groups
CREATE POLICY "Public groups are viewable by everyone"
    ON public.groups FOR SELECT
    USING (is_public = TRUE OR created_by = auth.uid());

-- Users can create groups
CREATE POLICY "Users can create groups"
    ON public.groups FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Group creators and admins can update
CREATE POLICY "Group creators can update groups"
    ON public.groups FOR UPDATE
    USING (
        created_by = auth.uid() OR
        EXISTS (
            SELECT 1 FROM public.group_members
            WHERE group_id = groups.id
            AND user_id = auth.uid()
            AND role IN ('admin', 'moderator')
        )
    );

-- ============================================
-- GROUP MEMBERS RLS POLICIES
-- ============================================
-- Anyone can read group memberships
CREATE POLICY "Group memberships are viewable by everyone"
    ON public.group_members FOR SELECT
    USING (true);

-- Users can join groups
CREATE POLICY "Users can join groups"
    ON public.group_members FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can leave groups
CREATE POLICY "Users can leave groups"
    ON public.group_members FOR DELETE
    USING (auth.uid() = user_id);

-- ============================================
-- CHATS RLS POLICIES
-- ============================================
-- Users can only see chats they're part of
CREATE POLICY "Users can view own chats"
    ON public.chats FOR SELECT
    USING (user1_id = auth.uid() OR user2_id = auth.uid());

-- Users can create chats
CREATE POLICY "Users can create chats"
    ON public.chats FOR INSERT
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- ============================================
-- MESSAGES RLS POLICIES
-- ============================================
-- Users can only see messages in their chats
CREATE POLICY "Users can view messages in own chats"
    ON public.messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = messages.chat_id
            AND (chats.user1_id = auth.uid() OR chats.user2_id = auth.uid())
        )
    );

-- Users can send messages in their chats
CREATE POLICY "Users can send messages"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = messages.chat_id
            AND (chats.user1_id = auth.uid() OR chats.user2_id = auth.uid())
        )
    );

-- Users can update read status of messages they received
CREATE POLICY "Users can mark messages as read"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = messages.chat_id
            AND (chats.user1_id = auth.uid() OR chats.user2_id = auth.uid())
            AND chats.user1_id != messages.sender_id
            AND chats.user2_id != messages.sender_id
        )
    );

-- ============================================
-- BLOCKED USERS RLS POLICIES
-- ============================================
-- Users can only see blocks they created
CREATE POLICY "Users can view own blocks"
    ON public.blocked_users FOR SELECT
    USING (blocker_id = auth.uid());

-- Users can block others
CREATE POLICY "Users can block others"
    ON public.blocked_users FOR INSERT
    WITH CHECK (blocker_id = auth.uid());

-- Users can unblock
CREATE POLICY "Users can unblock"
    ON public.blocked_users FOR DELETE
    USING (blocker_id = auth.uid());

-- ============================================
-- REPORTS RLS POLICIES
-- ============================================
-- Users can only see their own reports
CREATE POLICY "Users can view own reports"
    ON public.reports FOR SELECT
    USING (reporter_id = auth.uid());

-- Users can create reports
CREATE POLICY "Users can create reports"
    ON public.reports FOR INSERT
    WITH CHECK (auth.uid() = reporter_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update chat last_message_at
CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chats
    SET last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_chat_timestamp AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_chat_last_message();

-- Function to get user's avatar initials
CREATE OR REPLACE FUNCTION get_avatar_initials(profile_row public.profiles)
RETURNS TEXT AS $$
BEGIN
    RETURN UPPER(LEFT(profile_row.first_name, 1) || LEFT(profile_row.last_name, 1));
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEED DATA (Optional - for initial setup)
-- ============================================

-- Insert some default markets
INSERT INTO public.markets (name, province, district, is_active) VALUES
('Lusaka Central Market', 'Lusaka', 'Lusaka', TRUE),
('Kitwe Central Market', 'Copperbelt', 'Kitwe', TRUE),
('Ndola Central Market', 'Copperbelt', 'Ndola', TRUE),
('Livingstone Market', 'Southern', 'Livingstone', TRUE),
('Chipata Market', 'Eastern', 'Chipata', TRUE);

-- Create some default groups
-- Note: These will be created after profiles exist, so this is just a template
-- INSERT INTO public.groups (name, description, group_type, crop_tag, is_public, created_by)
-- VALUES
-- ('Maize Farmers Zambia', 'Connect with maize farmers across Zambia', 'crop', 'Maize', TRUE, 'user-uuid-here'),
-- ('Central Province Farmers', 'Farmers in Central Province', 'regional', NULL, TRUE, 'user-uuid-here');


