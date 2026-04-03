const Admin = {
    chartLoaded: false,
    currentTab: 'overview',

    adminIcons: {
        overview: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
        users: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
        activity: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
        settings: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        security: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
        storage: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
        downloads: Icons.download,
    },

    async render(container) {
        if (!this.chartLoaded) await this.loadChartJS();

        container.innerHTML = `
            <div class="admin-layout">
                <aside class="admin-sidebar">
                    <div class="admin-sidebar-section">
                        <div class="section-label">Main</div>
                        <div class="admin-nav-item active" data-tab="overview" onclick="Admin.switchTab('overview')">
                            ${this.adminIcons.overview} Overview
                        </div>
                        <div class="admin-nav-item" data-tab="users" onclick="Admin.switchTab('users')">
                            ${this.adminIcons.users} Users
                        </div>
                        <div class="admin-nav-item" data-tab="activity" onclick="Admin.switchTab('activity')">
                            ${this.adminIcons.activity} Activity
                        </div>
                    </div>
                    <div class="admin-sidebar-section">
                        <div class="section-label">Configuration</div>
                        <div class="admin-nav-item" data-tab="settings" onclick="Admin.switchTab('settings')">
                            ${this.adminIcons.settings} Settings
                        </div>
                        <div class="admin-nav-item" data-tab="security" onclick="Admin.switchTab('security')">
                            ${this.adminIcons.security} Security
                        </div>
                    </div>
                </aside>
                <div class="admin-main" id="admin-main">
                    <div class="loading"><div class="spinner"></div></div>
                </div>
            </div>`;

        this.switchTab('overview');
    },

    async switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.admin-nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === tab);
        });

        const main = document.getElementById('admin-main');
        if (!main) return;

        switch (tab) {
            case 'overview': await this.renderOverview(main); break;
            case 'users': await this.renderUsersTab(main); break;
            case 'activity': await this.renderActivityTab(main); break;
            case 'settings': await this.renderSettingsTab(main); break;
            case 'security': await this.renderSecurityTab(main); break;
        }
    },

    async loadChartJS() {
        return new Promise((resolve) => {
            if (window.Chart) { this.chartLoaded = true; resolve(); return; }
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
            script.onload = () => { this.chartLoaded = true; resolve(); };
            script.onerror = () => { this.chartLoaded = false; resolve(); };
            document.head.appendChild(script);
        });
    },

    async renderOverview(main) {
        main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const [stats, activity] = await Promise.all([
                API.get('admin/stats'),
                API.get('admin/activity?limit=10'),
            ]);
            this.buildOverview(main, stats, activity.activity || []);
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    buildOverview(main, stats, activity) {
        const weekChange = stats.last_week > 0
            ? Math.round(((stats.this_week - stats.last_week) / stats.last_week) * 100)
            : stats.this_week > 0 ? 100 : 0;
        const weekDir = weekChange >= 0 ? 'up' : 'down';
        const weekSign = weekChange >= 0 ? '+' : '';

        main.innerHTML = `
            <div class="admin-header">
                <div>
                    <h1>Welcome back, ${App.state.user?.username || 'Admin'}</h1>
                    <div class="subtitle">Here's what's happening with your media library.</div>
                </div>
            </div>

            <div class="admin-grid">
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="label">Total Downloads</div>
                        <div class="value">${stats.total_downloads}</div>
                        <div class="change ${weekDir}">${weekSign}${weekChange}% this week</div>
                    </div>
                    <div class="stat-icon accent">${Icons.download}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="label">Active Downloads</div>
                        <div class="value">${stats.active_downloads}</div>
                    </div>
                    <div class="stat-icon info">${this.adminIcons.activity}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="label">Storage Used</div>
                        <div class="value">${formatBytes(stats.total_storage)}</div>
                    </div>
                    <div class="stat-icon success">${this.adminIcons.storage}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="label">Users / Profiles</div>
                        <div class="value">${stats.total_users} / ${stats.total_profiles}</div>
                    </div>
                    <div class="stat-icon purple">${this.adminIcons.users}</div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:2fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
                <div class="admin-section">
                    <div class="admin-section-header">
                        <div>
                            <h3>${this.adminIcons.activity} Download Activity</h3>
                        </div>
                    </div>
                    <div class="chart-container"><canvas id="chart-daily"></canvas></div>
                </div>
                <div class="admin-section">
                    <h3>By Status</h3>
                    <div class="chart-container"><canvas id="chart-status"></canvas></div>
                </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:1.5rem">
                <div class="admin-section">
                    <h3>${this.adminIcons.users} Top Downloaders</h3>
                    <div class="chart-container"><canvas id="chart-users"></canvas></div>
                </div>
                <div class="admin-section">
                    <h3>By Media Type</h3>
                    <div class="chart-container"><canvas id="chart-type"></canvas></div>
                </div>
            </div>

            <div class="admin-section">
                <div class="admin-section-header">
                    <div>
                        <h3>${this.adminIcons.activity} Recent Activity</h3>
                        <div class="section-subtitle">Latest actions across all users</div>
                    </div>
                    <button class="btn btn-sm btn-secondary" onclick="Admin.switchTab('activity')">View All</button>
                </div>
                ${activity.length === 0 ? '<p style="color:var(--text-muted)">No activity yet</p>' : `
                    <table class="data-table">
                        <thead><tr><th>User</th><th>Action</th><th>Time</th></tr></thead>
                        <tbody>
                            ${activity.map(a => {
                                const colors = ['#e50914','#2563eb','#16a34a','#7c3aed','#ea580c','#db2777','#0d9488','#ca8a04'];
                                const c = colors[(a.username || '').charCodeAt(0) % colors.length];
                                return `<tr>
                                    <td><div class="user-cell"><span class="user-dot" style="background:${c}"></span>${a.username || '-'}</div></td>
                                    <td>${a.action}${a.profile_name ? ` <span style="color:var(--text-muted)">(${a.profile_name})</span>` : ''}</td>
                                    <td style="color:var(--text-muted);white-space:nowrap">${this.relativeTime(a.created_at)}</td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                `}
            </div>`;

        this.renderCharts(stats);
    },

    renderCharts(stats) {
        if (!window.Chart) return;

        const c = {
            accent: '#e50914', accentA: 'rgba(229,9,20,0.2)',
            success: '#46d369', successA: 'rgba(70,211,105,0.2)',
            info: '#5b8def', infoA: 'rgba(91,141,239,0.2)',
            warning: '#f0b232', error: '#e87c7c',
            muted: '#8888a0', grid: 'rgba(255,255,255,0.04)',
        };

        Chart.defaults.color = c.muted;
        Chart.defaults.borderColor = c.grid;

        const dailyCtx = document.getElementById('chart-daily');
        if (dailyCtx && stats.daily_downloads?.length) {
            new Chart(dailyCtx, {
                type: 'line',
                data: {
                    labels: stats.daily_downloads.map(d => d.day.substring(5)),
                    datasets: [{
                        label: 'Downloads',
                        data: stats.daily_downloads.map(d => d.count),
                        borderColor: c.accent,
                        backgroundColor: c.accentA,
                        fill: true, tension: 0.4, pointRadius: 3, pointBackgroundColor: c.accent,
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { color: c.grid }, ticks: { precision: 0 } },
                        x: { grid: { display: false } },
                    }
                }
            });
        }

        const statusCtx = document.getElementById('chart-status');
        if (statusCtx && stats.downloads_by_status?.length) {
            const sc = { completed: c.success, downloading: c.info, queued: c.warning, failed: c.error };
            new Chart(statusCtx, {
                type: 'doughnut',
                data: {
                    labels: stats.downloads_by_status.map(s => s.status),
                    datasets: [{ data: stats.downloads_by_status.map(s => s.count), backgroundColor: stats.downloads_by_status.map(s => sc[s.status] || c.muted), borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16 } } } }
            });
        }

        const usersCtx = document.getElementById('chart-users');
        if (usersCtx && stats.downloads_by_user?.length) {
            new Chart(usersCtx, {
                type: 'bar',
                data: {
                    labels: stats.downloads_by_user.map(u => u.name),
                    datasets: [{ label: 'Downloads', data: stats.downloads_by_user.map(u => u.count), backgroundColor: c.infoA, borderColor: c.info, borderWidth: 1, borderRadius: 6 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: c.grid }, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
            });
        }

        const typeCtx = document.getElementById('chart-type');
        if (typeCtx && stats.downloads_by_type?.length) {
            new Chart(typeCtx, {
                type: 'doughnut',
                data: {
                    labels: stats.downloads_by_type.map(t => t.media_type === 'tv' ? 'TV Shows' : 'Movies'),
                    datasets: [{ data: stats.downloads_by_type.map(t => t.count), backgroundColor: [c.accent, c.info], borderWidth: 0 }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { position: 'bottom', labels: { padding: 16 } } } }
            });
        }
    },

    async renderUsersTab(main) {
        main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('admin/users');
            const users = resp.users || [];
            const colors = ['#e50914','#2563eb','#16a34a','#7c3aed','#ea580c','#db2777','#0d9488','#ca8a04'];

            main.innerHTML = `
                <div class="admin-header">
                    <div><h1>User Management</h1><div class="subtitle">Manage users and their access</div></div>
                    <button class="btn btn-primary" onclick="Admin.showCreateUser()">+ Add User</button>
                </div>
                <div class="admin-section">
                    <table class="data-table">
                        <thead><tr><th>User</th><th>Role</th><th>Profiles</th><th>Downloads</th><th>Joined</th><th style="text-align:right">Actions</th></tr></thead>
                        <tbody>
                            ${users.map(u => {
                                const color = colors[u.username.charCodeAt(0) % colors.length];
                                return `<tr>
                                    <td><div class="user-cell"><span class="user-dot" style="background:${color}"></span><strong>${u.username}</strong></div></td>
                                    <td><span class="status-badge ${u.role === 'admin' ? 'downloading' : 'completed'}">${u.role}</span></td>
                                    <td>${u.profile_count}</td>
                                    <td>${u.download_count}</td>
                                    <td style="color:var(--text-muted)">${this.relativeTime(u.created_at)}</td>
                                    <td style="text-align:right;display:flex;gap:0.4rem;justify-content:flex-end">
                                        <button class="btn btn-sm btn-secondary" onclick="Admin.editUser(${u.id})">${Icons.edit}</button>
                                        <button class="btn btn-sm btn-secondary" style="color:var(--error)" onclick="Admin.deleteUser(${u.id},'${u.username}')">${Icons.trash}</button>
                                    </td>
                                </tr>`;
                            }).join('')}
                        </tbody>
                    </table>
                </div>`;
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    async renderActivityTab(main) {
        main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('admin/activity?limit=100');
            const activity = resp.activity || [];
            const colors = ['#e50914','#2563eb','#16a34a','#7c3aed','#ea580c','#db2777','#0d9488','#ca8a04'];

            main.innerHTML = `
                <div class="admin-header">
                    <div><h1>Activity Log</h1><div class="subtitle">Recent actions across all users and profiles</div></div>
                </div>
                <div class="admin-section">
                    ${activity.length === 0 ? '<p style="color:var(--text-muted);padding:2rem;text-align:center">No activity recorded yet.</p>' : `
                        <table class="data-table">
                            <thead><tr><th>User</th><th>Profile</th><th>Action</th><th>Details</th><th>Time</th></tr></thead>
                            <tbody>
                                ${activity.map(a => {
                                    const color = colors[(a.username || '').charCodeAt(0) % colors.length];
                                    return `<tr>
                                        <td><div class="user-cell"><span class="user-dot" style="background:${color}"></span>${a.username || '-'}</div></td>
                                        <td style="color:var(--text-muted)">${a.profile_name || '-'}</td>
                                        <td><span class="status-badge completed">${a.action}</span></td>
                                        <td style="color:var(--text-muted);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.details || '-'}</td>
                                        <td style="color:var(--text-muted);white-space:nowrap">${this.relativeTime(a.created_at)}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    `}
                </div>`;
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    async renderSettingsTab(main) {
        main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('admin/settings');
            const s = resp.settings || {};

            main.innerHTML = `
                <div class="admin-header">
                    <div><h1>Settings</h1><div class="subtitle">Configure your media server and download settings</div></div>
                </div>
                <div class="admin-section">
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;max-width:800px">
                        <div class="form-group">
                            <label>Site Name</label>
                            <input type="text" id="set-site_name" value="${s.site_name || 'Iris'}">
                        </div>
                        <div class="form-group">
                            <label>TMDB API Key</label>
                            <input type="password" id="set-tmdb_api_key" value="${s.tmdb_api_key || ''}">
                        </div>
                        <div class="form-group">
                            <label>Real-Debrid Key</label>
                            <input type="password" id="set-rd_key" value="${s.rd_key || ''}">
                        </div>
                        <div class="form-group">
                            <label>Service URL</label>
                            <input type="text" id="set-service_url" value="${s.service_url || ''}">
                        </div>
                        <div class="form-group">
                            <label>Default Quality</label>
                            <select id="set-quality_default">
                                <option value="2160p" ${s.quality_default === '2160p' ? 'selected' : ''}>4K</option>
                                <option value="1080p" ${(s.quality_default || '1080p') === '1080p' ? 'selected' : ''}>1080p</option>
                                <option value="720p" ${s.quality_default === '720p' ? 'selected' : ''}>720p</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Movies Directory</label>
                            <input type="text" id="set-movies_dir" value="${s.movies_dir || '/home/media_lib/Movies'}" placeholder="/home/media_lib/Movies">
                        </div>
                        <div class="form-group">
                            <label>TV Shows Directory</label>
                            <input type="text" id="set-tv_dir" value="${s.tv_dir || '/home/media_lib/TV Shows'}" placeholder="/home/media_lib/TV Shows">
                        </div>
                        <div class="form-group">
                            <label>Proxy</label>
                            <input type="text" id="set-proxy" value="${s.proxy || ''}" placeholder="IP:Port:User:Pass">
                        </div>
                    </div>
                    <div style="margin-top:1.5rem;display:flex;align-items:center;gap:1rem">
                        <button class="btn btn-primary" onclick="Admin.saveSettings()">Save Settings</button>
                        <span id="settings-status" style="color:var(--success);font-size:0.9rem;display:none">${Icons.check} Saved</span>
                    </div>
                </div>`;
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    async renderSecurityTab(main) {
        main.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('admin/settings');
            const s = resp.settings || {};
            const authMode = s.auth_mode || 'login';
            const ipBlocking = s.ip_blocking_enabled === '1';
            const maxAttempts = s.max_login_attempts || '10';
            const lockoutMin = s.lockout_duration_minutes || '15';

            main.innerHTML = `
                <div class="admin-header">
                    <div><h1>Security & Authentication</h1><div class="subtitle">Configure how users access your site</div></div>
                </div>
                <div class="admin-section">
                    <h3>${this.adminIcons.security} Authentication Mode</h3>
                    <div style="max-width:600px;margin-top:1rem">
                        <div class="form-group">
                            <select id="sec-auth_mode" style="font-size:0.95rem">
                                <option value="login" ${authMode === 'login' ? 'selected' : ''}>Login Screen (username + password, then profile selection)</option>
                                <option value="profiles" ${authMode === 'profiles' ? 'selected' : ''}>Profile Selection (profiles shown publicly, each has own auth)</option>
                            </select>
                            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.5rem;line-height:1.6">
                                <b>Login</b>: Users sign in with username/password first, then pick a profile.<br>
                                <b>Profiles</b>: Profile cards shown on homepage. Each profile can require a password, PIN, or have no auth.
                            </p>
                        </div>
                    </div>
                </div>

                <div class="admin-section">
                    <h3>${Icons.shield} Brute Force Protection</h3>
                    <div style="max-width:600px;margin-top:1rem">
                        <div class="form-group">
                            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
                                <input type="checkbox" id="sec-ip_blocking" ${ipBlocking ? 'checked' : ''} style="width:auto">
                                Enable IP-based brute force protection
                            </label>
                            <p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.4rem">When enabled, IPs with too many failed login attempts will be temporarily blocked.</p>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-top:1rem">
                            <div class="form-group">
                                <label>Max Failed Attempts</label>
                                <input type="number" id="sec-max_attempts" value="${maxAttempts}" min="1" max="100">
                            </div>
                            <div class="form-group">
                                <label>Lockout Duration (minutes)</label>
                                <input type="number" id="sec-lockout_minutes" value="${lockoutMin}" min="1" max="1440">
                            </div>
                        </div>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:1rem">
                    <button class="btn btn-primary" onclick="Admin.saveSecurity()">Save Security Settings</button>
                    <span id="security-status" style="color:var(--success);font-size:0.9rem;display:none">${Icons.check} Saved</span>
                </div>`;
        } catch (e) {
            main.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    async saveSettings() {
        const fields = ['site_name', 'tmdb_api_key', 'rd_key', 'service_url', 'quality_default', 'movies_dir', 'tv_dir', 'proxy'];
        const data = {};
        fields.forEach(f => { const el = document.getElementById('set-' + f); if (el) data[f] = el.value; });

        try {
            await API.post('admin/settings', data);
            const status = document.getElementById('settings-status');
            if (status) { status.style.display = 'inline'; setTimeout(() => status.style.display = 'none', 3000); }
            if (data.site_name) { App.state.siteName = data.site_name; document.title = data.site_name; App.renderNav(true); }
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async saveSecurity() {
        const data = {
            auth_mode: document.getElementById('sec-auth_mode')?.value || 'login',
            ip_blocking_enabled: document.getElementById('sec-ip_blocking')?.checked ? '1' : '0',
            max_login_attempts: document.getElementById('sec-max_attempts')?.value || '10',
            lockout_duration_minutes: document.getElementById('sec-lockout_minutes')?.value || '15',
        };
        try {
            await API.post('admin/settings', data);
            App.state.authMode = data.auth_mode;
            const status = document.getElementById('security-status');
            if (status) { status.style.display = 'inline'; setTimeout(() => status.style.display = 'none', 3000); }
            App.toast('Security settings saved', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    showCreateUser() {
        const isPublic = App.state.authMode === 'profiles';
        const html = `
            <div class="modal-overlay open" id="create-user-modal" onclick="if(event.target===this)this.remove()">
                <div class="modal">
                    <h2>Create User</h2>
                    <div class="form-group">
                        <label>Display Name</label>
                        <input type="text" id="new-user-name" placeholder="Name shown on profile">
                    </div>
                    ${isPublic ? `
                        <div class="form-group">
                            <label>Profile Authentication</label>
                            <select id="new-user-auth" onchange="Admin.toggleCreateAuth(this.value)">
                                <option value="none">None (open access)</option>
                                <option value="pin">PIN (4 digits)</option>
                                <option value="password">Password</option>
                            </select>
                        </div>
                        <div id="new-user-auth-fields"></div>
                    ` : `
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="new-user-pass" placeholder="Login password">
                        </div>
                    `}
                    <div class="form-group">
                        <label>Role</label>
                        <select id="new-user-role"><option value="user">User</option><option value="admin">Admin</option></select>
                    </div>
                    <div id="create-user-error" class="error-msg hidden"></div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="document.getElementById('create-user-modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="Admin.createUser()">Create</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    toggleCreateAuth(method) {
        const container = document.getElementById('new-user-auth-fields');
        if (!container) return;
        if (method === 'pin') {
            container.innerHTML = '<div class="form-group"><label>PIN</label><input type="password" id="new-user-pin" maxlength="4" placeholder="4-digit PIN" inputmode="numeric"></div>';
        } else if (method === 'password') {
            container.innerHTML = '<div class="form-group"><label>Password</label><input type="password" id="new-user-profile-pass" placeholder="Profile password"></div>';
        } else {
            container.innerHTML = '';
        }
    },

    async createUser() {
        const username = document.getElementById('new-user-name')?.value.trim();
        const role = document.getElementById('new-user-role')?.value;
        const isPublic = App.state.authMode === 'profiles';

        if (!username) {
            const err = document.getElementById('create-user-error');
            err.textContent = 'Name is required'; err.classList.remove('hidden');
            return;
        }

        const payload = { username, role };

        if (isPublic) {
            const authMethod = document.getElementById('new-user-auth')?.value || 'none';
            payload.auth_method = authMethod;
            if (authMethod === 'pin') {
                const pin = document.getElementById('new-user-pin')?.value;
                if (!pin || pin.length !== 4) {
                    const err = document.getElementById('create-user-error');
                    err.textContent = 'PIN must be 4 digits'; err.classList.remove('hidden');
                    return;
                }
                payload.pin = pin;
            } else if (authMethod === 'password') {
                const pass = document.getElementById('new-user-profile-pass')?.value;
                if (!pass) {
                    const err = document.getElementById('create-user-error');
                    err.textContent = 'Password is required'; err.classList.remove('hidden');
                    return;
                }
                payload.profile_password = pass;
            }
        } else {
            const password = document.getElementById('new-user-pass')?.value;
            if (!password) {
                const err = document.getElementById('create-user-error');
                err.textContent = 'Password is required'; err.classList.remove('hidden');
                return;
            }
            payload.password = password;
        }

        try {
            await API.post('admin/user-create', payload);
            document.getElementById('create-user-modal')?.remove();
            this.switchTab('users');
            App.toast('User created', 'success');
        } catch (e) {
            const err = document.getElementById('create-user-error');
            if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
        }
    },

    async deleteUser(id, username) {
        if (!confirm(`Delete user "${username}"? All their profiles and downloads will be removed.`)) return;
        try {
            await API.post('admin/user-delete', { id });
            this.switchTab('users');
            App.toast('User deleted', 'info');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    _editData: null,

    async editUser(userId) {
        try {
            const resp = await API.get(`admin/user-detail/${userId}`);
            this._editData = resp;
            this.renderEditModal(resp.user, resp.profiles);
        } catch (e) { App.toast(e.message, 'error'); }
    },

    renderEditModal(user, profiles) {
        const avatarColors = ['red','blue','green','purple','orange','pink','teal','yellow'];
        const isPublic = App.state.authMode === 'profiles';

        let profilesHtml = profiles.map(p => {
            const avatarPreview = p.picture
                ? `<img src="${p.picture}" class="admin-profile-pic">`
                : `<div class="admin-profile-pic" style="background:${p.avatar}">${p.name[0].toUpperCase()}</div>`;
            const authLabel = p.auth_method === 'pin' ? 'PIN' : p.auth_method === 'password' ? 'Password' : 'None';
            return `
                <div class="admin-profile-card" data-pid="${p.id}">
                    <div class="admin-profile-header" onclick="Admin.toggleProfileEdit(${p.id})">
                        ${avatarPreview}
                        <div class="admin-profile-summary">
                            <strong>${p.name}</strong>
                            <span style="color:var(--text-muted);font-size:0.8rem">${p.maturity} · Auth: ${authLabel}</span>
                        </div>
                        <span class="admin-profile-chevron" id="chevron-${p.id}">${Icons.edit}</span>
                    </div>
                    <div class="admin-profile-body hidden" id="profile-body-${p.id}">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                            <div class="form-group">
                                <label>Name</label>
                                <input type="text" id="ep-name-${p.id}" value="${p.name}">
                            </div>
                            <div class="form-group">
                                <label>Maturity</label>
                                <select id="ep-maturity-${p.id}">
                                    <option value="child" ${p.maturity==='child'?'selected':''}>Child</option>
                                    <option value="teen" ${p.maturity==='teen'?'selected':''}>Teen</option>
                                    <option value="adult" ${p.maturity==='adult'?'selected':''}>Adult</option>
                                </select>
                            </div>
                        </div>
                        <div class="form-group">
                            <label>Avatar Color</label>
                            <div class="avatar-picker" id="ap-${p.id}">
                                ${avatarColors.map(c => `<div class="avatar-dot ${c===p.avatar?'selected':''}" style="background:${c}" onclick="Admin.pickAvatar(${p.id},'${c}')"></div>`).join('')}
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                            <div class="form-group">
                                <label>Authentication</label>
                                <select id="ep-auth-${p.id}" onchange="Admin.toggleProfileAuth(${p.id},this.value)">
                                    <option value="none" ${p.auth_method==='none'?'selected':''}>None</option>
                                    <option value="pin" ${p.auth_method==='pin'?'selected':''}>PIN</option>
                                    <option value="password" ${p.auth_method==='password'?'selected':''}>Password</option>
                                </select>
                            </div>
                            <div class="form-group" id="ep-auth-field-${p.id}">
                                ${p.auth_method==='pin' ? `<label>New PIN</label><input type="password" id="ep-pin-${p.id}" maxlength="4" placeholder="Leave blank to keep" inputmode="numeric">` : ''}
                                ${p.auth_method==='password' ? `<label>New Password</label><input type="password" id="ep-pass-${p.id}" placeholder="Leave blank to keep">` : ''}
                            </div>
                        </div>
                        <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
                            <button class="btn btn-sm btn-primary" onclick="Admin.saveProfile(${p.id})">Save Profile</button>
                            <button class="btn btn-sm btn-secondary" style="color:var(--error)" onclick="Admin.removeProfile(${p.id},'${p.name}')">Delete Profile</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        const html = `
            <div class="modal-overlay open" id="edit-user-modal" onclick="if(event.target===this)this.remove()">
                <div class="modal" style="max-width:560px;max-height:85vh;overflow-y:auto">
                    <h2>Edit User</h2>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="eu-username" value="${user.username}">
                        </div>
                        <div class="form-group">
                            <label>Role</label>
                            <select id="eu-role">
                                <option value="user" ${user.role==='user'?'selected':''}>User</option>
                                <option value="admin" ${user.role==='admin'?'selected':''}>Admin</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Reset Password</label>
                        <input type="password" id="eu-password" placeholder="Leave blank to keep current">
                    </div>
                    <div style="margin-bottom:1rem">
                        <button class="btn btn-sm btn-primary" onclick="Admin.saveUser(${user.id})">Save User</button>
                    </div>

                    <hr style="border-color:var(--border);margin:1rem 0">

                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
                        <h3 style="margin:0">Profiles</h3>
                        <button class="btn btn-sm btn-secondary" onclick="Admin.addProfileForUser(${user.id})">+ Add Profile</button>
                    </div>
                    <div id="admin-profiles-list">
                        ${profilesHtml || '<p style="color:var(--text-muted)">No profiles</p>'}
                    </div>

                    <div class="modal-actions" style="margin-top:1rem">
                        <button class="btn btn-secondary" onclick="document.getElementById('edit-user-modal').remove()">Close</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    toggleProfileEdit(pid) {
        const body = document.getElementById(`profile-body-${pid}`);
        if (body) body.classList.toggle('hidden');
    },

    toggleProfileAuth(pid, method) {
        const container = document.getElementById(`ep-auth-field-${pid}`);
        if (!container) return;
        if (method === 'pin') {
            container.innerHTML = `<label>New PIN</label><input type="password" id="ep-pin-${pid}" maxlength="4" placeholder="4-digit PIN" inputmode="numeric">`;
        } else if (method === 'password') {
            container.innerHTML = `<label>New Password</label><input type="password" id="ep-pass-${pid}" placeholder="Password">`;
        } else {
            container.innerHTML = '';
        }
    },

    pickAvatar(pid, color) {
        const picker = document.getElementById(`ap-${pid}`);
        if (picker) picker.querySelectorAll('.avatar-dot').forEach(d => d.classList.toggle('selected', d.style.background === color));
    },

    async saveUser(userId) {
        const payload = { id: userId };
        const username = document.getElementById('eu-username')?.value.trim();
        const role = document.getElementById('eu-role')?.value;
        const password = document.getElementById('eu-password')?.value;
        if (username) payload.username = username;
        if (role) payload.role = role;
        if (password) payload.password = password;

        try {
            await API.post('admin/user-update', payload);
            App.toast('User updated', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async saveProfile(pid) {
        const payload = { id: pid };
        const name = document.getElementById(`ep-name-${pid}`)?.value.trim();
        const maturity = document.getElementById(`ep-maturity-${pid}`)?.value;
        const authMethod = document.getElementById(`ep-auth-${pid}`)?.value;
        const selectedAvatar = document.querySelector(`#ap-${pid} .avatar-dot.selected`);

        if (name) payload.name = name;
        if (maturity) payload.maturity = maturity;
        if (selectedAvatar) payload.avatar = selectedAvatar.style.background;
        if (authMethod) {
            payload.auth_method = authMethod;
            if (authMethod === 'pin') {
                const pin = document.getElementById(`ep-pin-${pid}`)?.value;
                if (pin) payload.pin = pin;
            } else if (authMethod === 'password') {
                const pass = document.getElementById(`ep-pass-${pid}`)?.value;
                if (pass) payload.password = pass;
            }
        }

        try {
            await API.post('admin/profile-update', payload);
            App.toast('Profile updated', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async removeProfile(pid, name) {
        if (!confirm(`Delete profile "${name}"?`)) return;
        try {
            await API.post('admin/profile-delete', { id: pid });
            const card = document.querySelector(`[data-pid="${pid}"]`);
            if (card) card.remove();
            App.toast('Profile deleted', 'info');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    async addProfileForUser(userId) {
        const name = prompt('Profile name:');
        if (!name) return;
        try {
            await API.post('admin/profile-create', { user_id: userId, name });
            document.getElementById('edit-user-modal')?.remove();
            this.editUser(userId);
            App.toast('Profile added', 'success');
        } catch (e) { App.toast(e.message, 'error'); }
    },

    relativeTime(dateStr) {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return date.toLocaleDateString();
    },
};
