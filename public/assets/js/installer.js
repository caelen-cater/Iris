const Installer = {
    currentStep: 0,
    totalSteps: 5,
    checks: null,
    saved: {},

    init() {
        this.renderStep();
        this.runChecks();
    },

    saveCurrentFields() {
        const inputs = document.querySelectorAll('#installer-app input, #installer-app select');
        inputs.forEach(el => { if (el.id) this.saved[el.id] = el.value; });
    },

    restoreFields() {
        requestAnimationFrame(() => {
            for (const [id, val] of Object.entries(this.saved)) {
                const el = document.getElementById(id);
                if (el) el.value = val;
            }
        });
    },

    async api(action, data = null) {
        const opts = { headers: { 'Content-Type': 'application/json' } };
        if (data) {
            opts.method = 'POST';
            opts.body = JSON.stringify(data);
        }
        const r = await fetch(`api/install/${action}`, opts);
        return r.json();
    },

    async runChecks() {
        try {
            this.checks = await this.api('check');
            if (this.currentStep === 0) this.renderStep();
        } catch (e) {
            this.checks = { all_passed: false, error: e.message };
            if (this.currentStep === 0) this.renderStep();
        }
    },

    next() {
        if (this.currentStep < this.totalSteps - 1) {
            this.saveCurrentFields();
            this.currentStep++;
            this.renderStep();
        }
    },

    prev() {
        if (this.currentStep > 0) {
            this.saveCurrentFields();
            this.currentStep--;
            this.renderStep();
        }
    },

    renderStep() {
        const app = document.getElementById('installer-app');
        const dots = document.querySelectorAll('.step-dot');
        dots.forEach((d, i) => {
            d.classList.toggle('active', i === this.currentStep);
            d.classList.toggle('done', i < this.currentStep);
        });

        switch (this.currentStep) {
            case 0: this.renderChecks(app); break;
            case 1: this.renderDB(app); break;
            case 2: this.renderAdmin(app); break;
            case 3: this.renderMedia(app); break;
            case 4: this.renderComplete(app); break;
        }
        this.restoreFields();
    },

    renderChecks(el) {
        const c = this.checks;
        const loading = !c;
        const items = loading ? [] : [
            ['PHP 8.0+', c.php_version],
            ['PDO Extension', c.pdo],
            ['PDO MySQL', c.pdo_mysql],
            ['cURL Extension', c.curl],
            ['JSON Extension', c.json],
            ['Sessions', c.session],
            ['Config Writable', c.config_writable],
            ['Media Downloader Binary', c.binary_exists],
        ];

        el.innerHTML = `
            <div class="card">
                <h2>System Requirements</h2>
                <p class="subtitle">Checking that your server meets all requirements</p>
                ${loading ? '<p style="color:var(--text-muted)">Checking...</p>' : `
                    <ul class="check-list">
                        ${items.map(([name, ok]) => `
                            <li>
                                <span class="check-icon ${ok ? 'pass' : 'fail'}">${ok ? '&#10003;' : '&#10007;'}</span>
                                ${name}
                            </li>
                        `).join('')}
                    </ul>
                    ${c.binary_path ? `<p style="font-size:0.8rem;color:var(--text-muted);margin-top:0.75rem">Binary: ${c.binary_path}</p>` : ''}
                `}
                <div class="btn-row" style="justify-content:flex-end">
                    <button class="btn btn-primary" ${!c || !c.all_passed ? 'disabled' : ''} onclick="Installer.next()">Continue</button>
                </div>
            </div>`;
    },

    renderDB(el) {
        el.innerHTML = `
            <div class="card">
                <h2>Database Setup</h2>
                <p class="subtitle">Enter your MySQL database credentials</p>
                <div class="form-group">
                    <label>Database Host</label>
                    <input type="text" id="db_host" value="localhost" placeholder="localhost">
                </div>
                <div class="form-group">
                    <label>Database Name</label>
                    <input type="text" id="db_name" value="iris" placeholder="iris">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="db_user" value="root" placeholder="root">
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="db_pass" placeholder="(optional)">
                    </div>
                </div>
                <div id="db-error" class="error-msg hidden"></div>
                <div class="btn-row">
                    <button class="btn btn-secondary" onclick="Installer.prev()">Back</button>
                    <button class="btn btn-primary" onclick="Installer.next()">Continue</button>
                </div>
            </div>`;
    },

    renderAdmin(el) {
        el.innerHTML = `
            <div class="card">
                <h2>Admin Account</h2>
                <p class="subtitle">Create the administrator account</p>
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" id="admin_username" placeholder="admin">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" id="admin_password" placeholder="Choose a strong password">
                </div>
                <div class="form-group">
                    <label>Confirm Password</label>
                    <input type="password" id="admin_password2" placeholder="Confirm password">
                </div>
                <div id="admin-error" class="error-msg hidden"></div>
                <div class="btn-row">
                    <button class="btn btn-secondary" onclick="Installer.prev()">Back</button>
                    <button class="btn btn-primary" onclick="Installer.next()">Continue</button>
                </div>
            </div>`;
    },

    renderMedia(el) {
        el.innerHTML = `
            <div class="card">
                <h2>Media Settings</h2>
                <p class="subtitle">Configure how media is discovered and downloaded</p>
                <div class="form-group">
                    <label>TMDB API Key <span style="color:var(--accent)">*</span></label>
                    <input type="text" id="tmdb_api_key" placeholder="TMDB v4 Read Access Token">
                    <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.25rem">Get one at <a href="https://www.themoviedb.org/settings/api" target="_blank" style="color:var(--accent)">themoviedb.org/settings/api</a></p>
                </div>
                <div class="form-group">
                    <label>Real-Debrid API Key <span style="color:var(--accent)">*</span></label>
                    <input type="text" id="rd_key" placeholder="Your Real-Debrid API key">
                </div>
                <div class="form-group">
                    <label>Streaming Service URL <span style="color:var(--accent)">*</span></label>
                    <input type="text" id="service_url" placeholder="Service URL">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Default Quality</label>
                        <select id="quality">
                            <option value="2160p">4K (2160p)</option>
                            <option value="1080p" selected>1080p</option>
                            <option value="720p">720p</option>
                            <option value="">Highest Available</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Download Directory</label>
                        <input type="text" id="download_dir" value="/media" placeholder="/media">
                    </div>
                </div>
                <div class="form-group">
                    <label>Proxy</label>
                    <input type="text" id="proxy" placeholder="IP:Port:User:Pass (optional)">
                </div>
                <div class="form-group">
                    <label>Site Name</label>
                    <input type="text" id="site_name" value="Iris" placeholder="Iris">
                </div>

                <div class="optional-section">
                    <h3>SFTP Transfer</h3>
                    <p class="subtitle">Optionally transfer downloads to a remote server</p>
                    <div class="form-row">
                        <div class="form-group">
                            <label>SFTP Host</label>
                            <input type="text" id="sftp_host" placeholder="(optional)">
                        </div>
                        <div class="form-group">
                            <label>SFTP Port</label>
                            <input type="number" id="sftp_port" value="22">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>SFTP Username</label>
                            <input type="text" id="sftp_user">
                        </div>
                        <div class="form-group">
                            <label>SFTP Password</label>
                            <input type="password" id="sftp_pass">
                        </div>
                    </div>
                    <div class="form-group">
                        <label>SFTP Remote Path</label>
                        <input type="text" id="sftp_path" placeholder="/remote/media">
                    </div>
                </div>

                <div id="media-error" class="error-msg hidden"></div>
                <div class="btn-row">
                    <button class="btn btn-secondary" onclick="Installer.prev()">Back</button>
                    <button class="btn btn-primary" id="install-btn" onclick="Installer.submit()">Install Iris</button>
                </div>
            </div>`;
    },

    renderComplete(el) {
        el.innerHTML = `
            <div class="card success-screen">
                <div class="checkmark">&#10003;</div>
                <h2>Iris is Ready</h2>
                <p>Your installation is complete. Click below to start using Iris.</p>
                <button class="btn btn-primary" onclick="window.location.reload()">Launch Iris</button>
            </div>`;
    },

    val(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    },

    showError(id, msg) {
        const el = document.getElementById(id);
        if (el) { el.textContent = msg; el.classList.remove('hidden'); }
    },

    field(id, fallback = '') {
        return this.val(id) || this.saved[id] || fallback;
    },

    async submit() {
        this.saveCurrentFields();

        const pw = this.field('admin_password');
        if (!pw) {
            return this.showError('media-error', 'Admin password is missing. Go back and fill it in.');
        }
        if (pw !== this.field('admin_password2')) {
            return this.showError('media-error', 'Passwords do not match (go back and fix)');
        }
        if (!this.field('tmdb_api_key')) {
            return this.showError('media-error', 'TMDB API key is required');
        }
        if (!this.field('rd_key') || !this.field('service_url')) {
            return this.showError('media-error', 'RD key and Service URL are required');
        }

        const btn = document.getElementById('install-btn');
        btn.disabled = true;
        btn.textContent = 'Installing...';

        try {
            const result = await this.api('run', {
                db_host: this.field('db_host', 'localhost'),
                db_name: this.field('db_name', 'iris'),
                db_user: this.field('db_user', 'root'),
                db_pass: this.field('db_pass'),
                admin_username: this.field('admin_username', 'admin'),
                admin_password: pw,
                tmdb_api_key: this.field('tmdb_api_key'),
                rd_key: this.field('rd_key'),
                service_url: this.field('service_url'),
                download_dir: this.field('download_dir', '/media'),
                quality: this.field('quality'),
                proxy: this.field('proxy'),
                site_name: this.field('site_name', 'Iris'),
                sftp_host: this.field('sftp_host'),
                sftp_port: this.field('sftp_port'),
                sftp_user: this.field('sftp_user'),
                sftp_pass: this.field('sftp_pass'),
                sftp_path: this.field('sftp_path'),
                binary_path: this.checks?.binary_path || '',
            });

            if (result.error) {
                this.showError('media-error', result.error);
                btn.disabled = false;
                btn.textContent = 'Install Iris';
            } else {
                this.next();
            }
        } catch (e) {
            this.showError('media-error', 'Installation failed: ' + e.message);
            btn.disabled = false;
            btn.textContent = 'Install Iris';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Installer.init());
