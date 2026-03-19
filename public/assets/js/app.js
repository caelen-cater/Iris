const Icons = {
    search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    play: '<svg class="icon" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    download: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    x: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    back: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
    pause: '<svg class="icon" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
    skipBack: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>',
    skipFwd: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>',
    expand: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    camera: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    edit: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    check: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    lock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    bookmark: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    bookmarkFilled: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    chevronRight: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
    star: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
};

const API = {
    async request(method, path, data = null) {
        const opts = {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
        };
        if (data) opts.body = JSON.stringify(data);

        const resp = await fetch(`api/${path}`, opts);
        const json = await resp.json();
        if (!resp.ok || json.error) {
            throw new Error(json.error || `HTTP ${resp.status}`);
        }
        return json;
    },

    get(path) { return this.request('GET', path); },
    post(path, data) { return this.request('POST', path, data); },

    async upload(path, formData) {
        const resp = await fetch(`api/${path}`, {
            method: 'POST',
            credentials: 'same-origin',
            body: formData,
        });
        const json = await resp.json();
        if (!resp.ok || json.error) throw new Error(json.error || `HTTP ${resp.status}`);
        return json;
    },
};

const App = {
    state: {
        user: null,
        profile: null,
        siteName: 'Iris',
        authMode: 'login',
    },

    pollInterval: null,
    searchTimeout: null,

    async init() {
        try {
            const session = await API.get('auth/session');
            this.state.authMode = session.auth_mode || 'login';
            this.state.siteName = session.site_name || 'Iris';
            document.title = this.state.siteName;

            if (session.authenticated) {
                this.state.user = session.user;
                this.state.profile = session.profile || null;
            }
        } catch (e) {}

        window.addEventListener('hashchange', () => this.route());
        this.route();
        this.startPolling();
    },

    navigate(path, replace = false) {
        const hash = '#/' + path;
        if (replace) {
            window.location.replace(hash);
            this.route();
        } else {
            window.location.hash = hash;
        }
    },

    route() {
        const hash = window.location.hash.replace('#/', '').replace('#', '') || '';
        const parts = hash.split('/');
        const container = document.getElementById('app');

        if (!this.state.user || !this.state.profile) {
            if (this.state.authMode === 'profiles') {
                if (this.state.user && this.state.profile) {
                    // already logged in via profile
                } else {
                    this.renderNav(false);
                    Profiles.renderPublic(container);
                    return;
                }
            } else {
                if (!this.state.user) {
                    this.renderNav(false);
                    this.renderLogin(container);
                    return;
                }
                if (!this.state.profile && parts[0] !== 'profiles' && parts[0] !== 'manage-profiles') {
                    this.renderNav(false);
                    Profiles.render(container);
                    return;
                }
            }
        }

        this.renderNav(true);

        switch (parts[0]) {
            case 'browse':
            case '':
                Browse.render(container);
                break;
            case 'profiles':
                if (this.state.authMode === 'profiles') {
                    this.state.user = null;
                    this.state.profile = null;
                    this.renderNav(false);
                    Profiles.renderPublic(container);
                } else {
                    this.state.profile = null;
                    this.renderNav(false);
                    Profiles.render(container);
                }
                break;
            case 'account':
                this.renderAccount(container);
                break;
            case 'media':
                if (parts[1] && parts[2]) Media.render(container, parts[1], parts[2]);
                break;
            case 'person':
                if (parts[1]) this.renderPerson(container, parts[1]);
                break;
            case 'search':
                this.handleSearchRoute(container, decodeURIComponent(parts.slice(1).join('/')));
                break;
            case 'watchlist':
                this.renderWatchlist(container);
                break;
            case 'downloads':
                this.renderDownloads(container);
                break;
            case 'play':
                if (parts[1]) Player.render(container, parts[1]);
                break;
            case 'admin':
                if (this.state.user?.role === 'admin') Admin.render(container);
                else container.innerHTML = '<div class="empty-state"><h3>Access Denied</h3></div>';
                break;
            default:
                Browse.render(container);
        }
    },

    renderNav(showFull) {
        const nav = document.getElementById('nav-container');
        if (!this.state.user && !this.state.profile) { nav.innerHTML = ''; return; }

        if (!showFull) {
            const brandName = this.state.siteName;
            nav.innerHTML = `
                <nav class="nav">
                    <div class="nav-brand" onclick="App.navigate('')">${brandName}</div>
                    <div style="flex:1"></div>
                    ${this.state.user ? `
                        <div class="nav-profile" onclick="this.querySelector('.nav-profile-menu').classList.toggle('open')">
                            <div class="avatar avatar-blue">${(this.state.user.username || '?')[0]}</div>
                            <div class="nav-profile-menu">
                                <a href="#" onclick="event.preventDefault();App.logout()">Sign Out</a>
                            </div>
                        </div>` : ''}
                </nav>`;
            return;
        }

        const p = this.state.profile;
        const isAdmin = this.state.user?.role === 'admin';
        const avatarHtml = p?.picture
            ? `<img class="profile-pic-sm" src="${p.picture}" alt="">`
            : `<div class="avatar avatar-${p?.avatar || 'blue'}">${(p?.name || '?')[0]}</div>`;

        const switchLabel = this.state.authMode === 'profiles' ? 'Switch Profile' : 'Switch Profile';

        const mobileTabIcons = {
            home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
            list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
            dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
            search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
            profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        };

        nav.innerHTML = `
            <nav class="nav">
                <div class="nav-brand" onclick="App.navigate('browse')">${this.state.siteName}</div>
                <div class="nav-links">
                    <a href="#/browse" class="${this.isActive('browse') ? 'active' : ''}">Home</a>
                    <a href="#/watchlist" class="${this.isActive('watchlist') ? 'active' : ''}">My List</a>
                    <a href="#/downloads" class="${this.isActive('downloads') ? 'active' : ''}">Downloads</a>
                    ${isAdmin ? `<a href="#/admin" class="${this.isActive('admin') ? 'active' : ''}">Admin</a>` : ''}
                </div>
                <div class="nav-search" id="nav-search">
                    <span class="nav-search-icon">${Icons.search}</span>
                    <input type="text" placeholder="Search movies and TV shows..." oninput="App.onSearchInput(this.value)" onkeydown="if(event.key==='Enter')App.submitSearch(this.value)">
                    <div class="search-dropdown hidden" id="search-dropdown"></div>
                </div>
                <div class="nav-profile" onclick="this.querySelector('.nav-profile-menu').classList.toggle('open')">
                    ${avatarHtml}
                    <div class="nav-profile-menu">
                        <a href="#/account" onclick="event.preventDefault();App.navigate('account')">Account</a>
                        <a href="#/profiles" onclick="event.preventDefault();App.navigate('profiles')">Switch Profile</a>
                        ${isAdmin ? '<a href="#/admin" onclick="event.preventDefault();App.navigate(\'admin\')">Admin</a>' : ''}
                        <a href="#" onclick="event.preventDefault();App.logout()">Sign Out</a>
                    </div>
                </div>
            </nav>
            <nav class="mobile-tabs">
                <a class="mobile-tab ${this.isActive('browse') || this.isActive('') ? 'active' : ''}" onclick="App.navigate('browse')">
                    ${mobileTabIcons.home}<span>Home</span>
                </a>
                <a class="mobile-tab ${this.isActive('search') ? 'active' : ''}" onclick="App.navigate('search/')">
                    ${mobileTabIcons.search}<span>Search</span>
                </a>
                <a class="mobile-tab ${this.isActive('watchlist') ? 'active' : ''}" onclick="App.navigate('watchlist')">
                    ${mobileTabIcons.list}<span>My List</span>
                </a>
                <a class="mobile-tab ${this.isActive('downloads') ? 'active' : ''}" onclick="App.navigate('downloads')">
                    ${mobileTabIcons.dl}<span>Downloads</span>
                </a>
                <a class="mobile-tab ${this.isActive('account') ? 'active' : ''}" onclick="App.navigate('account')">
                    ${mobileTabIcons.profile}<span>Profile</span>
                </a>
            </nav>`;
    },

    isActive(route) {
        const hash = window.location.hash.replace('#/', '');
        return hash === route || hash.startsWith(route + '/');
    },

    toggleSearch() {
        const el = document.getElementById('nav-search');
        el.classList.toggle('open');
        if (el.classList.contains('open')) el.querySelector('input').focus();
    },

    onSearchInput(query) {
        clearTimeout(this.searchTimeout);
        const dropdown = document.getElementById('search-dropdown') || document.getElementById('hero-search-dropdown');
        if (!dropdown) return;
        if (query.length < 2) { dropdown.classList.add('hidden'); return; }

        this.searchTimeout = setTimeout(async () => {
            try {
                const resp = await API.get('tmdb/search/' + encodeURIComponent(query));
                dropdown.innerHTML = Browse.renderSearchDropdown(resp.results);
                dropdown.classList.remove('hidden');
            } catch (e) { dropdown.classList.add('hidden'); }
        }, 300);
    },

    onHeroSearchInput(query) {
        clearTimeout(this.searchTimeout);
        const dropdown = document.getElementById('hero-search-dropdown');
        if (!dropdown) return;
        if (query.length < 2) { dropdown.classList.add('hidden'); return; }

        this.searchTimeout = setTimeout(async () => {
            try {
                const resp = await API.get('tmdb/search/' + encodeURIComponent(query));
                dropdown.innerHTML = Browse.renderSearchDropdown(resp.results);
                dropdown.classList.remove('hidden');
            } catch (e) { dropdown.classList.add('hidden'); }
        }, 300);
    },

    submitSearch(query) {
        if (query.length < 2) return;
        document.getElementById('search-dropdown')?.classList.add('hidden');
        document.getElementById('hero-search-dropdown')?.classList.add('hidden');
        this.navigate('search/' + encodeURIComponent(query));
    },

    async handleSearchRoute(container, query) {
        if (!query) {
            container.innerHTML = `
                <div class="page mobile-search-page">
                    <div class="mobile-search-box">
                        <span class="search-icon">${Icons.search}</span>
                        <input type="text" id="mobile-search-input" placeholder="Search movies and TV shows..." autofocus
                            oninput="App.onMobileSearchInput(this.value)"
                            onkeydown="if(event.key==='Enter')App.submitSearch(this.value)">
                    </div>
                    <div id="mobile-search-results"></div>
                </div>`;
            document.getElementById('mobile-search-input')?.focus();
            return;
        }
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('tmdb/search/' + encodeURIComponent(query));
            Browse.renderSearchResults(container, resp.results);
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><h3>Search Error</h3><p>${e.message}</p></div>`;
        }
    },

    onMobileSearchInput(query) {
        clearTimeout(this.searchTimeout);
        const results = document.getElementById('mobile-search-results');
        if (!results) return;
        if (query.length < 2) { results.innerHTML = ''; return; }
        this.searchTimeout = setTimeout(async () => {
            try {
                const resp = await API.get('tmdb/search/' + encodeURIComponent(query));
                const items = resp.results || [];
                if (!items.length) {
                    results.innerHTML = '<div class="empty-state" style="padding:2rem"><p>No results found</p></div>';
                    return;
                }
                results.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:0.4rem;margin-top:0.75rem">${items.map(i => Browse.renderCard(i)).join('')}</div>`;
            } catch (e) {
                results.innerHTML = '';
            }
        }, 300);
    },

    renderLogin(container) {
        container.innerHTML = `
            <div class="login-page">
                <div class="login-card">
                    <h1>${this.state.siteName}</h1>
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="login-user" placeholder="Username" onkeydown="if(event.key==='Enter')document.getElementById('login-pass').focus()">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="login-pass" placeholder="Password" onkeydown="if(event.key==='Enter')App.doLogin()">
                    </div>
                    <div id="login-error" class="error-msg hidden"></div>
                    <button class="btn btn-primary btn-lg" style="width:100%;margin-top:1rem" onclick="App.doLogin()">Sign In</button>
                </div>
            </div>`;
        container.classList.remove('main');
    },

    async doLogin() {
        const username = document.getElementById('login-user')?.value.trim();
        const password = document.getElementById('login-pass')?.value;
        if (!username || !password) {
            const err = document.getElementById('login-error');
            err.textContent = 'Username and password required';
            err.classList.remove('hidden');
            return;
        }
        try {
            const resp = await API.post('auth/login', { username, password });
            this.state.user = resp.user;
            document.getElementById('app').classList.add('main');
            this.route();
        } catch (e) {
            const err = document.getElementById('login-error');
            err.textContent = e.message || 'Login failed';
            err.classList.remove('hidden');
        }
    },

    async logout() {
        try { await API.get('auth/logout'); } catch (e) {}
        this.state.user = null;
        this.state.profile = null;
        this.stopPolling();
        this.navigate('');
    },

    async renderWatchlist(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('watchlist/list');
            const items = resp.results || [];

            if (!items.length) {
                container.innerHTML = `<div class="page"><div class="empty-state"><h3>Your List is Empty</h3><p>Add movies and TV shows to keep track of what you want to watch</p><button class="btn btn-primary" onclick="App.navigate('browse')">Browse</button></div></div>`;
                return;
            }

            container.innerHTML = `
                <div class="page">
                    <h1 style="margin-bottom:1.5rem">My List</h1>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:0.5rem">
                        ${items.map(item => Browse.renderCard(item)).join('')}
                    </div>
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="page"><div class="empty-state"><h3>Error</h3><p>${e.message}</p></div></div>`;
        }
    },

    async renderAccount(container) {
        const p = this.state.profile;
        const u = this.state.user;
        const isAdmin = u?.role === 'admin';

        const avatarHtml = p?.picture
            ? `<img class="account-avatar" src="${p.picture}" alt="${p.name}">`
            : `<div class="account-avatar account-avatar-placeholder avatar-${p?.avatar || 'blue'}">${(p?.name || '?')[0]}</div>`;

        container.innerHTML = `
            <div class="page account-page">
                <div class="account-header">
                    <div class="account-pic-upload" onclick="document.getElementById('account-pic-input').click()">
                        ${avatarHtml}
                        <div class="account-pic-edit">${Icons.camera}</div>
                    </div>
                    <input type="file" id="account-pic-input" accept="image/*" style="display:none" onchange="App.uploadAccountPic(this)">
                    <h1>${p?.name || 'Profile'}</h1>
                    <div class="account-meta">${p?.maturity || 'adult'} profile${u ? ' &middot; ' + u.username : ''}</div>
                </div>

                <div class="account-section">
                    <h2>Profile Settings</h2>
                    <div class="account-card">
                        <div class="account-row" onclick="App.navigate('profiles')">
                            <span>${Icons.back ? '<span style="transform:rotate(180deg);display:inline-flex">' + Icons.back + '</span>' : ''} Switch Profile</span>
                            <span class="account-chevron">${Icons.chevronRight}</span>
                        </div>
                        <div class="account-row" onclick="Profiles.showEditModal(${JSON.stringify({id: p?.id, name: p?.name, avatar: p?.avatar, maturity: p?.maturity, picture: p?.picture, auth_method: 'none'}).replace(/"/g, '&quot;')})">
                            <span>${Icons.edit} Edit Profile</span>
                            <span class="account-chevron">${Icons.chevronRight}</span>
                        </div>
                    </div>
                </div>

                <div class="account-section">
                    <h2>Appearance</h2>
                    <div class="account-card">
                        <div class="account-row">
                            <span>Avatar Color</span>
                            <div class="account-colors">
                                ${Profiles.avatarColors.map(c => `<div class="account-color-dot avatar-${c} ${c === (p?.avatar || 'blue') ? 'active' : ''}" onclick="App.changeAvatarColor('${c}')"></div>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>

                ${isAdmin ? `
                <div class="account-section">
                    <h2>Administration</h2>
                    <div class="account-card">
                        <div class="account-row" onclick="App.navigate('admin')">
                            <span>${Icons.shield} Admin Dashboard</span>
                            <span class="account-chevron">${Icons.chevronRight}</span>
                        </div>
                    </div>
                </div>` : ''}

                <div class="account-section" style="text-align:center;padding-top:1rem">
                    <button class="btn btn-secondary" onclick="App.logout()" style="color:var(--error)">Sign Out</button>
                </div>
            </div>`;
    },

    async uploadAccountPic(input) {
        if (!input.files?.[0]) return;
        const p = this.state.profile;
        if (!p) return;
        try {
            const resp = await Profiles.uploadPicture(p.id, input.files[0]);
            this.state.profile.picture = resp.picture;
            this.toast('Profile picture updated', 'success');
            this.renderAccount(document.getElementById('app'));
            this.renderNav(true);
        } catch (e) { this.toast(e.message || 'Upload failed', 'error'); }
    },

    async changeAvatarColor(color) {
        const p = this.state.profile;
        if (!p) return;
        try {
            await API.post('profiles/update', { id: p.id, avatar: color });
            this.state.profile.avatar = color;
            this.renderAccount(document.getElementById('app'));
            this.renderNav(true);
        } catch (e) { this.toast(e.message || 'Failed to update', 'error'); }
    },

    async renderPerson(container, personId) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const person = await API.get(`tmdb/person/${personId}`);

            const photo = person.profile_path
                ? `<img class="person-photo" src="${Browse.poster(person.profile_path, 'w300')}" alt="${person.name}">`
                : `<div class="person-photo person-photo-placeholder">${(person.name || '?')[0]}</div>`;

            const meta = [];
            if (person.known_for_department) meta.push(person.known_for_department);
            if (person.birthday) {
                const age = person.deathday
                    ? Math.floor((new Date(person.deathday) - new Date(person.birthday)) / 31557600000)
                    : Math.floor((Date.now() - new Date(person.birthday).getTime()) / 31557600000);
                meta.push(`Born ${person.birthday}` + (person.deathday ? ` \u2014 Died ${person.deathday}` : '') + ` (age ${age})`);
            }
            if (person.place_of_birth) meta.push(person.place_of_birth);

            const bioFull = person.biography || '';
            const bioShort = bioFull.length > 400 ? bioFull.substring(0, 400) + '...' : bioFull;
            const bioToggle = bioFull.length > 400 ? `<button class="person-bio-toggle" onclick="this.previousElementSibling.textContent=this.dataset.full==='1'?this.dataset.short:this.dataset.fullText;this.textContent=this.dataset.full==='1'?'Read more':'Show less';this.dataset.full=this.dataset.full==='1'?'0':'1'" data-full="0" data-short="${bioShort.replace(/"/g, '&quot;')}" data-full-text="${bioFull.replace(/"/g, '&quot;')}">Read more</button>` : '';

            let html = `<div class="person-page">
                <div class="person-header">
                    ${photo}
                    <div class="person-info">
                        <h1>${person.name}</h1>
                        <div class="person-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
                        ${bioFull ? `<p class="person-bio">${bioShort}</p>${bioToggle}` : ''}
                    </div>
                </div>`;

            if (person.filmography?.length) {
                html += `<div class="content-row"><h2>Known For</h2><div class="card-scroller">`;
                person.filmography.forEach(item => {
                    html += Browse.renderCard(item);
                });
                html += `</div></div>`;
            }

            html += `</div>`;
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<div class="page"><div class="empty-state"><h3>Error</h3><p>${e.message}</p></div></div>`;
        }
    },

    async renderDownloads(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('downloads/list');
            const downloads = resp.downloads || [];

            if (!downloads.length) {
                container.innerHTML = '<div class="page"><div class="empty-state"><h3>No Downloads</h3><p>Start browsing to download media</p><button class="btn btn-primary" onclick="App.navigate(\'browse\')">Browse</button></div></div>';
                return;
            }

            const statuses = { downloading: [], queued: [], completed: [], failed: [] };
            downloads.forEach(dl => { if (statuses[dl.status]) statuses[dl.status].push(dl); });

            let html = '<div class="page"><h1 style="margin-bottom:1.5rem">Downloads</h1>';

            const renderSection = (title, items) => {
                if (!items.length) return '';
                let s = `<h2 style="margin-bottom:1rem;margin-top:1.5rem">${title}</h2>`;
                items.forEach(dl => {
                    const poster = dl.poster_path ? Browse.poster(dl.poster_path, 'w92') : '';
                    const isTV = dl.media_type === 'tv' && dl.episodes;
                    const meta = [];
                    if (isTV) {
                        meta.push(`${dl.episode_count} episode${dl.episode_count > 1 ? 's' : ''}`);
                    } else {
                        if (dl.season) meta.push(`S${dl.season}E${dl.episode}`);
                    }
                    if (dl.quality) meta.push(dl.quality);
                    if (!isTV) meta.push(dl.status);

                    if (isTV) {
                        const active = dl.episodes.filter(e => e.status === 'downloading');
                        const done = dl.episodes.filter(e => e.status === 'completed').length;
                        const total = dl.episodes.length;
                        const statusLabel = active.length ? `Downloading ${active[0].season ? 'S' + active[0].season + 'E' + active[0].episode : ''}...` : `${done}/${total} completed`;

                        s += `
                            <div class="download-item" onclick="App.navigate('media/tv/${dl.tmdb_id}')" style="cursor:pointer">
                                ${poster ? `<img src="${poster}" alt="">` : '<div style="width:60px;height:90px;background:var(--bg-card);border-radius:4px;flex-shrink:0"></div>'}
                                <div class="info">
                                    <div class="title">${dl.title}</div>
                                    <div class="meta">${meta.join(' &middot; ')} &middot; ${statusLabel}</div>
                                    ${active.length ? `<div class="download-progress"><div class="download-progress-bar" style="width:${active[0].progress || 0}%"></div></div>` : ''}
                                </div>
                                <div style="display:flex;align-items:center;color:var(--text-muted);font-size:1.2rem">${Icons.chevronRight || '&rsaquo;'}</div>
                            </div>`;
                    } else {
                        s += `
                            <div class="download-item">
                                ${poster ? `<img src="${poster}" alt="">` : '<div style="width:60px;height:90px;background:var(--bg-card);border-radius:4px;flex-shrink:0"></div>'}
                                <div class="info">
                                    <div class="title">${dl.title}${dl.episode_title ? ' - ' + dl.episode_title : ''}</div>
                                    <div class="meta">${meta.join(' &middot; ')} ${dl.file_size ? '&middot; ' + formatBytes(dl.file_size) : ''}</div>
                                    ${dl.status === 'downloading' ? `<div class="download-progress"><div class="download-progress-bar" style="width:${dl.progress}%"></div></div>` : ''}
                                </div>
                                <div class="episode-actions" style="display:flex;gap:0.5rem">
                                    ${dl.status === 'completed' ? `<button class="btn btn-sm btn-success" onclick="App.navigate('play/${dl.id}')">${Icons.play} Play</button>` : ''}
                                    ${['queued', 'downloading'].includes(dl.status) ? `<button class="btn btn-sm btn-secondary" onclick="App.cancelDownload(${dl.id})">Cancel</button>` : ''}
                                    ${dl.status === 'completed' || dl.status === 'failed' ? `<button class="btn btn-sm btn-secondary" style="color:var(--error)" onclick="App.deleteDownload(${dl.id})">${Icons.trash}</button>` : ''}
                                </div>
                            </div>`;
                    }
                });
                return s;
            };

            html += renderSection('Active', [...statuses.downloading, ...statuses.queued]);
            html += renderSection('Completed', statuses.completed);
            html += renderSection('Failed', statuses.failed);
            html += '</div>';
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<div class="page"><div class="empty-state"><h3>Error</h3><p>${e.message}</p></div></div>`;
        }
    },

    async cancelDownload(id) {
        try {
            await API.post('downloads/cancel', { id });
            this.toast('Download cancelled', 'info');
            this.renderDownloads(document.getElementById('app'));
        } catch (e) { this.toast(e.message, 'error'); }
    },

    async deleteDownload(id) {
        if (!confirm('Delete this download?')) return;
        try {
            await API.post('downloads/delete', { id });
            this.toast('Download deleted', 'info');
            this.renderDownloads(document.getElementById('app'));
        } catch (e) { this.toast(e.message, 'error'); }
    },

    startPolling() {
        this.stopPolling();
        this.pollInterval = setInterval(() => {
            const hash = window.location.hash.replace('#/', '');
            if (hash === 'downloads') {
                this.renderDownloads(document.getElementById('app'));
            }
        }, 10000);
    },

    stopPolling() {
        if (this.pollInterval) { clearInterval(this.pollInterval); this.pollInterval = null; }
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 5000);
    },
};

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

document.addEventListener('click', (e) => {
    const searchDropdown = document.getElementById('search-dropdown');
    const navSearch = document.getElementById('nav-search');
    if (searchDropdown && navSearch && !navSearch.contains(e.target)) searchDropdown.classList.add('hidden');

    const heroDD = document.getElementById('hero-search-dropdown');
    const heroBox = document.querySelector('.hero-search');
    if (heroDD && heroBox && !heroBox.contains(e.target)) heroDD.classList.add('hidden');

    document.querySelectorAll('.nav-profile-menu.open').forEach(menu => {
        if (!menu.parentElement.contains(e.target)) menu.classList.remove('open');
    });
});
