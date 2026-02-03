// Main Application Controller
// Coordinates all modules and handles UI interactions

var App;

class AppController {
    constructor() {
        this.authManager = null;
        this.postsManager = null;
        this.marketManager = null;
        this.groupsManager = null;
        this.messagingManager = null;
        this.currentView = 'landing';
        this.currentChatId = null;
        this.currentChatChannel = null;
        this.postLoginRedirect = null;
        this.routingInitialized = false;
        this.authMode = 'password';
        this.feedFilters = { province: '', cropTag: '', photosOnly: false };
        this.marketFilters = { cropOrLivestock: '', province: '', district: '' };
        this.marketPostFilter = null;
        this.navMenuHost = null;
        this.storiesStorageKey = 'agrilovers.stories.v1';
        this.storyDraftImage = null;
        this.farmerSearchDebounced = null;
    }

    async init() {
        this.showLoading(true);
        try {
            this.setupRouting();
            this.setupLandingCarousel();
            this.setupResponsiveNav();
            this.setupStories();
            this.setupFarmerDiscovery();
            this.setupComposer();

            const requestedView = this.getViewFromUrl();

            // Check if Supabase is configured
            const isSupabaseConfigured = SUPABASE_CONFIG.url && 
                                        SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
                                        SUPABASE_CONFIG.anonKey &&
                                        SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY';
            
            if (!isSupabaseConfigured) {
                // Graceful degradation - show UI but with demo mode
                console.warn('Supabase not configured - running in preview mode');
                this.showPreviewMode();
                this.switchView(requestedView || 'feed', false);
                return;
            }

            // Initialize managers
            if (!supabaseClient) {
                console.warn('Supabase client failed to initialize - running in preview mode');
                this.showPreviewMode();
                this.switchView(requestedView || 'feed', false);
                return;
            }
            this.supabase = supabaseClient;
            this.authManager = new AuthManager(supabaseClient);
            this.postsManager = new PostsManager(supabaseClient);
            this.marketManager = new MarketManager(supabaseClient);
            this.groupsManager = new GroupsManager(supabaseClient);
            this.messagingManager = new MessagingManager(supabaseClient);
            this.toolsManager = new ToolsManager();

            if (this.authManager && typeof this.authManager.signInWithPassword !== 'function') {
                this.authManager.signInWithPassword = async (email, password) => {
                    try {
                        const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
                        if (error) throw error;

                        if (data?.user) {
                            if (typeof this.authManager.loadUserProfile === 'function') {
                                await this.authManager.loadUserProfile(data.user.id);
                            }
                            const hasProfile = !!(typeof this.authManager.getProfile === 'function' ? this.authManager.getProfile() : null);
                            return { success: true, needsProfile: !hasProfile, user: data.user };
                        }

                        return { success: true, needsProfile: true, user: null };
                    } catch (error) {
                        console.error('Password login error:', error);
                        return { success: false, error: error?.message || 'Login failed' };
                    }
                };
            }

            if (this.authManager && typeof this.authManager.signUpWithPassword !== 'function') {
                this.authManager.signUpWithPassword = async (email, password) => {
                    try {
                        const { data, error } = await this.supabase.auth.signUp({ email, password });
                        if (error) throw error;

                        if (data?.session?.user) {
                            if (typeof this.authManager.loadUserProfile === 'function') {
                                await this.authManager.loadUserProfile(data.session.user.id);
                            }
                            const hasProfile = !!(typeof this.authManager.getProfile === 'function' ? this.authManager.getProfile() : null);
                            return { success: true, needsProfile: !hasProfile, user: data.session.user };
                        }

                        return { success: true, needsEmailConfirm: true, user: data?.user || null };
                    } catch (error) {
                        console.error('Password signup error:', error);
                        return { success: false, error: error?.message || 'Signup failed' };
                    }
                };
            }

            // Set up auth state change handler
            this.authManager.onAuthChange = (isAuthenticated) => {
                this.handleAuthChange(isAuthenticated);
            };

            // Initialize auth
            await this.authManager.init();
            this.handleAuthChange(this.authManager.isAuthenticated());

            // Load initial view
            if (!this.authManager.isAuthenticated()) {
                if (requestedView && requestedView !== 'landing') {
                    this.postLoginRedirect = requestedView;
                }
                this.switchView('landing', false);
                return;
            }

            const initialView = requestedView && requestedView !== 'landing' ? requestedView : 'feed';
            this.switchView(initialView, false);

            // Set up realtime subscriptions
            this.setupRealtimeSubscriptions();

        } catch (error) {
            console.error('App initialization error:', error);
            // Still show UI even if there's an error
            this.switchView('feed');
            this.showAlert('Some features may not work. Check console for details.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    setupResponsiveNav() {
        const apply = () => {
            const navbarMenu = document.getElementById('navbarMenu');
            const navbarContainer = document.querySelector('.navbar-container');
            if (!navbarMenu || !navbarContainer) return;

            const isMobile = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;

            if (!this.navMenuHost) {
                this.navMenuHost = navbarMenu.parentElement || navbarContainer;
            }

            if (isMobile) {
                if (navbarMenu.parentElement !== document.body) {
                    document.body.appendChild(navbarMenu);
                }
            } else {
                if (navbarMenu.parentElement !== navbarContainer) {
                    navbarContainer.appendChild(navbarMenu);
                }
            }
        };

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(apply, 80);
        });

        apply();
    }

