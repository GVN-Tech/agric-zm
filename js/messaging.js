// Messaging Module
// Handles 1-to-1 real-time messaging using Supabase Realtime

class MessagingManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.channels = new Map();
    }

    async hydrateChatPreviews(chats) {
        const items = Array.isArray(chats) ? chats : [];
        if (!items.length) return items;

        const chatIds = items.map((c) => c && c.id).filter(Boolean);
        if (!chatIds.length) return items;

        const limit = Math.min(Math.max(chatIds.length * 6, 30), 250);

        try {
            const { data, error } = await this.supabase
                .from('messages')
                .select('chat_id, sender_id, content, created_at')
                .in('chat_id', chatIds)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            const previewByChat = new Map();
            (data || []).forEach((row) => {
                if (!row?.chat_id) return;
                if (previewByChat.has(row.chat_id)) return;
                previewByChat.set(row.chat_id, row);
            });

            items.forEach((chat) => {
                const row = previewByChat.get(chat.id);
                if (!row) {
                    chat.last_message_preview = chat.last_message_preview || '';
                    chat.last_message_sender_id = chat.last_message_sender_id || null;
                    chat.last_message_created_at = chat.last_message_created_at || null;
                    return;
                }
                chat.last_message_preview = row.content || '';
                chat.last_message_sender_id = row.sender_id || null;
                chat.last_message_created_at = row.created_at || null;
            });

            return items;
        } catch (_) {
            items.forEach((chat) => {
                chat.last_message_preview = chat.last_message_preview || '';
                chat.last_message_sender_id = chat.last_message_sender_id || null;
                chat.last_message_created_at = chat.last_message_created_at || null;
            });
            return items;
        }
    }

    async hydrateGroupPreviews(groups) {
        const items = Array.isArray(groups) ? groups : [];
        if (!items.length) return items;

        const groupIds = items.map((g) => g && g.id).filter(Boolean);
        if (!groupIds.length) return items;

        const limit = Math.min(Math.max(groupIds.length * 6, 30), 250);

        try {
            const { data, error } = await this.supabase
                .from('group_messages')
                .select('group_id, sender_id, content, created_at')
                .in('group_id', groupIds)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            const previewByGroup = new Map();
            (data || []).forEach((row) => {
                if (!row?.group_id) return;
                if (previewByGroup.has(row.group_id)) return;
                previewByGroup.set(row.group_id, row);
            });

            items.forEach((group) => {
                const row = previewByGroup.get(group.id);
                if (!row) {
                    group.last_message_preview = group.last_message_preview || '';
                    group.last_message_sender_id = group.last_message_sender_id || null;
                    group.last_message_created_at = group.last_message_created_at || null;
                    return;
                }
                group.last_message_preview = row.content || '';
                group.last_message_sender_id = row.sender_id || null;
                group.last_message_created_at = row.created_at || null;
            });

            return items;
        } catch (_) {
            items.forEach((group) => {
                group.last_message_preview = group.last_message_preview || '';
                group.last_message_sender_id = group.last_message_sender_id || null;
                group.last_message_created_at = group.last_message_created_at || null;
            });
            return items;
        }
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
        const chats = data.map(row => {
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
        return await this.hydrateChatPreviews(chats);
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

        return await this.hydrateChatPreviews(data || []);
    }

    async getGroupChats() {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const { data, error } = await this.supabase
            .from('group_members')
            .select(`
                role,
                joined_at,
                group:groups(
                    id,
                    name,
                    description,
                    group_type,
                    crop_tag,
                    province,
                    is_public
                )
            `)
            .eq('user_id', user.id)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('Group chats fetch error:', error);
            throw error;
        }

        const groups = (data || [])
            .map((row) => {
                const group = row.group || null;
                if (!group?.id) return null;
                return {
                    id: group.id,
                    name: group.name,
                    description: group.description,
                    group_type: group.group_type,
                    crop_tag: group.crop_tag,
                    province: group.province,
                    is_public: group.is_public,
                    user_role: row.role
                };
            })
            .filter(Boolean);

        return await this.hydrateGroupPreviews(groups);
    }

    // Get messages for a chat
    async getMessages(chatId, limit = 50) {
        const { data, error } = await this.supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                attachments:message_attachments(*)
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

    async getGroupMessages(groupId, limit = 50) {
        const { data, error } = await this.supabase
            .from('group_messages')
            .select(`
                *,
                sender:profiles!group_messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                attachments:message_attachments(*)
            `)
            .eq('group_id', groupId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Group messages fetch error:', error);
            throw error;
        }

        return (data || []).reverse();
    }

    // Send a message
    async sendMessage(chatId, content, files = []) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        // Check if user is blocked
        const chat = await this.getChat(chatId);
        const otherUserId = chat.user1_id === user.id ? chat.user2_id : chat.user1_id;
        const isBlocked = await this.isBlocked(user.id, otherUserId);
        if (isBlocked) {
            throw new Error('Cannot send message: User is blocked');
        }

        const body = content && content.trim() ? content.trim() : (files && files.length ? 'Attachment' : '');
        if (!body) throw new Error('Message cannot be empty');

        const payload = {
            chat_id: chatId,
            sender_id: user.id,
            content: body
        };

        const { data, error } = await this.supabase
            .from('messages')
            .insert(payload)
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                attachments:message_attachments(*)
            `)
            .single();

        if (error) {
            console.error('Message send error:', error);
            throw error;
        }

        const attachments = await this.uploadMessageAttachments(files, user.id, { messageId: data.id });
        if (attachments.length) {
            data.attachments = attachments;
        }

        return data;
    }

    async sendGroupMessage(groupId, content, files = []) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const body = content && content.trim() ? content.trim() : (files && files.length ? 'Attachment' : '');
        if (!body) throw new Error('Message cannot be empty');

        const { data, error } = await this.supabase
            .from('group_messages')
            .insert({
                group_id: groupId,
                sender_id: user.id,
                content: body
            })
            .select(`
                *,
                sender:profiles!group_messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                attachments:message_attachments(*)
            `)
            .single();

        if (error) {
            console.error('Group message send error:', error);
            throw error;
        }

        const attachments = await this.uploadMessageAttachments(files, user.id, { groupMessageId: data.id });
        if (attachments.length) {
            data.attachments = attachments;
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
                            sender:profiles!messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                            attachments:message_attachments(*)
                        `)
                        .eq('id', payload.new.id)
                        .single();
                    
                    callback(data);
                }
            )
            .subscribe();

        this.channels.set(`chat:${chatId}`, channel);
        return channel;
    }

    // Unsubscribe from chat
    unsubscribeFromMessages(chatId) {
        const channel = this.channels.get(`chat:${chatId}`);
        if (channel) {
            this.supabase.removeChannel(channel);
            this.channels.delete(`chat:${chatId}`);
        }
    }

    subscribeToGroupMessages(groupId, callback) {
        const channel = this.supabase
            .channel(`group:${groupId}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'group_messages',
                    filter: `group_id=eq.${groupId}`
                },
                async (payload) => {
                    const { data } = await this.supabase
                        .from('group_messages')
                        .select(`
                            *,
                            sender:profiles!group_messages_sender_id_fkey(id, first_name, last_name, avatar_url),
                            attachments:message_attachments(*)
                        `)
                        .eq('id', payload.new.id)
                        .single();

                    callback(data);
                }
            )
            .subscribe();

        this.channels.set(`group:${groupId}`, channel);
        return channel;
    }

    unsubscribeFromGroupMessages(groupId) {
        const channel = this.channels.get(`group:${groupId}`);
        if (channel) {
            this.supabase.removeChannel(channel);
            this.channels.delete(`group:${groupId}`);
        }
    }

    async uploadMessageAttachments(files, userId, options = {}) {
        const items = Array.from(files || []).filter(Boolean);
        if (!items.length) return [];

        const maxSize = 10 * 1024 * 1024;
        const allowedFiles = items.filter((file) => file.size <= maxSize);

        const attachments = [];

        for (let i = 0; i < allowedFiles.length; i++) {
            const file = allowedFiles[i];
            const token = Math.random().toString(36).slice(2, 10);
            const cleanName = String(file.name || 'file').replace(/[^\w.\-]+/g, '_');
            const filePath = `${userId}/${Date.now()}_${token}_${cleanName}`;
            const contentType = file.type || 'application/octet-stream';

            try {
                const { error } = await this.supabase.storage
                    .from('message-attachments')
                    .upload(filePath, file, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType
                    });

                if (error) {
                    console.error('Attachment upload error:', error);
                    continue;
                }

                const { data: { publicUrl } } = this.supabase.storage
                    .from('message-attachments')
                    .getPublicUrl(filePath);

                const attachmentRow = {
                    file_url: publicUrl,
                    file_name: file.name || cleanName,
                    file_type: contentType,
                    file_size: file.size || null
                };

                if (options.messageId) attachmentRow.message_id = options.messageId;
                if (options.groupMessageId) attachmentRow.group_message_id = options.groupMessageId;

                const { data: stored, error: insertError } = await this.supabase
                    .from('message_attachments')
                    .insert(attachmentRow)
                    .select('*')
                    .single();

                if (insertError) {
                    console.error('Attachment record error:', insertError);
                    continue;
                }

                attachments.push(stored);
            } catch (error) {
                console.error('Attachment upload failed:', error);
            }
        }

        return attachments;
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
