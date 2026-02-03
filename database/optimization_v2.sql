-- Optimization V2: Groups and Chats
-- Run this in Supabase SQL Editor

-- 1. Secure view for Groups with member counts
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

-- Grant access
GRANT SELECT ON public.groups_with_stats TO anon, authenticated, service_role;


-- 2. Secure view for Chats with unread counts
-- Note: logic is a bit complex for chats as it involves two users
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

-- Grant access
GRANT SELECT ON public.chats_with_meta TO authenticated, service_role;
