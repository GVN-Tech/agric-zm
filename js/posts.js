// Posts Module
// Handles social feed: create, read, like, comment

class PostsManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.postsCache = [];
    }

    // Create a new post
    async createPost(content, options = {}) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const postData = {
            author_id: user.id,
            content: content.trim(),
            crop_tags: options.cropTags || [],
            location_province: options.province || null,
            location_district: options.district || null,
            is_market_post: options.isMarketPost || false,
            market_type: options.marketType || null,
        };

        // Handle image uploads if provided
        if (options.images && options.images.length > 0) {
            const imageUrls = await this.uploadImages(options.images, user.id);
            postData.image_urls = imageUrls;
        }

        const { data, error } = await this.supabase
            .from('posts')
            .insert(postData)
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url, province, district)
            `)
            .single();

        if (error) {
            console.error('Post creation error:', error);
            throw error;
        }

        return data;
    }

    // Get posts with pagination
    async getPosts(options = {}) {
        const {
            limit = 20,
            offset = 0,
            province = null,
            district = null,
            cropTag = null,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = options;

        // Use the optimized view 'posts_with_stats'
        // Fallback to regular query if view doesn't exist yet (graceful degradation)
        let query = this.supabase
            .from('posts_with_stats')
            .select('*')
            .order(sortBy, { ascending: sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        if (province) {
            query = query.eq('location_province', province);
        }

        if (district) {
            query = query.eq('location_district', district);
        }

        if (cropTag) {
            query = query.contains('crop_tags', [cropTag]);
        }

        let { data, error } = await query;

        // If view not found, fallback to original implementation (for safety during migration)
        if (error && error.code === '42P01') { // Undefined table
            console.warn('posts_with_stats view not found, falling back to legacy query');
            return this.getPostsLegacy(options);
        }

        if (error) {
            console.error('Posts fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            return [];
        }

        // Map the view data to the format the UI expects
        // The view already flat-maps author info, but UI expects 'author' object
        return data.map(row => ({
            id: row.id,
            content: row.content,
            crop_tags: row.crop_tags,
            location_province: row.location_province,
            location_district: row.location_district,
            image_urls: row.image_urls,
            is_market_post: row.is_market_post,
            market_type: row.market_type,
            created_at: row.created_at,
            updated_at: row.updated_at,
            likes_count: row.likes_count,
            comments_count: row.comments_count,
            user_liked: row.user_liked,
            author: {
                id: row.author_id,
                first_name: row.first_name,
                last_name: row.last_name,
                avatar_url: row.avatar_url,
                province: row.author_province,
                district: row.author_district,
                farmer_type: row.farmer_type
            }
        }));
    }

    async getMarketPosts(options = {}) {
        const {
            limit = 20,
            offset = 0,
            type = null,
            province = null,
            district = null,
            cropTag = null,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = options;

        let query = this.supabase
            .from('posts_with_stats')
            .select('*')
            .eq('is_market_post', true)
            .order(sortBy, { ascending: sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        if (type) {
            query = query.eq('market_type', type);
        }

        if (province) {
            query = query.eq('location_province', province);
        }

        if (district) {
            query = query.eq('location_district', district);
        }

        if (cropTag) {
            query = query.contains('crop_tags', [cropTag]);
        }

        let { data, error } = await query;

        if (error && error.code === '42P01') {
            console.warn('posts_with_stats view not found, falling back to legacy market posts query');
            return this.getMarketPostsLegacy(options);
        }

        if (error) {
            console.error('Market posts fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            return [];
        }

        return data.map(row => ({
            id: row.id,
            content: row.content,
            crop_tags: row.crop_tags,
            location_province: row.location_province,
            location_district: row.location_district,
            image_urls: row.image_urls,
            is_market_post: row.is_market_post,
            market_type: row.market_type,
            created_at: row.created_at,
            updated_at: row.updated_at,
            likes_count: row.likes_count,
            comments_count: row.comments_count,
            user_liked: row.user_liked,
            author: {
                id: row.author_id,
                first_name: row.first_name,
                last_name: row.last_name,
                avatar_url: row.avatar_url,
                province: row.author_province,
                district: row.author_district,
                farmer_type: row.farmer_type
            }
        }));
    }

    async getPostById(postId) {
        const id = String(postId || '').trim();
        if (!id) return null;

        const mapFromView = (row) => ({
            id: row.id,
            content: row.content,
            crop_tags: row.crop_tags,
            location_province: row.location_province,
            location_district: row.location_district,
            image_urls: row.image_urls,
            is_market_post: row.is_market_post,
            market_type: row.market_type,
            created_at: row.created_at,
            updated_at: row.updated_at,
            likes_count: row.likes_count,
            comments_count: row.comments_count,
            user_liked: row.user_liked,
            author: {
                id: row.author_id,
                first_name: row.first_name,
                last_name: row.last_name,
                avatar_url: row.avatar_url,
                province: row.author_province,
                district: row.author_district,
                farmer_type: row.farmer_type
            }
        });

        const { data, error } = await this.supabase
            .from('posts_with_stats')
            .select('*')
            .eq('id', id)
            .single();

        if (error && error.code === '42P01') {
            return this.getPostByIdLegacy(id);
        }

        if (error) throw error;
        if (!data) return null;
        return mapFromView(data);
    }

    async getPostByIdLegacy(postId) {
        const { data, error } = await this.supabase
            .from('posts')
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url, province, district, farmer_type)
            `)
            .eq('id', postId)
            .is('deleted_at', null)
            .single();

        if (error) throw error;
        if (!data) return null;

        const [likesRes, commentsRes, userRes] = await Promise.all([
            this.supabase.from('post_likes').select('post_id').eq('post_id', postId),
            this.supabase.from('comments').select('post_id').eq('post_id', postId).is('deleted_at', null),
            this.supabase.auth.getUser()
        ]);

        const likesCount = Array.isArray(likesRes.data) ? likesRes.data.length : 0;
        const commentsCount = Array.isArray(commentsRes.data) ? commentsRes.data.length : 0;

        let userLiked = false;
        if (userRes.data?.user?.id) {
            const { data: userLikeRows } = await this.supabase
                .from('post_likes')
                .select('post_id')
                .eq('user_id', userRes.data.user.id)
                .eq('post_id', postId);
            userLiked = Array.isArray(userLikeRows) && userLikeRows.length > 0;
        }

        data.likes_count = likesCount;
        data.comments_count = commentsCount;
        data.user_liked = userLiked;
        return data;
    }

    async getMarketPostsLegacy(options) {
        const {
            limit = 20,
            offset = 0,
            type = null,
            province = null,
            district = null,
            cropTag = null,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = options;

        let query = this.supabase
            .from('posts')
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url, province, district, farmer_type)
            `)
            .is('deleted_at', null)
            .eq('is_market_post', true)
            .order(sortBy, { ascending: sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        if (type) query = query.eq('market_type', type);
        if (province) query = query.eq('location_province', province);
        if (district) query = query.eq('location_district', district);
        if (cropTag) query = query.contains('crop_tags', [cropTag]);

        const { data, error } = await query;

        if (error) {
            console.error('Market posts fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) return [];

        const postIds = data.map(p => p.id);

        const [likesRes, commentsRes, userRes] = await Promise.all([
            this.supabase.from('post_likes').select('post_id').in('post_id', postIds),
            this.supabase.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null),
            this.supabase.auth.getUser()
        ]);

        const likesCountMap = new Map();
        const commentsCountMap = new Map();

        likesRes.data?.forEach(l => likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1));
        commentsRes.data?.forEach(c => commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1));

        const likedPostIds = new Set();
        if (userRes.data?.user) {
            const { data: userLikes } = await this.supabase
                .from('post_likes')
                .select('post_id')
                .eq('user_id', userRes.data.user.id)
                .in('post_id', postIds);
            userLikes?.forEach(l => likedPostIds.add(l.post_id));
        }

        data.forEach(post => {
            post.user_liked = likedPostIds.has(post.id);
            post.likes_count = likesCountMap.get(post.id) || 0;
            post.comments_count = commentsCountMap.get(post.id) || 0;
        });

        return data;
    }

    // Legacy method for backward compatibility
    async getPostsLegacy(options) {
        const {
            limit = 20,
            offset = 0,
            province = null,
            district = null,
            cropTag = null,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = options;

        let query = this.supabase
            .from('posts')
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url, province, district, farmer_type)
            `)
            .is('deleted_at', null)
            .order(sortBy, { ascending: sortOrder === 'asc' })
            .range(offset, offset + limit - 1);

        if (province) query = query.eq('location_province', province);
        if (district) query = query.eq('location_district', district);
        if (cropTag) query = query.contains('crop_tags', [cropTag]);

        const { data, error } = await query;

        if (error) {
            console.error('Posts fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) return [];

        // Manual aggregation (slow)
        const postIds = data.map(p => p.id);
        
        // Parallelize these requests
        const [likesRes, commentsRes, userRes] = await Promise.all([
            this.supabase.from('post_likes').select('post_id').in('post_id', postIds),
            this.supabase.from('comments').select('post_id').in('post_id', postIds).is('deleted_at', null),
            this.supabase.auth.getUser()
        ]);

        const likesCountMap = new Map();
        const commentsCountMap = new Map();
        
        likesRes.data?.forEach(l => likesCountMap.set(l.post_id, (likesCountMap.get(l.post_id) || 0) + 1));
        commentsRes.data?.forEach(c => commentsCountMap.set(c.post_id, (commentsCountMap.get(c.post_id) || 0) + 1));

        const likedPostIds = new Set();
        if (userRes.data?.user) {
            const { data: userLikes } = await this.supabase
                .from('post_likes')
                .select('post_id')
                .eq('user_id', userRes.data.user.id)
                .in('post_id', postIds);
            userLikes?.forEach(l => likedPostIds.add(l.post_id));
        }

        data.forEach(post => {
            post.user_liked = likedPostIds.has(post.id);
            post.likes_count = likesCountMap.get(post.id) || 0;
            post.comments_count = commentsCountMap.get(post.id) || 0;
        });

        return data;
    }

    // Like a post
    async likePost(postId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('post_likes')
            .insert({ post_id: postId, user_id: user.id })
            .select()
            .single();

        if (error) {
            // Might already be liked
            if (error.code === '23505') {
                // Already liked, unlike it
                return await this.unlikePost(postId);
            }
            throw error;
        }

        return data;
    }

    // Unlike a post
    async unlikePost(postId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('post_likes')
            .delete()
            .eq('post_id', postId)
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    }

    // Add comment to post
    async addComment(postId, content) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('comments')
            .insert({
                post_id: postId,
                author_id: user.id,
                content: content.trim()
            })
            .select(`
                *,
                author:profiles!comments_author_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .single();

        if (error) {
            console.error('Comment creation error:', error);
            throw error;
        }

        return data;
    }

    // Get comments for a post
    async getComments(postId) {
        const { data, error } = await this.supabase
            .from('comments')
            .select(`
                *,
                author:profiles!comments_author_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .eq('post_id', postId)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Comments fetch error:', error);
            throw error;
        }

        const comments = data || [];
        if (!comments.length) return [];

        const commentIds = comments.map((c) => c.id);

        let viewerId = null;
        try {
            const { data: userRes } = await this.supabase.auth.getUser();
            viewerId = userRes?.user?.id || null;
        } catch (_) {
            viewerId = null;
        }

        try {
            const { data: likesData, error: likesError } = await this.supabase
                .from('comment_likes')
                .select('comment_id, user_id')
                .in('comment_id', commentIds);
            if (likesError) throw likesError;

            const countMap = new Map();
            const likedSet = new Set();
            (likesData || []).forEach((row) => {
                countMap.set(row.comment_id, (countMap.get(row.comment_id) || 0) + 1);
                if (viewerId && row.user_id === viewerId) likedSet.add(row.comment_id);
            });

            comments.forEach((c) => {
                c.likes_count = countMap.get(c.id) || 0;
                c.user_liked = likedSet.has(c.id);
            });
        } catch (_) {
            comments.forEach((c) => {
                c.likes_count = c.likes_count || 0;
                c.user_liked = !!c.user_liked;
            });
        }

        return comments;
    }

    async likeComment(commentId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('comment_likes')
            .insert({ comment_id: commentId, user_id: user.id });

        if (error) throw error;
        return { success: true };
    }

    async unlikeComment(commentId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('comment_likes')
            .delete()
            .eq('comment_id', commentId)
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    }

    // Delete a post (soft delete)
    async deletePost(postId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('posts')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', postId)
            .eq('author_id', user.id);

        if (error) throw error;
        return { success: true };
    }

    // Upload images to Supabase Storage
    async uploadImages(files, userId) {
        if (!files || files.length === 0) return [];

        const allowedTypes = new Map([
            ['image/jpeg', 'jpg'],
            ['image/jpg', 'jpg'],
            ['image/png', 'png'],
            ['image/webp', 'webp'],
            ['image/gif', 'gif']
        ]);

        const inputFiles = Array.from(files || []);
        const selected = inputFiles
            .filter((file) => file && typeof file.type === 'string' && file.type.startsWith('image/'))
            .filter((file) => file.size <= 5 * 1024 * 1024)
            .slice(0, 4);

        const imageUrls = [];
        
        for (let i = 0; i < selected.length; i++) {
            const file = selected[i];
            const fileExt = allowedTypes.get(file.type) || null;
            if (!fileExt) continue;

            const token = Math.random().toString(36).slice(2, 10);
            const fileName = `${userId}/${Date.now()}_${token}.${fileExt}`;
            
            try {
                const { data, error } = await this.supabase.storage
                    .from('post-images')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: file.type
                    });
                    
                if (error) {
                    console.error('Upload error:', error);
                    continue;
                }
                
                const { data: { publicUrl } } = this.supabase.storage
                    .from('post-images')
                    .getPublicUrl(fileName);
                    
                imageUrls.push(publicUrl);
            } catch (error) {
                console.error('File upload failed:', error);
            }
        }
        
        return imageUrls;
    }

    // Subscribe to new posts (realtime)
    subscribeToPosts(callback) {
        return this.supabase
            .channel('posts')
            .on('postgres_changes', 
                { event: 'INSERT', schema: 'public', table: 'posts' },
                callback
            )
            .subscribe();
    }

    async searchFarmers(options = {}) {
        const {
            query = '',
            cropTag = '',
            province = '',
            farmerType = '',
            limit = 20
        } = options;

        const q = (query || '').trim();
        const crop = (cropTag || '').trim();
        const prov = (province || '').trim();
        const type = (farmerType || '').trim();

        let builder = this.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, province, district, farmer_type, crops, livestock, farm_size_ha, bio, is_verified, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (prov) builder = builder.eq('province', prov);
        if (type) builder = builder.eq('farmer_type', type);
        if (crop) builder = builder.ilike('crops', `%${crop}%`);

        if (q) {
            builder = builder.or(
                [
                    `first_name.ilike.%${q}%`,
                    `last_name.ilike.%${q}%`,
                    `province.ilike.%${q}%`,
                    `district.ilike.%${q}%`,
                    `crops.ilike.%${q}%`,
                    `livestock.ilike.%${q}%`
                ].join(',')
            );
        }

        const { data, error } = await builder;
        if (error) throw error;
        return data || [];
    }

    async getFarmerProfileById(farmerId) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, province, district, farmer_type, crops, livestock, farm_size_ha, bio, is_verified, created_at')
            .eq('id', farmerId)
            .single();

        if (error) throw error;
        return data;
    }

    async getFriendStatus(otherUserId) {
        const otherId = String(otherUserId || '').trim();
        if (!otherId) return { status: 'none' };

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return { status: 'none' };
        if (user.id === otherId) return { status: 'self' };

        try {
            const { data: friendship, error: friendshipError } = await this.supabase
                .from('friendships')
                .select('id')
                .eq('user_id', user.id)
                .eq('friend_id', otherId)
                .maybeSingle();

            if (friendshipError) throw friendshipError;
            if (friendship) return { status: 'friends' };
        } catch (error) {
            if (error?.code === '42P01') return { status: 'unavailable' };
            throw error;
        }

        try {
            const { data: request, error: requestError } = await this.supabase
                .from('friend_requests')
                .select('id, requester_id, receiver_id, status')
                .eq('status', 'pending')
                .or(`and(requester_id.eq.${user.id},receiver_id.eq.${otherId}),and(requester_id.eq.${otherId},receiver_id.eq.${user.id})`)
                .maybeSingle();

            if (requestError) throw requestError;
            if (!request) return { status: 'none' };

            if (request.requester_id === user.id) {
                return { status: 'outgoing', requestId: request.id };
            }
            return { status: 'incoming', requestId: request.id };
        } catch (error) {
            if (error?.code === '42P01') return { status: 'unavailable' };
            throw error;
        }
    }

    async sendFriendRequest(receiverId) {
        const receiver = String(receiverId || '').trim();
        if (!receiver) throw new Error('Missing receiver');

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');
        if (user.id === receiver) throw new Error('Cannot friend yourself');

        const payload = { requester_id: user.id, receiver_id: receiver, status: 'pending' };

        const { data, error } = await this.supabase
            .from('friend_requests')
            .insert(payload)
            .select('id, requester_id, receiver_id, status')
            .single();

        if (error) {
            if (error.code === '23505') {
                const { data: existing, error: existingError } = await this.supabase
                    .from('friend_requests')
                    .select('id, requester_id, receiver_id, status')
                    .eq('requester_id', user.id)
                    .eq('receiver_id', receiver)
                    .eq('status', 'pending')
                    .maybeSingle();
                if (existingError) throw existingError;
                if (existing) return existing;
            }
            throw error;
        }

        return data;
    }

    async cancelFriendRequest(receiverId) {
        const receiver = String(receiverId || '').trim();
        if (!receiver) throw new Error('Missing receiver');

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('friend_requests')
            .update({ status: 'canceled', responded_at: new Date().toISOString() })
            .eq('requester_id', user.id)
            .eq('receiver_id', receiver)
            .eq('status', 'pending')
            .select('id, status')
            .maybeSingle();

        if (error) throw error;
        return data;
    }

    async respondToFriendRequest(requestId, decision) {
        const id = String(requestId || '').trim();
        const next = String(decision || '').trim().toLowerCase();
        const status = next === 'accepted' ? 'accepted' : 'declined';
        if (!id) throw new Error('Missing request');

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('friend_requests')
            .update({ status, responded_at: new Date().toISOString() })
            .eq('id', id)
            .eq('receiver_id', user.id)
            .eq('status', 'pending')
            .select('id, status, requester_id, receiver_id')
            .single();

        if (error) throw error;
        return data;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.PostsManager = PostsManager;
}


