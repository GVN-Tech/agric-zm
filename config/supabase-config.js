// Supabase Configuration
// Replace these with your actual Supabase project credentials

const SUPABASE_CONFIG = {
    url: 'https://vyvvlgoqcisjwmgmmqyi.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dnZsZ29xY2lzandtZ21tcXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzEzNDYsImV4cCI6MjA4NTYwNzM0Nn0.2265xPeMKh2aahD3x-6qfJpLuAVoTPizdw5ZTj45N2s'
};

// Initialize Supabase client
const { createClient } = supabase;
let supabaseClient = null;

const createSupabaseClientSafe = () => {
    try {
        return createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
            auth: {
                detectSessionInUrl: true,
                persistSession: true,
                autoRefreshToken: true
            }
        });
    } catch (error) {
        const message = String(error?.message || error || '');
        const isLockError = message.toLowerCase().includes('lock') || message.toLowerCase().includes('abort');
        if (!isLockError) throw error;

        const originalLocks = (typeof navigator !== 'undefined' && navigator && 'locks' in navigator)
            ? navigator.locks
            : undefined;

        try {
            if (typeof navigator !== 'undefined' && navigator && 'locks' in navigator) {
                try { navigator.locks = undefined; } catch (_) {}
            }

            return createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
                auth: {
                    detectSessionInUrl: true,
                    persistSession: true,
                    autoRefreshToken: true
                }
            });
        } finally {
            if (typeof navigator !== 'undefined' && navigator && 'locks' in navigator) {
                try { navigator.locks = originalLocks; } catch (_) {}
            }
        }
    }
};

try {
    supabaseClient = createSupabaseClientSafe();
} catch (error) {
    console.error('Supabase client init failed:', error);
    supabaseClient = null;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient, SUPABASE_CONFIG };
}

