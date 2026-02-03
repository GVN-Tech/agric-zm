// Groups & Cooperatives Module
// Handles crop-based groups, regional groups, cooperatives

class GroupsManager {
    constructor(supabase) {
        this.supabase = supabase;
    }

    // Create a group
    async createGroup(groupData) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const group = {
            name: groupData.name,
            description: groupData.description || null,
            group_type: groupData.groupType, // 'crop', 'regional', 'cooperative', 'general'
            crop_tag: groupData.cropTag || null,
            province: groupData.province || null,
            district: groupData.district || null,
            is_public: groupData.isPublic !== false, // Default to public
            created_by: user.id,
        };

        const { data, error } = await this.supabase
            .from('groups')
            .insert(group)
            .select(`
                *,
                creator:profiles!groups_created_by_fkey(id, first_name, last_name, avatar_url),
                members:group_members(count)
            `)
            .single();

        if (error) {
            console.error('Group creation error:', error);
            throw error;
        }

        // Auto-add creator as admin
        await this.addMember(data.id, user.id, 'admin');

        return data;
    }

    // Get groups with filters
    async getGroups(options = {}) {
        const {
            groupType = null,
            cropTag = null,
            province = null,
            isPublic = true,
            limit = 50,
            offset = 0
        } = options;

        // Use optimized view 'groups_with_stats'
        // Fallback to regular query if view doesn't exist
        let query = this.supabase
            .from('groups_with_stats')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (groupType) query = query.eq('group_type', groupType);
        if (cropTag) query = query.eq('crop_tag', cropTag);
        if (province) query = query.eq('province', province);
        if (isPublic !== null) query = query.eq('is_public', isPublic);

        let { data, error } = await query;

        // Fallback to legacy if view missing
        if (error && error.code === '42P01') {
            console.warn('groups_with_stats view not found, falling back to legacy query');
            return this.getGroupsLegacy(options);
        }

        if (error) {
            console.error('Groups fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) return [];

        // Map view data to UI format
        return data.map(row => ({
            id: row.id,
            name: row.name,
            description: row.description,
            group_type: row.group_type,
            crop_tag: row.crop_tag,
            province: row.province,
            district: row.district,
            is_public: row.is_public,
            created_at: row.created_at,
            members_count: row.members_count,
            user_role: row.user_role,
            is_member: !!row.user_role,
            creator: {
                id: row.created_by,
                first_name: row.creator_first_name,
                last_name: row.creator_last_name,
                avatar_url: row.creator_avatar_url
            }
        }));
    }

    // Legacy method for backward compatibility
    async getGroupsLegacy(options) {
        const {
            groupType = null,
            cropTag = null,
            province = null,
            isPublic = true,
            limit = 50,
            offset = 0
        } = options;

        let query = this.supabase
            .from('groups')
            .select(`
                *,
                creator:profiles!groups_created_by_fkey(id, first_name, last_name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (groupType) query = query.eq('group_type', groupType);
        if (cropTag) query = query.eq('crop_tag', cropTag);
        if (province) query = query.eq('province', province);
        if (isPublic !== null) query = query.eq('is_public', isPublic);

        const { data, error } = await query;

        if (error) {
            console.error('Groups fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) return [];

        const groupIds = data.map(g => g.id);
        
        // Parallel requests
        const [membersRes, userRes] = await Promise.all([
            this.supabase.from('group_members').select('group_id').in('group_id', groupIds),
            this.supabase.auth.getUser()
        ]);
        
        const memberCountMap = new Map();
        membersRes.data?.forEach(member => {
            memberCountMap.set(member.group_id, (memberCountMap.get(member.group_id) || 0) + 1);
        });

        const membershipMap = new Map();
        if (userRes.data?.user) {
            const { data: memberships } = await this.supabase
                .from('group_members')
                .select('group_id, role')
                .eq('user_id', userRes.data.user.id)
                .in('group_id', groupIds);

            memberships?.forEach(m => membershipMap.set(m.group_id, m.role));
        }

        data.forEach(group => {
            group.user_role = membershipMap.get(group.id) || null;
            group.is_member = !!group.user_role;
            group.members_count = memberCountMap.get(group.id) || 0;
        });

        return data;
    }

    // Get a single group with details
    async getGroup(groupId) {
        const { data, error } = await this.supabase
            .from('groups')
            .select(`
                *,
                creator:profiles!groups_created_by_fkey(id, first_name, last_name, avatar_url, province),
                members:group_members(
                    role,
                    joined_at,
                    user:profiles!group_members_user_id_fkey(id, first_name, last_name, avatar_url)
                )
            `)
            .eq('id', groupId)
            .single();

        if (error) {
            console.error('Group fetch error:', error);
            throw error;
        }

        // Check if current user is a member
        const { data: { user } } = await this.supabase.auth.getUser();
        if (user) {
            const { data: membership } = await this.supabase
                .from('group_members')
                .select('role')
                .eq('group_id', groupId)
                .eq('user_id', user.id)
                .single();

            data.user_role = membership?.role || null;
            data.is_member = !!membership;
        }

        return data;
    }

    // Join a group
    async joinGroup(groupId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('group_members')
            .insert({
                group_id: groupId,
                user_id: user.id,
                role: 'member'
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                // Already a member
                return { success: true, alreadyMember: true };
            }
            throw error;
        }

        return data;
    }

    // Leave a group
    async leaveGroup(groupId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', user.id);

        if (error) throw error;
        return { success: true };
    }

    // Add member (admin/moderator only)
    async addMember(groupId, userId, role = 'member') {
        const { data, error } = await this.supabase
            .from('group_members')
            .insert({
                group_id: groupId,
                user_id: userId,
                role: role
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // Update member role (admin only)
    async updateMemberRole(groupId, userId, newRole) {
        const { error } = await this.supabase
            .from('group_members')
            .update({ role: newRole })
            .eq('group_id', groupId)
            .eq('user_id', userId);

        if (error) throw error;
        return { success: true };
    }

    // Get user's groups
    async getUserGroups(userId = null) {
        if (!userId) {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) throw new Error('User must be authenticated');
            userId = user.id;
        }

        const { data, error } = await this.supabase
            .from('group_members')
            .select(`
                role,
                joined_at,
                group:groups(*)
            `)
            .eq('user_id', userId)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('User groups fetch error:', error);
            throw error;
        }

        return data || [];
    }

    // Get group posts (posts from group members with group tag)
    async getGroupPosts(groupId, limit = 20) {
        const group = await this.getGroup(groupId);
        if (!group) throw new Error('Group not found');

        // Get posts from group members or posts tagged with group's crop
        let query = this.supabase
            .from('posts')
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (group.crop_tag) {
            query = query.contains('crop_tags', [group.crop_tag]);
        } else if (group.province) {
            query = query.eq('location_province', group.province);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Group posts fetch error:', error);
            throw error;
        }

        return data || [];
    }
}

// Export
if (typeof window !== 'undefined') {
    window.GroupsManager = GroupsManager;
}


