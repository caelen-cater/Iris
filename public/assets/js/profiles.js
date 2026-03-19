const Profiles = {
    avatarColors: ['red', 'blue', 'green', 'purple', 'orange', 'pink', 'teal', 'yellow'],

    avatarHtml(profile, sizeClass = 'avatar-xl') {
        if (profile.picture) {
            const sizeMap = { 'avatar-xl': 'profile-pic', 'avatar-lg': 'profile-pic-lg', 'avatar': 'profile-pic-sm' };
            return `<img class="${sizeMap[sizeClass] || 'profile-pic'}" src="${profile.picture}" alt="${profile.name}">`;
        }
        return `<div class="avatar ${sizeClass} avatar-${profile.avatar || 'blue'}">${(profile.name || '?')[0]}</div>`;
    },

    authBadge(profile) {
        if (profile.auth_method === 'password' || profile.has_password) return `<span style="color:var(--text-dim);font-size:0.7rem;display:flex;align-items:center;gap:0.25rem">${Icons.lock} Password</span>`;
        if (profile.auth_method === 'pin' || profile.has_pin) return `<span style="color:var(--text-dim);font-size:0.7rem;display:flex;align-items:center;gap:0.25rem">${Icons.shield} PIN</span>`;
        return '';
    },

    // --- Public profile selection (profiles mode - no prior login) ---
    async renderPublic(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('profiles/public-list');
            this.showPublic(container, resp.profiles);
        } catch (e) {
            // If profiles mode isn't enabled, fall back to login
            App.state.authMode = 'login';
            App.renderLogin(container);
        }
    },

    showPublic(container, profiles) {
        container.innerHTML = `
            <div class="profiles-page">
                <h1>Who's watching?</h1>
                <div class="profiles-grid">
                    ${profiles.map(p => `
                        <div class="profile-card" onclick="Profiles.publicSelect(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                            ${this.avatarHtml(p)}
                            <div class="name">${p.name}</div>
                            ${this.authBadge(p)}
                        </div>
                    `).join('')}
                </div>
            </div>`;
    },

    publicSelect(profile) {
        const p = typeof profile === 'string' ? JSON.parse(profile) : profile;
        const method = p.auth_method || (p.has_password ? 'password' : p.has_pin ? 'pin' : 'none');

        if (method === 'password') {
            this.showPasswordModal(p);
        } else if (method === 'pin') {
            this.showPublicPinModal(p);
        } else {
            this.doProfileLogin(p.id, {});
        }
    },

    showPasswordModal(profile) {
        document.getElementById('profile-auth-modal')?.remove();
        const html = `
            <div class="profile-auth-overlay" id="profile-auth-modal" onclick="if(event.target===this)this.remove()">
                <div class="profile-auth-card">
                    <div class="auth-avatar">${this.avatarHtml(profile)}</div>
                    <div class="auth-name">${profile.name}</div>
                    <div class="auth-prompt">Enter your password</div>
                    <div class="form-group" style="text-align:left;margin-top:1rem">
                        <input type="password" id="profile-login-password" placeholder="Password" onkeydown="if(event.key==='Enter')Profiles.submitPassword(${profile.id})">
                    </div>
                    <div id="profile-login-error" class="error-msg hidden"></div>
                    <button class="btn btn-primary btn-lg" style="width:100%;margin-top:0.5rem" onclick="Profiles.submitPassword(${profile.id})">Sign In</button>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        setTimeout(() => document.getElementById('profile-login-password')?.focus(), 100);
    },

    async submitPassword(profileId) {
        const password = document.getElementById('profile-login-password')?.value;
        if (!password) {
            const err = document.getElementById('profile-login-error');
            if (err) { err.textContent = 'Password required'; err.classList.remove('hidden'); }
            return;
        }
        await this.doProfileLogin(profileId, { password });
    },

    showPublicPinModal(profile) {
        document.getElementById('profile-auth-modal')?.remove();
        const html = `
            <div class="profile-auth-overlay" id="profile-auth-modal" onclick="if(event.target===this)this.remove()">
                <div class="profile-auth-card">
                    <div class="auth-avatar">${this.avatarHtml(profile)}</div>
                    <div class="auth-name">${profile.name}</div>
                    <div class="auth-prompt">Enter your PIN</div>
                    <div class="pin-input-group">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="0" autofocus>
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="1">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="2">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="3">
                    </div>
                    <div id="profile-login-error" class="error-msg hidden"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        const inputs = document.querySelectorAll('#profile-auth-modal .pin-input-group input');
        inputs.forEach((inp, i) => {
            inp.addEventListener('input', () => {
                if (inp.value && i < 3) inputs[i + 1].focus();
                if (i === 3 && inp.value) {
                    const pin = Array.from(inputs).map(x => x.value).join('');
                    this.doProfileLogin(profile.id, { pin });
                }
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
            });
        });
        setTimeout(() => inputs[0]?.focus(), 100);
    },

    async doProfileLogin(profileId, credentials) {
        try {
            const resp = await API.post('auth/profile-login', { profile_id: profileId, ...credentials });
            App.state.user = resp.user;
            App.state.profile = resp.profile;
            document.getElementById('profile-auth-modal')?.remove();
            document.getElementById('app').classList.add('main');
            App.navigate('browse');
        } catch (e) {
            const err = document.getElementById('profile-login-error');
            if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
            const inputs = document.querySelectorAll('#profile-auth-modal .pin-input-group input');
            if (inputs.length) {
                inputs.forEach(i => i.value = '');
                inputs[0]?.focus();
            }
        }
    },

    // --- Authenticated profile selection (login mode) ---
    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('profiles/list');
            this.show(container, resp.profiles);
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><h3>Error loading profiles</h3><p>${e.message}</p></div>`;
        }
    },

    show(container, profiles) {
        container.innerHTML = `
            <div class="profiles-page">
                <h1>Who's watching?</h1>
                <div class="profiles-grid">
                    ${profiles.map(p => `
                        <div class="profile-card" onclick="Profiles.select(${p.id}, ${p.has_pin})">
                            ${this.avatarHtml(p)}
                            <div class="name">${p.name}</div>
                        </div>
                    `).join('')}
                    <div class="profile-card" onclick="Profiles.showCreateModal()">
                        <div class="profile-add">+</div>
                        <div class="name">Add Profile</div>
                    </div>
                </div>
                ${App.state.user?.role === 'admin' ? '<button class="btn btn-secondary" onclick="Profiles.showManage()">Manage Profiles</button>' : ''}
            </div>`;
    },

    async select(id, hasPin) {
        if (hasPin) { this.showPinModal(id); return; }
        await this.switchProfile(id);
    },

    async switchProfile(id, pinVerified = false) {
        try {
            const resp = await API.post('profiles/switch', { id, pin_verified: pinVerified });
            if (resp.requires_pin) { this.showPinModal(id); return; }
            App.state.profile = resp.profile;
            App.navigate('browse');
        } catch (e) { App.toast(e.message || 'Failed to switch profile', 'error'); }
    },

    showPinModal(profileId) {
        const html = `
            <div class="profile-auth-overlay" id="pin-modal" onclick="if(event.target===this)this.remove()">
                <div class="profile-auth-card">
                    <div class="auth-name">Enter PIN</div>
                    <div class="auth-prompt">This profile is protected</div>
                    <div class="pin-input-group">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="0" autofocus>
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="1">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="2">
                        <input type="password" maxlength="1" inputmode="numeric" pattern="[0-9]" data-idx="3">
                    </div>
                    <div id="pin-error" class="error-msg hidden"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);

        const inputs = document.querySelectorAll('#pin-modal .pin-input-group input');
        inputs.forEach((inp, i) => {
            inp.addEventListener('input', () => {
                if (inp.value && i < 3) inputs[i + 1].focus();
                if (i === 3 && inp.value) {
                    this.verifyPin(profileId, Array.from(inputs).map(x => x.value).join(''));
                }
            });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && !inp.value && i > 0) inputs[i - 1].focus();
            });
        });
        inputs[0].focus();
    },

    async verifyPin(profileId, pin) {
        try {
            const resp = await API.post('auth/verify-pin', { profile_id: profileId, pin });
            if (resp.verified) {
                document.getElementById('pin-modal')?.remove();
                await this.switchProfile(profileId, true);
            }
        } catch (e) {
            const err = document.getElementById('pin-error');
            if (err) { err.textContent = e.message || 'Incorrect PIN'; err.classList.remove('hidden'); }
            const inputs = document.querySelectorAll('#pin-modal .pin-input-group input');
            inputs.forEach(i => i.value = '');
            inputs[0]?.focus();
        }
    },

    // --- Create profile ---
    showCreateModal() {
        const html = `
            <div class="modal-overlay open" id="create-profile-modal" onclick="if(event.target===this)this.remove()">
                <div class="modal">
                    <h2>Create Profile</h2>
                    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:1.5rem">
                        <div class="profile-pic-upload" id="create-pic-preview" onclick="document.getElementById('create-pic-input').click()">
                            <div class="avatar avatar-xl avatar-blue">?</div>
                            <div class="upload-overlay">${Icons.camera} Upload</div>
                        </div>
                        <input type="file" id="create-pic-input" accept="image/*" style="display:none" onchange="Profiles.previewCreatePic(this)">
                    </div>
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="new-profile-name" placeholder="Profile name">
                    </div>
                    <div class="form-group">
                        <label>Avatar Color (used when no picture)</label>
                        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                            ${this.avatarColors.map((c, i) => `
                                <div class="avatar avatar-lg avatar-${c}" style="cursor:pointer;${i===0?'box-shadow:0 0 0 3px var(--text)':''}" onclick="Profiles.selectAvatar(this,'${c}')">${c[0].toUpperCase()}</div>
                            `).join('')}
                        </div>
                        <input type="hidden" id="new-profile-avatar" value="red">
                    </div>
                    <div class="form-group">
                        <label>Maturity</label>
                        <select id="new-profile-maturity">
                            <option value="adult">Adult</option>
                            <option value="teen">Teen</option>
                            <option value="child">Child</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Authentication</label>
                        <select id="new-profile-auth" onchange="Profiles.toggleCreateAuth(this.value)">
                            <option value="none">None (open access)</option>
                            <option value="pin">PIN (4 digits)</option>
                            <option value="password">Password</option>
                        </select>
                    </div>
                    <div id="create-auth-fields"></div>
                    <div id="create-error" class="error-msg hidden"></div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="document.getElementById('create-profile-modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="Profiles.create()">Create</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    toggleCreateAuth(method) {
        const container = document.getElementById('create-auth-fields');
        if (method === 'pin') {
            container.innerHTML = '<div class="form-group"><label>PIN</label><input type="password" id="new-profile-pin" maxlength="4" placeholder="4-digit PIN"></div>';
        } else if (method === 'password') {
            container.innerHTML = '<div class="form-group"><label>Password</label><input type="password" id="new-profile-password" placeholder="Password"></div>';
        } else {
            container.innerHTML = '';
        }
    },

    previewCreatePic(input) {
        if (!input.files?.[0]) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('create-pic-preview').innerHTML = `<img class="profile-pic" src="${e.target.result}" alt="Preview"><div class="upload-overlay">Change</div>`;
        };
        reader.readAsDataURL(input.files[0]);
    },

    selectAvatar(el, color) {
        el.parentElement.querySelectorAll('.avatar').forEach(a => a.style.boxShadow = '');
        el.style.boxShadow = '0 0 0 3px var(--text)';
        document.getElementById('new-profile-avatar').value = color;
    },

    async create() {
        const name = document.getElementById('new-profile-name')?.value.trim();
        if (!name) {
            const err = document.getElementById('create-error');
            err.textContent = 'Name is required';
            err.classList.remove('hidden');
            return;
        }

        const authMethod = document.getElementById('new-profile-auth')?.value || 'none';

        try {
            const payload = {
                name,
                avatar: document.getElementById('new-profile-avatar')?.value || 'blue',
                maturity: document.getElementById('new-profile-maturity')?.value || 'adult',
            };

            if (authMethod === 'pin') payload.pin = document.getElementById('new-profile-pin')?.value || '';
            if (authMethod === 'password') payload.password = document.getElementById('new-profile-password')?.value || '';

            const resp = await API.post('profiles/create', payload);

            const fileInput = document.getElementById('create-pic-input');
            if (fileInput?.files?.[0] && resp.id) await this.uploadPicture(resp.id, fileInput.files[0]);

            document.getElementById('create-profile-modal')?.remove();
            App.navigate('profiles');
        } catch (e) {
            const err = document.getElementById('create-error');
            if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
        }
    },

    async uploadPicture(profileId, file) {
        const fd = new FormData();
        fd.append('profile_id', profileId);
        fd.append('picture', file);
        return API.upload('profiles/upload-picture', fd);
    },

    // --- Manage profiles ---
    showManage() { App.navigate('manage-profiles'); },

    async renderManage(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
        try {
            const resp = await API.get('profiles/list');
            const profiles = resp.profiles || [];

            container.innerHTML = `
                <div class="page">
                    <h1 style="margin-bottom:2rem">Manage Profiles</h1>
                    <div style="display:grid;gap:1rem;max-width:600px">
                        ${profiles.map(p => {
                            const authLabel = p.auth_method === 'password' ? 'Password' : p.auth_method === 'pin' ? 'PIN' : 'No auth';
                            return `
                            <div class="episode-item" style="cursor:pointer" onclick="Profiles.showEditModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                                ${this.avatarHtml(p, 'avatar')}
                                <div class="episode-info">
                                    <div class="title">${p.name}</div>
                                    <div class="name">${p.maturity} &middot; ${authLabel}</div>
                                </div>
                                <div class="episode-actions" style="display:flex;gap:0.5rem">
                                    <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation();Profiles.showEditModal(${JSON.stringify(p).replace(/"/g, '&quot;')})">${Icons.edit}</button>
                                    <button class="btn btn-sm btn-secondary" style="color:var(--error)" onclick="event.stopPropagation();Profiles.confirmDelete(${p.id},'${p.name.replace(/'/g, "\\'")}')">${Icons.trash}</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <button class="btn btn-secondary" style="margin-top:1.5rem" onclick="App.navigate('profiles')">Done</button>
                </div>`;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${e.message}</p></div>`;
        }
    },

    showEditModal(profile) {
        const p = typeof profile === 'string' ? JSON.parse(profile) : profile;
        const currentAuth = p.auth_method || (p.has_password ? 'password' : p.has_pin ? 'pin' : 'none');
        const picPreview = p.picture
            ? `<img class="profile-pic" src="${p.picture}" alt="${p.name}">`
            : `<div class="avatar avatar-xl avatar-${p.avatar}">${p.name[0]}</div>`;

        const html = `
            <div class="modal-overlay open" id="edit-profile-modal" onclick="if(event.target===this)this.remove()">
                <div class="modal" style="max-width:520px">
                    <h2>Edit Profile</h2>

                    <div style="display:flex;flex-direction:column;align-items:center;margin-bottom:1.5rem;gap:0.75rem">
                        <div class="profile-pic-upload" id="edit-pic-preview" onclick="document.getElementById('edit-pic-input').click()">
                            ${picPreview}
                            <div class="upload-overlay">${Icons.camera} Change</div>
                        </div>
                        <input type="file" id="edit-pic-input" accept="image/*" style="display:none" onchange="Profiles.previewEditPic(this)">
                        ${p.picture ? `<button class="btn btn-sm btn-secondary" style="color:var(--error);font-size:0.8rem" onclick="Profiles.markRemovePic()">Remove Picture</button>` : ''}
                    </div>

                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="edit-profile-name" value="${p.name.replace(/"/g, '&quot;')}">
                    </div>

                    <div class="form-group">
                        <label>Avatar Color (shown when no picture)</label>
                        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
                            ${this.avatarColors.map(c => `
                                <div class="avatar avatar-lg avatar-${c}" style="cursor:pointer;${c===p.avatar?'box-shadow:0 0 0 3px var(--text)':''}" onclick="Profiles.selectEditAvatar(this,'${c}')">${c[0].toUpperCase()}</div>
                            `).join('')}
                        </div>
                        <input type="hidden" id="edit-profile-avatar" value="${p.avatar}">
                    </div>

                    <div class="form-group">
                        <label>Maturity Rating</label>
                        <select id="edit-profile-maturity">
                            <option value="adult" ${p.maturity==='adult'?'selected':''}>Adult</option>
                            <option value="teen" ${p.maturity==='teen'?'selected':''}>Teen</option>
                            <option value="child" ${p.maturity==='child'?'selected':''}>Child</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Authentication</label>
                        <select id="edit-profile-auth" onchange="Profiles.toggleEditAuth(this.value)">
                            <option value="none" ${currentAuth==='none'?'selected':''}>None (open access)</option>
                            <option value="pin" ${currentAuth==='pin'?'selected':''}>PIN (4 digits)</option>
                            <option value="password" ${currentAuth==='password'?'selected':''}>Password</option>
                        </select>
                    </div>
                    <div id="edit-auth-fields">
                        ${currentAuth === 'pin' ? '<div class="form-group"><label>New PIN (leave blank to keep current)</label><input type="password" id="edit-profile-pin" maxlength="4" placeholder="4-digit PIN"></div>' : ''}
                        ${currentAuth === 'password' ? '<div class="form-group"><label>New Password (leave blank to keep current)</label><input type="password" id="edit-profile-password" placeholder="Password"></div>' : ''}
                    </div>

                    <div id="edit-error" class="error-msg hidden"></div>
                    <input type="hidden" id="edit-profile-id" value="${p.id}">
                    <input type="hidden" id="edit-remove-pic" value="0">

                    <div class="modal-actions">
                        <button class="btn btn-secondary" onclick="document.getElementById('edit-profile-modal').remove()">Cancel</button>
                        <button class="btn btn-primary" onclick="Profiles.update()">Save Changes</button>
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    toggleEditAuth(method) {
        const container = document.getElementById('edit-auth-fields');
        if (method === 'pin') {
            container.innerHTML = '<div class="form-group"><label>PIN</label><input type="password" id="edit-profile-pin" maxlength="4" placeholder="4-digit PIN"></div>';
        } else if (method === 'password') {
            container.innerHTML = '<div class="form-group"><label>Password</label><input type="password" id="edit-profile-password" placeholder="Password"></div>';
        } else {
            container.innerHTML = '';
        }
    },

    previewEditPic(input) {
        if (!input.files?.[0]) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('edit-pic-preview').innerHTML = `<img class="profile-pic" src="${e.target.result}" alt="Preview"><div class="upload-overlay">Change</div>`;
        };
        reader.readAsDataURL(input.files[0]);
        document.getElementById('edit-remove-pic').value = '0';
    },

    markRemovePic() {
        document.getElementById('edit-remove-pic').value = '1';
        const name = document.getElementById('edit-profile-name')?.value || '?';
        const avatar = document.getElementById('edit-profile-avatar')?.value || 'blue';
        document.getElementById('edit-pic-preview').innerHTML = `<div class="avatar avatar-xl avatar-${avatar}">${name[0]}</div><div class="upload-overlay">${Icons.camera} Upload</div>`;
        App.toast('Picture will be removed on save', 'info');
    },

    selectEditAvatar(el, color) {
        el.parentElement.querySelectorAll('.avatar').forEach(a => a.style.boxShadow = '');
        el.style.boxShadow = '0 0 0 3px var(--text)';
        document.getElementById('edit-profile-avatar').value = color;
    },

    async update() {
        const id = document.getElementById('edit-profile-id')?.value;
        const name = document.getElementById('edit-profile-name')?.value.trim();
        if (!name) {
            const err = document.getElementById('edit-error');
            if (err) { err.textContent = 'Name is required'; err.classList.remove('hidden'); }
            return;
        }

        try {
            const authMethod = document.getElementById('edit-profile-auth')?.value || 'none';
            const payload = {
                id: parseInt(id),
                name,
                avatar: document.getElementById('edit-profile-avatar')?.value,
                maturity: document.getElementById('edit-profile-maturity')?.value,
                auth_method: authMethod,
            };

            if (authMethod === 'pin') {
                const pin = document.getElementById('edit-profile-pin')?.value;
                if (pin) payload.pin = pin;
            } else if (authMethod === 'password') {
                const pw = document.getElementById('edit-profile-password')?.value;
                if (pw) payload.password = pw;
            }

            if (document.getElementById('edit-remove-pic')?.value === '1') payload.remove_picture = true;

            await API.post('profiles/update', payload);

            const fileInput = document.getElementById('edit-pic-input');
            if (fileInput?.files?.[0]) {
                const picResp = await this.uploadPicture(parseInt(id), fileInput.files[0]);
                if (App.state.profile?.id == id) App.state.profile.picture = picResp.picture;
            }

            if (App.state.profile?.id == id) {
                App.state.profile.name = name;
                App.state.profile.avatar = payload.avatar;
                App.state.profile.maturity = payload.maturity;
                if (payload.remove_picture) App.state.profile.picture = null;
            }

            document.getElementById('edit-profile-modal')?.remove();
            App.toast('Profile updated', 'success');
            this.renderManage(document.getElementById('app'));
        } catch (e) {
            const err = document.getElementById('edit-error');
            if (err) { err.textContent = e.message; err.classList.remove('hidden'); }
        }
    },

    async confirmDelete(id, name) {
        if (!confirm(`Delete profile "${name}"? This cannot be undone.`)) return;
        try {
            await API.post('profiles/delete', { id });
            this.renderManage(document.getElementById('app'));
        } catch (e) { App.toast(e.message, 'error'); }
    }
};
