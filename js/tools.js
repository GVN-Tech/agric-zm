// Farming Tools: Calculators & Weather
// Adds industry-specific utility to the platform

class ToolsManager {
    constructor() {
        this.weatherApiKey = 'MOCK_API_KEY'; // In production, use real API
    }

    // --- Calculators ---

    // Calculate Seed Rate
    // formula: (Target Plants per ha * 10000) / (Germination % * Purity %) ... simplified for MVP
    calculateSeedRate(crop, areaHa) {
        const seedRates = {
            'Maize': 25, // kg per ha
            'Soybeans': 80,
            'Wheat': 100,
            'Groundnuts': 80,
            'Sunflower': 40
        };

        const rate = seedRates[crop] || 0;
        if (!rate) return null;

        return {
            crop: crop,
            area: areaHa,
            seedNeededKg: rate * areaHa,
            bagsNeeded: Math.ceil((rate * areaHa) / 25) // Assuming 25kg bags
        };
    }

    // Calculate Fertilizer
    // Simplified NPK recommendation
    calculateFertilizer(crop, areaHa) {
        // Standard recommendations (basal + top dressing)
        const recommendations = {
            'Maize': { basal: 4, top: 4 }, // bags (50kg) per ha
            'Soybeans': { basal: 2, top: 0 },
            'Wheat': { basal: 4, top: 4 }
        };

        const rec = recommendations[crop];
        if (!rec) return null;

        return {
            crop: crop,
            area: areaHa,
            basalBags: Math.ceil(rec.basal * areaHa),
            topBags: Math.ceil(rec.top * areaHa),
            totalBags: Math.ceil((rec.basal + rec.top) * areaHa)
        };
    }

    // --- Weather ---

    // Get Weather Forecast using OpenMeteo API (Free, no key required)
    async getWeather(province) {
        // Default coordinates for Lusaka
        let lat = -15.4167;
        let lon = 28.2833;
        
        // Approximate coordinates for Zambian provinces
        const provinceCoords = {
            'Lusaka': { lat: -15.4167, lon: 28.2833 },
            'Copperbelt': { lat: -12.9667, lon: 28.6333 }, // Ndola
            'Central': { lat: -14.4333, lon: 28.4500 }, // Kabwe
            'Southern': { lat: -16.8500, lon: 26.9833 }, // Choma
            'Western': { lat: -15.2833, lon: 23.1500 }, // Mongu
            'Eastern': { lat: -13.6333, lon: 32.6500 }, // Chipata
            'Northern': { lat: -10.2000, lon: 31.1833 }, // Kasama
            'Luapula': { lat: -11.1000, lon: 28.8833 }, // Mansa
            'North-Western': { lat: -12.1833, lon: 26.4000 }, // Solwezi
            'Muchinga': { lat: -11.8333, lon: 31.4333 } // Chinsali
        };

        if (province && provinceCoords[province]) {
            lat = provinceCoords[province].lat;
            lon = provinceCoords[province].lon;
        }

        try {
            // Fetch 5-day forecast
            const response = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Africa%2FLusaka`
            );
            
            if (!response.ok) throw new Error('Weather API failed');
            
            const data = await response.json();
            const daily = data.daily;
            const forecast = [];

            for (let i = 0; i < 5; i++) {
                const date = new Date(daily.time[i]);
                const code = daily.weathercode[i];
                const condition = this.getWeatherCondition(code);
                
                forecast.push({
                    date: date.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric' }),
                    tempHigh: Math.round(daily.temperature_2m_max[i]),
                    tempLow: Math.round(daily.temperature_2m_min[i]),
                    condition: condition.text,
                    icon: condition.icon,
                    rainfall: daily.precipitation_sum[i].toFixed(1)
                });
            }

            return {
                location: province || 'Lusaka',
                current: forecast[0],
                forecast: forecast
            };

        } catch (error) {
            console.error('Weather API error:', error);
            // Fallback to mock data if offline or API fails
            return this.getMockWeather(province);
        }
    }

    // WMO Weather interpretation codes (http://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM)
    getWeatherCondition(code) {
        if (code === 0) return { text: 'Sunny', icon: '☀️' };
        if (code >= 1 && code <= 3) return { text: 'Partly Cloudy', icon: '⛅' };
        if (code >= 45 && code <= 48) return { text: 'Foggy', icon: '🌫️' };
        if (code >= 51 && code <= 67) return { text: 'Rainy', icon: '🌧️' };
        if (code >= 71 && code <= 77) return { text: 'Snow', icon: '❄️' }; // Rare in Zambia!
        if (code >= 80 && code <= 82) return { text: 'Heavy Rain', icon: '⛈️' };
        if (code >= 95 && code <= 99) return { text: 'Thunderstorm', icon: '⚡' };
        return { text: 'Unknown', icon: '🌡️' };
    }

    // Mock Fallback
    async getMockWeather(province) {
        const weatherTypes = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy'];
        const mockForecast = [];

        for (let i = 0; i < 5; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const type = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
            
            mockForecast.push({
                date: date.toLocaleDateString('en-ZM', { weekday: 'short', day: 'numeric' }),
                tempHigh: 25 + Math.floor(Math.random() * 10),
                tempLow: 15 + Math.floor(Math.random() * 5),
                condition: type,
                icon: type === 'Sunny' ? '☀️' : (type === 'Rainy' ? '🌧️' : '☁️'),
                rainfall: type === 'Rainy' ? (Math.random() * 20).toFixed(1) : 0
            });
        }

        return {
            location: province || 'Lusaka',
            current: mockForecast[0],
            forecast: mockForecast
        };
    }

    getWeatherIcon(condition) {
        // Legacy method kept for compatibility
        return '🌡️';
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ToolsManager = ToolsManager;
}
