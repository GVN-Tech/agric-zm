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

CREATE TABLE public.group_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_join_requests_group ON public.group_join_requests(group_id);
CREATE INDEX idx_group_join_requests_user ON public.group_join_requests(user_id);
CREATE INDEX idx_group_join_requests_status ON public.group_join_requests(status);
CREATE INDEX idx_group_join_requests_requested_at ON public.group_join_requests(requested_at DESC);

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
-- FRIEND REQUESTS & FRIENDSHIPS
-- ============================================
CREATE TABLE public.friend_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('pending', 'accepted', 'declined', 'canceled')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ,
    UNIQUE(requester_id, receiver_id),
    CHECK (requester_id != receiver_id)
);

CREATE INDEX idx_friend_requests_requester ON public.friend_requests(requester_id);
CREATE INDEX idx_friend_requests_receiver ON public.friend_requests(receiver_id);
CREATE INDEX idx_friend_requests_receiver_status_created ON public.friend_requests(receiver_id, status, created_at DESC);

CREATE TABLE public.friendships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    friend_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, friend_id),
    CHECK (user_id != friend_id)
);

CREATE INDEX idx_friendships_user ON public.friendships(user_id);
CREATE INDEX idx_friendships_friend ON public.friendships(friend_id);

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
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    data JSONB DEFAULT '{}'::jsonb,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_recipient_created_at ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX idx_notifications_recipient_is_read ON public.notifications(recipient_id, is_read);

-- ============================================
-- STORIES TABLE (24-hour crop and harvest updates)
-- ============================================
CREATE TABLE public.stories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    caption TEXT,
    crop_tags TEXT[],
    location_province TEXT,
    location_district TEXT,
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stories_author ON public.stories(author_id);
CREATE INDEX idx_stories_expires ON public.stories(expires_at);
CREATE INDEX idx_stories_created_at ON public.stories(created_at DESC);
CREATE INDEX idx_stories_crop_tags ON public.stories USING GIN(crop_tags);

-- ============================================
-- STORY VIEWS TABLE
-- ============================================
CREATE TABLE public.story_views (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    story_id UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
    viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(story_id, viewer_id)
);

CREATE INDEX idx_story_views_story ON public.story_views(story_id);
CREATE INDEX idx_story_views_viewer ON public.story_views(viewer_id);

-- ============================================
-- GROUP MESSAGES TABLE (for group chats)
-- ============================================
CREATE TABLE public.group_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    attachment_url TEXT,
    attachment_type TEXT CHECK (attachment_type IN ('image', 'video', 'document', 'audio')),
    is_read_by JSONB DEFAULT '[]'::jsonb, -- Array of user IDs who read the message
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_group_messages_group ON public.group_messages(group_id, created_at);
CREATE INDEX idx_group_messages_sender ON public.group_messages(sender_id);

-- ============================================
-- MESSAGE ATTACHMENTS TABLE (for file sharing)
-- ============================================
CREATE TABLE public.message_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    group_message_id UUID REFERENCES public.group_messages(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (message_id IS NOT NULL OR group_message_id IS NOT NULL)
);

CREATE INDEX idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX idx_message_attachments_group_message ON public.message_attachments(group_message_id);

-- ============================================
-- SEARCH HISTORY TABLE (for enhanced search)
-- ============================================
CREATE TABLE public.search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    search_type TEXT CHECK (search_type IN ('farmer', 'crop', 'market', 'post', 'group')),
    filters JSONB DEFAULT '{}'::jsonb,
    result_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_history_user ON public.search_history(user_id, created_at DESC);
CREATE INDEX idx_search_history_query ON public.search_history USING GIN(query gin_trgm_ops);
CREATE INDEX idx_search_history_type ON public.search_history(search_type);

-- Enable trigram extension for better text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

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
ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
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
    USING (
        is_public = TRUE
        OR auth.role() = 'authenticated'
    );

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
CREATE POLICY "Users can insert group memberships"
    ON public.group_members FOR INSERT
    WITH CHECK (
        (
            auth.uid() = user_id
            AND EXISTS (
                SELECT 1 FROM public.groups g
                WHERE g.id = group_id
                AND g.is_public = TRUE
            )
        )
        OR EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_id
            AND g.created_by = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = group_id
            AND gm.user_id = auth.uid()
            AND gm.role IN ('admin', 'moderator')
        )
    );

