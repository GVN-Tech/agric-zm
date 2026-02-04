// Friends & Connections Manager
// Handles formal connection requests and friendships

class FriendsManager {
    constructor(supabase) {
        this.supabase = supabase;
    }

    // Get friend status between current user and another user
    async getFriendStatus(otherId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return { status: 'none' };
        if (user.id === otherId) return { status: 'self' };

        try {
            // Check if already friends
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
            // Check for pending friend requests
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

    // Send a friend request
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

    // Cancel a friend request
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

    // Respond to a friend request (accept/decline)
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

    // Get all friends for current user
    async getFriends(options = {}) {
        const { limit = 50, offset = 0 } = options;
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('friendships')
            .select(`
                friend:profiles!friendships_friend_id_fkey(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    province,
                    district,
                    farmer_type,
                    crops,
                    farm_size_ha,
                    is_verified
                )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        
        return data.map(item => ({
            ...item.friend,
            friendship_id: item.id
        }));
    }

    // Get pending friend requests (incoming)
    async getPendingRequests(options = {}) {
        const { limit = 50, offset = 0 } = options;
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('friend_requests')
            .select(`
                id,
                status,
                created_at,
                requester:profiles!friend_requests_requester_id_fkey(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    province,
                    district,
                    farmer_type,
                    crops,
                    farm_size_ha,
                    is_verified
                )
            `)
            .eq('receiver_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return data;
    }

    // Get sent friend requests (outgoing)
    async getSentRequests(options = {}) {
        const { limit = 50, offset = 0 } = options;
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('friend_requests')
            .select(`
                id,
                status,
                created_at,
                receiver:profiles!friend_requests_receiver_id_fkey(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    province,
                    district,
                    farmer_type,
                    crops,
                    farm_size_ha,
                    is_verified
                )
            `)
            .eq('requester_id', user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return data;
    }

    // Remove a friend
    async removeFriend(friendId) {
        const friend = String(friendId || '').trim();
        if (!friend) throw new Error('Missing friend');

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Delete both friendship records (bidirectional)
        const { error } = await this.supabase
            .from('friendships')
            .delete()
            .or(`and(user_id.eq.${user.id},friend_id.eq.${friend}),and(user_id.eq.${friend},friend_id.eq.${user.id})`);

        if (error) throw error;
        return { success: true };
    }

    // Get friend suggestions based on location, crops, etc.
    async getFriendSuggestions(options = {}) {
        const { limit = 10, offset = 0 } = options;
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) return [];

        // Get current user's profile to use for suggestions
        const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('province, district, crops, farmer_type')
            .eq('id', user.id)
            .single();

        if (profileError) throw profileError;
        if (!profile) return [];

        let query = this.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, province, district, farmer_type, crops, farm_size_ha, is_verified')
            .neq('id', user.id)
            .order('is_verified', { ascending: false })
            .range(offset, offset + limit - 1);

        // Add location-based suggestions
        if (profile.province) {
            query = query.eq('province', profile.province);
        }
        if (profile.district) {
            query = query.eq('district', profile.district);
        }

        // Exclude existing friends and pending requests
        const [friendsRes, pendingRes, sentRes] = await Promise.all([
            this.supabase.from('friendships').select('friend_id').eq('user_id', user.id),
            this.supabase.from('friend_requests').select('requester_id').eq('receiver_id', user.id).eq('status', 'pending'),
            this.supabase.from('friend_requests').select('receiver_id').eq('requester_id', user.id).eq('status', 'pending')
        ]);

        const excludeIds = new Set([user.id]);
        friendsRes.data?.forEach(f => excludeIds.add(f.friend_id));
        pendingRes.data?.forEach(r => excludeIds.add(r.requester_id));
        sentRes.data?.forEach(r => excludeIds.add(r.receiver_id));

        if (excludeIds.size > 0) {
            query = query.not('id', 'in', `(${Array.from(excludeIds).join(',')})`);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    }

    // Get mutual friends between current user and another user
    async getMutualFriends(otherId, options = {}) {
        const { limit = 10, offset = 0 } = options;
        const other = String(otherId || '').trim();
        if (!other) throw new Error('Missing user');

        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');
        if (user.id === other) return [];

        // This is a complex query that finds friends in common
        const { data, error } = await this.supabase
            .from('friendships')
            .select(`
                friend:profiles!friendships_friend_id_fkey(
                    id,
                    first_name,
                    last_name,
                    avatar_url,
                    province,
                    district
                )
            `)
            .eq('user_id', user.id)
            .in('friend_id', 
                this.supabase
                    .from('friendships')
                    .select('friend_id')
                    .eq('user_id', other)
            )
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) throw error;
        return data.map(item => item.friend);
    }
}

// Export
if (typeof window !== 'undefined') {
    window.FriendsManager = FriendsManager;
}