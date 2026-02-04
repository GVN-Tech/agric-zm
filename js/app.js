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
        this.searchManager = null;
        this.notificationsChannel = null;
        this.notificationsCache = new Map();
        this.unreadNotificationsCount = 0;
        this.currentView = 'landing';
        this.currentChatId = null;
        this.currentChatType = 'direct';
        this.currentGroupId = null;
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
        this.feedReloadTimer = null;
        this.chatNotificationChannels = [];
        this.modalStack = [];
        this.activeModalId = null;
        this.modalAccessibilityInitialized = false;
    }

    async init() {
        this.showLoading(true);
        try {
            this.setupRouting();
            this.setupLandingCarousel();
            this.setupResponsiveNav();
            this.setupNavbarSearch();
            this.setupStories();
            this.setupFarmerDiscovery();
            this.setupComposer();
            this.setupChatComposer();
            this.setupModalAccessibility();

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
            this.friendsManager = new FriendsManager(supabaseClient);
            this.storiesManager = new StoriesManager(supabaseClient);
            this.searchManager = typeof SearchManager === 'function' ? new SearchManager(supabaseClient) : null;
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

            await this.authManager.init();
            if (typeof this.authManager.waitForAuthReady === 'function') {
                await this.authManager.waitForAuthReady();
            }
            await this.resolveAuthSession();
            this.handleAuthChange(this.authManager.isAuthenticated());

            // Load initial view
            if (!this.authManager.isAuthenticated()) {
                if (requestedView && requestedView !== 'landing') {
                    this.postLoginRedirect = requestedView;
                }
                this.switchView('landing', false);
                return;
            }

            const lastView = this.getLastAuthedView();
            const initialView = requestedView && requestedView !== 'landing'
                ? requestedView
                : (lastView || 'feed');
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

    async resolveAuthSession() {
        if (!this.supabase || !this.authManager) return;
        const ensureProfile = async (user) => {
            if (!user) return;
            const hasProfile = typeof this.authManager.getProfile === 'function' ? this.authManager.getProfile() : null;
            if (hasProfile) return;
            if (typeof this.authManager.loadUserProfile === 'function') {
                await this.authManager.loadUserProfile(user.id);
            }
        };

        let authUser = typeof this.authManager.getUser === 'function' ? this.authManager.getUser() : null;
        if (authUser) {
            await ensureProfile(authUser);
            return;
        }

        const attempts = [0, 250, 750];
        for (let i = 0; i < attempts.length; i++) {
            if (attempts[i]) {
                await new Promise((resolve) => window.setTimeout(resolve, attempts[i]));
            }
            try {
                if (this.supabase.auth?.getSession) {
                    const { data: { session } } = await this.supabase.auth.getSession();
                    if (session?.user) {
                        this.authManager.currentUser = session.user;
                        await ensureProfile(session.user);
                        return;
                    }
                }
                if (this.supabase.auth?.getUser) {
                    const { data: { user } } = await this.supabase.auth.getUser();
                    if (user) {
                        this.authManager.currentUser = user;
                        await ensureProfile(user);
                        return;
                    }
                }
            } catch (_) {
            }
        }
    }

    getLastAuthedView() {
        try {
            const value = window.localStorage.getItem('agrilovers.lastView') || '';
            const view = value.trim().toLowerCase();
            const allowed = new Set(['feed', 'showcase', 'market', 'groups', 'messages']);
            return allowed.has(view) ? view : null;
        } catch (_) {
            return null;
        }
    }

    setupNavbarSearch() {
        const host = document.getElementById('navbarSearch');
        if (!host) return;

        const input = host.querySelector('input.topbar-search') || host.querySelector('input');
        if (!input) return;

        if (host.dataset.ready === '1') return;
        host.dataset.ready = '1';

        host.style.position = 'relative';

        const dropdown = document.createElement('div');
        dropdown.className = 'navbar-search-dropdown';
        dropdown.setAttribute('role', 'listbox');
        dropdown.style.display = 'none';
        host.appendChild(dropdown);

        let hideTimer = null;
        let activeQueryToken = 0;

        const hide = () => {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
        };

        const show = () => {
            if (!dropdown.innerHTML.trim()) return;
            dropdown.style.display = 'block';
        };

        const renderMessage = (title, text) => {
            dropdown.innerHTML = `
                <div class="navbar-search-empty">
                    <div class="navbar-search-empty-title">${this.escapeHtml(title || '')}</div>
                    <div class="navbar-search-empty-text">${this.escapeHtml(text || '')}</div>
                </div>
            `;
            dropdown.style.display = 'block';
        };

        const renderSearchResults = (results, query, searchType = 'all') => {
            const q = (query || '').trim();
            const items = Array.isArray(results) ? results : [];

            if (!items.length) {
                renderMessage('No results', q ? `No ${searchType === 'all' ? 'results' : searchType + 's'} match "${q}".` : 'No results found.');
                return;
            }

            // Group results by type
            const groupedResults = {};
            items.forEach(item => {
                const type = item.type || 'farmer';
                if (!groupedResults[type]) {
                    groupedResults[type] = [];
                }
                groupedResults[type].push(item);
            });

            dropdown.innerHTML = Object.entries(groupedResults)
                .map(([type, typeItems]) => {
                    const title = this.getSearchTypeTitle(type);
                    return `
                        <div class="navbar-search-section">
                            <div class="navbar-search-section-title">${title}</div>
                            <div class="navbar-search-section-items">
                                ${typeItems.slice(0, 5).map(item => this.renderSearchResultItem(item, type)).join('')}
                            </div>
                        </div>
                    `;
                }).join('');

            dropdown.style.display = 'block';
        };

        const renderSearchSuggestions = (suggestions, query) => {
            const q = (query || '').trim();
            if (!suggestions.length) return;

            dropdown.innerHTML += `
                <div class="navbar-search-section">
                    <div class="navbar-search-section-title">Suggestions</div>
                    <div class="navbar-search-section-items">
                        ${suggestions.slice(0, 5).map(suggestion => `
                            <button class="navbar-search-suggestion" type="button" data-query="${this.escapeHtml(suggestion.query)}" data-type="${this.escapeHtml(suggestion.type)}">
                                <div class="navbar-search-suggestion-icon">🔍</div>
                                <div class="navbar-search-suggestion-text">
                                    <div class="navbar-search-suggestion-query">${this.escapeHtml(suggestion.query)}</div>
                                    <div class="navbar-search-suggestion-type">${this.escapeHtml(this.getSearchTypeTitle(suggestion.type))}</div>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        };

        const runSearch = async () => {
            const q = String(input.value || '').trim();
            if (q.length < 2) {
                hide();
                return;
            }

            const token = ++activeQueryToken;
            dropdown.innerHTML = '<div class="spinner" style="margin: 14px auto;"></div>';
            dropdown.style.display = 'block';

            if (!this.authManager || !this.authManager.isAuthenticated()) {
                renderMessage('Sign in to search', 'Create an account to search farmers, crops, and markets.');
                return;
            }

            if (!this.searchManager || !this.searchManager.searchAll) {
                renderMessage('Search unavailable', 'Configure Supabase to enable enhanced search.');
                return;
            }

            try {
                const { results, suggestions } = await this.withTimeout(
                    this.searchManager.searchAll(q, { limit: 15 }),
                    12000
                );
                
                if (token !== activeQueryToken) return;
                
                if (results.length > 0) {
                    renderSearchResults(results, q, 'all');
                    if (suggestions.length > 0) {
                        renderSearchSuggestions(suggestions, q);
                    }
                } else {
                    renderMessage('No results found', `Try searching for farmers, crops, markets, or posts.`);
                    
                    // Show search suggestions even when no results
                    if (suggestions.length > 0) {
                        renderSearchSuggestions(suggestions, q);
                    }
                }
            } catch (error) {
                if (token !== activeQueryToken) return;
                console.error('Enhanced search error:', error);
                renderMessage('Search failed', 'Please try again.');
                
                // Fallback to basic farmer search
                try {
                    const myId = this.authManager?.getProfile?.()?.id || null;
                    const farmers = await this.withTimeout(this.postsManager.searchFarmers({ query: q, limit: 8 }), 5000);
                    if (token !== activeQueryToken) return;
                    const filtered = (farmers || []).filter((f) => !myId || f.id !== myId);
                    if (filtered.length > 0) {
                        renderSearchResults(filtered.map(f => ({ ...f, type: 'farmer' })), q, 'farmer');
                    } else {
                        renderMessage('No farmers found', `No farmers match "${q}".`);
                    }
                } catch (fallbackError) {
                    renderMessage('Search unavailable', 'Please check your connection.');
                }
            }
        };

        const schedule = this.debounce(runSearch, 250);

        input.setAttribute('autocomplete', 'off');
        input.setAttribute('autocapitalize', 'off');
        input.setAttribute('spellcheck', 'false');

        input.addEventListener('input', () => {
            if (hideTimer) window.clearTimeout(hideTimer);
            schedule();
        });

        input.addEventListener('focus', () => {
            if (hideTimer) window.clearTimeout(hideTimer);
            if (String(input.value || '').trim().length >= 2) {
                if (dropdown.innerHTML.trim()) show();
                schedule();
            }
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                hide();
                input.blur();
                return;
            }
            if (event.key === 'Enter') {
                const first = dropdown.querySelector('.navbar-search-item');
                if (first) {
                    event.preventDefault();
                    first.click();
                }
            }
        });

        host.addEventListener('focusout', () => {
            if (hideTimer) window.clearTimeout(hideTimer);
            hideTimer = window.setTimeout(() => {
                const active = document.activeElement;
                if (!active || !host.contains(active)) hide();
            }, 140);
        });

        dropdown.addEventListener('mousedown', (event) => {
            event.preventDefault();
        });

        dropdown.addEventListener('click', async (event) => {
            const target = event.target instanceof Element ? event.target : null;
            
            // Handle search result items
            const resultItem = target ? target.closest('.navbar-search-item') : null;
            if (resultItem) {
                const userId = String(resultItem.getAttribute('data-user-id') || '').trim();
                const postId = String(resultItem.getAttribute('data-post-id') || '').trim();
                const groupId = String(resultItem.getAttribute('data-group-id') || '').trim();
                const marketId = String(resultItem.getAttribute('data-market-id') || '').trim();
                
                hide();
                
                if (userId) {
                    try {
                        await this.openFarmerProfile(userId);
                    } catch (_) {}
                } else if (postId) {
                    try {
                        await this.openPostDetail(postId);
                    } catch (_) {}
                } else if (groupId) {
                    try {
                        await this.openGroupDetail(groupId);
                    } catch (_) {}
                } else if (marketId) {
                    try {
                        await this.openMarketDetail(marketId);
                    } catch (_) {}
                }
                return;
            }
            
            // Handle search suggestions
            const suggestionItem = target ? target.closest('.navbar-search-suggestion') : null;
            if (suggestionItem) {
                const query = String(suggestionItem.getAttribute('data-query') || '').trim();
                const type = String(suggestionItem.getAttribute('data-type') || '').trim();
                
                if (query) {
                    input.value = query;
                    input.focus();
                    runSearch();
                }
                return;
            }
        });

        document.addEventListener('click', (event) => {
            const target = event.target instanceof Node ? event.target : null;
            if (!target) return;
            if (!host.contains(target)) hide();
        });
    }

    setupStories() {
        const row = document.getElementById('storiesRow');
        if (!row) return;

        // Load initial stories
        this.loadStories();

        const addBtn = document.getElementById('addStoryBtn');
        if (addBtn) {
            addBtn.onclick = () => this.openStoryCreateModal();
        }
        
        const imageInput = document.getElementById('storyImageInput');
        const imagePreview = document.getElementById('storyImagePreview');

        // Setup image preview
        if (imageInput && imagePreview) {
            imageInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (evt) => {
                    imagePreview.innerHTML = `<img src="${evt.target.result}" style="max-height: 200px; width: auto; display: block; margin: 0 auto;">`;
                    imagePreview.style.display = 'block';
                };
                reader.readAsDataURL(file);
            };
        }

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

        startDragScroll();
    }

    async loadStories() {
        if (!this.storiesManager) return;

        const row = document.getElementById('storiesRow');
        if (!row) return;

        // Keep the "Add Story" button
        const addBtnHtml = `
            <div class="story story-add" id="addStoryBtn" role="button" tabindex="0" aria-label="Add Story" onclick="App.openStoryCreateModal()">
                <div class="story-image">+</div>
                <div class="story-label">Add Story</div>
            </div>
        `;

        try {
            const storyGroups = await this.storiesManager.getActiveStories();
            
            const storiesHtml = storyGroups.map(group => {
                const user = group.user;
                const hasUnseen = group.hasUnseen;
                
                return `
                    <div class="story ${hasUnseen ? 'unseen' : ''}" 
                         onclick="App.openStoryViewer('${user.id}')">
                        <div class="story-image-wrapper">
                            ${this.renderAvatarHtml(user.avatar_url, user.first_name, user.last_name)}
                        </div>
                        <div class="story-label">${this.escapeHtml(user.first_name)}</div>
                    </div>
                `;
            }).join('');

            row.innerHTML = addBtnHtml + storiesHtml;
        } catch (error) {
            console.error('Load stories error:', error);
            // Fallback to just showing add button if error
            row.innerHTML = addBtnHtml;
        }
    }

    openStoryCreateModal() {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }
        this.openModal('storyCreateModal');
    }

    async openStoryViewer(userId) {
        if (!this.storiesManager) return;

        try {
            const storyGroups = await this.storiesManager.getActiveStories();
            const group = storyGroups.find(g => g.user.id === userId);
            
            if (!group || !group.stories.length) return;

            this.currentStoryGroup = group;
            this.currentStoryIndex = 0;
            
            this.openModal('storyViewerModal');
            this.renderStorySlide();
        } catch (error) {
            console.error('Open story viewer error:', error);
        }
    }

    async renderStorySlide() {
        if (!this.currentStoryGroup) return;
        
        const story = this.currentStoryGroup.stories[this.currentStoryIndex];
        const user = this.currentStoryGroup.user;
        const container = document.getElementById('storyViewerMedia');
        const meta = document.getElementById('storyViewerMeta');
        
        if (!story) return;

        // Mark as viewed
        this.storiesManager.viewStory(story.id).catch(console.error);

        container.innerHTML = `
            <img src="${story.image_url}" alt="Story" style="width: 100%; height: 100%; object-fit: contain; background: #000;">
        `;

        meta.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; color: white; background: rgba(0,0,0,0.5); position: absolute; bottom: 0; left: 0; right: 0;">
                <div>
                    <strong>${this.escapeHtml(user.first_name)} ${this.escapeHtml(user.last_name)}</strong>
                    <div>${this.escapeHtml(story.caption || '')}</div>
                    <small>${this.formatTimeAgo(story.created_at)}</small>
                </div>
                ${this.authManager.getProfile()?.id === user.id ? `
                    <button class="btn btn-icon" style="color: white;" onclick="App.deleteStory('${story.id}')">🗑️</button>
                ` : ''}
            </div>
            <div class="story-nav" style="position: absolute; top: 50%; width: 100%; display: flex; justify-content: space-between; padding: 0 10px; pointer-events: none;">
                <button class="btn btn-icon" style="pointer-events: auto; background: rgba(255,255,255,0.2); color: white;" onclick="App.prevStory()">❮</button>
                <button class="btn btn-icon" style="pointer-events: auto; background: rgba(255,255,255,0.2); color: white;" onclick="App.nextStory()">❯</button>
            </div>
        `;
    }

    nextStory() {
        if (!this.currentStoryGroup) return;
        
        if (this.currentStoryIndex < this.currentStoryGroup.stories.length - 1) {
            this.currentStoryIndex++;
            this.renderStorySlide();
        } else {
            this.closeModal('storyViewerModal');
            this.loadStories(); // Refresh seen status
        }
    }

    prevStory() {
        if (!this.currentStoryGroup) return;
        
        if (this.currentStoryIndex > 0) {
            this.currentStoryIndex--;
            this.renderStorySlide();
        }
    }

    async deleteStory(storyId) {
        if (!confirm('Delete this story?')) return;
        
        try {
            await this.storiesManager.deleteStory(storyId);
            this.showToast('Story deleted');
            this.closeModal('storyViewerModal');
            await this.loadStories();
        } catch (error) {
            console.error('Delete story error:', error);
            this.showToast('Failed to delete story', 'error');
        }
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

    setupChatComposer() {
        const input = document.getElementById('chatAttachmentInput');
        const list = document.getElementById('chatAttachmentList');
        if (!input || !list) return;

        const renderList = () => {
            const files = Array.from(input.files || []);
            if (!files.length) {
                list.innerHTML = '';
                return;
            }

            list.innerHTML = files.map((file) => {
                const size = this.formatFileSize(file.size || 0);
                return `
                    <div class="chat-attachment-item">
                        <span class="chat-attachment-name">${this.escapeHtml(file.name || 'file')}</span>
                        <span class="chat-attachment-size">${this.escapeHtml(size)}</span>
                    </div>
                `;
            }).join('');
        };

        input.addEventListener('change', renderList);
    }

    async handleStoryCreate(event) {
        event.preventDefault();
        
        const fileInput = document.getElementById('storyImageInput');
        const captionInput = document.getElementById('storyCaption');
        const file = fileInput?.files?.[0];
        const caption = captionInput?.value?.trim();

        if (!file) {
            this.showToast('Please select an image', 'error');
            return;
        }

        try {
            this.showLoading(true);
            await this.storiesManager.createStory(file, caption);
            this.showToast('Story posted!', 'success');
            this.closeModal('storyCreateModal');
            
            // Reset form
            document.getElementById('storyCreateForm').reset();
            const preview = document.getElementById('storyImagePreview');
            if (preview) {
                preview.innerHTML = '';
                preview.style.display = 'none';
            }
            
            await this.loadStories();
        } catch (error) {
            console.error('Create story error:', error);
            this.showToast('Failed to post story', 'error');
        } finally {
            this.showLoading(false);
        }
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
        if (this.isSupabaseConfigured()) {
            const container = document.getElementById('previewModeContainer');
            if (container) container.style.display = 'none';
            const postsContainer = document.getElementById('postsContainer');
            if (postsContainer) postsContainer.style.display = 'block';
            return;
        }

        const container = document.getElementById('previewModeContainer');
        if (container) {
            container.style.display = 'block';
            document.getElementById('postsContainer').style.display = 'none';
        }
    }

    isSupabaseConfigured() {
        return !!(
            SUPABASE_CONFIG &&
            SUPABASE_CONFIG.url &&
            SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL' &&
            SUPABASE_CONFIG.anonKey &&
            SUPABASE_CONFIG.anonKey !== 'YOUR_SUPABASE_ANON_KEY'
        );
    }

    getSupabaseErrorInfo(error, fallbackTitle) {
        const code = error?.code || error?.error?.code || null;
        const status = error?.status || error?.error?.status || null;
        const rawMessage = String(error?.message || error?.error_description || error?.details || error || '');
        const message = rawMessage.toLowerCase();

        if (code === '42P01' || message.includes('does not exist') || message.includes('undefined table')) {
            return {
                title: 'Database setup required',
                text: 'Run database/COMPLETE_SETUP.sql in Supabase SQL Editor.'
            };
        }

        if (message.includes('request timed out') || message.includes('timed out')) {
            return {
                title: 'Request timed out',
                text: 'Check your network connection and Supabase availability.'
            };
        }

        if (
            status === 401 ||
            status === 403 ||
            message.includes('jwt') ||
            message.includes('permission denied') ||
            message.includes('not authorized') ||
            message.includes('rls')
        ) {
            return {
                title: 'Access denied',
                text: 'Sign in again and verify RLS policies are installed.'
            };
        }

        if (
            message.includes('failed to fetch') ||
            message.includes('networkerror') ||
            message.includes('fetch failed') ||
            message.includes('enotfound') ||
            message.includes('cors')
        ) {
            return {
                title: 'Cannot reach Supabase',
                text: 'Check your Project URL, anon key, and network connectivity.'
            };
        }

        return {
            title: fallbackTitle || 'Could not load data',
            text: 'Please check your Supabase configuration.'
        };
    }

    buildEmptyStateHtml(icon, title, text, style = '') {
        const styleAttr = style ? ` style="${style}"` : '';
        return `
            <div class="empty-state"${styleAttr}>
                <div class="empty-state-icon">${icon}</div>
                <h3 class="empty-state-title">${this.escapeHtml(title || '')}</h3>
                <p class="empty-state-text">${this.escapeHtml(text || '')}</p>
            </div>
        `;
    }

    renderSupabaseError(container, icon, fallbackTitle, error, style = '') {
        if (!container) return;
        const info = this.getSupabaseErrorInfo(error, fallbackTitle);
        container.innerHTML = this.buildEmptyStateHtml(icon, info.title, info.text, style);
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

        const demoGroupChats = [
            {
                id: 'demo-group-1',
                name: 'Maize Growers',
                group_type: 'crop',
                crop_tag: 'Maize',
                unread_count: 0
            },
            {
                id: 'demo-group-2',
                name: 'Lusaka Cooperative',
                group_type: 'regional',
                province: 'Lusaka',
                unread_count: 2
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
                    ` + `
                        <div class="chat-section">
                            <div class="chat-section-title">Direct</div>
                            ${demoChats.map((chat) => {
                        const otherUser = chat.other_user || {};
                        const name = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Farmer';
                        const avatarHtml = this.renderAvatarHtml(otherUser.avatar_url, otherUser.first_name, otherUser.last_name, name);
                        return `
                            <div class="card chat-card" aria-disabled="true">
                                <div class="chat-card-content">
                                    <div class="post-avatar">${avatarHtml}</div>
                                    <div class="chat-info">
                                        <h4 class="chat-name">${this.escapeHtml(name)}</h4>
                                        ${chat.unread_count ? `<span class="badge badge-error">${chat.unread_count} new</span>` : ''}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                        </div>
                        <div class="chat-section">
                            <div class="chat-section-title">Groups</div>
                            ${demoGroupChats.map((group) => {
                                const metaParts = [group.group_type, group.crop_tag || group.province].filter(Boolean);
                                const meta = metaParts.join(' • ');
                                return `
                                    <div class="card chat-card" aria-disabled="true">
                                        <div class="chat-card-content">
                                            <div class="post-avatar">👥</div>
                                            <div class="chat-info">
                                                <h4 class="chat-name">${this.escapeHtml(group.name || 'Group')}</h4>
                                                ${meta ? `<div class="post-meta">${this.escapeHtml(meta)}</div>` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `;
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
                if (accountNavBtn) {
                    const iconEl = accountNavBtn.querySelector('.nav-icon');
                    if (iconEl) iconEl.textContent = '👤';
                    const labelEl = accountNavBtn.querySelector('span');
                    if (labelEl) labelEl.textContent = profile.first_name || 'Me';
                }
                this.setupChatNotificationSubscriptions();
                this.setupNotificationSubscriptions();
                this.refreshNotificationsBadge();
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
            if (this.currentView === 'landing') {
                this.switchView('feed', false);
            } else {
                this.applyLayoutForView(this.currentView);
            }
            this.openModal('profileModal');
        } else {
            this.teardownChatNotificationSubscriptions();
            this.teardownNotificationSubscriptions();
            this.setUnreadNotificationsCount(0);
            postComposer.style.display = 'none';
            priceReportForm.style.display = 'none';
            if (accountNavBtn) {
                const iconEl = accountNavBtn.querySelector('.nav-icon');
                if (iconEl) iconEl.textContent = '👤';
                const labelEl = accountNavBtn.querySelector('span');
                if (labelEl) labelEl.textContent = 'Me';
            }
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

        const layers = Array.from(root.querySelectorAll('.landing-hero-bg-layer'));
        if (layers.length < 2) return;

        const captionEl = document.getElementById('landingHeroCaption');
        const stripRoot = document.getElementById('landingPhotoStrip');

        const captionPhrases = [
            'Better prices, together.',
            'Get local tips from farmers near you.',
            'Share harvest updates and learn faster.',
            'Find buyers and sell smarter.',
            'Spot pests early with community alerts.',
            'Build trusted groups across Zambia.',
            'Real farms. Real markets. Real support.',
            'Mobile-first and low-data friendly.'
        ];

        const imageUrls = [
            'assets/IMG-20260203-WA0056.jpg',
            'assets/IMG-20260203-WA0055.jpg',
            'assets/IMG-20260203-WA0054.jpg',
            'assets/IMG-20260203-WA0052.jpg',
            'assets/IMG-20260203-WA0051.jpg',
            'assets/IMG-20260203-WA0044.jpg',
            'assets/IMG-20260203-WA0041.jpg',
            'assets/IMG-20260203-WA0039.jpg',
            'assets/IMG-20260203-WA0038.jpg',
            'assets/IMG-20260203-WA0036.jpg',
            'assets/IMG-20260203-WA0035.jpg',
            'assets/IMG-20260203-WA0034.jpg',
            'assets/IMG-20260203-WA0032.jpg',
            'assets/IMG-20260203-WA0031.jpg',
            'assets/IMG-20260203-WA0030.jpg',
            'assets/IMG-20260203-WA0026.jpg',
            'assets/IMG-20260203-WA0025.jpg',
            'assets/IMG-20260203-WA0023.jpg',
            'assets/IMG-20260203-WA0022.jpg',
            'assets/IMG-20260203-WA0021.jpg',
            'assets/IMG-20260203-WA0019.jpg',
            'assets/IMG-20260203-WA0017.jpg',
            'assets/IMG-20260203-WA0013.jpg',
            'assets/IMG-20260203-WA0012.jpg',
            'assets/IMG-20260203-WA0010.jpg'
        ];

        const slides = imageUrls.map((url, slideIndex) => ({
            url,
            caption: captionPhrases[slideIndex % captionPhrases.length]
        }));

        let stripButtons = [];
        if (stripRoot) {
            const fragment = document.createDocumentFragment();
            slides.forEach((slide, slideIndex) => {
                const btn = document.createElement('button');
                btn.className = `landing-photo-strip-btn${slideIndex === 0 ? ' is-active' : ''}`;
                btn.type = 'button';
                btn.dataset.index = String(slideIndex);
                btn.setAttribute('aria-label', `Photo ${slideIndex + 1}`);

                const img = document.createElement('img');
                img.src = slide.url;
                img.alt = `Farm photo ${slideIndex + 1}`;
                img.loading = 'lazy';
                img.decoding = 'async';

                btn.appendChild(img);
                fragment.appendChild(btn);
            });
            stripRoot.replaceChildren(fragment);
            stripButtons = Array.from(stripRoot.querySelectorAll('.landing-photo-strip-btn'));
        }

        const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let index = 0;
        let timer = null;
        let paused = false;
        let activeLayer = Math.max(0, layers.findIndex(layer => layer.classList.contains('is-active')));
        if (activeLayer >= layers.length) activeLayer = 0;
        let switching = false;

        const host = root.closest('.landing-hero') || root;

        const normalizeIndex = (nextIndex) => ((nextIndex % slides.length) + slides.length) % slides.length;

        const preload = (url) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });

        const setLayerImage = (layerIndex, url) => {
            layers[layerIndex].style.backgroundImage = `url("${url}")`;
        };

        const setCaption = (activeIndex) => {
            if (!captionEl) return;
            const text = slides[activeIndex]?.caption || '';
            const nodes = captionEl.querySelectorAll('.landing-hero-ticker-text');
            nodes.forEach((node) => {
                node.textContent = text;
            });
            const track = captionEl.querySelector('.landing-hero-ticker-track');
            if (track) {
                track.style.animation = 'none';
                track.offsetHeight;
                track.style.animation = '';
            }
        };

        const setStripState = (activeIndex) => {
            if (!stripButtons.length) return;
            stripButtons.forEach((btn) => {
                const btnIndex = Number(btn.dataset.index);
                btn.classList.toggle('is-active', btnIndex === activeIndex);
            });
        };

        const goTo = async (nextIndex) => {
            if (!slides.length) return;
            if (switching) return;
            switching = true;

            const safeIndex = normalizeIndex(nextIndex);
            const nextUrl = slides[safeIndex].url;
            const incomingLayer = activeLayer === 0 ? 1 : 0;

            await preload(nextUrl);
            setLayerImage(incomingLayer, nextUrl);

            layers[incomingLayer].classList.add('is-active');
            layers[activeLayer].classList.remove('is-active');

            activeLayer = incomingLayer;
            index = safeIndex;
            setCaption(safeIndex);
            setStripState(safeIndex);

            const nextPreloadUrl = slides[normalizeIndex(safeIndex + 1)]?.url;
            if (nextPreloadUrl) preload(nextPreloadUrl);
            window.setTimeout(() => { switching = false; }, 950);
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

        if (slides.length) {
            const initialUrl = slides[0].url;
            setCaption(0);
            setStripState(0);
            preload(initialUrl).finally(() => {
                setLayerImage(activeLayer, initialUrl);
                layers[activeLayer].classList.add('is-active');
                layers[activeLayer === 0 ? 1 : 0].classList.remove('is-active');
                const nextPreloadUrl = slides[normalizeIndex(1)]?.url;
                if (nextPreloadUrl) preload(nextPreloadUrl);
            });
            start();
        }

        const pause = () => {
            paused = true;
        };

        const resume = () => {
            paused = false;
        };

        host.addEventListener('mouseenter', pause);
        host.addEventListener('mouseleave', resume);
        host.addEventListener('focusin', pause);
        host.addEventListener('focusout', resume);

        if (stripButtons.length) {
            stripButtons.forEach((btn) => {
                btn.addEventListener('click', () => {
                    const targetIndex = Number(btn.dataset.index);
                    if (!Number.isFinite(targetIndex)) return;
                    stop();
                    paused = false;
                    goTo(targetIndex);
                    start();
                });
            });
        }

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
            if (isAuthed && viewName !== 'landing') {
                try {
                    window.localStorage.setItem('agrilovers.lastView', viewName);
                } catch (_) {
                }
            }

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
            if (!this.postsManager || !this.postsManager.supabase) {
                this.renderPreviewContentForView('showcase');
                return;
            }

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

            container.innerHTML = imagePosts.map(post => {
                const author = post.author || {};
                const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Farmer';
                const safeImage = this.safeUrl(post.image_urls?.[0]);
                if (!safeImage) return '';
                return `
                    <div class="card showcase-card" onclick="App.openPostModal(${this.jsString(post.id)})">
                        <img src="${safeImage}" class="showcase-image" alt="${this.escapeHtml(authorName)}" loading="lazy" decoding="async">
                        <div class="showcase-meta">
                            <div class="showcase-author">${this.escapeHtml(authorName)}</div>
                            <div class="showcase-likes">❤️ ${Number(post.likes_count || 0)}</div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error('Showcase error:', error);
            this.renderSupabaseError(container, '📷', 'Could not load showcase', error, 'grid-column: 1/-1;');
        }
    }

    async openPostModal(postId) {
        const contentEl = document.getElementById('postModalContent');
        const titleEl = document.getElementById('postModalTitle');

        if (titleEl) titleEl.textContent = 'Post Details';
        if (contentEl) contentEl.innerHTML = '<div class="spinner"></div>';
        this.openModal('postModal');

        if (!this.postsManager || typeof this.postsManager.getPostById !== 'function') {
            if (contentEl) {
                contentEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📄</div>
                        <h3 class="empty-state-title">Post unavailable</h3>
                        <p class="empty-state-text">Connect Supabase to view post details.</p>
                    </div>
                `;
            }
            return;
        }

        try {
            const post = await this.withTimeout(this.postsManager.getPostById(postId), 12000);
            if (!post) {
                if (contentEl) {
                    contentEl.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state-icon">📄</div>
                            <h3 class="empty-state-title">Post not found</h3>
                            <p class="empty-state-text">It may have been deleted or is unavailable.</p>
                        </div>
                    `;
                }
                return;
            }

            const author = post.author || {};
            const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim();
            if (titleEl) titleEl.textContent = authorName ? `Post by ${authorName}` : 'Post Details';
            if (contentEl) contentEl.innerHTML = this.renderPost(post);
        } catch (error) {
            console.error('Open post modal error:', error);
            if (contentEl) {
                contentEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">⚠️</div>
                        <h3 class="empty-state-title">Could not load post</h3>
                        <p class="empty-state-text">Please try again in a moment.</p>
                    </div>
                `;
            }
        }
    }

    // Load data for current view
    async loadViewData(viewName) {
        // If we are in preview mode, don't try to load data
        const previewContainer = document.getElementById('previewModeContainer');
        if (previewContainer && previewContainer.style.display !== 'none') {
            console.warn('Preview mode active, skipping data load');
            if (!this.isSupabaseConfigured()) {
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
            this.renderSupabaseError(container, '🏠', 'Could not load feed', error);
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
        const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown';
        const avatarHtml = this.renderAvatarHtml(author.avatar_url, author.first_name, author.last_name, authorName);
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
                    <div class="post-avatar">${avatarHtml}</div>
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
                                ${(() => {
                                    const safe = this.safeUrl(url);
                                    if (!safe) return '';
                                    return `<a class="post-image-link" href="${safe}" target="_blank" rel="noopener noreferrer"><img src="${safe}" class="post-image" loading="lazy" decoding="async"></a>`;
                                })()}
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

        const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);

        // Limit to 4 images
        if (files.length > 4) {
            this.showAlert('Maximum 4 images allowed', 'error');
            event.target.value = ''; // Clear selection
            return;
        }

        const selectedFiles = Array.from(files);
        if (selectedFiles.some((file) => !file || !allowed.has(file.type))) {
            this.showAlert('Only PNG, JPG, WebP, or GIF images are allowed', 'error');
            event.target.value = '';
            return;
        }

        if (selectedFiles.some((file) => file.size > 5 * 1024 * 1024)) {
            this.showAlert('Each image must be 5MB or smaller', 'error');
            event.target.value = '';
            return;
        }

        selectedFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const div = document.createElement('div');
                div.style.cssText = 'position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden;';
                const img = document.createElement('img');
                img.className = 'image-cover';
                img.src = String(e?.target?.result || '');
                img.loading = 'lazy';
                img.decoding = 'async';
                div.appendChild(img);
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

        if (imageFiles && imageFiles.length) {
            const allowed = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
            const selectedFiles = Array.from(imageFiles);
            if (selectedFiles.length > 4) {
                this.showAlert('Maximum 4 images allowed', 'error');
                return;
            }
            if (selectedFiles.some((file) => !file || !allowed.has(file.type))) {
                this.showAlert('Only PNG, JPG, WebP, or GIF images are allowed', 'error');
                return;
            }
            if (selectedFiles.some((file) => file.size > 5 * 1024 * 1024)) {
                this.showAlert('Each image must be 5MB or smaller', 'error');
                return;
            }
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
            const authorName = `${author.first_name || ''} ${author.last_name || ''}`.trim() || 'Unknown';
            const avatarHtml = this.renderAvatarHtml(author.avatar_url, author.first_name, author.last_name, authorName);
            const likesCount = Number(comment.likes_count) || 0;
            const liked = comment.user_liked ? 'liked' : '';
            
            return `
                <div class="comment">
                    <div class="comment-avatar">${avatarHtml}</div>
                    <div class="comment-content">
                        <div class="comment-author">${this.escapeHtml(authorName)}</div>
                        <div class="comment-text">${this.escapeHtml(comment.content)}</div>
                        <div class="comment-actions">
                            <button class="comment-action ${liked}" type="button" onclick="App.toggleCommentLike('${postId}', '${comment.id}')">
                                ${liked ? '❤️' : '🤍'} ${likesCount}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async toggleCommentLike(postId, commentId) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        if (!this.postsManager || !this.postsManager.likeComment) {
            this.showAlert('Comment likes unavailable', 'error');
            return;
        }

        const btn = document.querySelector(`#comments-list-${postId} .comment-action[onclick*="${commentId}"]`);
        if (!btn) return;

        const isLiked = btn.classList.contains('liked');
        let count = parseInt(String(btn.textContent || '').trim().split(' ').pop() || '0', 10);
        if (!Number.isFinite(count)) count = 0;

        if (isLiked) {
            btn.classList.remove('liked');
            count = Math.max(0, count - 1);
            btn.innerHTML = `🤍 ${count}`;
        } else {
            btn.classList.add('liked');
            count += 1;
            btn.innerHTML = `❤️ ${count}`;
        }

        try {
            if (isLiked) {
                await this.postsManager.unlikeComment(commentId);
            } else {
                await this.postsManager.likeComment(commentId);
            }
        } catch (error) {
            console.error('Comment like error:', error);
            if (isLiked) {
                btn.classList.add('liked');
                btn.innerHTML = `❤️ ${count + 1}`;
            } else {
                btn.classList.remove('liked');
                btn.innerHTML = `🤍 ${Math.max(0, count - 1)}`;
            }
            this.showAlert('Failed to update comment like', 'error');
        }
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
            this.renderSupabaseError(container, '💰', 'Could not load market listings', error);
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
            this.renderSupabaseError(container, '📈', 'Could not load price reports', error);
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
            this.renderSupabaseError(container, '👥', 'Could not load groups', error, 'grid-column: 1/-1;');
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
            const isPublic = group.is_public !== false;
            const joinRequestStatus = group.join_request_status || null;
            const canReviewRequests = !isPublic && (group.user_role === 'admin' || group.user_role === 'moderator');

            let primaryLabel = 'Join Group';
            let primaryAction = 'joinGroup';
            let primaryDisabled = false;

            if (isMember) {
                primaryLabel = 'Leave Group';
                primaryAction = 'leaveGroup';
            } else if (!isPublic) {
                if (joinRequestStatus === 'pending') {
                    primaryLabel = 'Request Pending';
                    primaryDisabled = true;
                } else {
                    primaryLabel = 'Request to Join';
                }
            }
            
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
                        ${!isPublic ? `<span class="badge">Private</span>` : ''}
                    </div>
                    <div class="post-meta group-meta">
                        👥 ${membersCount} members
                    </div>
                    <button 
                        class="btn ${isMember ? 'btn-outline' : 'btn-primary'} btn-full-width"
                        ${primaryDisabled ? 'disabled' : ''}
                        onclick="App.${primaryAction}('${group.id}')"
                    >
                        ${primaryLabel}
                    </button>
                    ${joinRequestStatus === 'pending' && !isMember ? `
                        <button class="btn btn-outline btn-sm btn-full-width" onclick="App.cancelGroupJoinRequest('${group.id}')">
                            Cancel Request
                        </button>
                    ` : ''}
                    ${canReviewRequests ? `
                        <button class="btn btn-outline btn-sm btn-full-width" onclick="App.openJoinRequests('${group.id}')">
                            Review Requests
                        </button>
                    ` : ''}
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
            const result = await this.groupsManager.joinGroup(groupId);
            if (result?.alreadyMember) {
                this.showAlert('You are already a member of this group.', 'success');
            } else if (result?.requested) {
                this.showAlert('Request sent. Waiting for admin approval.', 'success');
            } else {
                this.showAlert('Joined group successfully!', 'success');
            }
            await this.loadGroups();
        } catch (error) {
            console.error('Join group error:', error);
            this.showAlert('Failed to join group', 'error');
        }
    }

    async cancelGroupJoinRequest(groupId) {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            await this.groupsManager.cancelJoinRequest(groupId);
            this.showAlert('Request cancelled', 'success');
            await this.loadGroups();
        } catch (error) {
            console.error('Cancel join request error:', error);
            this.showAlert('Failed to cancel request', 'error');
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

    async openJoinRequests(groupId) {
        if (!this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        const container = document.getElementById('joinRequestsContainer');
        if (container) container.innerHTML = '<div class="spinner"></div>';
        this.openModal('joinRequestsModal');

        try {
            const requests = await this.groupsManager.getPendingJoinRequests(groupId);
            this.renderJoinRequests(groupId, requests);
        } catch (error) {
            console.error('Load join requests error:', error);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <h3 class="empty-state-title">Could not load requests</h3>
                        <p class="empty-state-text">Please try again.</p>
                    </div>
                `;
            }
        }
    }

    renderJoinRequests(groupId, requests) {
        const container = document.getElementById('joinRequestsContainer');
        if (!container) return;

        if (!requests || requests.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">✅</div>
                    <h3 class="empty-state-title">No pending requests</h3>
                    <p class="empty-state-text">New requests will show up here.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = requests.map((req) => {
            const name = `${req.user?.first_name || ''} ${req.user?.last_name || ''}`.trim() || 'Farmer';
            const locationParts = [];
            if (req.user?.district) locationParts.push(req.user.district);
            if (req.user?.province) locationParts.push(req.user.province);
            const location = locationParts.join(', ');
            const timeAgo = this.formatTimeAgo(req.requested_at);

            return `
                <div class="card" style="margin-bottom: var(--spacing-sm);">
                    <div style="display: flex; justify-content: space-between; gap: var(--spacing-sm);">
                        <div>
                            <div style="font-weight: 600;">${this.escapeHtml(name)}</div>
                            <div class="post-meta">${location ? `📍 ${this.escapeHtml(location)} • ` : ''}${timeAgo}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
                        <button class="btn btn-primary btn-sm" onclick="App.approveJoinRequest('${groupId}', '${req.id}', '${req.user_id}')">Approve</button>
                        <button class="btn btn-outline btn-sm" onclick="App.rejectJoinRequest('${groupId}', '${req.id}')">Reject</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    async approveJoinRequest(groupId, requestId, userId) {
        try {
            await this.groupsManager.approveJoinRequest(requestId, groupId, userId);
            await this.openJoinRequests(groupId);
            await this.loadGroups();
            this.showAlert('Request approved', 'success');
        } catch (error) {
            console.error('Approve join request error:', error);
            this.showAlert('Failed to approve request', 'error');
        }
    }

    async rejectJoinRequest(groupId, requestId) {
        try {
            await this.groupsManager.rejectJoinRequest(requestId);
            await this.openJoinRequests(groupId);
            this.showAlert('Request rejected', 'success');
        } catch (error) {
            console.error('Reject join request error:', error);
            this.showAlert('Failed to reject request', 'error');
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
            const [chats, groups] = await Promise.all([
                this.withTimeout(this.messagingManager.getChats(), 12000),
                this.withTimeout(this.messagingManager.getGroupChats(), 12000)
            ]);
            this.renderChats(chats, groups);
        } catch (error) {
            console.error('Load messages error:', error);
            this.renderSupabaseError(container, '💬', 'Could not load messages', error);
        }
    }

    // Render chats list
    renderChats(chats, groups = []) {
        const container = document.getElementById('chatsContainer');
        const directChats = Array.isArray(chats) ? chats : [];
        const groupChats = Array.isArray(groups) ? groups : [];
        const myId = this.authManager?.getProfile?.()?.id || null;

        const directHtml = directChats.length ? directChats.map(chat => {
            const otherUser = chat.other_user || {};
            const name = `${otherUser.first_name || ''} ${otherUser.last_name || ''}`.trim() || 'Unknown';
            const avatarHtml = this.renderAvatarHtml(otherUser.avatar_url, otherUser.first_name, otherUser.last_name, name);
            const unreadCount = Number(chat.unread_count) || 0;
            const isUnread = unreadCount > 0;
            const previewRaw = String(chat.last_message_preview || '').trim();
            const previewPrefix = myId && chat.last_message_sender_id === myId ? 'You: ' : '';
            const preview = previewRaw ? `${previewPrefix}${previewRaw}` : 'No messages yet';
            const timeSource = chat.last_message_created_at || chat.last_message_at || chat.created_at || null;
            const timeAgo = timeSource ? this.formatTimeAgo(timeSource) : '';
            
            return `
                <div class="card chat-card ${isUnread ? 'chat-card-unread' : ''}" onclick="App.openChat('${chat.id}', ${this.jsString(name)});" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.openChat('${chat.id}', ${this.jsString(name)});}">
                    <div class="chat-card-content">
                        <div class="post-avatar">${avatarHtml}</div>
                        <div class="chat-info">
                            <div class="chat-row-top">
                                <h4 class="chat-name">${this.escapeHtml(name)}</h4>
                                ${timeAgo ? `<div class="chat-time">${this.escapeHtml(timeAgo)}</div>` : ''}
                            </div>
                            <div class="chat-row-bottom">
                                <div class="chat-preview">${this.escapeHtml(preview)}</div>
                                ${unreadCount > 0 ? `<span class="badge badge-error chat-unread-badge">${unreadCount}</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') : `
            <div class="empty-state">
                <div class="empty-state-icon">💬</div>
                <h3 class="empty-state-title">No direct messages yet</h3>
                <p class="empty-state-text">Start a conversation with another farmer from the Feed.</p>
            </div>
        `;

        const groupHtml = groupChats.length ? groupChats.map(group => {
            const name = String(group.name || 'Group');
            const unreadCount = Number(group.unread_count) || 0;
            const isUnread = unreadCount > 0;
            const previewRaw = String(group.last_message_preview || '').trim();
            const previewPrefix = myId && group.last_message_sender_id === myId ? 'You: ' : '';
            const preview = previewRaw ? `${previewPrefix}${previewRaw}` : 'No messages yet';
            const timeSource = group.last_message_created_at || null;
            const timeAgo = timeSource ? this.formatTimeAgo(timeSource) : '';
            const metaParts = [group.group_type, group.crop_tag || group.province].filter(Boolean);
            const meta = metaParts.join(' • ');
            return `
                <div class="card chat-card ${isUnread ? 'chat-card-unread' : ''}" onclick="App.openGroupChat('${group.id}', ${this.jsString(name)});" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.openGroupChat('${group.id}', ${this.jsString(name)});}">
                    <div class="chat-card-content">
                        <div class="post-avatar">👥</div>
                        <div class="chat-info">
                            <div class="chat-row-top">
                                <h4 class="chat-name">${this.escapeHtml(name)}</h4>
                                ${timeAgo ? `<div class="chat-time">${this.escapeHtml(timeAgo)}</div>` : ''}
                            </div>
                            <div class="chat-row-bottom">
                                <div class="chat-preview">${this.escapeHtml(preview)}</div>
                                ${unreadCount > 0 ? `<span class="badge badge-error chat-unread-badge">${unreadCount}</span>` : ''}
                            </div>
                            ${meta ? `<div class="post-meta">${this.escapeHtml(meta)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('') : `
            <div class="empty-state">
                <div class="empty-state-icon">👥</div>
                <h3 class="empty-state-title">No group chats yet</h3>
                <p class="empty-state-text">Join a group to start chatting with members.</p>
            </div>
        `;

        container.innerHTML = `
            <div class="chat-section">
                <div class="chat-section-title">Direct</div>
                ${directHtml}
            </div>
            <div class="chat-section">
                <div class="chat-section-title">Groups</div>
                ${groupHtml}
            </div>
        `;
    }

    // Open chat
    async openChat(chatId, userName) {
        const previousChatId = this.currentChatId;
        const previousGroupId = this.currentGroupId;
        const previousChatType = this.currentChatType;
        this.currentChatId = chatId;
        this.currentChatType = 'direct';
        this.currentGroupId = null;
        document.getElementById('chatTitle').textContent = `💬 ${userName}`;
        this.openModal('chatModal');

        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) messagesEl.innerHTML = '<div class="spinner"></div>';

        try {
            const messages = await this.withTimeout(this.messagingManager.getMessages(chatId), 12000);
            await this.renderChatMessages(messages);

            await this.messagingManager.markAsRead(chatId);

            if (this.currentChatChannel) {
                if (previousChatType === 'direct' && previousChatId) this.messagingManager.unsubscribeFromMessages(previousChatId);
                if (previousChatType === 'group' && previousGroupId) this.messagingManager.unsubscribeFromGroupMessages(previousGroupId);
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

    async openGroupChat(groupId, groupName) {
        const previousChatId = this.currentChatId;
        const previousGroupId = this.currentGroupId;
        const previousChatType = this.currentChatType;
        this.currentChatId = null;
        this.currentChatType = 'group';
        this.currentGroupId = groupId;
        document.getElementById('chatTitle').textContent = `👥 ${groupName}`;
        this.openModal('chatModal');

        const messagesEl = document.getElementById('chatMessages');
        if (messagesEl) messagesEl.innerHTML = '<div class="spinner"></div>';

        try {
            const messages = await this.withTimeout(this.messagingManager.getGroupMessages(groupId), 12000);
            await this.renderChatMessages(messages);

            if (this.currentChatChannel) {
                if (previousChatType === 'direct' && previousChatId) this.messagingManager.unsubscribeFromMessages(previousChatId);
                if (previousChatType === 'group' && previousGroupId) this.messagingManager.unsubscribeFromGroupMessages(previousGroupId);
                this.currentChatChannel = null;
            }

            this.currentChatChannel = this.messagingManager.subscribeToGroupMessages(groupId, async (message) => {
                await this.appendChatMessage(message);
            });
        } catch (error) {
            console.error('Open group chat error:', error);
            if (messagesEl) {
                messagesEl.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">👥</div>
                        <h3 class="empty-state-title">Could not load group chat</h3>
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
            const senderName = `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Farmer';
            const avatarHtml = this.renderAvatarHtml(sender.avatar_url, sender.first_name, sender.last_name, senderName);
            const attachmentsHtml = this.renderMessageAttachments(msg.attachments);
            
            return `
                <div class="message ${isSent ? 'message-sent' : 'message-received'}">
                    <div class="comment-avatar">${avatarHtml}</div>
                    <div class="message-bubble">
                        <div class="message-text">${this.escapeHtml(msg.content)}</div>
                        ${attachmentsHtml}
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
        const senderName = `${sender.first_name || ''} ${sender.last_name || ''}`.trim() || 'Farmer';
        const avatarHtml = this.renderAvatarHtml(sender.avatar_url, sender.first_name, sender.last_name, senderName);
        const attachmentsHtml = this.renderMessageAttachments(message.attachments);
        
        const messageHtml = `
            <div class="message ${isSent ? 'message-sent' : 'message-received'}">
                <div class="comment-avatar">${avatarHtml}</div>
                <div class="message-bubble">
                    <div class="message-text">${this.escapeHtml(message.content)}</div>
                    ${attachmentsHtml}
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
        const input = document.getElementById('chatInput');
        const attachmentInput = document.getElementById('chatAttachmentInput');
        const attachmentList = document.getElementById('chatAttachmentList');
        const content = input.value.trim();
        const files = Array.from(attachmentInput?.files || []);

        if (!content && !files.length) return;

        try {
            let message = null;
            if (this.currentChatType === 'group' && this.currentGroupId) {
                message = await this.messagingManager.sendGroupMessage(this.currentGroupId, content, files);
            } else if (this.currentChatId) {
                message = await this.messagingManager.sendMessage(this.currentChatId, content, files);
            } else {
                return;
            }
            input.value = '';
            if (attachmentInput) attachmentInput.value = '';
            if (attachmentList) attachmentList.innerHTML = '';
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
                const avatarHtml = this.renderAvatarHtml(farmer.avatar_url, farmer.first_name, farmer.last_name, name);
                const locationParts = [farmer.district, farmer.province].filter(Boolean);
                const location = locationParts.join(', ');
                const metaParts = [location, farmer.farmer_type].filter(Boolean);
                const meta = metaParts.join(' • ');
                const crops = (farmer.crops || '').trim();
                const livestock = (farmer.livestock || '').trim();
                const chips = [crops && `🌿 ${crops}`, livestock && `🐄 ${livestock}`].filter(Boolean).slice(0, 2);

                return `
                    <div class="card farmer-card" role="button" tabindex="0" onclick="App.openFarmerProfile('${farmer.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();App.openFarmerProfile('${farmer.id}');}">
                        <div class="farmer-card-header">
                            <div class="post-avatar">${avatarHtml}</div>
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
            const avatarHtml = this.renderAvatarHtml(farmer.avatar_url, farmer.first_name, farmer.last_name, name);
            const locationParts = [farmer.district, farmer.province].filter(Boolean);
            const location = locationParts.join(', ');
            const viewerId = this.authManager?.getProfile?.()?.id || null;

            let friendStatus = { status: 'none' };
            if (viewerId && viewerId !== farmer.id && this.friendsManager) {
                try {
                    friendStatus = await this.friendsManager.getFriendStatus(farmer.id);
                } catch (error) {
                    console.error('Friend status error:', error);
                    friendStatus = { status: 'none' };
                }
            }

            const rows = [
                farmer.farmer_type ? ['Farmer type', farmer.farmer_type] : null,
                farmer.crops ? ['Crops', farmer.crops] : null,
                farmer.livestock ? ['Livestock', farmer.livestock] : null,
                (farmer.farm_size_ha != null && farmer.farm_size_ha !== '') ? ['Farm size', `${farmer.farm_size_ha} ha`] : null
            ].filter(Boolean);

            let actionsHtml = '';
            const canMessage = !!this.messagingManager;
            const showActions = viewerId && viewerId !== farmer.id;

            if (showActions) {
                const messageBtn = canMessage
                    ? `<button class="btn btn-primary btn-full-width" type="button" onclick="App.startChatWithFarmer('${farmer.id}', ${this.jsString(name)});">Message</button>`
                    : '';

                if (friendStatus.status === 'unavailable') {
                    actionsHtml = `
                        <div class="farmer-profile-actions">
                            ${messageBtn}
                            <button class="btn btn-outline btn-full-width" type="button" disabled>Connections unavailable</button>
                        </div>
                    `;
                } else if (friendStatus.status === 'friends') {
                    actionsHtml = `
                        <div class="farmer-profile-actions">
                            ${messageBtn}
                            <button class="btn btn-outline btn-full-width" type="button" disabled>Friends</button>
                        </div>
                    `;
                } else if (friendStatus.status === 'outgoing') {
                    actionsHtml = `
                        <div class="farmer-profile-actions">
                            ${messageBtn}
                            <button class="btn btn-outline btn-full-width" type="button" disabled>Request sent</button>
                            <button class="btn btn-outline btn-full-width" type="button" onclick="App.cancelFriendRequest('${farmer.id}')">Cancel request</button>
                        </div>
                    `;
                } else if (friendStatus.status === 'incoming') {
                    actionsHtml = `
                        <div class="farmer-profile-actions">
                            ${messageBtn}
                            <button class="btn btn-primary btn-full-width" type="button" onclick="App.acceptFriendRequest('${friendStatus.requestId}', '${farmer.id}')">Accept</button>
                            <button class="btn btn-outline btn-full-width" type="button" onclick="App.declineFriendRequest('${friendStatus.requestId}', '${farmer.id}')">Decline</button>
                        </div>
                    `;
                } else {
                    actionsHtml = `
                        <div class="farmer-profile-actions">
                            ${messageBtn}
                            <button class="btn btn-primary btn-full-width" type="button" onclick="App.sendFriendRequest('${farmer.id}')">Add Friend</button>
                        </div>
                    `;
                }
            } else if (canMessage) {
                actionsHtml = `
                    <div class="farmer-profile-actions">
                        <button class="btn btn-primary btn-full-width" type="button" onclick="App.startChatWithFarmer('${farmer.id}', ${this.jsString(name)});">Message</button>
                    </div>
                `;
            }

            content.innerHTML = `
                <div class="farmer-profile">
                    <div class="farmer-profile-header">
                        <div class="farmer-profile-avatar">${avatarHtml}</div>
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
                    ${actionsHtml}
                </div>
            `;
        } catch (error) {
            console.error('Open farmer profile error:', error);
            content.innerHTML = '<div class="empty-state"><p>Failed to load farmer profile.</p></div>';
        }
    }

    // Friend System & Connections
    async openConnectionsModal(tab = 'friends') {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        this.openModal('connectionsModal');
        await this.switchConnectionsTab(tab);
    }

    async switchConnectionsTab(tab) {
        const modal = document.getElementById('connectionsModal');
        if (!modal) return;

        // Update tabs
        const tabs = modal.querySelectorAll('.tab-btn');
        tabs.forEach(t => {
            t.classList.toggle('active', t.getAttribute('onclick').includes(tab));
        });

        const content = document.getElementById('connectionsContent');
        if (content) content.innerHTML = '<div class="spinner"></div>';

        try {
            if (tab === 'friends') {
                const friends = await this.friendsManager.getFriends();
                this.renderFriendsList(friends);
            } else if (tab === 'requests') {
                const [incoming, outgoing] = await Promise.all([
                    this.friendsManager.getPendingRequests(),
                    this.friendsManager.getSentRequests()
                ]);
                this.renderFriendRequests(incoming, outgoing);
            } else if (tab === 'suggestions') {
                const suggestions = await this.friendsManager.getFriendSuggestions();
                this.renderFriendSuggestions(suggestions);
            }
        } catch (error) {
            console.error('Load connections error:', error);
            if (content) content.innerHTML = '<div class="empty-state"><p>Failed to load content</p></div>';
        }
    }

    renderFriendsList(friends) {
        const content = document.getElementById('connectionsContent');
        if (!content) return;

        if (!friends || friends.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">👥</div>
                    <h3 class="empty-state-title">No friends yet</h3>
                    <p class="empty-state-text">Connect with other farmers to share knowledge and opportunities.</p>
                    <button class="btn btn-primary" onclick="App.switchConnectionsTab('suggestions')">Find Farmers</button>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="list-group">
                ${friends.map(friend => `
                    <div class="list-item">
                        <div class="comment-avatar" onclick="App.openFarmerProfile('${friend.id}')">
                            ${this.renderAvatarHtml(friend.avatar_url, friend.first_name, friend.last_name)}
                        </div>
                        <div class="list-content" onclick="App.openFarmerProfile('${friend.id}')">
                            <div class="list-title">${this.escapeHtml(friend.first_name)} ${this.escapeHtml(friend.last_name)}</div>
                            <div class="list-subtitle">
                                ${friend.district ? `📍 ${this.escapeHtml(friend.district)}` : ''}
                                ${friend.farmer_type ? `• ${this.escapeHtml(friend.farmer_type)}` : ''}
                            </div>
                        </div>
                        <div class="list-actions">
                            <button class="btn btn-icon" onclick="App.startChatWithFarmer('${friend.id}', '${this.jsString(friend.first_name + ' ' + friend.last_name)}')" title="Message">
                                💬
                            </button>
                            <button class="btn btn-icon" onclick="App.confirmRemoveFriend('${friend.friend_id || friend.id}', '${this.jsString(friend.first_name)}')" title="Remove Friend" style="color: var(--danger);">
                                ✕
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderFriendRequests(incoming, outgoing) {
        const content = document.getElementById('connectionsContent');
        if (!content) return;

        if ((!incoming || incoming.length === 0) && (!outgoing || outgoing.length === 0)) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📨</div>
                    <h3 class="empty-state-title">No pending requests</h3>
                    <p class="empty-state-text">Friend requests you send or receive will appear here.</p>
                </div>
            `;
            return;
        }

        let html = '';

        if (incoming && incoming.length > 0) {
            html += `
                <h4 class="section-title">Incoming Requests</h4>
                <div class="list-group">
                    ${incoming.map(req => `
                        <div class="list-item">
                            <div class="comment-avatar" onclick="App.openFarmerProfile('${req.requester.id}')">
                                ${this.renderAvatarHtml(req.requester.avatar_url, req.requester.first_name, req.requester.last_name)}
                            </div>
                            <div class="list-content" onclick="App.openFarmerProfile('${req.requester.id}')">
                                <div class="list-title">${this.escapeHtml(req.requester.first_name)} ${this.escapeHtml(req.requester.last_name)}</div>
                                <div class="list-subtitle">
                                    ${req.requester.district ? `📍 ${this.escapeHtml(req.requester.district)}` : ''}
                                </div>
                            </div>
                            <div class="list-actions">
                                <button class="btn btn-primary btn-sm" onclick="App.acceptFriendRequest('${req.id}', '${req.requester.id}')">Accept</button>
                                <button class="btn btn-outline btn-sm" onclick="App.declineFriendRequest('${req.id}', '${req.requester.id}')">Decline</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (outgoing && outgoing.length > 0) {
            html += `
                <h4 class="section-title" style="margin-top: var(--spacing-md);">Sent Requests</h4>
                <div class="list-group">
                    ${outgoing.map(req => `
                        <div class="list-item">
                            <div class="comment-avatar" onclick="App.openFarmerProfile('${req.receiver.id}')">
                                ${this.renderAvatarHtml(req.receiver.avatar_url, req.receiver.first_name, req.receiver.last_name)}
                            </div>
                            <div class="list-content" onclick="App.openFarmerProfile('${req.receiver.id}')">
                                <div class="list-title">${this.escapeHtml(req.receiver.first_name)} ${this.escapeHtml(req.receiver.last_name)}</div>
                                <div class="list-subtitle">Pending...</div>
                            </div>
                            <div class="list-actions">
                                <button class="btn btn-outline btn-sm" onclick="App.cancelFriendRequest('${req.receiver.id}')">Cancel</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        content.innerHTML = html;
    }

    renderFriendSuggestions(suggestions) {
        const content = document.getElementById('connectionsContent');
        if (!content) return;

        if (!suggestions || suggestions.length === 0) {
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3 class="empty-state-title">No suggestions found</h3>
                    <p class="empty-state-text">Try updating your profile with your location and crops to get better suggestions.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="list-group">
                ${suggestions.map(person => `
                    <div class="list-item">
                        <div class="comment-avatar" onclick="App.openFarmerProfile('${person.id}')">
                            ${this.renderAvatarHtml(person.avatar_url, person.first_name, person.last_name)}
                        </div>
                        <div class="list-content" onclick="App.openFarmerProfile('${person.id}')">
                            <div class="list-title">${this.escapeHtml(person.first_name)} ${this.escapeHtml(person.last_name)}</div>
                            <div class="list-subtitle">
                                ${person.district ? `📍 ${this.escapeHtml(person.district)}` : ''}
                                ${person.farmer_type ? `• ${this.escapeHtml(person.farmer_type)}` : ''}
                            </div>
                        </div>
                        <div class="list-actions">
                            <button class="btn btn-primary btn-sm" onclick="App.sendFriendRequest('${person.id}')">Connect</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async confirmRemoveFriend(friendId, name) {
        if (confirm(`Remove ${name} from your connections?`)) {
            try {
                this.showLoading(true);
                await this.friendsManager.removeFriend(friendId);
                this.showToast('Connection removed');
                this.switchConnectionsTab('friends');
            } catch (error) {
                console.error('Remove friend error:', error);
                this.showToast('Failed to remove connection', 'error');
            } finally {
                this.showLoading(false);
            }
        }
    }

    async sendFriendRequest(farmerId) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            await this.friendsManager.sendFriendRequest(farmerId);
            this.showToast('Friend request sent', 'success');
            
            if (document.getElementById('connectionsModal').classList.contains('active')) {
                this.switchConnectionsTab('suggestions');
            } else {
                await this.openFarmerProfile(farmerId);
            }
        } catch (error) {
            console.error('Send friend request error:', error);
            this.showToast('Failed to send friend request', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async cancelFriendRequest(farmerId) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            await this.friendsManager.cancelFriendRequest(farmerId);
            this.showToast('Request canceled', 'success');
            
            if (document.getElementById('connectionsModal').classList.contains('active')) {
                this.switchConnectionsTab('requests');
            } else {
                await this.openFarmerProfile(farmerId);
            }
        } catch (error) {
            console.error('Cancel friend request error:', error);
            this.showToast('Failed to cancel request', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async acceptFriendRequest(requestId, farmerId) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            await this.friendsManager.respondToFriendRequest(requestId, 'accepted');
            this.showToast('Friend request accepted', 'success');
            
            if (document.getElementById('connectionsModal').classList.contains('active')) {
                this.switchConnectionsTab('requests');
            } else {
                await this.openFarmerProfile(farmerId);
            }
        } catch (error) {
            console.error('Accept friend request error:', error);
            this.showToast('Failed to accept request', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async declineFriendRequest(requestId, farmerId) {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        try {
            this.showLoading(true);
            await this.friendsManager.respondToFriendRequest(requestId, 'declined');
            this.showToast('Friend request declined', 'success');
            
            if (document.getElementById('connectionsModal').classList.contains('active')) {
                this.switchConnectionsTab('requests');
            } else {
                await this.openFarmerProfile(farmerId);
            }
        } catch (error) {
            console.error('Decline friend request error:', error);
            this.showToast('Failed to decline request', 'error');
        } finally {
            this.showLoading(false);
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
                    if (this.currentView === 'landing') {
                        const nextView = this.postLoginRedirect || 'feed';
                        this.postLoginRedirect = null;
                        this.switchView(nextView);
                    } else {
                        await this.loadViewData(this.currentView);
                    }
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
                if (this.currentView === 'landing') {
                    const nextView = this.postLoginRedirect || 'feed';
                    this.postLoginRedirect = null;
                    this.switchView(nextView);
                } else {
                    await this.loadViewData(this.currentView);
                }
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
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const previousFocus = (document.activeElement && document.activeElement instanceof HTMLElement)
            ? document.activeElement
            : null;

        modal.classList.add('active');
        this.modalStack.push({ modalId, previousFocus });
        this.activeModalId = modalId;

        window.setTimeout(() => {
            const closeBtn = modal.querySelector('.modal-close');
            const focusables = this.getModalFocusableElements(modal);
            const target = focusables[0] || closeBtn;
            if (target && typeof target.focus === 'function') target.focus();
        }, 0);
    }

    // Close modal
    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.remove('active');

        let restoreFocus = null;
        for (let i = this.modalStack.length - 1; i >= 0; i--) {
            const entry = this.modalStack[i];
            if (entry.modalId === modalId) {
                restoreFocus = entry.previousFocus || null;
                this.modalStack.splice(i, 1);
                break;
            }
        }

        this.activeModalId = this.modalStack.length ? this.modalStack[this.modalStack.length - 1].modalId : null;

        if (modalId === 'chatModal') {
            if (this.currentChatChannel) {
                if (this.currentChatType === 'direct' && this.currentChatId) {
                    this.messagingManager?.unsubscribeFromMessages?.(this.currentChatId);
                }
                if (this.currentChatType === 'group' && this.currentGroupId) {
                    this.messagingManager?.unsubscribeFromGroupMessages?.(this.currentGroupId);
                }
                this.currentChatChannel = null;
            }
            this.currentChatId = null;
            this.currentGroupId = null;
            this.currentChatType = 'direct';
            const input = document.getElementById('chatInput');
            if (input) input.value = '';
            const attachmentInput = document.getElementById('chatAttachmentInput');
            if (attachmentInput) attachmentInput.value = '';
            const attachmentList = document.getElementById('chatAttachmentList');
            if (attachmentList) attachmentList.innerHTML = '';
        }

        if (restoreFocus && typeof restoreFocus.focus === 'function') {
            window.setTimeout(() => restoreFocus.focus(), 0);
        }
    }

    setupModalAccessibility() {
        if (this.modalAccessibilityInitialized) return;
        this.modalAccessibilityInitialized = true;

        document.addEventListener('keydown', (event) => {
            const modalId = this.activeModalId;
            if (!modalId) return;
            if (modalId === 'loadingOverlay') return;

            const modal = document.getElementById(modalId);
            if (!modal || !modal.classList.contains('active')) return;

            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeModal(modalId);
                return;
            }

            if (event.key !== 'Tab') return;

            const focusables = this.getModalFocusableElements(modal);
            if (!focusables.length) {
                event.preventDefault();
                return;
            }

            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement;

            if (event.shiftKey) {
                if (active === first || !modal.contains(active)) {
                    event.preventDefault();
                    last.focus();
                }
            } else {
                if (active === last || !modal.contains(active)) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });

        document.addEventListener('click', (event) => {
            const modalId = this.activeModalId;
            if (!modalId) return;
            if (modalId === 'loadingOverlay') return;

            const modal = document.getElementById(modalId);
            if (!modal || !modal.classList.contains('active')) return;
            if (event.target === modal) this.closeModal(modalId);
        });
    }

    getModalFocusableElements(modal) {
        const nodes = Array.from(
            modal.querySelectorAll('a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        );

        return nodes.filter((el) => {
            if (!(el instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(el);
            if (style.visibility === 'hidden' || style.display === 'none') return false;
            return true;
        });
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
            const postId = payload?.new?.id || null;
            if (this.currentView === 'feed' && postId) {
                this.tryInsertNewFeedPost(postId);
            } else {
                // Optional: Show a small indicator that there are new posts
            }
        });
        this.setupChatNotificationSubscriptions();
        this.setupNotificationSubscriptions();
        this.refreshNotificationsBadge();
    }

    async tryInsertNewFeedPost(postId) {
        if (!postId || !this.postsManager || !this.postsManager.supabase) return;
        const container = document.getElementById('postsContainer');
        if (!container) return;
        if (container.querySelector('.spinner')) return;
        if (container.querySelector(`.post-card[data-post-id="${postId}"]`)) return;

        if (!this.recentRealtimePostIds) this.recentRealtimePostIds = new Set();
        if (this.recentRealtimePostIds.has(postId)) return;
        this.recentRealtimePostIds.add(postId);
        window.setTimeout(() => this.recentRealtimePostIds.delete(postId), 30000);

        try {
            const post = await this.withTimeout(this.postsManager.getPostById(postId), 12000);
            if (!post) {
                this.scheduleFeedReload();
                return;
            }

            const filters = this.feedFilters || { province: '', cropTag: '', photosOnly: false };
            if (filters.province && String(post.location_province || '') !== String(filters.province)) return;
            if (filters.cropTag && !(Array.isArray(post.crop_tags) && post.crop_tags.includes(filters.cropTag))) return;
            if (filters.photosOnly && !(Array.isArray(post.image_urls) && post.image_urls.length > 0)) return;

            if (container.querySelector(`.post-card[data-post-id="${post.id}"]`)) return;
            container.insertAdjacentHTML('afterbegin', this.renderPost(post));
        } catch (_) {
            this.scheduleFeedReload();
        }
    }

    scheduleFeedReload() {
        if (this.feedReloadTimer) return;
        this.feedReloadTimer = window.setTimeout(async () => {
            this.feedReloadTimer = null;
            if (this.currentView === 'feed') {
                await this.loadFeed();
            }
        }, 1200);
    }

    setupChatNotificationSubscriptions() {
        if (!this.messagingManager || !this.supabase || !this.authManager) return;

        const user = this.authManager.getUser();
        if (!user?.id) return;

        this.teardownChatNotificationSubscriptions();

        const handler = async (payload) => {
            const chatId = payload?.new?.id || payload?.old?.id || null;
            if (!chatId) return;
            if (this.currentChatId && String(this.currentChatId) === String(chatId)) return;

            if (this.currentView === 'messages') {
                await this.loadMessages();
                return;
            }

            this.showAlert('New message received! 💬', 'info');
        };

        const channelUser1 = this.supabase
            .channel(`chats_notify_user1:${user.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `user1_id=eq.${user.id}` }, handler)
            .subscribe();

        const channelUser2 = this.supabase
            .channel(`chats_notify_user2:${user.id}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chats', filter: `user2_id=eq.${user.id}` }, handler)
            .subscribe();

        this.chatNotificationChannels = [channelUser1, channelUser2];
    }

    teardownChatNotificationSubscriptions() {
        if (!this.supabase || !this.chatNotificationChannels || this.chatNotificationChannels.length === 0) return;
        this.chatNotificationChannels.forEach((ch) => {
            try { this.supabase.removeChannel(ch); } catch (_) {}
        });
        this.chatNotificationChannels = [];
    }

    setupNotificationSubscriptions() {
        if (!this.supabase || !this.authManager) return;
        const user = this.authManager.getUser();
        if (!user?.id) return;

        this.teardownNotificationSubscriptions();

        const handler = async (payload) => {
            const change = payload?.new || payload?.old || null;
            if (!change) return;

            if (payload?.eventType === 'INSERT') {
                if (!change.is_read) {
                    this.setUnreadNotificationsCount((this.unreadNotificationsCount || 0) + 1);
                }
            } else if (payload?.eventType === 'UPDATE') {
                await this.refreshNotificationsBadge();
            }

            if (payload?.eventType === 'INSERT') {
                const title = String(change.title || 'Notification');
                this.showAlert(title, 'info');
            }

            const modal = document.getElementById('notificationsModal');
            if (modal && modal.classList.contains('active')) {
                await this.loadNotificationsIntoModal();
            }
        };

        this.notificationsChannel = this.supabase
            .channel(`notifications:${user.id}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, handler)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, handler)
            .subscribe();
    }

    teardownNotificationSubscriptions() {
        if (!this.supabase || !this.notificationsChannel) return;
        try { this.supabase.removeChannel(this.notificationsChannel); } catch (_) {}
        this.notificationsChannel = null;
    }

    setUnreadNotificationsCount(count) {
        const next = Math.max(0, Number(count) || 0);
        this.unreadNotificationsCount = next;
        const badge = document.getElementById('notificationsBadge');
        if (!badge) return;
        if (!next) {
            badge.style.display = 'none';
            badge.textContent = '';
            return;
        }
        badge.style.display = 'inline-flex';
        badge.textContent = next > 99 ? '99+' : String(next);
    }

    async refreshNotificationsBadge() {
        if (!this.supabase || !this.authManager || !this.authManager.isAuthenticated()) return;
        try {
            const { count, error } = await this.supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('is_read', false);
            if (error) throw error;
            this.setUnreadNotificationsCount(count || 0);
        } catch (_) {
            this.setUnreadNotificationsCount(0);
        }
    }

    async openNotificationsModal() {
        if (!this.authManager || !this.authManager.isAuthenticated()) {
            this.openAccountModal();
            return;
        }

        const content = document.getElementById('notificationsModalContent');
        if (content) content.innerHTML = '<div class="spinner"></div>';
        this.openModal('notificationsModal');
        await this.loadNotificationsIntoModal();
    }

    async loadNotificationsIntoModal() {
        if (!this.supabase || !this.authManager || !this.authManager.isAuthenticated()) return;
        const content = document.getElementById('notificationsModalContent');
        if (!content) return;

        try {
            const { data, error } = await this.withTimeout(
                this.supabase
                    .from('notifications')
                    .select(`
                        *,
                        actor:profiles!notifications_actor_id_fkey(id, first_name, last_name, avatar_url)
                    `)
                    .order('created_at', { ascending: false })
                    .limit(50),
                12000
            );
            if (error) throw error;

            const notifications = Array.isArray(data) ? data : [];
            this.notificationsCache = new Map(notifications.map((n) => [String(n.id), n]));

            if (!notifications.length) {
                content.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔔</div>
                        <h3 class="empty-state-title">No notifications</h3>
                        <p class="empty-state-text">Likes, comments, messages, and group updates show here.</p>
                    </div>
                `;
                await this.refreshNotificationsBadge();
                return;
            }

            content.innerHTML = `
                <div class="notifications-actions">
                    <button class="btn btn-outline btn-sm" type="button" onclick="App.markAllNotificationsRead()">Mark all read</button>
                </div>
                <div class="notifications-list">
                    ${notifications.map((n) => {
                        const actor = n.actor || {};
                        const name = `${actor.first_name || ''} ${actor.last_name || ''}`.trim() || 'Someone';
                        const avatarHtml = this.renderAvatarHtml(actor.avatar_url, actor.first_name, actor.last_name, name);
                        const timeAgo = n.created_at ? this.formatTimeAgo(n.created_at) : '';
                        const unreadClass = n.is_read ? '' : 'is-unread';
                        const body = n.body ? `<div class="notification-body">${this.escapeHtml(n.body)}</div>` : '';
                        return `
                            <button class="notification-item ${unreadClass}" type="button" onclick="App.handleNotificationClick(${this.jsString(n.id)})">
                                <div class="notification-avatar">${avatarHtml}</div>
                                <div class="notification-main">
                                    <div class="notification-title">${this.escapeHtml(n.title || 'Notification')}</div>
                                    ${body}
                                    <div class="notification-meta">${this.escapeHtml(name)}${timeAgo ? ` • ${this.escapeHtml(timeAgo)}` : ''}</div>
                                </div>
                            </button>
                        `;
                    }).join('')}
                </div>
            `;

            await this.refreshNotificationsBadge();
        } catch (error) {
            console.error('Load notifications error:', error);
            content.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <h3 class="empty-state-title">Could not load notifications</h3>
                    <p class="empty-state-text">Please try again in a moment.</p>
                </div>
            `;
        }
    }

    async handleNotificationClick(notificationId) {
        const id = String(notificationId || '');
        if (!id) return;

        const notification = this.notificationsCache?.get?.(id) || null;
        if (!notification) {
            await this.loadNotificationsIntoModal();
            return;
        }

        if (!notification.is_read) {
            try {
                await this.supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .eq('id', id);
            } catch (_) {}
        }

        await this.refreshNotificationsBadge();

        const type = String(notification.type || '').trim();
        const data = notification.data || {};

        if (type === 'message' && data.chat_id) {
            try {
                const chat = await this.messagingManager.getChat(data.chat_id);
                const me = this.authManager?.getUser?.()?.id || null;
                const otherUserId = chat.user1_id === me ? chat.user2_id : chat.user1_id;
                const other = otherUserId ? await this.postsManager.getFarmerProfileById(otherUserId) : null;
                const name = other ? `${other.first_name || ''} ${other.last_name || ''}`.trim() || 'Chat' : 'Chat';
                this.closeModal('notificationsModal');
                await this.openChat(chat.id, name);
                return;
            } catch (_) {
                this.closeModal('notificationsModal');
                this.switchView('messages');
                return;
            }
        }

        if ((type === 'post_like' || type === 'post_comment') && data.post_id) {
            this.closeModal('notificationsModal');
            await this.openPostModal(data.post_id);
            if (type === 'post_comment') {
                await this.toggleComments(data.post_id);
            }
            return;
        }

        if ((type === 'group_join_request' || type === 'group_join_decision') && data.group_id) {
            this.closeModal('notificationsModal');
            this.switchView('groups');
            if (type === 'group_join_request') {
                await this.openJoinRequests(data.group_id);
            }
            return;
        }

        this.closeModal('notificationsModal');
    }

    async markAllNotificationsRead() {
        if (!this.supabase || !this.authManager || !this.authManager.isAuthenticated()) return;
        try {
            await this.supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false);
        } catch (_) {}
        await this.refreshNotificationsBadge();
        await this.loadNotificationsIntoModal();
    }

    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    jsString(value) {
        return JSON.stringify(String(value ?? ''));
    }

    safeUrl(url, options = {}) {
        const value = String(url ?? '').trim();
        if (!value) return '';

        const allowDataImage = !!options.allowDataImage;
        const allowBlob = !!options.allowBlob;

        try {
            const resolved = new URL(value, window.location.origin);
            const protocol = String(resolved.protocol || '').toLowerCase();

            if (protocol === 'http:' || protocol === 'https:') return resolved.href;
            if (allowBlob && protocol === 'blob:') return resolved.href;
            if (allowDataImage && protocol === 'data:') {
                if (/^data:image\/(png|jpe?g|webp|gif);/i.test(value)) return value;
            }

            return '';
        } catch (_) {
            return '';
        }
    }

    renderAvatarHtml(avatarUrl, firstName, lastName, altName) {
        const initials = this.getInitials(firstName, lastName);
        const safe = this.safeUrl(avatarUrl, { allowDataImage: true, allowBlob: true });
        if (!safe) return this.escapeHtml(initials);
        return `<img src="${safe}" alt="${this.escapeHtml(altName || 'Avatar')}" loading="lazy" decoding="async">`;
    }

    getSearchTypeTitle(type) {
        const titles = {
            'farmer': 'Farmers',
            'farmer_crop': 'Farmers Growing',
            'post_crop': 'Posts About',
            'crop': 'Crops',
            'market': 'Markets',
            'post': 'Posts',
            'group': 'Groups'
        };
        return titles[type] || type.charAt(0).toUpperCase() + type.slice(1) + 's';
    }

    renderSearchResultItem(item, type) {
        switch (type) {
            case 'farmer':
            case 'farmer_crop':
                const name = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Farmer';
                const avatarHtml = this.renderAvatarHtml(item.avatar_url, item.first_name, item.last_name, name);
                const location = [item.district, item.province].filter(Boolean).join(', ');
                const meta = [location, item.farmer_type].filter(Boolean).join(' • ');
                return `
                    <button class="navbar-search-item" type="button" data-user-id="${this.escapeHtml(item.id)}">
                        <div class="navbar-search-item-avatar">${avatarHtml}</div>
                        <div class="navbar-search-item-main">
                            <div class="navbar-search-item-title">${this.escapeHtml(name)}</div>
                            ${meta ? `<div class="navbar-search-item-meta">${this.escapeHtml(meta)}</div>` : ''}
                        </div>
                    </button>
                `;

            case 'post':
            case 'post_crop':
                const authorName = item.author ? `${item.author.first_name || ''} ${item.author.last_name || ''}`.trim() : 'Farmer';
                const authorAvatar = this.renderAvatarHtml(item.author?.avatar_url, item.author?.first_name, item.author?.last_name, authorName);
                const contentPreview = item.content ? this.escapeHtml(item.content.substring(0, 60) + (item.content.length > 60 ? '...' : '')) : '';
                const postLocation = [item.location_district, item.location_province].filter(Boolean).join(', ');
                return `
                    <button class="navbar-search-item" type="button" data-post-id="${this.escapeHtml(item.id)}">
                        <div class="navbar-search-item-avatar">${authorAvatar}</div>
                        <div class="navbar-search-item-main">
                            <div class="navbar-search-item-title">${authorName}</div>
                            ${contentPreview ? `<div class="navbar-search-item-meta">${contentPreview}</div>` : ''}
                            ${postLocation ? `<div class="navbar-search-item-meta">📍 ${this.escapeHtml(postLocation)}</div>` : ''}
                        </div>
                    </button>
                `;

            case 'market':
                const marketName = item.name || 'Market';
                const commodities = item.commodities ? this.escapeHtml(item.commodities.substring(0, 40) + (item.commodities.length > 40 ? '...' : '')) : '';
                const marketLocation = [item.district, item.province].filter(Boolean).join(', ');
                return `
                    <button class="navbar-search-item" type="button" data-market-id="${this.escapeHtml(item.id)}">
                        <div class="navbar-search-item-avatar">🏪</div>
                        <div class="navbar-search-item-main">
                            <div class="navbar-search-item-title">${this.escapeHtml(marketName)}</div>
                            ${commodities ? `<div class="navbar-search-item-meta">${commodities}</div>` : ''}
                            ${marketLocation ? `<div class="navbar-search-item-meta">📍 ${this.escapeHtml(marketLocation)}</div>` : ''}
                        </div>
                    </button>
                `;

            case 'group':
                const groupName = item.name || 'Group';
                const memberCount = item.member_count ? `${item.member_count} members` : '';
                const groupType = item.group_type ? this.escapeHtml(item.group_type) : '';
                return `
                    <button class="navbar-search-item" type="button" data-group-id="${this.escapeHtml(item.id)}">
                        <div class="navbar-search-item-avatar">👥</div>
                        <div class="navbar-search-item-main">
                            <div class="navbar-search-item-title">${this.escapeHtml(groupName)}</div>
                            ${groupType ? `<div class="navbar-search-item-meta">${groupType}</div>` : ''}
                            ${memberCount ? `<div class="navbar-search-item-meta">${memberCount}</div>` : ''}
                        </div>
                    </button>
                `;

            case 'crop':
                const cropName = item.crops ? this.escapeHtml(item.crops.substring(0, 30) + (item.crops.length > 30 ? '...' : '')) : 'Crop';
                const farmerLocation = [item.district, item.province].filter(Boolean).join(', ');
                return `
                    <button class="navbar-search-item" type="button" data-user-id="${this.escapeHtml(item.id)}">
                        <div class="navbar-search-item-avatar">🌱</div>
                        <div class="navbar-search-item-main">
                            <div class="navbar-search-item-title">${cropName}</div>
                            ${farmerLocation ? `<div class="navbar-search-item-meta">📍 ${this.escapeHtml(farmerLocation)}</div>` : ''}
                            ${item.farm_size_ha ? `<div class="navbar-search-item-meta">${item.farm_size_ha} ha</div>` : ''}
                        </div>
                    </button>
                `;

            default:
                return '';
        }
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

    formatFileSize(size) {
        const bytes = Number(size) || 0;
        if (bytes < 1024) return `${bytes} B`;
        const kb = bytes / 1024;
        if (kb < 1024) return `${kb.toFixed(1)} KB`;
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
    }

    renderMessageAttachments(attachments) {
        const items = Array.isArray(attachments) ? attachments : [];
        if (!items.length) return '';

        const content = items.map((item) => {
            const name = item?.file_name || 'Attachment';
            const url = item?.file_url || '';
            const type = item?.file_type || '';
            const size = item?.file_size ? this.formatFileSize(item.file_size) : '';

            if (type.startsWith('image/') && url) {
                return `
                    <a class="message-attachment message-attachment-image" href="${this.escapeHtml(url)}" target="_blank" rel="noopener">
                        <img src="${this.escapeHtml(url)}" alt="${this.escapeHtml(name)}" loading="lazy" decoding="async">
                        <span>${this.escapeHtml(name)}</span>
                    </a>
                `;
            }

            return `
                <a class="message-attachment" href="${this.escapeHtml(url)}" target="_blank" rel="noopener">
                    <div>
                        <div class="message-attachment-name">${this.escapeHtml(name)}</div>
                        ${size ? `<div class="message-attachment-size">${this.escapeHtml(size)}</div>` : ''}
                    </div>
                </a>
            `;
        }).join('');

        return `<div class="message-attachments">${content}</div>`;
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