-- Users can leave groups
CREATE POLICY "Users can leave groups"
    ON public.group_members FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can request to join private groups"
    ON public.group_join_requests FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_id
            AND g.is_public = FALSE
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = group_id
            AND gm.user_id = auth.uid()
        )
        AND status = 'pending'
        AND decided_by IS NULL
        AND decided_at IS NULL
    );

CREATE POLICY "Users and admins can view join requests"
    ON public.group_join_requests FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_id
            AND (
                g.created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.group_members gm
                    WHERE gm.group_id = group_id
                    AND gm.user_id = auth.uid()
                    AND gm.role IN ('admin', 'moderator')
                )
            )
        )
    );

CREATE POLICY "Admins can decide join requests"
    ON public.group_join_requests FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_id
            AND (
                g.created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.group_members gm
                    WHERE gm.group_id = group_id
                    AND gm.user_id = auth.uid()
                    AND gm.role IN ('admin', 'moderator')
                )
            )
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.groups g
            WHERE g.id = group_id
            AND (
                g.created_by = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.group_members gm
                    WHERE gm.group_id = group_id
                    AND gm.user_id = auth.uid()
                    AND gm.role IN ('admin', 'moderator')
                )
            )
        )
        AND decided_by = auth.uid()
        AND (
            (status = 'pending' AND decided_at IS NULL)
            OR (status IN ('approved', 'rejected') AND decided_at IS NOT NULL)
        )
    );

CREATE POLICY "Users can retry rejected join requests"
    ON public.group_join_requests FOR UPDATE
    USING (user_id = auth.uid() AND status = 'rejected')
    WITH CHECK (
        user_id = auth.uid()
        AND status = 'pending'
        AND decided_by IS NULL
        AND decided_at IS NULL
    );

CREATE POLICY "Users can cancel pending join requests"
    ON public.group_join_requests FOR DELETE
    USING (user_id = auth.uid() AND status = 'pending');

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

-- Users can update chat timestamp (last_message_at) for chats they're part of
CREATE POLICY "Users can update own chats"
    ON public.chats FOR UPDATE
    USING (user1_id = auth.uid() OR user2_id = auth.uid())
    WITH CHECK (user1_id = auth.uid() OR user2_id = auth.uid());

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
        )
        AND messages.sender_id <> auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chats
            WHERE chats.id = messages.chat_id
            AND (chats.user1_id = auth.uid() OR chats.user2_id = auth.uid())
        )
        AND messages.sender_id <> auth.uid()
    );

REVOKE UPDATE ON public.chats FROM anon, authenticated;
GRANT UPDATE(last_message_at) ON public.chats TO authenticated;

REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE(is_read) ON public.messages TO authenticated;

-- ============================================
-- NOTIFICATIONS RLS POLICIES
-- ============================================
CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "Users can mark own notifications as read"
    ON public.notifications FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;

