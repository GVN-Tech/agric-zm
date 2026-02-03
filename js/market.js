// Market Intelligence Module
// Handles price reports, markets, buyer demand

class MarketManager {
    constructor(supabase) {
        this.supabase = supabase;
    }

    // Create a price report
    async createPriceReport(reportData) {
        const { data: { user } } = await this.supabase.auth.getUser();
        if (!user) throw new Error('User must be authenticated');

        const report = {
            reporter_id: user.id,
            crop_or_livestock: reportData.cropOrLivestock,
            unit: reportData.unit,
            price_per_unit: reportData.pricePerUnit,
            currency: reportData.currency || 'ZMW',
            province: reportData.province,
            district: reportData.district,
            market_id: reportData.marketId || null,
            quality_grade: reportData.qualityGrade || null,
            notes: reportData.notes || null,
        };

        const { data, error } = await this.supabase
            .from('price_reports')
            .insert(report)
            .select(`
                *,
                reporter:profiles!price_reports_reporter_id_fkey(id, first_name, last_name),
                market:markets(id, name, district)
            `)
            .single();

        if (error) {
            console.error('Price report creation error:', error);
            throw error;
        }

        return data;
    }

    // Get price reports with filters
    async getPriceReports(options = {}) {
        const {
            cropOrLivestock = null,
            province = null,
            district = null,
            marketId = null,
            limit = 50,
            offset = 0
        } = options;

        let query = this.supabase
            .from('price_reports')
            .select(`
                *,
                reporter:profiles!price_reports_reporter_id_fkey(id, first_name, last_name, avatar_url),
                market:markets(id, name, district, province)
            `)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (cropOrLivestock) {
            query = query.eq('crop_or_livestock', cropOrLivestock);
        }

        if (province) {
            query = query.eq('province', province);
        }

        if (district) {
            query = query.eq('district', district);
        }

        if (marketId) {
            query = query.eq('market_id', marketId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Price reports fetch error:', error);
            throw error;
        }

        return data || [];
    }

    // Get average price for a crop/livestock in a region
    async getAveragePrice(cropOrLivestock, province = null, district = null) {
        let query = this.supabase
            .from('price_reports')
            .select('price_per_unit')
            .eq('crop_or_livestock', cropOrLivestock)
            .order('created_at', { ascending: false })
            .limit(100); // Last 100 reports

        if (province) {
            query = query.eq('province', province);
        }

        if (district) {
            query = query.eq('district', district);
        }

        const { data, error } = await query;

        if (error || !data || data.length === 0) {
            return null;
        }

        const sum = data.reduce((acc, report) => acc + parseFloat(report.price_per_unit), 0);
        const average = sum / data.length;

        return {
            average: Math.round(average * 100) / 100,
            sampleSize: data.length,
            currency: 'ZMW'
        };
    }

    // Get all markets
    async getMarkets(province = null) {
        let query = this.supabase
            .from('markets')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (province) {
            query = query.eq('province', province);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Markets fetch error:', error);
            throw error;
        }

        return data || [];
    }

    // Get price trends (for charts)
    async getPriceTrends(cropOrLivestock, province = null, days = 30) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        let query = this.supabase
            .from('price_reports')
            .select('price_per_unit, created_at')
            .eq('crop_or_livestock', cropOrLivestock)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (province) {
            query = query.eq('province', province);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Price trends fetch error:', error);
            throw error;
        }

        return data || [];
    }

    // Get market posts (buying/selling posts)
    async getMarketPosts(type = null) {
        // type: 'selling', 'buying', 'price_report', or null for all
        let query = this.supabase
            .from('posts')
            .select(`
                *,
                author:profiles!posts_author_id_fkey(id, first_name, last_name, avatar_url, province, district)
            `)
            .eq('is_market_post', true)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });

        if (type) {
            query = query.eq('market_type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Market posts fetch error:', error);
            throw error;
        }

        return data || [];
    }
}

// Export
if (typeof window !== 'undefined') {
    window.MarketManager = MarketManager;
}


