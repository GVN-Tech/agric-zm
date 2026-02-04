// Stories Manager
// Handles 24-hour crop and harvest updates

class StoriesManager {
    constructor(supabase) {
        this.supabase = supabase;
    }

    // Create a new story
    async createStory(file, caption) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // 1. Upload image
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const filePath = `stories/${fileName}`;

        const { error: uploadError } = await this.supabase.storage
            .from('story-images') // Assuming bucket exists, need to verify/create
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = this.supabase.storage
            .from('story-images')
            .getPublicUrl(filePath);

        // 2. Get user location/profile info for metadata
        const { data: profile } = await this.supabase
            .from('profiles')
            .select('province, district, crops')
            .eq('id', user.id)
            .single();

        // 3. Create story record
        const story = {
            author_id: user.id,
            image_url: publicUrl,
            caption: caption,
            location_province: profile?.province,
            location_district: profile?.district,
            crop_tags: profile?.crops ? (Array.isArray(profile.crops) ? profile.crops : profile.crops.split(',').map(c => c.trim())) : [],
            // expires_at is handled by default value in DB (NOW + 24h)
        };

        const { data, error } = await this.supabase
            .from('stories')
            .insert(story)
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // Get active stories grouped by user
    async getActiveStories() {
        const { data: { user } } = await this.supabase.auth.getUser();
        
        // Fetch valid stories
        const { data, error } = await this.supabase
            .from('stories')
            .select(`
                id,
                image_url,
                caption,
                created_at,
                expires_at,
                author:profiles!stories_author_id_fkey(
                    id,
                    first_name,
                    last_name,
                    avatar_url
                )
            `)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group by author
        const storiesByUser = new Map();
        
        // Add current user first if they have stories
        if (user) {
            const myStories = data.filter(s => s.author.id === user.id);
            if (myStories.length > 0) {
                storiesByUser.set(user.id, {
                    user: myStories[0].author,
                    stories: myStories,
                    hasUnseen: false // Own stories are always "seen" conceptually
                });
            }
        }

        // Process other users' stories
        for (const story of data) {
            if (user && story.author.id === user.id) continue;

            if (!storiesByUser.has(story.author.id)) {
                storiesByUser.set(story.author.id, {
                    user: story.author,
                    stories: [],
                    hasUnseen: false
                });
            }
            storiesByUser.get(story.author.id).stories.push(story);
        }

        // Check seen status if authenticated
        if (user) {
            const { data: views } = await this.supabase
                .from('story_views')
                .select('story_id')
                .eq('viewer_id', user.id);
            
            const viewedStoryIds = new Set(views?.map(v => v.story_id) || []);

            for (const [userId, group] of storiesByUser) {
                if (userId === user.id) continue;
                
                // If any story in the group hasn't been viewed, mark group as having unseen
                const hasUnseen = group.stories.some(s => !viewedStoryIds.has(s.id));
                group.hasUnseen = hasUnseen;
            }
        }

        return Array.from(storiesByUser.values());
    }

    // Mark a story as viewed
    async viewStory(storyId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return;

        // Check if already viewed to avoid unique constraint error
        const { data: existing } = await this.supabase
            .from('story_views')
            .select('id')
            .eq('story_id', storyId)
            .eq('viewer_id', user.id)
            .maybeSingle();

        if (existing) return;

        await this.supabase
            .from('story_views')
            .insert({
                story_id: storyId,
                viewer_id: user.id
            });
    }

    // Delete a story
    async deleteStory(storyId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('stories')
            .delete()
            .eq('id', storyId)
            .eq('author_id', user.id);

        if (error) throw error;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.StoriesManager = StoriesManager;
}