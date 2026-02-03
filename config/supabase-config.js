// Supabase Configuration
// Replace these with your actual Supabase project credentials

const SUPABASE_CONFIG = {
    url: 'https://vyvvlgoqcisjwmgmmqyi.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dnZsZ29xY2lzandtZ21tcXlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwMzEzNDYsImV4cCI6MjA4NTYwNzM0Nn0.2265xPeMKh2aahD3x-6qfJpLuAVoTPizdw5ZTj45N2s'
};

// Initialize Supabase client
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { supabaseClient, SUPABASE_CONFIG };
}


