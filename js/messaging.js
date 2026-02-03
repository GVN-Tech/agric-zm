// Messaging Module
// Handles 1-to-1 real-time messaging using Supabase Realtime

class MessagingManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.channels = new Map();
    }

    // Get or create a chat between two users
    async getOrCreateChat(otherUserId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Check if chat already exists
        const { data: existingChat } = await this.supabase
            .from('chats')
            .select('*')
            .or(`and(user1_id.eq.${user.id},user2_id.eq.${otherUserId}),and(user1_id.eq.${otherUserId},user2_id.eq.${user.id})`)
            .single();

        if (existingChat) {
            return existingChat;
        }

        // Create new chat
        const { data, error } = await this.supabase
            .from('chats')
            .insert({
                user1_id: user.id,
                user2_id: otherUserId
            })
            .select(`
                *,
                user1:profiles!chats_user1_id_fkey(id, first_name, last_name, avatar_url),
                user2:profiles!chats_user2_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .single();

        if (error) {
            console.error('Chat creation error:', error);
            throw error;
        }

        return data;
    }

    // Get all chats for current user
    async getChats() {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Use optimized view
        let query = this.supabase
            .from('chats_with_meta')
            .select('*')
            .order('last_message_at', { ascending: false, nullsFirst: false });

        let { data, error } = await query;

        // Fallback to legacy
        if (error && error.code === '42P01') {
            console.warn('chats_with_meta view not found, falling back to legacy query');
            return this.getChatsLegacy(user);
        }

        if (error) {
            console.error('Chats fetch error:', error);
            throw error;
        }

        if (!data || data.length === 0) return [];

        // Map view data to UI format
        return data.map(row => {
            const isUser1 = row.user1_id === user.id;
            return {
                id: row.id,
                user1_id: row.user1_id,
                user2_id: row.user2_id,
                last_message_at: row.last_message_at,
                unread_count: row.unread_count,
                other_user: {
                    id: isUser1 ? row.user2_id : row.user1_id,
                    first_name: isUser1 ? row.user2_first_name : row.user1_first_name,
                    last_name: isUser1 ? row.user2_last_name : row.user1_last_name,
                    avatar_url: isUser1 ? row.user2_avatar_url : row.user1_avatar_url,
                    province: isUser1 ? row.user2_province : row.user1_province
                }
            };
        });
    }

    // Legacy method for backward compatibility
    async getChatsLegacy(user) {
        const { data, error } = await this.supabase
            .from('chats')
            .select(`
                *,
                user1:profiles!chats_user1_id_fkey(id, first_name, last_name, avatar_url, province),
                user2:profiles!chats_user2_id_fkey(id, first_name, last_name, avatar_url, province)
            `)
            .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
            .order('last_message_at', { ascending: false, nullsFirst: false });

        if (error) {
            console.error('Chats fetch error:', error);
            throw error;
        }

        if (data && data.length > 0) {
            const chatIds = data.map(c => c.id);
            const { data: unreadCounts } = await this.supabase
                .from('messages')
                .select('chat_id')
                .in('chat_id', chatIds)
                .eq('is_read', false)
                .neq('sender_id', user.id); // Don't count own messages as unread

            const unreadMap = new Map();
            unreadCounts?.forEach(msg => {
                unreadMap.set(msg.chat_id, (unreadMap.get(msg.chat_id) || 0) + 1);
            });

            data.forEach(chat => {
                chat.unread_count = unreadMap.get(chat.id) || 0;
                chat.other_user = chat.user1_id === user.id ? chat.user2 : chat.user1;
            });
        }

        return data || [];
    }

    // Get messages for a chat
    async getMessages(chatId, limit = 50) {
        const { data, error } = await this.supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .eq('chat_id', chatId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Messages fetch error:', error);
            throw error;
        }

        return (data || []).reverse(); // Reverse to show oldest first
    }

    // Send a message
    async sendMessage(chatId, content) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Check if user is blocked
        const chat = await this.getChat(chatId);
        const otherUserId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;
        const isBlocked = await this.isBlocked(user.id, otherUserId);
        if (isBlocked) {
            throw new Error('Cannot send message: User is blocked');
        }

        const { data, error } = await this.supabase
            .from('messages')
            .insert({
                chat_id: chatId,
                sender_id: user.id,
                content: content.trim()
            })
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url)
            `)
            .single();

        if (error) {
            console.error('Message send error:', error);
            throw error;
        }

        return data;
    }

    // Mark messages as read
    async markAsRead(chatId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Get the chat to find the other user
        const chat = await this.getChat(chatId);
        const otherUserId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;

        const { error } = await this.supabase
            .from('messages')
            .update({ is_read: true })
            .eq('chat_id', chatId)
            .eq('sender_id', otherUserId) // Only mark messages from other user as read
            .eq('is_read', false);

        if (error) {
            console.error('Mark as read error:', error);
            throw error;
        }

        return { success: true };
    }

    // Get a single chat
    async getChat(chatId) {
        const { data, error } = await this.supabase
            .from('chats')
            .select('*')
            .eq('id', chatId)
            .single();

        if (error) throw error;
        return data;
    }

    // Subscribe to new messages in a chat (realtime)
    subscribeToMessages(chatId, callback) {
        const channel = this.supabase
            .channel(`chat:${chatId}`)
            .on('postgres_changes', 
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'messages',
                    filter: `chat_id=eq.${chatId}`
                },
                async (payload) => {
                    // Fetch the full message with sender info
                    const { data } = await this.supabase
                        .from('messages')
                        .select(`
                            *,
                            sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url)
                        `)
                        .eq('id', payload.new.id)
                        .single();
                    
                    callback(data);
                }
            )
            .subscribe();

        this.channels.set(chatId, channel);
        return channel;
    }

    // Unsubscribe from chat
    unsubscribeFromMessages(chatId) {
        const channel = this.channels.get(chatId);
        if (channel) {
            this.supabase.removeChannel(channel);
            this.channels.delete(chatId);
        }
    }

    // Block a user
    async blockUser(userId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('blocked_users')
            .insert({
                blocker_id: user.id,
                blocked_id: userId
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                // Already blocked
                return { success: true, alreadyBlocked: true };
            }
            throw error;
        }

        return data;
    }

    // Unblock a user
    async unblockUser(userId) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { error } = await this.supabase
            .from('blocked_users')
            .delete()
            .eq('blocker_id', user.id)
            .eq('blocked_id', userId);

        if (error) throw error;
        return { success: true };
    }

    // Check if a user is blocked
    async isBlocked(userId1, userId2) {
        const { data } = await this.supabase
            .from('blocked_users')
            .select('id')
            .or(`and(blocker_id.eq.${userId1},blocked_id.eq.${userId2}),and(blocker_id.eq.${userId2},blocked_id.eq.${userId1})`)
            .single();

        return !!data;
    }

    // Report a user or message
    async report(reportedType, reportedId, reason) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('reports')
            .insert({
                reporter_id: user.id,
                reported_type: reportedType, // 'user', 'post', 'comment', 'message'
                reported_id: reportedId,
                reason: reason
            })
            .select()
            .single();

        if (error) {
            console.error('Report creation error:', error);
            throw error;
        }

        return data;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MessagingManager = MessagingManager;
}


