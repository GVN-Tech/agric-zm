-- Optimize posts query to avoid N+1 problem
-- Run this in your Supabase SQL Editor

-- 1. Create a secure view for posts with stats
-- Note: we use `auth.uid()` which works when queried via Supabase Client

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

-- 2. Grant access to the view
GRANT SELECT ON public.posts_with_stats TO anon, authenticated, service_role;

-- 3. Add some helpful indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_post_likes_post_id ON public.post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
