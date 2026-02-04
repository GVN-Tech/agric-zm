// Search Manager
// Enhanced search functionality with history, advanced filtering, and multi-type search

class SearchManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.searchHistory = [];
        this.recentSearches = [];
    }

    // Enhanced search across multiple types
    async searchAll(query, options = {}) {
        const {
            searchType = 'all', // all, farmer, crop, market, post, group
            filters = {},
            limit = 20
        } = options;

        const q = (query || '').trim();
        if (!q) return { results: [], suggestions: [] };

        try {
            // Save search to history
            await this.saveSearchHistory(q, searchType, filters);

            // Perform search based on type
            let results = [];
            let suggestions = [];

            switch (searchType) {
                case 'farmer':
                    results = await this.searchFarmers(q, { ...filters, limit });
                    suggestions = await this.getSearchSuggestions(q, 'farmer');
                    break;
                case 'crop':
                    results = await this.searchCrops(q, { ...filters, limit });
                    suggestions = await this.getSearchSuggestions(q, 'crop');
                    break;
                case 'market':
                    results = await this.searchMarkets(q, { ...filters, limit });
                    suggestions = await this.getSearchSuggestions(q, 'market');
                    break;
                case 'post':
                    results = await this.searchPosts(q, { ...filters, limit });
                    suggestions = await this.getSearchSuggestions(q, 'post');
                    break;
                case 'group':
                    results = await this.searchGroups(q, { ...filters, limit });
                    suggestions = await this.getSearchSuggestions(q, 'group');
                    break;
                default: // 'all'
                    const [farmers, crops, markets, posts, groups] = await Promise.all([
                        this.searchFarmers(q, { ...filters, limit: 5 }),
                        this.searchCrops(q, { ...filters, limit: 5 }),
                        this.searchMarkets(q, { ...filters, limit: 5 }),
                        this.searchPosts(q, { ...filters, limit: 5 }),
                        this.searchGroups(q, { ...filters, limit: 5 })
                    ]);
                    
                    results = [
                        ...farmers.map(item => ({ ...item, type: 'farmer' })),
                        ...crops.map(item => ({ ...item, type: 'crop' })),
                        ...markets.map(item => ({ ...item, type: 'market' })),
                        ...posts.map(item => ({ ...item, type: 'post' })),
                        ...groups.map(item => ({ ...item, type: 'group' }))
                    ];
                    
                    suggestions = await this.getSearchSuggestions(q, 'all');
                    break;
            }

            return { results, suggestions, query: q, searchType, filters };
        } catch (error) {
            console.error('Search error:', error);
            throw error;
        }
    }

    // Search farmers with advanced filters
    async searchFarmers(query, options = {}) {
        const {
            cropTag = '',
            province = '',
            farmerType = '',
            minFarmSize = 0,
            maxFarmSize = 1000,
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
        if (minFarmSize > 0) builder = builder.gte('farm_size_ha', minFarmSize);
        if (maxFarmSize < 1000) builder = builder.lte('farm_size_ha', maxFarmSize);

        if (q) {
            builder = builder.or(
                [
                    `first_name.ilike.%${q}%`,
                    `last_name.ilike.%${q}%`,
                    `province.ilike.%${q}%`,
                    `district.ilike.%${q}%`,
                    `crops.ilike.%${q}%`,
                    `livestock.ilike.%${q}%`,
                    `bio.ilike.%${q}%`
                ].join(',')
            );
        }

        const { data, error } = await builder;
        if (error) throw error;
        return data || [];
    }

    // Search crops (from posts and profiles)
    async searchCrops(query, options = {}) {
        const { province = '', district = '', limit = 20 } = options;
        const q = (query || '').trim();

        // Search in profiles (farmers growing this crop)
        const farmersBuilder = this.supabase
            .from('profiles')
            .select('id, first_name, last_name, avatar_url, province, district, crops, farm_size_ha, is_verified')
            .ilike('crops', `%${q}%`)
            .limit(limit);

        if (province) farmersBuilder.eq('province', province);
        if (district) farmersBuilder.eq('district', district);

        // Search in posts (posts about this crop)
        const postsBuilder = this.supabase
            .from('posts')
            .select(`id, content, crop_tags, location_province, location_district, created_at, author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url)`)
            .contains('crop_tags', [q])
            .limit(limit);

        const [farmersResult, postsResult] = await Promise.all([
            farmersBuilder,
            postsBuilder
        ]);

        if (farmersResult.error) throw farmersResult.error;
        if (postsResult.error) throw postsResult.error;

        return [
            ...(farmersResult.data || []).map(farmer => ({
                ...farmer,
                type: 'farmer_crop',
                search_relevance: 'high'
            })),
            ...(postsResult.data || []).map(post => ({
                ...post,
                type: 'post_crop',
                search_relevance: 'medium'
            }))
        ];
    }

    // Search markets
    async searchMarkets(query, options = {}) {
        const { province = '', district = '', commodity = '', limit = 20 } = options;
        const q = (query || '').trim();

        let builder = this.supabase
            .from('markets')
            .select('id, name, province, district, commodities, current_prices, last_updated')
            .order('last_updated', { ascending: false })
            .limit(limit);

        if (province) builder = builder.eq('province', province);
        if (district) builder = builder.eq('district', district);
        if (commodity) builder = builder.ilike('commodities', `%${commodity}%`);

        if (q) {
            builder = builder.or(
                [
                    `name.ilike.%${q}%`,
                    `province.ilike.%${q}%`,
                    `district.ilike.%${q}%`,
                    `commodities.ilike.%${q}%`
                ].join(',')
            );
        }

        const { data, error } = await builder;
        if (error) throw error;
        return data || [];
    }

    // Search posts
    async searchPosts(query, options = {}) {
        const { cropTag = '', province = '', district = '', limit = 20 } = options;
        const q = (query || '').trim();

        let builder = this.supabase
            .from('posts')
            .select(`id, content, crop_tags, location_province, location_district, created_at, likes_count, comments_count, author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url)`)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (province) builder = builder.eq('location_province', province);
        if (district) builder = builder.eq('location_district', district);
        if (cropTag) builder = builder.contains('crop_tags', [cropTag]);

        if (q) {
            builder = builder.or(
                [
                    `content.ilike.%${q}%`,
                    `crop_tags.cs.{${q}}`,
                    `location_province.ilike.%${q}%`,
                    `location_district.ilike.%${q}%`
                ].join(',')
            );
        }

        const { data, error } = await builder;
        if (error) throw error;
        return data || [];
    }

    // Search groups
    async searchGroups(query, options = {}) {
        const { groupType = '', cropTag = '', province = '', limit = 20 } = options;
        const q = (query || '').trim();

        let builder = this.supabase
            .from('groups')
            .select('id, name, description, group_type, crop_tag, is_public, member_count, created_at, created_by')
            .order('member_count', { ascending: false })
            .limit(limit);

        if (groupType) builder = builder.eq('group_type', groupType);
        if (cropTag) builder = builder.eq('crop_tag', cropTag);
        if (province) builder = builder.ilike('description', `%${province}%`);

        if (q) {
            builder = builder.or(
                [
                    `name.ilike.%${q}%`,
                    `description.ilike.%${q}%`,
                    `group_type.ilike.%${q}%`,
                    `crop_tag.ilike.%${q}%`
                ].join(',')
            );
        }

        const { data, error } = await builder;
        if (error) throw error;
        return data || [];
    }

    // Save search to history
    async saveSearchHistory(query, searchType, filters = {}) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await this.supabase
                .from('search_history')
                .insert({
                    user_id: user.id,
                    query: query,
                    search_type: searchType,
                    filters: filters,
                    result_count: 0 // Will be updated after search
                })
                .select()
                .single();

            if (!error && data) {
                this.searchHistory.unshift(data);
                this.recentSearches.unshift(data);
                
                // Keep only last 10 recent searches
                if (this.recentSearches.length > 10) {
                    this.recentSearches = this.recentSearches.slice(0, 10);
                }
            }
        } catch (error) {
            console.error('Error saving search history:', error);
        }
    }

    // Get search suggestions based on query
    async getSearchSuggestions(query, searchType = 'all') {
        const q = (query || '').trim();
        if (!q || q.length < 2) return [];

        try {
            // Get popular searches from history (excluding current user)
            const { data: popularSearches, error } = await this.supabase
                .from('search_history')
                .select('query, search_type, COUNT(*) as search_count')
                .ilike('query', `${q}%`)
                .neq('search_type', searchType)
                .group('query, search_type')
                .order('search_count', { ascending: false })
                .limit(5);

            if (error) throw error;

            // Get trending searches (most searched in last 7 days)
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data: trendingSearches } = await this.supabase
                .from('search_history')
                .select('query, search_type, COUNT(*) as search_count')
                .gte('created_at', sevenDaysAgo.toISOString())
                .ilike('query', `${q}%`)
                .group('query, search_type')
                .order('search_count', { ascending: false })
                .limit(5);

            const suggestions = [
                ...(popularSearches || []).map(item => ({
                    query: item.query,
                    type: item.search_type,
                    count: item.search_count,
                    source: 'popular'
                })),
                ...(trendingSearches || []).map(item => ({
                    query: item.query,
                    type: item.search_type,
                    count: item.search_count,
                    source: 'trending'
                }))
            ];

            // Remove duplicates and sort by count
            const uniqueSuggestions = suggestions.filter((suggestion, index, self) =>
                index === self.findIndex(s => s.query === suggestion.query && s.type === suggestion.type)
            ).sort((a, b) => b.count - a.count);

            return uniqueSuggestions.slice(0, 8);
        } catch (error) {
            console.error('Error getting search suggestions:', error);
            return [];
        }
    }

    // Get user's search history
    async getUserSearchHistory(limit = 10) {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return [];

            const { data, error } = await this.supabase
                .from('search_history')
                .select('id, query, search_type, filters, created_at')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting search history:', error);
            return [];
        }
    }

    // Clear user's search history
    async clearSearchHistory() {
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return;

            const { error } = await this.supabase
                .from('search_history')
                .delete()
                .eq('user_id', user.id);

            if (error) throw error;
            
            this.searchHistory = [];
            this.recentSearches = [];
            
            return true;
        } catch (error) {
            console.error('Error clearing search history:', error);
            throw error;
        }
    }

    // Get trending searches across platform
    async getTrendingSearches(limit = 10) {
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const { data, error } = await this.supabase
                .from('search_history')
                .select('query, search_type, COUNT(*) as search_count')
                .gte('created_at', sevenDaysAgo.toISOString())
                .group('query, search_type')
                .order('search_count', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.error('Error getting trending searches:', error);
            return [];
        }
    }

    // Get search analytics for farmers (popular crops, regions, etc.)
    async getSearchAnalytics() {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Top searched crops
            const { data: topCrops } = await this.supabase
                .from('search_history')
                .select('query, COUNT(*) as search_count')
                .eq('search_type', 'crop')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .group('query')
                .order('search_count', { ascending: false })
                .limit(10);

            // Top searched regions
            const { data: topRegions } = await this.supabase
                .from('search_history')
                .select('filters->>province as province, COUNT(*) as search_count')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .group('filters->>province')
                .order('search_count', { ascending: false })
                .limit(10);

            // Search type distribution
            const { data: searchTypes } = await this.supabase
                .from('search_history')
                .select('search_type, COUNT(*) as search_count')
                .gte('created_at', thirtyDaysAgo.toISOString())
                .group('search_type')
                .order('search_count', { ascending: false });

            return {
                topCrops: topCrops || [],
                topRegions: topRegions || [],
                searchTypes: searchTypes || []
            };
        } catch (error) {
            console.error('Error getting search analytics:', error);
            return { topCrops: [], topRegions: [], searchTypes: [] };
        }
    }
}