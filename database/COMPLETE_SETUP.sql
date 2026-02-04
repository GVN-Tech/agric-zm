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

CREATE INDEX idx_messages_chat ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

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
    USING (
        is_public = TRUE
        OR auth.role() = 'authenticated'
    );

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

DROP POLICY IF EXISTS "Users can join public groups" ON public.group_members;
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

ALTER TABLE public.group_join_requests ENABLE ROW LEVEL SECURITY;

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

-- CHATS & MESSAGES
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chats"
    ON public.chats FOR SELECT
    USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create chats"
    ON public.chats FOR INSERT
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update own chats"
    ON public.chats FOR UPDATE
    USING (auth.uid() = user1_id OR auth.uid() = user2_id)
    WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can view messages in their chats"
    ON public.messages FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.chats c WHERE c.id = chat_id AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
    ));

CREATE POLICY "Users can send messages to their chats"
    ON public.messages FOR INSERT
    WITH CHECK (
        auth.uid() = sender_id
        AND EXISTS (
            SELECT 1 FROM public.chats c
            WHERE c.id = chat_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
    );

CREATE POLICY "Users can mark messages as read"
    ON public.messages FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.chats c
            WHERE c.id = chat_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
        AND sender_id <> auth.uid()
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.chats c
            WHERE c.id = chat_id
            AND (c.user1_id = auth.uid() OR c.user2_id = auth.uid())
        )
        AND sender_id <> auth.uid()
    );

CREATE POLICY "Users can view own notifications"
    ON public.notifications FOR SELECT
    USING (recipient_id = auth.uid());

CREATE POLICY "Users can mark own notifications as read"
    ON public.notifications FOR UPDATE
    USING (recipient_id = auth.uid())
    WITH CHECK (recipient_id = auth.uid());

REVOKE UPDATE ON public.chats FROM anon, authenticated;
GRANT UPDATE(last_message_at) ON public.chats TO authenticated;

REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE(is_read) ON public.messages TO authenticated;

REVOKE UPDATE ON public.notifications FROM anon, authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_posts_updated_at ON public.posts;
CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_comments_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_groups_updated_at ON public.groups;
CREATE TRIGGER update_groups_updated_at BEFORE UPDATE ON public.groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_chat_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.chats
    SET last_message_at = NEW.created_at
    WHERE id = NEW.chat_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chat_timestamp ON public.messages;
CREATE TRIGGER update_chat_timestamp AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION update_chat_last_message();

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
    (SELECT role FROM public.group_members gm WHERE gm.group_id = g.id AND gm.user_id = auth.uid()) as user_role,

    gjr.status as join_request_status,
    gjr.id as join_request_id

FROM 
    public.groups g
JOIN 
    public.profiles pr ON g.created_by = pr.id
LEFT JOIN
    public.group_join_requests gjr ON gjr.group_id = g.id AND gjr.user_id = auth.uid();

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