    setupStories() {
        const row = document.getElementById('storiesRow');
        if (!row) return;

        const addBtn = document.getElementById('addStoryBtn') || row.querySelector('.story-add');
        const createForm = document.getElementById('storyCreateForm');
        const imageInput = document.getElementById('storyImageInput');
        const imagePreview = document.getElementById('storyImagePreview');
        const captionInput = document.getElementById('storyCaption');

        const startDragScroll = () => {
            let isDown = false;
            let startX = 0;
            let startScrollLeft = 0;
            let pointerId = null;

            row.addEventListener('pointerdown', (event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                isDown = true;
                pointerId = event.pointerId;
                startX = event.clientX;
                startScrollLeft = row.scrollLeft;
                row.classList.add('is-dragging');
                try { row.setPointerCapture(pointerId); } catch (_) {}
            });

            row.addEventListener('pointermove', (event) => {
                if (!isDown) return;
                const dx = event.clientX - startX;
                row.scrollLeft = startScrollLeft - dx;
            });

            const end = () => {
                isDown = false;
                pointerId = null;
                row.classList.remove('is-dragging');
            };

            row.addEventListener('pointerup', end);
            row.addEventListener('pointercancel', end);
            row.addEventListener('lostpointercapture', end);

            row.addEventListener('wheel', (event) => {
                const useY = Math.abs(event.deltaY) > Math.abs(event.deltaX);
                if (!useY) return;
                row.scrollLeft += event.deltaY;
                event.preventDefault();
            }, { passive: false });
        };

        const saveStories = (stories) => {
            try {
                localStorage.setItem(this.storiesStorageKey, JSON.stringify(stories));
            } catch (_) {}
        };

        const loadStories = () => {
            try {
                const raw = localStorage.getItem(this.storiesStorageKey);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_) {
                return [];
            }
        };

        const renderStoryElement = (story) => {
            const el = document.createElement('div');
            el.className = 'story';
            el.dataset.storyId = story.id;
            el.dataset.storyTitle = story.title || 'Story';
            el.dataset.storyType = story.type || 'emoji';
            el.dataset.storyCreatedAt = story.createdAt || '';
            if (story.imageDataUrl) {
                el.style.setProperty('--story-image', `url("${story.imageDataUrl}")`);
            }

            const img = document.createElement('div');
            img.className = 'story-image';
            img.textContent = story.type === 'image' ? '📷' : (story.emoji || '🌱');

            const label = document.createElement('div');
            label.className = 'story-label';
            label.textContent = story.title || 'Story';

            el.appendChild(img);
            el.appendChild(label);
            return el;
        };

        const setupCreateModal = () => {
            if (!createForm || !imageInput || !captionInput || !imagePreview) return;

            const showPreview = (dataUrl) => {
                imagePreview.style.display = dataUrl ? '' : 'none';
                imagePreview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Story preview">` : '';
            };

            imageInput.addEventListener('change', async () => {
                const file = imageInput.files && imageInput.files[0];
                if (!file) {
                    this.storyDraftImage = null;
                    showPreview(null);
                    return;
                }

                try {
                    this.storyDraftImage = await this.prepareStoryImage(file);
                    showPreview(this.storyDraftImage);
                } catch (error) {
                    console.error('Story image processing failed:', error);
                    this.storyDraftImage = null;
                    showPreview(null);
                    this.showAlert('Could not load that image. Try a smaller photo.', 'error');
                }
            });
        };

        const setupAddButton = () => {
            if (!addBtn) return;

            const openCreate = () => {
                this.storyDraftImage = null;
                if (imageInput) imageInput.value = '';
                if (captionInput) captionInput.value = '';
                if (imagePreview) {
                    imagePreview.style.display = 'none';
                    imagePreview.innerHTML = '';
                }
                this.openModal('storyCreateModal');
            };

            addBtn.addEventListener('click', openCreate);
            addBtn.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openCreate();
                }
            });
        };

        const setupStoryViewer = () => {
            row.addEventListener('click', (event) => {
                const target = event.target instanceof Element ? event.target : null;
                if (!target) return;
                const storyEl = target.closest('.story');
                if (!storyEl || storyEl.classList.contains('story-add')) return;

                const title = storyEl.dataset.storyTitle || 'Story';
                const type = storyEl.dataset.storyType || 'emoji';
                const createdAt = storyEl.dataset.storyCreatedAt || '';
                const storyId = storyEl.dataset.storyId || '';
                const stored = loadStories();
                const storedStory = stored.find((s) => String(s.id) === String(storyId));

                const viewerTitle = document.getElementById('storyViewerTitle');
                const viewerMedia = document.getElementById('storyViewerMedia');
                const viewerMeta = document.getElementById('storyViewerMeta');

                if (viewerTitle) viewerTitle.textContent = title;
                if (viewerMeta) viewerMeta.textContent = createdAt ? this.formatTimeAgo(createdAt) : '';

                if (viewerMedia) {
                    const storyImage = storedStory?.imageDataUrl;
                    if (type === 'image' && storyImage) {
                        viewerMedia.innerHTML = `<img src="${storyImage}" alt="${this.escapeHtml(title)}">`;
                    } else {
                        const emoji = (storedStory && storedStory.emoji) ? storedStory.emoji : (storyEl.querySelector('.story-image')?.textContent || '🌿');
                        viewerMedia.innerHTML = `<div class="story-emoji">${this.escapeHtml(emoji)}</div>`;
                    }
                }

                this.openModal('storyViewerModal');
            });
        };

        const hydrateSavedStories = () => {
            const saved = loadStories();
            if (!saved.length) return;
            const insertPoint = row.querySelector('.story-add')?.nextSibling || null;
            saved
                .slice()
                .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
                .forEach((story) => {
                    const el = renderStoryElement(story);
                    row.insertBefore(el, insertPoint);
                });
        };

        startDragScroll();
        setupCreateModal();
        setupAddButton();
        setupStoryViewer();
        hydrateSavedStories();
    }

    setupFarmerDiscovery() {
        const queryEl = document.getElementById('farmerSearchQuery');
        const cropEl = document.getElementById('farmerCropTag');
        const provinceEl = document.getElementById('farmerProvince');
        const typeEl = document.getElementById('farmerType');
        const resultsEl = document.getElementById('farmerSearchResults');
        if (!queryEl || !resultsEl) return;

        const schedule = this.debounce(() => this.searchFarmers(), 250);
        this.farmerSearchDebounced = schedule;

        queryEl.addEventListener('input', schedule);
        cropEl?.addEventListener('input', schedule);
        provinceEl?.addEventListener('change', schedule);
        typeEl?.addEventListener('change', schedule);
    }

    setupComposer() {
        const promptBtn = document.querySelector('#postComposer .composer-input');
        const textarea = document.getElementById('postContent');
        if (!promptBtn || !textarea) return;
        promptBtn.addEventListener('click', () => {
            textarea.focus();
            textarea.scrollIntoView({ block: 'center', behavior: 'smooth' });
        });
    }

    async prepareStoryImage(file) {
        const maxSize = 1080;
        const quality = 0.84;

        const bitmap = (window.createImageBitmap ? await window.createImageBitmap(file) : null);
        if (!bitmap) {
            const dataUrl = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('file read failed'));
                reader.readAsDataURL(file);
            });
            return dataUrl;
        }

        const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        ctx.drawImage(bitmap, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        try { bitmap.close(); } catch (_) {}
        return dataUrl;
    }

    handleStoryCreate(event) {
        event.preventDefault();

        const row = document.getElementById('storiesRow');
        const captionInput = document.getElementById('storyCaption');
        if (!row) return;

        const title = (captionInput && captionInput.value ? captionInput.value.trim() : '') || 'My Story';
        const createdAt = new Date().toISOString();

        const story = {
            id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            type: this.storyDraftImage ? 'image' : 'emoji',
            title,
            emoji: this.storyDraftImage ? null : '🌿',
            imageDataUrl: this.storyDraftImage || null,
            createdAt
        };

        let stored = [];
        try {
            const raw = localStorage.getItem(this.storiesStorageKey);
            stored = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(stored)) stored = [];
        } catch (_) {
            stored = [];
        }

        stored.unshift(story);
        try {
            localStorage.setItem(this.storiesStorageKey, JSON.stringify(stored.slice(0, 30)));
        } catch (_) {}

        const addEl = document.getElementById('addStoryBtn') || row.querySelector('.story-add');
        const el = (() => {
            const wrap = document.createElement('div');
            wrap.className = 'story';
            wrap.dataset.storyId = story.id;
            wrap.dataset.storyTitle = story.title;
            wrap.dataset.storyType = story.type;
            wrap.dataset.storyCreatedAt = story.createdAt;
            if (story.imageDataUrl) {
                wrap.style.setProperty('--story-image', `url("${story.imageDataUrl}")`);
            }

            const img = document.createElement('div');
            img.className = 'story-image';
            img.textContent = story.type === 'image' ? '📷' : (story.emoji || '🌿');

            const label = document.createElement('div');
            label.className = 'story-label';
            label.textContent = story.title;

            wrap.appendChild(img);
            wrap.appendChild(label);
            return wrap;
        })();

        if (addEl && addEl.nextSibling) {
            row.insertBefore(el, addEl.nextSibling);
        } else {
            row.appendChild(el);
        }

        this.closeModal('storyCreateModal');
        this.showAlert('Story posted', 'success');
    }

    // Load Weather
    async loadWeather() {
        if (!this.toolsManager) return;
        
        const widget = document.getElementById('weatherWidget');
        if (!widget) return;

        try {
            // Get user location from profile if available, else default
            const profile = this.authManager.getProfile();
            const location = profile?.province || 'Lusaka';
            
            const weather = await this.toolsManager.getWeather(location);
            
            widget.innerHTML = `
                <div class="weather-widget-header">
                    <div>
                        <h3 class="weather-location">${this.escapeHtml(weather.location)}</h3>
                        <div class="weather-date">${weather.current.date}</div>
                    </div>
                    <div style="text-align: right;">
                        <div class="weather-temp-large">${weather.current.tempHigh}°C</div>
                        <div class="weather-condition">${weather.current.icon} ${weather.current.condition}</div>
                    </div>
                </div>
                <div class="weather-forecast">
                    ${weather.forecast.slice(1).map(day => `
                        <div class="weather-day">
                            <div class="weather-day-date">${day.date}</div>
                            <div class="weather-day-icon">${day.icon}</div>
                            <div class="weather-day-temp">${day.tempHigh}°</div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (error) {
            console.error('Weather load error:', error);
        }
    }

    // Calculator Modal
    openCalculatorModal() {
        this.openModal('calculatorModal');
    }

    // Handle Calculator Calculation
    calculateTools() {
        const type = document.getElementById('calcType').value;
        const crop = document.getElementById('calcCrop').value;
        const area = parseFloat(document.getElementById('calcArea').value);
        const resultDiv = document.getElementById('calcResult');

        if (!crop || !area) {
            resultDiv.innerHTML = '<p style="color: var(--error);">Please enter all fields</p>';
            return;
        }

        let result;
        if (type === 'seed') {
            result = this.toolsManager.calculateSeedRate(crop, area);
            if (result) {
                resultDiv.innerHTML = `
                    <div class="result-card">
                        <h4>Seed Requirement</h4>
                        <p>For <strong>${area} ha</strong> of <strong>${crop}</strong>:</p>
                        <div class="result-highlight">
                            ${result.seedNeededKg} kg
                        </div>
                        <p>Approx. <strong>${result.bagsNeeded} bags</strong> (25kg)</p>
                    </div>
                `;
            }
        } else {
            result = this.toolsManager.calculateFertilizer(crop, area);
            if (result) {
                resultDiv.innerHTML = `
                    <div class="result-card">
                        <h4>Fertilizer Estimate</h4>
                        <p>For <strong>${area} ha</strong> of <strong>${crop}</strong>:</p>
                        <ul class="result-list">
                            <li class="result-list-item">Basal: <strong>${result.basalBags} bags</strong></li>
                            <li class="result-list-item">Top Dressing: <strong>${result.topBags} bags</strong></li>
                            <li class="result-list-total">
                                Total: <strong>${result.totalBags} bags</strong> (50kg)
                            </li>
                        </ul>
                    </div>
                `;
            }
        }

        if (!result) {
            resultDiv.innerHTML = '<p>Data not available for this crop.</p>';
        }
    }

    // Show preview mode with demo data
    showPreviewMode() {
        // Double check configuration before showing preview
        if (SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' && SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY') {
             // Config is valid, do not show preview mode
             const container = document.getElementById('previewModeContainer');
             if (container) container.style.display = 'none';
             const postsContainer = document.getElementById('postsContainer');
             if (postsContainer) postsContainer.style.display = 'block';
             return;
        }

        // We do NOT want to show preview mode if we have valid config!
        // This function is only called if configuration check fails.
        const container = document.getElementById('previewModeContainer');
        if (container) {
            container.style.display = 'block';
            document.getElementById('postsContainer').style.display = 'none';
        }
    }

    renderPreviewContentForView(viewName) {
        const normalized = (viewName || '').trim().toLowerCase();

        const demoMarketPosts = [
            {
                id: 'demo-market-post-1',
                author: { first_name: 'Chipo', last_name: 'M.', avatar_url: null },
                content: 'SELLING: Maize\nQuantity: 20 x 50kg bags\nPrice: ZMW 1,800 per bag\nNotes: Pickup in Lusaka.',
                location_province: 'Lusaka',
                location_district: 'Lusaka',
                created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
                likes_count: 6,
                comments_count: 2,
                crop_tags: ['Maize'],
                image_urls: []
            },
            {
                id: 'demo-market-post-2',
                author: { first_name: 'Patrick', last_name: 'S.', avatar_url: null },
                content: 'BUYING: Broiler chickens\nQuantity: 100\nNotes: Ready buyers, cash on delivery.',
                location_province: 'Copperbelt',
                location_district: 'Ndola',
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
                likes_count: 3,
                comments_count: 0,
                crop_tags: ['Poultry'],
                image_urls: []
            }
        ];

        const demoPriceReports = [
            {
                crop_or_livestock: 'Maize',
                price_per_unit: 145,
                unit: 'kg',
                province: 'Lusaka',
                district: 'Chongwe',
                notes: 'Wholesale price at main depot.',
                created_at: new Date(Date.now() - 1000 * 60 * 90).toISOString()
            },
            {
                crop_or_livestock: 'Eggs',
                price_per_unit: 85,
                unit: 'tray',
                province: 'Central',
                district: 'Kabwe',
                notes: '',
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString()
            }
        ];

        const demoGroups = [
            {
                id: 'demo-group-1',
                name: 'Maize Farmers Association',
                description: 'Prices, inputs, and harvesting tips for maize growers.',
                group_type: 'crop',
                crop_tag: 'Maize',
                province: 'Lusaka',
                members_count: 45,
                is_member: false
            },
            {
                id: 'demo-group-2',
                name: 'Dairy Farmers Network',
                description: 'Feed, milk collection routes, and vet contacts.',
                group_type: 'livestock',
                crop_tag: '',
                province: 'Copperbelt',
                members_count: 28,
                is_member: false
            }
        ];

        const demoChats = [
            {
                id: 'demo-chat-1',
                other_user: { first_name: 'Agnes', last_name: 'K.', avatar_url: null },
                unread_count: 1
            },
            {
                id: 'demo-chat-2',
                other_user: { first_name: 'Moses', last_name: 'B.', avatar_url: null },
                unread_count: 0
            }
        ];

        switch (normalized) {
            case 'feed':
                this.showPreviewMode();
                break;
            case 'showcase': {
                const container = document.getElementById('showcaseContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1;">
                            <div class="empty-state-icon">📷</div>
                            <h3 class="empty-state-title">Photo showcase</h3>
                            <p class="empty-state-text">Connect Supabase to load real farm photos.</p>
                        </div>
                    `;
                }
                break;
            }
            case 'market': {
                const marketPostsContainer = document.getElementById('marketPostsContainer');
                const priceReportsContainer = document.getElementById('priceReportsContainer');
                if (marketPostsContainer) {
                    marketPostsContainer.innerHTML = `
                        <div class="empty-state" style="margin-bottom: var(--spacing-md);">
                            <div class="empty-state-icon">💰</div>
                            <h3 class="empty-state-title">Market (preview)</h3>
                            <p class="empty-state-text">Connect Supabase to load real listings.</p>
                        </div>
                    ` + demoMarketPosts.map((post) => {
                        const author = post.author || {};
                        const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Farmer';
                        const location = post.location_district ? `${post.location_district}, ${post.location_province}` : (post.location_province || '');
                        const body = this.escapeHtml(post.content).replace(/\n/g, '<br>');
                        return `
                            <div class="card market-card">
                                <h4 class="listing-title">${this.escapeHtml(authorName)}</h4>
                                <div class="listing-meta">
                                    ${location ? `📍 ${this.escapeHtml(location)} • ` : ''}${this.formatTimeAgo(post.created_at)}
                                </div>
                                <p class="listing-notes">${body}</p>
                            </div>
                        `;
                    }).join('');
                }
                if (priceReportsContainer) {
                    priceReportsContainer.innerHTML = `
                        <div class="empty-state" style="margin-bottom: var(--spacing-md);">
                            <div class="empty-state-icon">📈</div>
                            <h3 class="empty-state-title">Prices (preview)</h3>
                            <p class="empty-state-text">Connect Supabase to load real reports.</p>
                        </div>
                    `;
                    this.renderPriceReports(demoPriceReports);
                }
                break;
            }
            case 'groups': {
                const container = document.getElementById('groupsContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1;">
                            <div class="empty-state-icon">👥</div>
                            <h3 class="empty-state-title">Groups (preview)</h3>
                            <p class="empty-state-text">Connect Supabase to browse and join real groups.</p>
                        </div>
                    ` + demoGroups.map((group) => `
                        <div class="card group-card">
                            <h4 class="listing-title">${this.escapeHtml(group.name)}</h4>
                            ${group.description ? `<p class="group-description">${this.escapeHtml(group.description)}</p>` : ''}
                            <div class="group-tags">
                                <span class="badge">${this.escapeHtml(group.group_type)}</span>
                                ${group.crop_tag ? `<span class="badge">${this.escapeHtml(group.crop_tag)}</span>` : ''}
                                ${group.province ? `<span class="badge">${this.escapeHtml(group.province)}</span>` : ''}
                            </div>
                            <div class="post-meta group-meta">👥 ${group.members_count || 0} members</div>
                            <button class="btn btn-outline btn-full-width" type="button" disabled>Connect Supabase to join</button>
                        </div>
                    `).join('');
                }
                break;
            }
            case 'messages': {
                const container = document.getElementById('chatsContainer');
                if (container) {
                    container.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state-icon">💬</div>
                            <h3 class="empty-state-title">Messages (preview)</h3>
                            <p class="empty-state-text">Connect Supabase to load chats and send messages.</p>
                        </div>
                    ` + demoChats.map((chat) => {
                        const otherUser = chat.other_user || {};
                        const avatar = otherUser.avatar_url || this.getInitials(otherUser.first_name, otherUser.last_name);
                        const name = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Farmer';
                        return `
                            <div class="card chat-card" aria-disabled="true">
                                <div class="chat-card-content">
                                    <div class="post-avatar">${avatar}</div>
                                    <div class="chat-info">
                                        <h4 class="chat-name">${this.escapeHtml(name)}</h4>
                                        ${chat.unread_count ? `<span class="badge badge-error">${chat.unread_count} new</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('');
                }
                break;
            }
        }
    }

    // Handle authentication state changes
    handleAuthChange(isAuthenticated) {
        const postComposer = document.getElementById('postComposer');
        const priceReportForm = document.getElementById('priceReportForm');
        const accountNavBtn = document.getElementById('accountNavBtn');

        if (isAuthenticated) {
            const profile = this.authManager.getProfile();
            if (profile) {
                postComposer.style.display = 'block';
                priceReportForm.style.display = 'block';
                accountNavBtn.textContent = `👤 ${profile.first_name}`;
                const redirectView = this.postLoginRedirect;
                if (redirectView) {
                    this.postLoginRedirect = null;
                    this.switchView(redirectView);
                } else if (this.currentView === 'landing') {
                    this.switchView('feed');
                } else {
                    this.applyLayoutForView(this.currentView);
                }
                return;
            }

            if (postComposer) postComposer.style.display = 'none';
            if (priceReportForm) priceReportForm.style.display = 'none';
            // if (accountNavBtn) accountNavBtn.textContent = '👤 Account';
            if (accountNavBtn) {
                const accountSpan = accountNavBtn.querySelector('span');
                if (accountSpan) accountSpan.textContent = 'Me';
            }
            this.switchView('landing', false);
            this.openModal('profileModal');
        } else {
            postComposer.style.display = 'none';
            priceReportForm.style.display = 'none';
            accountNavBtn.textContent = '👤 Account';
            if (this.currentView !== 'landing') {
                this.switchView('landing');
            }
        }
    }

    handleAccountNav(event) {
        if (event?.preventDefault) event.preventDefault();

        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        this.openAccountPanel();
    }

    openAccountPanel() {
        const profile = this.authManager?.getProfile?.() || null;
        const avatarEl = document.getElementById('accountAvatar');
        const nameEl = document.getElementById('accountName');
        const metaEl = document.getElementById('accountMeta');

        const firstName = profile?.first_name || '';
        const lastName = profile?.last_name || '';
        const fullName = `${firstName} ${lastName}`.trim() || 'Account';
        const province = profile?.province || '';
        const district = profile?.district || '';
        const location = district ? `${district}, ${province}` : province;

        if (avatarEl) avatarEl.textContent = this.getInitials(firstName, lastName);
        if (nameEl) nameEl.textContent = fullName;
        if (metaEl) metaEl.textContent = location;

        this.openModal('accountModal');
    }

    openProfileEditModal() {
        const profile = this.authManager?.getProfile?.() || null;
        if (!profile) {
            this.showAlert('Profile not found', 'error');
            return;
        }

        const title = document.getElementById('profileModalTitle');
        const submit = document.getElementById('profileSubmitButton');
        const closeBtn = document.getElementById('profileModalClose');

        if (title) title.textContent = 'Edit Profile';
        if (submit) submit.textContent = 'Save Profile';
        if (closeBtn) closeBtn.style.display = 'flex';

        document.getElementById('profileFirstName').value = profile.first_name || '';
        document.getElementById('profileLastName').value = profile.last_name || '';
        document.getElementById('profilePhone').value = profile.phone || '';
        document.getElementById('profileProvince').value = profile.province || '';
        document.getElementById('profileDistrict').value = profile.district || '';
        document.getElementById('profileFarmerType').value = profile.farmer_type || '';
        document.getElementById('profileCrops').value = profile.crops || '';
        document.getElementById('profileLivestock').value = profile.livestock || '';
        document.getElementById('profileFarmSize').value = profile.farm_size_ha ?? '';

        this.closeModal('accountModal');
        this.openModal('profileModal');
    }

    async handleAccountSignOut() {
        try {
            this.showLoading(true);
            const result = await this.authManager.signOut();
            if (!result.success) {
                this.showAlert(result.error || 'Failed to sign out', 'error');
                return;
            }
            this.closeModal('accountModal');
            this.showAlert('Signed out', 'success');
        } catch (error) {
            console.error('Sign out error:', error);
            this.showAlert('Failed to sign out', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    getViewFromUrl() {
        const url = new URL(window.location.href);
        const view = (url.searchParams.get('view') || '').trim().toLowerCase();
        const allowed = new Set(['landing', 'feed', 'showcase', 'market', 'groups', 'messages']);
        return allowed.has(view) ? view : null;
    }

    setupRouting() {
        if (this.routingInitialized) return;
        this.routingInitialized = true;

        window.addEventListener('popstate', (event) => {
            const viewFromState = event?.state?.view;
            const view = viewFromState || this.getViewFromUrl() || 'feed';
            this.switchView(view, false);
        });
    }

    setupLandingCarousel() {
        const root = document.getElementById('landingCarousel');
        if (!root) return;

        const track = root.querySelector('.landing-carousel-track');
        const slides = Array.from(root.querySelectorAll('.landing-carousel-slide'));
        const dots = Array.from(root.querySelectorAll('.landing-carousel-dot'));
        const prevBtn = root.querySelector('.landing-carousel-prev');
        const nextBtn = root.querySelector('.landing-carousel-next');
        const captionEl = document.getElementById('landingCarouselCaption');

        if (!track || slides.length === 0) return;

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let index = 0;
        let timer = null;
        let paused = false;
        let startX = null;
        let lastX = null;

        const setDotState = (activeIndex) => {
            if (!dots.length) return;
            dots.forEach((dot, dotIndex) => {
                dot.classList.toggle('active', dotIndex === activeIndex);
            });
        };

        const setCaption = (activeIndex) => {
            if (!captionEl) return;
            const caption = slides[activeIndex]?.dataset?.caption || '';
            captionEl.textContent = caption;
        };

        const goTo = (nextIndex) => {
            const safeIndex = ((nextIndex % slides.length) + slides.length) % slides.length;
            index = safeIndex;
            track.style.transform = `translateX(-${safeIndex * 100}%)`;
            setDotState(safeIndex);
            setCaption(safeIndex);
        };

        const stop = () => {
            if (timer) {
                window.clearInterval(timer);
                timer = null;
            }
        };

        const start = () => {
            if (prefersReducedMotion) return;
            if (timer) return;
            timer = window.setInterval(() => {
                if (paused) return;
                goTo(index + 1);
            }, 6500);
        };

        setDotState(0);
        setCaption(0);
        goTo(0);
        start();

        const pause = () => {
            paused = true;
        };

        const resume = () => {
            paused = false;
        };

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                goTo(index - 1);
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                goTo(index + 1);
            });
        }

        if (dots.length) {
            dots.forEach((dot, dotIndex) => {
                dot.addEventListener('click', () => {
                    goTo(dotIndex);
                });
            });
        }

        root.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            startX = event.clientX;
            lastX = event.clientX;
            pause();
            stop();
            try { root.setPointerCapture(event.pointerId); } catch (_) {}
        });

        root.addEventListener('pointermove', (event) => {
            if (startX == null) return;
            lastX = event.clientX;
        });

        const handlePointerEnd = () => {
            if (startX == null || lastX == null) return;
            const delta = lastX - startX;
            startX = null;
            lastX = null;

            if (Math.abs(delta) > 55) {
                goTo(delta < 0 ? index + 1 : index - 1);
            }

            resume();
            start();
        };

        root.addEventListener('pointerup', handlePointerEnd);
        root.addEventListener('pointercancel', handlePointerEnd);

        root.addEventListener('mouseenter', pause);
        root.addEventListener('mouseleave', resume);
        root.addEventListener('focusin', pause);
        root.addEventListener('focusout', resume);

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                stop();
                return;
            }
            start();
        });
    }

    navigate(viewName) {
        const view = (viewName || '').trim().toLowerCase();
        const allowed = new Set(['landing', 'feed', 'showcase', 'market', 'groups', 'messages']);
        const target = allowed.has(view) ? view : 'feed';

        if (target === 'landing') {
            this.switchView('landing');
            return;
        }

        const isAuthed = !!this.authManager && this.authManager.isAuthenticated();
        if (!isAuthed) {
            this.postLoginRedirect = target;
            this.switchView('landing');
            this.openAccountModal();
            return;
        }

        this.switchView(target);
    }

    applyLayoutForView(viewName) {
        const appShell = document.getElementById('appShell');
        const navbarMenu = document.getElementById('navbarMenu');
        const navbarSearch = document.getElementById('navbarSearch');

        if (viewName === 'landing') {
            if (appShell) appShell.style.display = 'none';
            if (navbarMenu) navbarMenu.style.display = 'none';
            if (navbarSearch) navbarSearch.style.display = 'none';
        } else {
            if (appShell) appShell.style.display = '';
            if (navbarMenu) navbarMenu.style.display = '';
            if (navbarSearch) navbarSearch.style.display = '';
        }
    }

    // Switch between views
    switchView(viewName, updateHistory = true) {
        const normalized = (viewName || '').trim().toLowerCase();
        const isAuthed = !!this.authManager && this.authManager.isAuthenticated();
        const guarded = normalized !== 'landing' && this.authManager && !isAuthed;
        if (guarded) {
            this.postLoginRedirect = normalized;
            viewName = 'landing';

            if (!updateHistory) {
                const url = new URL(window.location);
                url.searchParams.set('view', 'landing');
                window.history.replaceState({ view: 'landing' }, '', url);
            }
        }

        this.applyLayoutForView(viewName);

        // Hide all views
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });

        // Update active nav state
        document.querySelectorAll('.navbar-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.view === viewName) {
                link.classList.add('active');
            }
        });

        // Show selected view
        const view = document.getElementById(`${viewName}View`);
        if (view) {
            view.style.display = 'block';
            this.currentView = viewName;

            // Update URL
            if (updateHistory) {
                const url = new URL(window.location);
                url.searchParams.set('view', viewName);
                window.history.pushState({ view: viewName }, '', url);
            }

            // Load view data
            this.loadViewData(viewName);
        } else {
            this.showAlert('Page not found', 'error');
        }
    }

    // Calculate Market Average (from Market View)
    async calculateMarketAverage() {
        const crop = document.getElementById('avgCrop').value.trim();
        const province = document.getElementById('avgProvince').value;
        const district = document.getElementById('avgDistrict').value.trim();
        const resultDiv = document.getElementById('avgResult');
        if (!resultDiv) return;

        if (!crop) {
            this.showAlert('Please enter a crop name', 'error');
            return;
        }

        resultDiv.innerHTML = '<div class="spinner"></div>';

        try {
            const result = await this.marketManager.getAveragePrice(crop, province, district);
            
            if (result) {
                resultDiv.innerHTML = `
                    <div class="market-avg-price">
                        ${result.currency} ${result.average.toFixed(2)}
                    </div>
                    <div class="market-avg-meta">
                        Based on ${result.sampleSize} reports
                    </div>
                `;
            } else {
                resultDiv.innerHTML = 'No data found';
            }
        } catch (error) {
            console.error('Avg calc error:', error);
            resultDiv.innerHTML = 'Error';
        }
    }

    // Load Showcase
    async loadShowcase() {
        const container = document.getElementById('showcaseContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner"></div>';

        // Reuse getPosts but filter for images
        try {
            const posts = await this.withTimeout(this.postsManager.getPosts({ limit: 50 }), 12000); // Fetch more to find images
            const imagePosts = posts.filter(p => p.image_urls && p.image_urls.length > 0);
            
            if (imagePosts.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="grid-column: 1/-1;">
                        <div class="empty-state-icon">📷</div>
                        <h3 class="empty-state-title">No photos yet</h3>
                        <p class="empty-state-text">Share your farm photos in the Feed!</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = imagePosts.map(post => `
                <div class="card showcase-card" onclick="App.openPostModal('${post.id}')">
                    <img src="${post.image_urls[0]}" class="showcase-image">
                    <div class="showcase-meta">
                        <div class="showcase-author">${this.escapeHtml(post.author.first_name)}</div>
                        <div class="showcase-likes">❤️ ${post.likes_count}</div>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('Showcase error:', error);
            container.innerHTML = '<p>Failed to load showcase.</p>';
        }
    }

    // Load data for current view
    async loadViewData(viewName) {
        // If we are in preview mode, don't try to load data
        const previewContainer = document.getElementById('previewModeContainer');
        if (previewContainer && previewContainer.style.display !== 'none') {
            console.warn('Preview mode active, skipping data load');
            const isSupabaseConfigured = SUPABASE_CONFIG.url &&
                                        SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
                                        SUPABASE_CONFIG.anonKey &&
                                        SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY';

            if (!isSupabaseConfigured) {
                this.renderPreviewContentForView(viewName);
                return;
            }

            previewContainer.style.display = 'none';
            const postsContainer = document.getElementById('postsContainer');
            if (postsContainer) postsContainer.style.display = 'block';
        }

        try {
            switch (viewName) {
                case 'feed':
                    await this.loadFeed();
                    break;
                case 'showcase':
                    await this.loadShowcase();
                    break;
                case 'market':
                    await this.loadMarket();
                    break;
                case 'groups':
                    await this.loadGroups();
                    break;
                case 'messages':
                    await this.loadMessages();
                    break;
            }
        } catch (error) {
            console.error(`Error loading ${viewName}:`, error);
            this.showAlert(`Failed to load ${viewName}`, 'error');
        }
    }

    // Load feed posts
    async loadFeed() {
        const container = document.getElementById('postsContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner"></div>';

        // Check if Supabase is configured
        if (!this.postsManager || !this.postsManager.supabase) {
            this.showPreviewMode();
            return;
        }

        try {
            const filters = this.feedFilters || { province: '', cropTag: '', photosOnly: false };
            const options = { limit: 20 };
            if (filters.province) options.province = filters.province;
            if (filters.cropTag) options.cropTag = filters.cropTag;

            const posts = await this.withTimeout(this.postsManager.getPosts(options), 12000);
            const filteredPosts = filters.photosOnly
                ? posts.filter(p => p.image_urls && p.image_urls.length > 0)
                : posts;

            this.renderPosts(filteredPosts);
        } catch (error) {
            console.error('Load feed error:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load posts. Please check your Supabase configuration.</p></div>';
        }
    }

    applyFeedFilters() {
        const province = (document.getElementById('feedProvince')?.value || '').trim();
        const cropTag = (document.getElementById('feedCropTag')?.value || '').trim();
        const photosOnly = !!document.getElementById('feedPhotosOnly')?.checked;
        this.feedFilters = { province, cropTag, photosOnly };
        this.loadFeed();
    }

    clearFeedFilters() {
        const provinceEl = document.getElementById('feedProvince');
        const cropTagEl = document.getElementById('feedCropTag');
        const photosOnlyEl = document.getElementById('feedPhotosOnly');

        if (provinceEl) provinceEl.value = '';
        if (cropTagEl) cropTagEl.value = '';
        if (photosOnlyEl) photosOnlyEl.checked = false;

        this.feedFilters = { province: '', cropTag: '', photosOnly: false };
        this.loadFeed();
    }

    // Render posts
    renderPosts(posts) {
        const container = document.getElementById('postsContainer');
        
        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🌾</div>
                    <h3 class="empty-state-title">No posts yet</h3>
                    <p class="empty-state-text">Be the first to share something with the community!</p>
                    <button class="btn btn-primary btn-sm" onclick="if(App.authManager.isAuthenticated()) { document.getElementById('postContent').focus(); } else { App.openAccountModal(); }">Create Post</button>
                </div>
            `;
            return;
        }

        container.innerHTML = posts.map(post => this.renderPost(post)).join('');
    }

    // Render a single post
    renderPost(post) {
        const author = post.author || {};
        const avatar = author.avatar_url || this.getInitials(author.first_name, author.last_name);
        const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown';
        const location = post.location_district ? `${post.location_district}, ${post.location_province}` : post.location_province || '';
        const timeAgo = this.formatTimeAgo(post.created_at);
        const likesCount = post.likes_count || 0;
        const commentsCount = post.comments_count || 0;
        const liked = post.user_liked ? 'liked' : '';
        const myId = this.authManager?.getProfile?.()?.id || null;
        const canMessage = !!(author?.id && myId && author.id !== myId && this.messagingManager);

        return `
            <div class="post-card" data-post-id="${post.id}">
                <div class="post-header">
                    <div class="post-avatar">${avatar}</div>
                    <div class="flex-1">
                        <h4>${this.escapeHtml(authorName)}</h4>
                        <div class="post-meta">
                            ${location ? `📍 ${this.escapeHtml(location)} • ` : ''}${timeAgo}
                        </div>
                    </div>
                    ${canMessage ? `
                        <button class="icon-btn" type="button" onclick="App.startChatWithFarmer('${author.id}', ${this.jsString(authorName)});">
                            💬
                        </button>
                    ` : ''}
                </div>
                <div class="post-content">${this.escapeHtml(post.content)}</div>
                ${post.image_urls && post.image_urls.length > 0 ? `
                    <div class="post-images-grid">
                        ${post.image_urls.map(url => `
                            <div class="post-image-container">
                                <img src="${url}" class="post-image" onclick="window.open('${url}', '_blank')">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                ${post.crop_tags && post.crop_tags.length > 0 ? `
                    <div class="tags-container">
                        ${post.crop_tags.map(tag => `<span class="badge">${this.escapeHtml(tag)}</span>`).join(' ')}
                    </div>
                ` : ''}
                <div class="post-actions">
                    <button class="post-action ${liked}" onclick="App.toggleLike('${post.id}')">
                        ${liked ? '❤️' : '🤍'} ${likesCount}
                    </button>
                    <button class="post-action" onclick="App.toggleComments('${post.id}')">
                        💬 ${commentsCount}
                    </button>
                </div>
                <div class="comments-section" id="comments-${post.id}" style="display: none;">
                    <div id="comments-list-${post.id}"></div>
                    <div class="comment-input-wrapper">
                        <input 
                            type="text" 
                            id="comment-input-${post.id}" 
                            class="form-input" 
                            placeholder="Add a comment..."
                            onkeypress="if(event.key==='Enter') App.addComment('${post.id}')"
                        >
                        <button class="btn btn-sm btn-primary" onclick="App.addComment('${post.id}')">
                            Post
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Handle image selection for post
    handleImageSelect(event) {
        const files = event.target.files;
        const previewContainer = document.getElementById('imagePreview');
        previewContainer.innerHTML = '';

        if (!files || files.length === 0) return;

        // Limit to 4 images
        if (files.length > 4) {
            this.showAlert('Maximum 4 images allowed', 'error');
            event.target.value = ''; // Clear selection
            return;
        }

        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) return;
            
            // Basic validation (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                this.showAlert(`Image ${file.name} is too large (max 5MB)`, 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.style.cssText = 'position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden;';
                div.innerHTML = `
                    <img src="${e.target.result}" class="image-cover">
                `;
                previewContainer.appendChild(div);
            };
            reader.readAsDataURL(file);
        });
    }

    // Handle post submission
    async handlePostSubmit(event) {
        event.preventDefault();
        
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        const content = document.getElementById('postContent').value.trim();
        const cropTagsInput = document.getElementById('cropTags').value.trim();
        const cropTags = cropTagsInput ? cropTagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
        const imageFiles = document.getElementById('postImages').files;

        if (!content && imageFiles.length === 0) {
            this.showAlert('Please enter post content or add an image', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const profile = this.authManager.getProfile();
            
            await this.postsManager.createPost(content, {
                cropTags: cropTags,
                province: profile?.province,
                district: profile?.district,
                images: imageFiles
            });

            // Reset form
            document.getElementById('postForm').reset();
            document.getElementById('imagePreview').innerHTML = '';
            this.showAlert('Post shared successfully!', 'success');
            
            // Reload feed
            await this.loadFeed();
        } catch (error) {
            console.error('Post creation error:', error);
            this.showAlert('Failed to create post. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Toggle like on post
    async toggleLike(postId) {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        const btn = document.querySelector(`.post-card[data-post-id="${postId}"] .post-action`);
        if (!btn) return;

        // Optimistic UI update
        const isLiked = btn.classList.contains('liked');
        const countSpan = btn; // The button text contains the count
        let count = parseInt(btn.textContent.split(' ')[1]) || 0;

        // Toggle state
        if (isLiked) {
            btn.classList.remove('liked');
            count = Math.max(0, count - 1);
            btn.innerHTML = `🤍 ${count}`;
        } else {
            btn.classList.add('liked');
            count++;
            btn.innerHTML = `❤️ ${count}`;
        }

        try {
            if (isLiked) {
                await this.postsManager.unlikePost(postId);
            } else {
                await this.postsManager.likePost(postId);
            }
            // No need to reload feed
        } catch (error) {
            console.error('Like error:', error);
            // Revert on error
            if (isLiked) {
                btn.classList.add('liked');
                count++;
                btn.innerHTML = `❤️ ${count}`;
            } else {
                btn.classList.remove('liked');
                count--;
                btn.innerHTML = `🤍 ${count}`;
            }
            this.showAlert('Failed to update like', 'error');
        }
    }

    // Toggle comments section
    async toggleComments(postId) {
        const commentsSection = document.getElementById(`comments-${postId}`);
        const isVisible = commentsSection.style.display !== 'none';

        if (!isVisible) {
            // Load comments
            try {
                const comments = await this.postsManager.getComments(postId);
                this.renderComments(postId, comments);
            } catch (error) {
                console.error('Comments load error:', error);
            }
        }

        commentsSection.style.display = isVisible ? 'none' : 'block';
    }

    // Render comments
    renderComments(postId, comments) {
        const container = document.getElementById(`comments-list-${postId}`);
        
        if (!comments || comments.length === 0) {
            container.innerHTML = '<p class="empty-state-text">No comments yet.</p>';
            return;
        }

        container.innerHTML = comments.map(comment => {
            const author = comment.author || {};
            const avatar = author.avatar_url || this.getInitials(author.first_name, author.last_name);
            const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown';
            
            return `
                <div class="comment">
                    <div class="comment-avatar">${avatar}</div>
                    <div class="comment-content">
                        <div class="comment-author">${this.escapeHtml(authorName)}</div>
                        <div class="comment-text">${this.escapeHtml(comment.content)}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Add comment
    async addComment(postId) {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        const input = document.getElementById(`comment-input-${postId}`);
        const content = input.value.trim();

        if (!content) return;

        try {
            await this.postsManager.addComment(postId, content);
            input.value = '';
            
            // Reload comments
            const comments = await this.postsManager.getComments(postId);
            this.renderComments(postId, comments);
        } catch (error) {
            console.error('Comment error:', error);
            this.showAlert('Failed to add comment', 'error');
        }
    }

    async loadMarket() {
        const priceReportsContainer = document.getElementById('priceReportsContainer');
        const marketPostsContainer = document.getElementById('marketPostsContainer');

        if (marketPostsContainer) marketPostsContainer.innerHTML = '<div class="spinner"></div>';
        if (priceReportsContainer) priceReportsContainer.innerHTML = '<div class="spinner"></div>';

        if (!this.marketManager || !this.marketManager.supabase) {
            if (marketPostsContainer) {
                marketPostsContainer.innerHTML = '<div class="empty-state"><p>Configure Supabase to view market listings.</p></div>';
            }
            if (priceReportsContainer) {
                priceReportsContainer.innerHTML = '<div class="empty-state"><p>Configure Supabase to view market prices.</p></div>';
            }
            return;
        }

        await Promise.all([
            this.loadMarketPosts(),
            this.loadPriceReports()
        ]);
    }

    async loadMarketPosts() {
        const container = document.getElementById('marketPostsContainer');
        if (!container) return;

        if (!this.postsManager || !this.postsManager.supabase) {
            container.innerHTML = '<div class="empty-state"><p>Configure Supabase to view market listings.</p></div>';
            return;
        }

        try {
            const posts = await this.withTimeout(this.postsManager.getMarketPosts({
                limit: 30,
                type: this.marketPostFilter
            }), 12000);
            this.renderMarketPosts(posts);
        } catch (error) {
            console.error('Load market posts error:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load market listings. Please check your Supabase configuration.</p></div>';
        }
    }

    renderMarketPosts(posts) {
        const container = document.getElementById('marketPostsContainer');
        if (!container) return;

        if (!posts || posts.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📌</div>
                    <h3 class="empty-state-title">No listings yet</h3>
                    <p class="empty-state-text">Post a buying or selling request to get started.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openMarketForm('selling')">Post Listing</button>
                </div>
            `;
            return;
        }

        container.innerHTML = posts.map(post => this.renderPost(post)).join('');
    }

    async loadPriceReports() {
        const container = document.getElementById('priceReportsContainer');
        if (!container) return;

        if (!this.marketManager || !this.marketManager.supabase) {
            container.innerHTML = '<div class="empty-state"><p>Configure Supabase to view market prices.</p></div>';
            return;
        }

        try {
            const filters = this.marketFilters || { cropOrLivestock: '', province: '', district: '' };
            const reports = await this.withTimeout(this.marketManager.getPriceReports({
                limit: 20,
                cropOrLivestock: filters.cropOrLivestock || null,
                province: filters.province || null,
                district: filters.district || null
            }), 12000);
            this.renderPriceReports(reports);
        } catch (error) {
            console.error('Load price reports error:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load price reports. Please check your Supabase configuration.</p></div>';
        }
    }

    setMarketPostFilter(type) {
        this.marketPostFilter = type || null;
        this.loadMarketPosts();
    }

    applyMarketFilters() {
        const cropOrLivestock = (document.getElementById('priceFilterCrop')?.value || '').trim();
        const province = (document.getElementById('priceFilterProvince')?.value || '').trim();
        const district = (document.getElementById('priceFilterDistrict')?.value || '').trim();

        this.marketFilters = { cropOrLivestock, province, district };
        this.loadPriceReports();
    }

    clearMarketFilters() {
        const cropEl = document.getElementById('priceFilterCrop');
        const provEl = document.getElementById('priceFilterProvince');
        const distEl = document.getElementById('priceFilterDistrict');

        if (cropEl) cropEl.value = '';
        if (provEl) provEl.value = '';
        if (distEl) distEl.value = '';

        this.marketFilters = { cropOrLivestock: '', province: '', district: '' };
        this.loadPriceReports();
    }

    openNeedComposer(kind) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.postLoginRedirect = 'feed';
            this.openAccountModal();
            return;
        }

        this.switchView('feed');
        const textarea = document.getElementById('postContent');
        if (!textarea) return;

        const prefix = kind === 'pest'
            ? '🐛 Pest alert: '
            : '🆘 Need help: ';

        if (!textarea.value || textarea.value.trim().length === 0) {
            textarea.value = prefix;
        } else if (!textarea.value.startsWith(prefix)) {
            textarea.value = `${prefix}${textarea.value}`;
        }

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    openMarketForm(listingType = '') {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.postLoginRedirect = 'market';
            this.openAccountModal();
            return;
        }

        this.switchView('market');

        const formWrap = document.getElementById('marketPostForm');
        const listingTypeEl = document.getElementById('marketListingType');
        const itemEl = document.getElementById('marketListingItem');
        if (formWrap) formWrap.style.display = 'block';
        if (listingTypeEl) listingTypeEl.value = listingType || '';
        if (itemEl) itemEl.focus();
    }

    openMarketPriceForm() {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.postLoginRedirect = 'market';
            this.openAccountModal();
            return;
        }

        this.switchView('market');
        const form = document.getElementById('priceReportForm');
        if (form) form.style.display = 'block';
        document.getElementById('priceCrop')?.focus?.();
    }

    async handleMarketPostSubmit(event) {
        event.preventDefault();

        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.postLoginRedirect = 'market';
            this.openAccountModal();
            return;
        }

        if (!this.postsManager || !this.postsManager.supabase) {
            this.showAlert('Configure Supabase to post listings.', 'error');
            return;
        }

        const listingType = (document.getElementById('marketListingType')?.value || '').trim();
        const item = (document.getElementById('marketListingItem')?.value || '').trim();
        const qty = (document.getElementById('marketListingQty')?.value || '').trim();
        const unit = (document.getElementById('marketListingUnit')?.value || '').trim();
        const priceRaw = (document.getElementById('marketListingPrice')?.value || '').trim();
        const notes = (document.getElementById('marketListingNotes')?.value || '').trim();

        if (!listingType || !item || !qty || !unit) {
            this.showAlert('Please fill in the required listing fields', 'error');
            return;
        }

        const qtyNumber = parseFloat(qty);
        const priceNumber = priceRaw ? parseFloat(priceRaw) : null;

        const lines = [
            `${listingType.toUpperCase()}: ${item}`,
            `Quantity: ${Number.isFinite(qtyNumber) ? qtyNumber : qty} ${unit}`
        ];

        if (priceRaw && Number.isFinite(priceNumber)) {
            lines.push(`Price: ZMW ${priceNumber.toFixed(2)} per ${unit}`);
        }

        if (notes) {
            lines.push(`Notes: ${notes}`);
        }

        const content = lines.join('\n');

        try {
            this.showLoading(true);
            const profile = this.authManager.getProfile();

            await this.postsManager.createPost(content, {
                cropTags: [item],
                province: profile?.province,
                district: profile?.district,
                isMarketPost: true,
                marketType: listingType
            });

            document.getElementById('marketPostFormElement')?.reset?.();
            const formWrap = document.getElementById('marketPostForm');
            if (formWrap) formWrap.style.display = 'none';

            this.showAlert('Listing posted successfully!', 'success');
            await this.loadMarketPosts();
        } catch (error) {
            console.error('Market listing creation error:', error);
            this.showAlert('Failed to post listing. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Render price reports
    renderPriceReports(reports) {
        const container = document.getElementById('priceReportsContainer');
        
        if (!reports || reports.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💰</div>
                    <h3 class="empty-state-title">No price reports yet</h3>
                    <p class="empty-state-text">Be the first to share market prices!</p>
                    <button class="btn btn-secondary btn-sm" onclick="App.togglePriceForm()">Report Price</button>
                </div>
            `;
            return;
        }

        container.innerHTML = reports.map(report => {
            const location = report.district ? `${report.district}, ${report.province}` : report.province || '';
            const timeAgo = this.formatTimeAgo(report.created_at);
            
            return `
                <div class="card market-card">
                    <h4 class="listing-title">
                        ${this.escapeHtml(report.crop_or_livestock)}
                    </h4>
                    <div class="listing-price">
                        ZMW ${parseFloat(report.price_per_unit).toFixed(2)} / ${this.escapeHtml(report.unit)}
                    </div>
                    <div class="listing-meta">
                        📍 ${this.escapeHtml(location)} • ${timeAgo}
                    </div>
                    ${report.notes ? `<p class="listing-notes">${this.escapeHtml(report.notes)}</p>` : ''}
                </div>
            `;
        }).join('');
    }

    // Handle price report submission
    async handlePriceReport(event) {
        event.preventDefault();
        
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            
            await this.marketManager.createPriceReport({
                cropOrLivestock: document.getElementById('priceCrop').value.trim(),
                pricePerUnit: parseFloat(document.getElementById('priceAmount').value),
                unit: document.getElementById('priceUnit').value,
                province: document.getElementById('priceProvince').value.trim(),
                district: document.getElementById('priceDistrict').value.trim() || null
            });

            document.getElementById('priceForm').reset();
            this.showAlert('Price reported successfully!', 'success');
            this.togglePriceForm();
            await this.loadMarket();
        } catch (error) {
            console.error('Price report error:', error);
            this.showAlert('Failed to report price', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Toggle price form
    togglePriceForm() {
        const form = document.getElementById('priceReportForm');
        form.style.display = form.style.display === 'none' ? 'block' : 'none';
    }

    // Load groups
    async loadGroups() {
        const container = document.getElementById('groupsContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner"></div>';

        if (!this.groupsManager || !this.groupsManager.supabase) {
            container.innerHTML = '<div class="empty-state"><p>Configure Supabase to view groups.</p></div>';
            return;
        }

        if (!this.authManager || !this.authManager.isAuthenticated()) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3 class="empty-state-title">Sign in to view groups</h3>
                    <p class="empty-state-text">Create, join, and chat with farmer groups.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openAccountModal()">Sign in</button>
                </div>
            `;
            return;
        }

        try {
            const groups = await this.withTimeout(this.groupsManager.getGroups({ limit: 20 }), 12000);
            this.renderGroups(groups);
        } catch (error) {
            console.error('Load groups error:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load groups. Please check your Supabase configuration.</p></div>';
        }
    }

    // Render groups
    renderGroups(groups) {
        const container = document.getElementById('groupsContainer');
        
        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3 class="empty-state-title">No groups yet</h3>
                    <p class="empty-state-text">Create the first group!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = groups.map(group => {
            const membersCount = group.members_count || 0;
            const isMember = group.is_member;
            
            return `
                <div class="card group-card">
                    <h4 class="listing-title">
                        ${this.escapeHtml(group.name)}
                    </h4>
                    ${group.description ? `<p class="group-description">${this.escapeHtml(group.description)}</p>` : ''}
                    <div class="group-tags">
                        <span class="badge">${this.escapeHtml(group.group_type)}</span>
                        ${group.crop_tag ? `<span class="badge">${this.escapeHtml(group.crop_tag)}</span>` : ''}
                        ${group.province ? `<span class="badge">${this.escapeHtml(group.province)}</span>` : ''}
                    </div>
                    <div class="post-meta group-meta">
                        👥 ${membersCount} members
                    </div>
                    <button 
                        class="btn ${isMember ? 'btn-outline' : 'btn-primary'} btn-full-width" 
                        onclick="App.${isMember ? 'leaveGroup' : 'joinGroup'}('${group.id}')"
                    >
                        ${isMember ? 'Leave Group' : 'Join Group'}
                    </button>
                </div>
            `;
        }).join('');
    }

    // Join group
    async joinGroup(groupId) {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            await this.groupsManager.joinGroup(groupId);
            this.showAlert('Joined group successfully!', 'success');
            await this.loadGroups();
        } catch (error) {
            console.error('Join group error:', error);
            this.showAlert('Failed to join group', 'error');
        }
    }

    // Leave group
    async leaveGroup(groupId) {
        try {
            await this.groupsManager.leaveGroup(groupId);
            this.showAlert('Left group', 'success');
            await this.loadGroups();
        } catch (error) {
            console.error('Leave group error:', error);
        }
    }

    // Handle create group
    async handleCreateGroup(event) {
        event.preventDefault();
        
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            
            const groupData = {
                name: document.getElementById('groupName').value.trim(),
                description: document.getElementById('groupDescription').value.trim() || null,
                groupType: document.getElementById('groupType').value,
                cropTag: document.getElementById('groupCropTag').value.trim() || null,
                province: document.getElementById('groupProvince').value.trim() || null,
                isPublic: document.getElementById('groupIsPublic').checked
            };

            await this.groupsManager.createGroup(groupData);
            
            this.closeModal('createGroupModal');
            document.getElementById('createGroupForm').reset();
            this.showAlert('Group created successfully!', 'success');
            await this.loadGroups();
        } catch (error) {
            console.error('Create group error:', error);
            this.showAlert('Failed to create group', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Handle group type change
    handleGroupTypeChange() {
        const groupType = document.getElementById('groupType').value;
        const cropTagGroup = document.getElementById('cropTagGroup');
        const provinceGroup = document.getElementById('provinceGroup');

        cropTagGroup.style.display = groupType === 'crop' ? 'block' : 'none';
        provinceGroup.style.display = groupType === 'regional' ? 'block' : 'none';
    }

    // Open create group modal
    openCreateGroupModal() {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }
        this.openModal('createGroupModal');
    }

    // Load messages/chats
    async loadMessages() {
        const container = document.getElementById('chatsContainer');
        if (!container) return;
        container.innerHTML = '<div class="spinner"></div>';

        if (!this.messagingManager || !this.messagingManager.supabase) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3 class="empty-state-title">Messages unavailable</h3>
                    <p class="empty-state-text">Connect Supabase to load chats and send messages.</p>
                </div>
            `;
            return;
        }

        if (!this.authManager || !this.authManager.isAuthenticated()) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3 class="empty-state-title">Sign in to view messages</h3>
                    <p class="empty-state-text">Message farmers 1-on-1 in real time.</p>
                    <button class="btn btn-primary btn-sm" onclick="App.openAccountModal()">Sign in</button>
                </div>
            `;
            return;
        }

        try {
            const chats = await this.withTimeout(this.messagingManager.getChats(), 12000);
            this.renderChats(chats);
        } catch (error) {
            console.error('Load messages error:', error);
            container.innerHTML = '<div class="empty-state"><p>Failed to load messages. Please check your Supabase configuration.</p></div>';
        }
    }

    // Render chats list
    renderChats(chats) {
        const container = document.getElementById('chatsContainer');
        
        if (!chats || chats.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">💬</div>
                    <h3 class="empty-state-title">No messages yet</h3>
                    <p class="empty-state-text">Start a conversation with another farmer from the Feed.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = chats.map(chat => {
            const otherUser = chat.other_user || {};
            const avatar = otherUser.avatar_url || this.getInitials(otherUser.first_name, otherUser.last_name);
            const name = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Unknown';
            const unreadCount = chat.unread_count || 0;
            
            return `
                <div class="card chat-card" onclick="App.openChat('${chat.id}', ${this.jsString(name)})">
                    <div class="chat-card-content">
                        <div class="post-avatar">${avatar}</div>
                        <div class="chat-info">
                            <h4 class="chat-name">${this.escapeHtml(name)}</h4>
                            ${unreadCount > 0 ? `<span class="badge badge-error">${unreadCount} new</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Open chat
    async openChat(chatId, userName) {
        const previousChatId = this.currentChatId;
        this.currentChatId = chatId;
        document.getElementById('chatTitle').textContent = `💬 ${userName}`;
        this.openModal('chatModal');

        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) messagesEl.innerHTML = '<div class="spinner"></div>';

        try {
            const messages = await this.withTimeout(this.messagingManager.getMessages(chatId), 12000);
            await this.renderChatMessages(messages);

            await this.messagingManager.markAsRead(chatId);

            if (this.currentChatChannel) {
                if (previousChatId) this.messagingManager.unsubscribeFromMessages(previousChatId);
                this.currentChatChannel = null;
            }

            this.currentChatChannel = this.messagingManager.subscribeToMessages(chatId, async (message) => {
                await this.appendChatMessage(message);
                await this.messagingManager.markAsRead(chatId);
            });
        } catch (error) {
            console.error('Open chat error:', error);
            if (messagesEl) {
                messagesEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">💬</div>
                        <h3 class="empty-state-title">Could not load messages</h3>
                        <p class="empty-state-text">Please try again in a moment.</p>
                    </div>
                `;
            }
        }
    }

    // Render chat messages
    async renderChatMessages(messages) {
        const container = document.getElementById('chatMessages');
        let user = null;
        try {
            const authClient = this.supabase || supabaseClient;
            if (authClient && authClient.auth) {
                const { data: { user: authUser } } = await authClient.auth.getUser();
                user = authUser;
            }
        } catch (error) {
            console.error('Error getting user:', error);
        }
        
        container.innerHTML = messages.map(msg => {
            const isSent = user && msg.sender_id === user.id;
            const sender = msg.sender || {};
            const avatar = sender.avatar_url || this.getInitials(sender.first_name, sender.last_name);
            
            return `
                <div class="message ${isSent ? 'message-sent' : 'message-received'}">
                    <div class="comment-avatar">${avatar}</div>
                    <div class="message-bubble">
                        <div class="message-text">${this.escapeHtml(msg.content)}</div>
                        <div class="message-time">
                            ${this.formatTimeAgo(msg.created_at)}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.scrollTop = container.scrollHeight;
    }

    // Append new chat message
    async appendChatMessage(message) {
        const container = document.getElementById('chatMessages');
        let user = null;
        try {
            const authClient = this.supabase || supabaseClient;
            if (authClient && authClient.auth) {
                const { data: { user: authUser } } = await authClient.auth.getUser();
                user = authUser;
            }
        } catch (error) {
            console.error('Error getting user:', error);
        }
        const isSent = user && message.sender_id === user.id;
        const sender = message.sender || {};
        const avatar = sender.avatar_url || this.getInitials(sender.first_name, sender.last_name);
        
        const messageHtml = `
            <div class="message ${isSent ? 'message-sent' : 'message-received'}">
                <div class="comment-avatar">${avatar}</div>
                <div class="message-bubble">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    <div class="message-time">
                        ${this.formatTimeAgo(message.created_at)}
                    </div>
                </div>
            </div>
        `;
        
        container.insertAdjacentHTML('beforeend', messageHtml);
        container.scrollTop = container.scrollHeight;
    }

    // Send chat message
    async sendChatMessage() {
        if (!this.currentChatId) return;
        
        const input = document.getElementById('chatInput');
        const content = input.value.trim();
        
        if (!content) return;

        try {
            const message = await this.messagingManager.sendMessage(this.currentChatId, content);
            input.value = '';
            await this.appendChatMessage(message);
            await this.loadMessages(); // Refresh chat list
        } catch (error) {
            console.error('Send message error:', error);
            this.showAlert('Failed to send message', 'error');
        }
    }

    async startChatWithFarmer(farmerId, farmerName) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }
        if (!this.messagingManager) {
            this.showAlert('Messaging is not available', 'error');
            return;
        }
        try {
            this.showLoading(true);
            const chat = await this.messagingManager.getOrCreateChat(farmerId);
            await this.openChat(chat.id, farmerName || 'Chat');
        } catch (error) {
            console.error('Start chat error:', error);
            this.showAlert('Failed to start chat', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async searchFarmers() {
        const resultsEl = document.getElementById('farmerSearchResults');
        if (!resultsEl) return;

        if (!this.postsManager || !this.postsManager.searchFarmers) {
            resultsEl.innerHTML = '<div class="empty-state"><p>Configure Supabase to search farmers.</p></div>';
            return;
        }

        const query = (document.getElementById('farmerSearchQuery')?.value || '').trim();
        const cropTag = (document.getElementById('farmerCropTag')?.value || '').trim();
        const province = (document.getElementById('farmerProvince')?.value || '').trim();
        const farmerType = (document.getElementById('farmerType')?.value || '').trim();

        if (!query && !cropTag && !province && !farmerType) {
            resultsEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👩🏾‍🌾</div>
                    <h3 class="empty-state-title">Find farmers</h3>
                    <p class="empty-state-text">Search by name, province, crops, or livestock.</p>
                </div>
            `;
            return;
        }

        resultsEl.innerHTML = '<div class="spinner"></div>';

        try {
            const farmers = await this.postsManager.searchFarmers({ query, cropTag, province, farmerType, limit: 20 });
            const myId = this.authManager?.getProfile?.()?.id || null;
            const filtered = (farmers || []).filter(f => !myId || f.id !== myId);

            if (filtered.length === 0) {
                resultsEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔎</div>
                        <h3 class="empty-state-title">No farmers found</h3>
                        <p class="empty-state-text">Try a different name, crop, or province.</p>
                    </div>
                `;
                return;
            }

            resultsEl.innerHTML = filtered.map(farmer => {
                const name = `${farmer.first_name || ''} ${farmer.last_name || ''}`.trim() || 'Unknown';
                const avatar = farmer.avatar_url || this.getInitials(farmer.first_name, farmer.last_name);
                const locationParts = [farmer.district, farmer.province].filter(Boolean);
                const location = locationParts.join(', ');
                const metaParts = [location, farmer.farmer_type].filter(Boolean);
                const meta = metaParts.join(' • ');
                const crops = (farmer.crops || '').trim();
                const livestock = (farmer.livestock || '').trim();
                const chips = [crops && `🌿 ${crops}`, livestock && `🐄 ${livestock}`].filter(Boolean).slice(0, 2);

                return `
                    <div class="card farmer-card" onclick="App.openFarmerProfile('${farmer.id}')">
                        <div class="farmer-card-header">
                            <div class="post-avatar">${avatar}</div>
                            <div class="farmer-card-main">
                                <div class="farmer-card-name">${this.escapeHtml(name)}</div>
                                <div class="post-meta">${this.escapeHtml(meta)}</div>
                            </div>
                            ${this.messagingManager ? `
                                <button class="icon-btn" type="button" onclick="event.stopPropagation(); App.startChatWithFarmer('${farmer.id}', ${this.jsString(name)});">
                                    💬
                                </button>
                            ` : ''}
                        </div>
                        ${chips.length ? `
                            <div class="farmer-card-tags">
                                ${chips.map(t => `<span class="badge badge-outline">${this.escapeHtml(t)}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        } catch (error) {
            console.error('Farmer search error:', error);
            resultsEl.innerHTML = '<div class="empty-state"><p>Failed to search farmers.</p></div>';
        }
    }

    async openFarmerProfile(farmerId) {
        const modal = document.getElementById('farmerProfileModal');
        const content = document.getElementById('farmerProfileContent');
        if (!modal || !content) return;

        if (!this.postsManager || !this.postsManager.getFarmerProfileById) {
            content.innerHTML = '<div class="empty-state"><p>Configure Supabase to view profiles.</p></div>';
            this.openModal('farmerProfileModal');
            return;
        }

        content.innerHTML = '<div class="spinner"></div>';
        this.openModal('farmerProfileModal');

        try {
            const farmer = await this.postsManager.getFarmerProfileById(farmerId);
            const name = `${farmer.first_name || ''} ${farmer.last_name || ''}`.trim() || 'Farmer';
            const avatar = farmer.avatar_url || this.getInitials(farmer.first_name, farmer.last_name);
            const locationParts = [farmer.district, farmer.province].filter(Boolean);
            const location = locationParts.join(', ');

            const rows = [
                farmer.farmer_type ? ['Farmer type', farmer.farmer_type] : null,
                farmer.crops ? ['Crops', farmer.crops] : null,
                farmer.livestock ? ['Livestock', farmer.livestock] : null,
                (farmer.farm_size_ha != null && farmer.farm_size_ha !== '') ? ['Farm size', `${farmer.farm_size_ha} ha`] : null
            ].filter(Boolean);

            content.innerHTML = `
                <div class="farmer-profile">
                    <div class="farmer-profile-header">
                        <div class="farmer-profile-avatar">${avatar}</div>
                        <div class="farmer-profile-main">
                            <div class="farmer-profile-name">${this.escapeHtml(name)}</div>
                            <div class="post-meta">${this.escapeHtml(location)}</div>
                        </div>
                    </div>
                    ${farmer.bio ? `<div class="farmer-profile-bio">${this.escapeHtml(farmer.bio)}</div>` : ''}
                    ${rows.length ? `
                        <div class="farmer-profile-grid">
                            ${rows.map(([k, v]) => `
                                <div class="farmer-profile-row">
                                    <div class="farmer-profile-key">${this.escapeHtml(k)}</div>
                                    <div class="farmer-profile-value">${this.escapeHtml(String(v))}</div>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${this.messagingManager ? `
                        <div class="farmer-profile-actions">
                            <button class="btn btn-primary btn-full-width" onclick="App.startChatWithFarmer('${farmer.id}', ${this.jsString(name)});">Message</button>
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (error) {
            console.error('Open farmer profile error:', error);
            content.innerHTML = '<div class="empty-state"><p>Failed to load farmer profile.</p></div>';
        }
    }

    // OTP Send handler
    async handleOTPSend(event) {
        event.preventDefault();
        
        const emailOrPhone = document.getElementById('authEmailOrPhone').value.trim();
        if (!emailOrPhone) return;

        const isEmail = emailOrPhone.includes('@');
        const type = isEmail ? 'email' : 'phone';

        try {
            this.showLoading(true);
            const result = await this.authManager.sendOTP(emailOrPhone, type);
            
            if (result.success) {
                document.getElementById('otpSendForm').style.display = 'none';
                document.getElementById('otpVerifyForm').style.display = 'block';
                this.showAlert('OTP sent! Check your ' + (isEmail ? 'email' : 'phone'), 'success');
            } else {
                this.showAlert(result.error || 'Failed to send OTP', 'error');
            }
        } catch (error) {
            console.error('OTP send error:', error);
            this.showAlert('Failed to send OTP', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // OTP Verify handler
    async handleOTPVerify(event) {
        event.preventDefault();
        
        const emailOrPhone = document.getElementById('authEmailOrPhone').value.trim();
        const otpCode = document.getElementById('otpCode').value.trim();
        
        if (!otpCode) return;

        const isEmail = emailOrPhone.includes('@');
        const type = isEmail ? 'email' : 'phone';

        try {
            this.showLoading(true);
            const result = await this.authManager.verifyOTP(emailOrPhone, otpCode, type);
            
            if (result.success) {
                if (result.needsProfile) {
                    this.closeModal('authModal');
                    this.openModal('profileModal');
                } else {
                    this.closeModal('authModal');
                    this.showAlert('Logged in successfully!', 'success');
                    await this.loadViewData(this.currentView);
                }
            } else {
                this.showAlert(result.error || 'Invalid OTP', 'error');
            }
        } catch (error) {
            console.error('OTP verify error:', error);
            this.showAlert('Failed to verify OTP', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Profile creation handler
    async handleProfileCreate(event) {
        event.preventDefault();
        
        try {
            this.showLoading(true);
            
            const profileData = {
                first_name: document.getElementById('profileFirstName').value.trim(),
                last_name: document.getElementById('profileLastName').value.trim(),
                phone: document.getElementById('profilePhone').value.trim() || null,
                province: document.getElementById('profileProvince').value.trim(),
                district: document.getElementById('profileDistrict').value.trim() || null,
                farmer_type: document.getElementById('profileFarmerType').value,
                crops: document.getElementById('profileCrops').value.trim() || null,
                livestock: document.getElementById('profileLivestock').value.trim() || null,
                farm_size_ha: document.getElementById('profileFarmSize').value ? parseFloat(document.getElementById('profileFarmSize').value) : null
            };

            // Validate
            if (window.Utils && window.Utils.validateProfile) {
                const errors = window.Utils.validateProfile(profileData);
                if (errors.length > 0) {
                    this.showAlert(errors[0], 'error');
                    return;
                }
            }

            await this.authManager.createProfile(profileData);
            
            this.closeModal('profileModal');
            this.showAlert('Profile created successfully!', 'success');
            const redirectView = this.postLoginRedirect || (this.currentView === 'landing' ? 'feed' : this.currentView);
            this.postLoginRedirect = null;
            this.switchView(redirectView);
        } catch (error) {
            console.error('Profile creation error:', error);
            this.showAlert(error?.message || 'Failed to create profile', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Open account modal
    openAccountModal() {
        document.getElementById('authModalTitle').textContent = 'Sign in / Create account';
        this.setAuthMode(this.authMode || 'password');
        this.openModal('authModal');
    }

    setAuthMode(mode) {
        const nextMode = (mode || '').trim().toLowerCase() === 'otp' ? 'otp' : 'password';
        this.authMode = nextMode;

        const passwordLoginForm = document.getElementById('passwordLoginForm');
        const passwordSignupForm = document.getElementById('passwordSignupForm');
        const otpSendForm = document.getElementById('otpSendForm');
        const otpVerifyForm = document.getElementById('otpVerifyForm');

        if (nextMode === 'otp') {
            if (passwordLoginForm) passwordLoginForm.style.display = 'none';
            if (passwordSignupForm) passwordSignupForm.style.display = 'none';
            if (otpSendForm) otpSendForm.style.display = 'block';
            if (otpVerifyForm) otpVerifyForm.style.display = 'none';
            const emailOrPhone = document.getElementById('authEmailOrPhone');
            const otpCode = document.getElementById('otpCode');
            if (emailOrPhone) emailOrPhone.value = '';
            if (otpCode) otpCode.value = '';
            return;
        }

        if (otpSendForm) otpSendForm.style.display = 'none';
        if (otpVerifyForm) otpVerifyForm.style.display = 'none';
        this.showPasswordLogin();
    }

    showPasswordLogin() {
        const passwordLoginForm = document.getElementById('passwordLoginForm');
        const passwordSignupForm = document.getElementById('passwordSignupForm');
        if (passwordSignupForm) passwordSignupForm.style.display = 'none';
        if (passwordLoginForm) passwordLoginForm.style.display = 'block';

        const email = document.getElementById('authEmail');
        const password = document.getElementById('authPassword');
        if (email) email.value = '';
        if (password) password.value = '';
    }

    showPasswordSignup() {
        const passwordLoginForm = document.getElementById('passwordLoginForm');
        const passwordSignupForm = document.getElementById('passwordSignupForm');
        if (passwordLoginForm) passwordLoginForm.style.display = 'none';
        if (passwordSignupForm) passwordSignupForm.style.display = 'block';

        const email = document.getElementById('signupEmail');
        const password = document.getElementById('signupPassword');
        const confirm = document.getElementById('signupPasswordConfirm');
        if (email) email.value = '';
        if (password) password.value = '';
        if (confirm) confirm.value = '';
    }

    async handlePasswordSignup(event) {
        event.preventDefault();

        const email = document.getElementById('signupEmail')?.value?.trim();
        const password = document.getElementById('signupPassword')?.value || '';
        const confirm = document.getElementById('signupPasswordConfirm')?.value || '';

        if (!email || !password) return;
        if (password !== confirm) {
            this.showAlert('Passwords do not match', 'error');
            return;
        }

        try {
            this.showLoading(true);
            const result = await this.authManager.signUpWithPassword(email, password);

            if (!result.success) {
                this.showAlert(result.error || 'Failed to create account', 'error');
                return;
            }

            if (result.needsEmailConfirm) {
                this.showAlert('Account created. Check your email to confirm, then login.', 'success');
                this.showPasswordLogin();
                return;
            }

            this.closeModal('authModal');
            if (result.needsProfile) {
                this.openModal('profileModal');
            } else {
                this.showAlert('Account created successfully!', 'success');
                await this.loadViewData(this.currentView);
            }
        } catch (error) {
            console.error('Password signup error:', error);
            this.showAlert('Failed to create account', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handlePasswordLogin(event) {
        event.preventDefault();

        const email = document.getElementById('authEmail')?.value?.trim();
        const password = document.getElementById('authPassword')?.value || '';
        if (!email || !password) return;

        try {
            this.showLoading(true);
            const result = await this.authManager.signInWithPassword(email, password);

            if (!result.success) {
                this.showAlert(result.error || 'Login failed', 'error');
                return;
            }

            this.closeModal('authModal');
            if (result.needsProfile) {
                this.openModal('profileModal');
            } else {
                this.showAlert('Logged in successfully!', 'success');
                await this.loadViewData(this.currentView);
            }
        } catch (error) {
            console.error('Password login error:', error);
            this.showAlert('Login failed', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Open modal
    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    }

    // Close modal
    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    // Show loading overlay
    showLoading(show) {
        document.getElementById('loadingOverlay').style.display = show ? 'flex' : 'none';
    }

    // Show alert
    showAlert(message, type = 'info') {
        if (window.Toast) {
            window.Toast.show(message, type);
            return;
        }

        const alertDiv = document.getElementById('authAlert');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        alertDiv.style.display = 'block';
        
        setTimeout(() => {
            alertDiv.style.display = 'none';
        }, 5000);
    }

    // Setup realtime subscriptions
    setupRealtimeSubscriptions() {
        // Subscribe to new posts
        this.postsManager.subscribeToPosts((payload) => {
            if (this.currentView === 'feed') {
                this.loadFeed();
            } else {
                // Optional: Show a small indicator that there are new posts
            }
        });

        // Subscribe to global messages (to show notifications)
        if (this.messagingManager) {
            this.supabase.channel('global_messages')
                .on('postgres_changes', 
                    { event: 'INSERT', schema: 'public', table: 'messages' },
                    async (payload) => {
                        // Check if message is for us (not sent by us)
                        const user = this.authManager.getUser();
                        if (user && payload.new.sender_id !== user.id) {
                            if (this.currentView === 'messages') {
                                // If in messages view, reload list
                                await this.loadMessages();
                            } else if (this.currentChatId !== payload.new.chat_id) {
                                // Show notification if not in this specific chat
                                this.showAlert('New message received! 💬', 'info');
                            }
                        }
                    }
                )
                .subscribe();
        }
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    jsString(value) {
        return JSON.stringify(String(value ?? ''));
    }

    debounce(fn, delayMs) {
        let timer = null;
        return (...args) => {
            if (timer) window.clearTimeout(timer);
            timer = window.setTimeout(() => fn.apply(this, args), delayMs);
        };
    }

    withTimeout(promise, timeoutMs) {
        const ms = Math.max(0, Number(timeoutMs) || 0);
        if (!ms) return promise;
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = window.setTimeout(() => {
                reject(new Error('Request timed out'));
            }, ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) window.clearTimeout(timeoutId);
        });
    }

    getInitials(firstName, lastName) {
        const first = (firstName || '').charAt(0).toUpperCase();
        const last = (lastName || '').charAt(0).toUpperCase();
        return (first + last) || 'U';
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return time.toLocaleDateString();
    }
}

// Initialize app when DOM is ready
let AppInstance;
document.addEventListener('DOMContentLoaded', async () => {
    AppInstance = new AppController();
    App = AppInstance;
    window.App = AppInstance;
    await AppInstance.init();
});
