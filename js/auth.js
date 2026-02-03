// Authentication Module
// Handles Supabase Auth: Email/Phone OTP, Profile Creation

class AuthManager {
    constructor(supabase) {
        this.supabase = supabase;
        this.currentUser = null;
        this.currentProfile = null;
    }

    // Initialize auth state listener
    async init() {
        // Check for existing session
        const { data: { session } } = await this.supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user || null;
            await this.loadUserProfile(session.user.id);
        }

        // Listen for auth changes
        this.supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
                this.currentUser = session.user || { id: session.user?.id };
                await this.loadUserProfile(session.user.id);
                this.onAuthChange(true);
            } else if (event === 'SIGNED_OUT') {
                this.currentUser = null;
                this.currentProfile = null;
                this.onAuthChange(false);
            }
        });
    }

    // Load user profile from database
    async loadUserProfile(userId) {
        const { data, error } = await this.supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle();

        if (error) {
            console.error('Error loading profile:', error);
            return null;
        }

        if (!this.currentUser) {
            this.currentUser = { id: userId };
        }

        if (data) {
            this.currentProfile = data;
            this.currentUser = { ...this.currentUser, id: userId, ...data };
            return data;
        }

        // Profile doesn't exist yet - will be created during registration
        return null;
    }

    // Send OTP for email or phone
    async sendOTP(emailOrPhone, type = 'email') {
        try {
            const { data, error } = await this.supabase.auth.signInWithOtp({
                [type]: emailOrPhone,
                options: {
                    shouldCreateUser: true, // Auto-create user if doesn't exist
                    emailRedirectTo: `${window.location.origin}/?view=feed`
                }
            });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('OTP send error:', error);
            return { success: false, error: error.message };
        }
    }

    // Verify OTP and sign in
    async verifyOTP(emailOrPhone, token, type = 'email') {
        try {
            const otpType = type === 'phone' ? 'sms' : 'email';
            const { data, error } = await this.supabase.auth.verifyOtp({
                [type]: emailOrPhone,
                token: token,
                type: otpType
            });

            if (error) throw error;

            // Check if profile exists, if not, redirect to profile creation
            const profile = await this.loadUserProfile(data.user.id);
            
            if (!profile) {
                // New user - needs to create profile
                return { success: true, needsProfile: true, user: data.user };
            }

            return { success: true, needsProfile: false, user: data.user };
        } catch (error) {
            console.error('OTP verify error:', error);
            return { success: false, error: error.message };
        }
    }

    async signUpWithPassword(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signUp({
                email,
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/?view=feed`
                }
            });

            if (error) throw error;

            if (data?.session?.user) {
                this.currentUser = data.session.user;
                await this.loadUserProfile(data.session.user.id);
                const hasProfile = !!this.currentProfile;
                return { success: true, needsProfile: !hasProfile, user: data.session.user };
            }

            return { success: true, needsEmailConfirm: true, user: data?.user || null };
        } catch (error) {
            console.error('Password signup error:', error);
            return { success: false, error: error.message };
        }
    }

    async signInWithPassword(email, password) {
        try {
            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;

            if (data?.user) {
                this.currentUser = data.user;
                await this.loadUserProfile(data.user.id);
                const hasProfile = !!this.currentProfile;
                return { success: true, needsProfile: !hasProfile, user: data.user };
            }

            return { success: true, needsProfile: true, user: null };
        } catch (error) {
            console.error('Password login error:', error);
            return { success: false, error: error.message };
        }
    }

    // Create or update user profile
    async createProfile(profileData) {
        if (!this.currentUser?.id) {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                throw new Error('User not authenticated');
            }
            profileData.id = user.id;
        } else {
            profileData.id = this.currentUser.id;
        }

        const { data, error } = await this.supabase
            .from('profiles')
            .upsert(profileData, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            console.error('Profile creation error:', error);
            throw error;
        }

        this.currentProfile = data;
        this.currentUser = { ...this.currentUser, ...data };
        return data;
    }

    // Sign out
    async signOut() {
        const { error } = await this.supabase.auth.signOut();
        if (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
        this.currentUser = null;
        this.currentProfile = null;
        return { success: true };
    }

    // Get current user
    getUser() {
        return this.currentUser;
    }

    // Get current profile
    getProfile() {
        return this.currentProfile;
    }

    // Check if user is authenticated
    isAuthenticated() {
        return !!this.currentUser;
    }

    // Callback for auth state changes (override in app)
    onAuthChange(isAuthenticated) {
        // Override this in your app
    }
}

// Export
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}