-- ============================================
-- FRIEND REQUESTS & FRIENDSHIPS RLS POLICIES
-- ============================================
CREATE POLICY "Users can view own friend requests"
    ON public.friend_requests FOR SELECT
    USING (requester_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send friend requests"
    ON public.friend_requests FOR INSERT
    WITH CHECK (requester_id = auth.uid() AND status = 'pending');

CREATE POLICY "Receivers can respond to friend requests"
    ON public.friend_requests FOR UPDATE
    USING (receiver_id = auth.uid() AND status = 'pending')
    WITH CHECK (receiver_id = auth.uid() AND status IN ('accepted', 'declined'));

CREATE POLICY "Requesters can cancel friend requests"
    ON public.friend_requests FOR UPDATE
    USING (requester_id = auth.uid() AND status = 'pending')
    WITH CHECK (requester_id = auth.uid() AND status = 'canceled');

REVOKE UPDATE ON public.friend_requests FROM anon, authenticated;
GRANT UPDATE(status, responded_at) ON public.friend_requests TO authenticated;

CREATE POLICY "Users can view own friendships"
    ON public.friendships FOR SELECT
    USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.friendships FROM anon, authenticated;

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

CREATE OR REPLACE FUNCTION public.create_friendships_from_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
        IF NEW.status = 'accepted' THEN
            INSERT INTO public.friendships (user_id, friend_id, created_at)
            VALUES
                (NEW.requester_id, NEW.receiver_id, NOW()),
                (NEW.receiver_id, NEW.requester_id, NOW())
            ON CONFLICT (user_id, friend_id) DO NOTHING;
            NEW.responded_at := COALESCE(NEW.responded_at, NOW());
        ELSIF NEW.status IN ('declined', 'canceled') THEN
            NEW.responded_at := COALESCE(NEW.responded_at, NOW());
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_friend_requests_status ON public.friend_requests;
CREATE TRIGGER trg_friend_requests_status
BEFORE UPDATE OF status ON public.friend_requests
FOR EACH ROW
EXECUTE FUNCTION public.create_friendships_from_request();

CREATE OR REPLACE FUNCTION public.create_notification(
    p_recipient_id UUID,
    p_actor_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_body TEXT,
    p_data JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_recipient_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.notifications (
        recipient_id,
        actor_id,
        type,
        title,
        body,
        data
    )
    VALUES (
        p_recipient_id,
        p_actor_id,
        COALESCE(p_type, 'generic'),
        COALESCE(p_title, 'Notification'),
        p_body,
        COALESCE(p_data, '{}'::jsonb)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_post_like()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_author_id UUID;
BEGIN
    SELECT p.author_id INTO v_author_id
    FROM public.posts p
    WHERE p.id = NEW.post_id;

    IF v_author_id IS NULL OR v_author_id = NEW.user_id THEN
        RETURN NEW;
    END IF;

    PERFORM public.create_notification(
        v_author_id,
        NEW.user_id,
        'post_like',
        'New like on your post',
        NULL,
        jsonb_build_object('post_id', NEW.post_id)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_like ON public.post_likes;
CREATE TRIGGER trg_notify_post_like
AFTER INSERT ON public.post_likes
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_post_like();

CREATE OR REPLACE FUNCTION public.notify_on_post_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_author_id UUID;
    v_preview TEXT;
BEGIN
    SELECT p.author_id INTO v_author_id
    FROM public.posts p
    WHERE p.id = NEW.post_id;

    IF v_author_id IS NULL OR v_author_id = NEW.author_id THEN
        RETURN NEW;
    END IF;

    v_preview := NULLIF(LEFT(COALESCE(NEW.content, ''), 180), '');

    PERFORM public.create_notification(
        v_author_id,
        NEW.author_id,
        'post_comment',
        'New comment on your post',
        v_preview,
        jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_post_comment ON public.comments;
CREATE TRIGGER trg_notify_post_comment
AFTER INSERT ON public.comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_post_comment();

CREATE OR REPLACE FUNCTION public.notify_on_group_join_request_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id UUID;
BEGIN
    SELECT g.created_by INTO v_creator_id
    FROM public.groups g
    WHERE g.id = NEW.group_id;

    IF v_creator_id IS NOT NULL AND v_creator_id <> NEW.user_id THEN
        PERFORM public.create_notification(
            v_creator_id,
            NEW.user_id,
            'group_join_request',
            'New group join request',
            NULL,
            jsonb_build_object('group_id', NEW.group_id, 'request_id', NEW.id)
        );
    END IF;

    INSERT INTO public.notifications (recipient_id, actor_id, type, title, body, data)
    SELECT
        gm.user_id,
        NEW.user_id,
        'group_join_request',
        'New group join request',
        NULL,
        jsonb_build_object('group_id', NEW.group_id, 'request_id', NEW.id)
    FROM public.group_members gm
    WHERE gm.group_id = NEW.group_id
      AND gm.role IN ('admin', 'moderator')
      AND gm.user_id <> NEW.user_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_group_join_request_created ON public.group_join_requests;
CREATE TRIGGER trg_notify_group_join_request_created
AFTER INSERT ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_group_join_request_created();

CREATE OR REPLACE FUNCTION public.notify_on_group_join_request_decided()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_name TEXT;
    v_title TEXT;
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'rejected') THEN
        RETURN NEW;
    END IF;

    SELECT g.name INTO v_group_name
    FROM public.groups g
    WHERE g.id = NEW.group_id;

    v_title := CASE
        WHEN NEW.status = 'approved' THEN 'Your join request was approved'
        ELSE 'Your join request was rejected'
    END;

    PERFORM public.create_notification(
        NEW.user_id,
        NEW.decided_by,
        'group_join_decision',
        v_title,
        v_group_name,
        jsonb_build_object('group_id', NEW.group_id, 'request_id', NEW.id, 'status', NEW.status)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_group_join_request_decided ON public.group_join_requests;
CREATE TRIGGER trg_notify_group_join_request_decided
AFTER UPDATE ON public.group_join_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_group_join_request_decided();

CREATE OR REPLACE FUNCTION public.notify_on_message_inserted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient_id UUID;
    v_preview TEXT;
BEGIN
    SELECT CASE
        WHEN c.user1_id = NEW.sender_id THEN c.user2_id
        ELSE c.user1_id
    END
    INTO v_recipient_id
    FROM public.chats c
    WHERE c.id = NEW.chat_id;

    IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
        RETURN NEW;
    END IF;

    v_preview := NULLIF(LEFT(COALESCE(NEW.content, ''), 180), '');

    PERFORM public.create_notification(
        v_recipient_id,
        NEW.sender_id,
        'message',
        'New message',
        v_preview,
        jsonb_build_object('chat_id', NEW.chat_id, 'message_id', NEW.id)
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message_inserted ON public.messages;
CREATE TRIGGER trg_notify_message_inserted
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_message_inserted();

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

-- ============================================
-- RLS POLICIES FOR NEW TABLES
-- ============================================

-- Enable RLS on new tables
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STORIES RLS POLICIES
-- ============================================
-- Anyone can view active stories
CREATE POLICY "Stories are viewable by everyone"
    ON public.stories FOR SELECT
    USING (expires_at > NOW());

-- Users can create their own stories
CREATE POLICY "Users can create stories"
    ON public.stories FOR INSERT
    WITH CHECK (auth.uid() = author_id);

-- Users can update their own stories
CREATE POLICY "Users can update own stories"
    ON public.stories FOR UPDATE
    USING (auth.uid() = author_id AND expires_at > NOW());

-- Users can delete their own stories
CREATE POLICY "Users can delete own stories"
    ON public.stories FOR DELETE
    USING (auth.uid() = author_id);

-- ============================================
-- STORY VIEWS RLS POLICIES
-- ============================================
-- Users can view story views (for analytics)
CREATE POLICY "Story views are viewable by story author"
    ON public.story_views FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.stories s 
        WHERE s.id = story_views.story_id 
        AND s.author_id = auth.uid()
    ));

-- Users can create story views
CREATE POLICY "Users can view stories"
    ON public.story_views FOR INSERT
    WITH CHECK (auth.uid() = viewer_id);

-- ============================================
-- GROUP MESSAGES RLS POLICIES
-- ============================================
-- Group members can read group messages
CREATE POLICY "Group messages are viewable by group members"
    ON public.group_messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.group_members gm
        WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = auth.uid()
    ));

-- Group members can send messages
CREATE POLICY "Group members can send messages"
    ON public.group_messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (
            SELECT 1 FROM public.group_members gm
            WHERE gm.group_id = group_messages.group_id
            AND gm.user_id = auth.uid()
        )
    );

-- Users can update their own messages
CREATE POLICY "Users can update own group messages"
    ON public.group_messages FOR UPDATE
    USING (auth.uid() = sender_id);

-- Users can delete their own messages
CREATE POLICY "Users can delete own group messages"
    ON public.group_messages FOR DELETE
    USING (auth.uid() = sender_id);

-- ============================================
-- MESSAGE ATTACHMENTS RLS POLICIES
-- ============================================
-- Users can view attachments for messages they can access
CREATE POLICY "Message attachments are viewable by message participants"
    ON public.message_attachments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
            JOIN public.chats c ON m.chat_id = c.id
            WHERE m.id = message_attachments.message_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        ) OR
        EXISTS (
            SELECT 1 FROM public.group_messages gm
            JOIN public.group_members gmm ON gm.group_id = gmm.group_id
            WHERE gm.id = message_attachments.group_message_id
            AND gmm.user_id = auth.uid()
        )
    );

-- Users can create attachments for their messages
CREATE POLICY "Users can create message attachments"
    ON public.message_attachments FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.messages m
            WHERE m.id = message_attachments.message_id
            AND m.sender_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.group_messages gm
            WHERE gm.id = message_attachments.group_message_id
            AND gm.sender_id = auth.uid()
        )
    );

-- ============================================
-- SEARCH HISTORY RLS POLICIES
-- ============================================
-- Users can only view their own search history
CREATE POLICY "Users can view own search history"
    ON public.search_history FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create their own search history
CREATE POLICY "Users can create search history"
    ON public.search_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own search history
CREATE POLICY "Users can delete own search history"
    ON public.search_history FOR DELETE
    USING (auth.uid() = user_id);


