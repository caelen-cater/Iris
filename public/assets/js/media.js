const Media = {
    selectedQuality: '1080p',
    currentDetail: null,
    statusPollTimer: null,
    onWatchlist: false,

    async render(container, type, id) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const [detail, downloadStatus, watchlistStatus] = await Promise.all([
                API.get(`tmdb/${type}/${id}`),
                API.get(`downloads/status/${type}/${id}`).catch(() => ({ downloads: [] })),
                API.get(`watchlist/check/${type}/${id}`).catch(() => ({ on_watchlist: false })),
            ]);

            this.onWatchlist = watchlistStatus.on_watchlist;

            this.currentDetail = detail;
            const downloads = downloadStatus.downloads || [];

            let html = '';

            const bd = Browse.backdrop(detail.backdrop_path, 'original');
            if (bd) html += `<div class="detail-backdrop" style="background-image:url('${bd}')"></div>`;

            html += '<div class="detail-content"><div class="detail-header">';
            const poster = Browse.poster(detail.poster_path, 'w500');
            if (poster) html += `<img class="detail-poster" src="${poster}" alt="${detail.title}">`;

            html += '<div class="detail-info">';
            html += `<h1>${detail.title}</h1>`;

            const year = (detail.release_date || '').substring(0, 4);
            html += '<div class="detail-meta">';
            if (detail.vote_average) html += `<span class="rating">${Icons.star} ${detail.vote_average.toFixed(1)}</span>`;
            if (detail.certification) html += `<span class="cert-tag">${detail.certification}</span>`;
            if (year) html += `<span>${year}</span>`;
            if (detail.runtime) html += `<span>${detail.runtime} min</span>`;
            if (detail.status) html += `<span>${detail.status}</span>`;
            html += '</div>';

            if (detail.genres?.length) {
                html += '<div class="detail-genres">' + detail.genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('') + '</div>';
            }

            if (detail.overview) html += `<p class="detail-overview">${detail.overview}</p>`;

            if (type === 'movie') {
                const dl = downloads.find(d => d.status === 'completed');
                const active = downloads.find(d => ['queued', 'downloading'].includes(d.status));

                html += '<div id="dl-action-row">';
                if (active) {
                    html += this.buildStatusBar();
                } else {
                    html += this.buildActionRow(dl, detail.id, type);
                }
                html += '</div>';

                if (active) {
                    this._pendingStatus = { type, id, title: detail.title, active };
                }
            }

            if (type === 'tv') {
                html += `<div class="dl-action-inline" style="margin-top:0.75rem">${this.buildWatchlistBtn(type, detail.id)}</div>`;
            }

            html += '</div></div>';

            if (type === 'tv' && detail.seasons?.length) {
                html += this.renderSeasons(detail, downloads);
            }

            if (detail.cast?.length) {
                html += '<div class="content-row" style="margin-top:2rem"><h2>Cast</h2><div class="card-scroller">';
                detail.cast.forEach(c => {
                    html += `<div class="cast-card" onclick="App.navigate('person/${c.id}')" style="cursor:pointer">`;
                    if (c.profile_path) {
                        html += `<img src="${Browse.poster(c.profile_path, 'w185')}" class="cast-photo" alt="${c.name}">`;
                    } else {
                        html += `<div class="cast-photo cast-photo-placeholder">${c.name[0]}</div>`;
                    }
                    html += `<div class="cast-name">${c.name}</div>`;
                    html += `<div class="cast-role">${c.character}</div></div>`;
                });
                html += '</div></div>';
            }

            if (detail.similar?.length) {
                html += Browse.renderRow('More Like This', detail.similar.map(s => ({ ...s, media_type: type })));
            }

            html += '</div>';
            container.innerHTML = html;

            if (this._pendingStatus) {
                const s = this._pendingStatus;
                this._pendingStatus = null;
                this.startStatusPoll(s.type, s.id);
            }

            if (type === 'tv' && detail.seasons?.length) {
                this.loadSeason(detail.id, detail.seasons[0].season_number);
            }
        } catch (e) {
            const msg = e.message || 'Error loading details';
            const isRestricted = msg.includes('not available for your profile') || msg.includes('rated');
            container.innerHTML = `<div class="page" style="text-align:center;padding-top:4rem">
                <div style="font-size:3rem;margin-bottom:1rem">${isRestricted ? Icons.lock : ''}</div>
                <h2>${isRestricted ? 'Content Restricted' : 'Error'}</h2>
                <p style="color:var(--text-muted);margin:1rem 0">${msg}</p>
                <button class="btn btn-secondary" onclick="history.back()">Go Back</button>
            </div>`;
        }
    },

    renderSeasons(detail, downloads) {
        let html = '<div style="margin-top:2rem">';
        html += '<div class="seasons-tabs" id="season-tabs">';
        detail.seasons.forEach((s, i) => {
            html += `<button class="season-tab ${i === 0 ? 'active' : ''}" onclick="Media.loadSeason(${detail.id}, ${s.season_number})" data-season="${s.season_number}">Season ${s.season_number}</button>`;
        });
        html += '</div>';
        html += '<div id="episode-list"><div class="loading"><div class="spinner"></div></div></div>';
        html += '</div>';
        return html;
    },

    async loadSeason(tvId, seasonNum) {
        document.querySelectorAll('.season-tab').forEach(t => {
            t.classList.toggle('active', parseInt(t.dataset.season) === seasonNum);
        });

        const episodeContainer = document.getElementById('episode-list');
        if (!episodeContainer) return;
        episodeContainer.innerHTML = '<div class="loading" style="min-height:auto;padding:2rem"><div class="spinner"></div></div>';

        try {
            const [season, downloadStatus] = await Promise.all([
                API.get(`tmdb/season/${tvId}?s=${seasonNum}`),
                API.get(`downloads/status/tv/${tvId}`).catch(() => ({ downloads: [] })),
            ]);

            const downloads = downloadStatus.downloads || [];
            const episodes = season.episodes || [];

            if (!episodes.length) {
                episodeContainer.innerHTML = '<div class="empty-state" style="padding:2rem"><p>No episodes found</p></div>';
                return;
            }

            let html = '<div class="dl-action-inline" style="margin-bottom:1rem">';
            html += `<button class="btn btn-primary" onclick="Media.downloadSeason(${tvId}, ${seasonNum})">${Icons.download} Download Season ${seasonNum}</button>`;
            html += '<div class="quality-select">';
            ['2160p', '1080p', '720p'].forEach(q => {
                html += `<button class="quality-option ${q === this.selectedQuality ? 'active' : ''}" onclick="Media.selectQuality('${q}')">${q}</button>`;
            });
            html += '</div></div>';
            html += '<div class="ep-scroller">';
            episodes.forEach(ep => {
                const dl = downloads.find(d => d.season == seasonNum && d.episode == ep.episode_number && d.status === 'completed');
                const active = downloads.find(d => d.season == seasonNum && d.episode == ep.episode_number && ['queued', 'downloading'].includes(d.status));
                const still = ep.still_path ? `https://image.tmdb.org/t/p/w400${ep.still_path}` : '';
                const runtime = ep.runtime ? `${ep.runtime}m` : '';
                const desc = ep.overview || '';
                const shortDesc = desc.length > 150 ? desc.substring(0, 150) + '...' : desc;

                let footerHtml = '';
                let progressHtml = '';
                if (active) {
                    const pct = active.progress || 0;
                    let statusLabel = 'Starting...';
                    if (active.status === 'queued') statusLabel = 'Queued';
                    else if (active.status_text === 'resolving') statusLabel = 'Resolving...';
                    else if (pct > 0) {
                        statusLabel = `${formatBytes(active.file_size || 0)} / ${formatBytes(active.total_size || 0)}`;
                    } else statusLabel = 'Connecting...';
                    footerHtml = `<div class="ep-progress-row"><span class="ep-progress-label">${statusLabel}</span><span class="ep-progress-pct">${pct}%</span></div>`;
                    progressHtml = `<div class="ep-progress-bar"><div class="ep-progress-fill" style="width:${pct}%"></div></div>`;
                } else if (dl) {
                    footerHtml = `<div class="ep-btn-group"><button class="ep-btn ep-btn-play" onclick="event.stopPropagation();App.navigate('play/${dl.id}')">${Icons.play} Play</button><button class="ep-btn ep-btn-redl" onclick="event.stopPropagation();Media.download('tv', ${tvId}, ${seasonNum}, ${ep.episode_number}, ${JSON.stringify(ep.name || '')})" title="Re-download">${Icons.download}</button></div>`;
                } else {
                    footerHtml = `<button class="ep-btn ep-btn-dl" onclick="event.stopPropagation();Media.download('tv', ${tvId}, ${seasonNum}, ${ep.episode_number}, ${JSON.stringify(ep.name || '')})">${Icons.download} Download</button>`;
                }

                html += `<div class="ep-card" data-ep="${ep.episode_number}">
                    <div class="ep-thumb" ${still ? `style="background-image:url('${still}')"` : ''}>
                        <div class="ep-thumb-overlay">
                            <span class="ep-num">E${ep.episode_number}</span>
                            ${runtime ? `<span class="ep-rt">${runtime}</span>` : ''}
                        </div>
                        ${dl ? `<button class="ep-play-circle" onclick="event.stopPropagation();App.navigate('play/${dl.id}')">${Icons.play}</button>` : ''}
                    </div>
                    ${progressHtml}
                    <div class="ep-info">
                        <div class="ep-title">${ep.name}</div>
                        <p class="ep-desc">${shortDesc}</p>
                        <div class="ep-footer">${footerHtml}</div>
                    </div>
                </div>`;
            });
            html += '</div>';
            episodeContainer.innerHTML = html;

            const hasActive = downloads.some(d => d.season == seasonNum && ['queued', 'downloading'].includes(d.status));
            if (hasActive) this.startEpisodePoll(tvId, seasonNum);
        } catch (e) {
            episodeContainer.innerHTML = `<div class="empty-state" style="padding:2rem"><p>Error: ${e.message}</p></div>`;
        }
    },

    selectEpisode(el, tvId, seasonNum, epNum) {
        document.querySelectorAll('.ep-card.selected').forEach(c => c.classList.remove('selected'));
        el.classList.toggle('selected');
    },

    selectQuality(q) {
        this.selectedQuality = q;
        document.querySelectorAll('.quality-option').forEach(btn => {
            btn.classList.toggle('active', btn.textContent === q);
        });
    },

    async download(type, tmdbId, season = null, episode = null, episodeTitle = null) {
        const detail = this.currentDetail;
        if (!detail) return;

        try {
            const year = (detail.release_date || detail.first_air_date || '').substring(0, 4);
            const payload = {
                tmdb_id: String(tmdbId),
                media_type: type,
                title: detail.title,
                year: year,
                poster_path: detail.poster_path || '',
                backdrop_path: detail.backdrop_path || '',
                quality: this.selectedQuality,
                imdb_id: detail.imdb_id || '',
            };
            if (season !== null) payload.season = season;
            if (episode !== null) payload.episode = episode;
            if (episodeTitle) payload.episode_title = episodeTitle;

            const resp = await API.post('downloads/start', payload);
            App.toast(`Download started: ${detail.title}${episode ? ` S${season}E${episode}` : ''}`, 'success');

            if (type === 'tv' && episode !== null) {
                this.setEpisodeDownloading(episode);
                this.startEpisodePoll(tmdbId, season);
            } else {
                this.showInlineStatus();
                this.startStatusPoll(type, tmdbId);
            }
        } catch (e) {
            App.toast(e.message || 'Failed to start download', 'error');
        }
    },

    setEpisodeDownloading(epNum) {
        const card = document.querySelector(`.ep-card[data-ep="${epNum}"]`);
        if (!card) return;
        const footer = card.querySelector('.ep-footer');
        if (footer) footer.innerHTML = `<div class="ep-progress-row"><span class="ep-progress-label">Starting...</span><span class="ep-progress-pct">0%</span></div>`;
        const thumb = card.querySelector('.ep-thumb');
        if (thumb && !card.querySelector('.ep-progress-bar')) {
            thumb.insertAdjacentHTML('afterend', '<div class="ep-progress-bar"><div class="ep-progress-fill" style="width:0%"></div></div>');
        }
    },

    epPollTimer: null,

    startEpisodePoll(tvId, seasonNum) {
        this.stopEpisodePoll();
        this.epPollTimer = setInterval(async () => {
            try {
                const resp = await API.get(`downloads/status/tv/${tvId}`);
                const dls = resp.downloads || [];
                let anyActive = false;

                dls.forEach(dl => {
                    if (dl.season != seasonNum) return;
                    const card = document.querySelector(`.ep-card[data-ep="${dl.episode}"]`);
                    if (!card) return;

                    const footer = card.querySelector('.ep-footer');
                    const bar = card.querySelector('.ep-progress-fill');

                    if (['queued', 'downloading'].includes(dl.status)) {
                        anyActive = true;
                        const pct = dl.progress || 0;
                        let label = 'Starting...';
                        if (dl.status === 'queued') label = 'Queued';
                        else if (dl.status_text === 'resolving') label = 'Resolving...';
                        else if (pct > 0) {
                            label = `${formatBytes(dl.file_size || 0)} / ${formatBytes(dl.total_size || 0)}`;
                        } else label = 'Connecting...';

                        if (footer) footer.innerHTML = `<div class="ep-progress-row"><span class="ep-progress-label">${label}</span><span class="ep-progress-pct">${pct}%</span></div>`;
                        if (bar) bar.style.width = pct + '%';
                        if (!bar) {
                            const thumb = card.querySelector('.ep-thumb');
                            if (thumb && !card.querySelector('.ep-progress-bar')) {
                                thumb.insertAdjacentHTML('afterend', '<div class="ep-progress-bar"><div class="ep-progress-fill" style="width:' + pct + '%"></div></div>');
                            }
                        }
                    } else if (dl.status === 'completed') {
                        if (footer) footer.innerHTML = `<div class="ep-btn-group"><button class="ep-btn ep-btn-play" onclick="event.stopPropagation();App.navigate('play/${dl.id}')">${Icons.play} Play</button><button class="ep-btn ep-btn-redl" onclick="event.stopPropagation();Media.download('tv', ${tvId}, ${seasonNum}, ${dl.episode})" title="Re-download">${Icons.download}</button></div>`;
                        const progressBar = card.querySelector('.ep-progress-bar');
                        if (progressBar) progressBar.remove();
                    } else if (dl.status === 'failed') {
                        if (footer) footer.innerHTML = `<button class="ep-btn ep-btn-dl" onclick="event.stopPropagation();Media.download('tv', ${tvId}, ${seasonNum}, ${dl.episode})">${Icons.download} Retry</button>`;
                        const progressBar = card.querySelector('.ep-progress-bar');
                        if (progressBar) progressBar.remove();
                    }
                });

                if (!anyActive) this.stopEpisodePoll();
            } catch (e) {}
        }, 3000);
    },

    stopEpisodePoll() {
        if (this.epPollTimer) { clearInterval(this.epPollTimer); this.epPollTimer = null; }
    },

    buildWatchlistBtn(type, tmdbId) {
        const icon = this.onWatchlist ? Icons.bookmarkFilled : Icons.bookmark;
        const label = this.onWatchlist ? 'In My List' : 'Add to My List';
        const cls = this.onWatchlist ? 'btn-watchlist active' : 'btn-watchlist';
        return `<button class="${cls}" id="watchlist-btn" onclick="Media.toggleWatchlist('${type}', ${tmdbId})">${icon} <span>${label}</span></button>`;
    },

    async toggleWatchlist(type, tmdbId) {
        const detail = this.currentDetail;
        if (!detail) return;
        try {
            const resp = await API.post('watchlist/toggle', {
                tmdb_id: tmdbId,
                media_type: type,
                title: detail.title,
                poster_path: detail.poster_path || '',
                backdrop_path: detail.backdrop_path || '',
            });
            this.onWatchlist = resp.added;
            const btn = document.getElementById('watchlist-btn');
            if (btn) {
                btn.className = resp.added ? 'btn-watchlist active' : 'btn-watchlist';
                btn.innerHTML = `${resp.added ? Icons.bookmarkFilled : Icons.bookmark} <span>${resp.added ? 'In My List' : 'Add to My List'}</span>`;
            }
            App.toast(resp.added ? 'Added to My List' : 'Removed from My List', 'success');
        } catch (e) {
            App.toast(e.message || 'Failed to update watchlist', 'error');
        }
    },

    buildActionRow(dl, movieId, type) {
        let h = '<div class="dl-action-inline">';
        if (dl) h += `<button class="btn btn-success" onclick="App.navigate('play/${dl.id}')">${Icons.play} Play</button>`;
        h += `<button class="btn btn-primary" onclick="Media.download('movie', ${movieId})">${Icons.download} Download</button>`;
        h += this.buildWatchlistBtn(type, movieId);
        h += '<div class="quality-select">';
        ['2160p', '1080p', '720p'].forEach(q => {
            h += `<button class="quality-option ${q === this.selectedQuality ? 'active' : ''}" onclick="Media.selectQuality('${q}')">${q}</button>`;
        });
        h += '</div></div>';
        return h;
    },

    buildStatusBar() {
        return `<div class="dl-status-compact">
            <span class="pulse-dot"></span>
            <span id="dl-status-text">Starting...</span>
            <div class="dl-progress-track"><div class="dl-progress-fill" id="dl-status-bar" style="width:0%"></div></div>
            <span class="dl-progress-pct" id="dl-status-pct">0%</span>
        </div>`;
    },

    showInlineStatus() {
        const row = document.getElementById('dl-action-row');
        if (!row) return;
        row.innerHTML = this.buildStatusBar();
    },

    startStatusPoll(type, tmdbId) {
        this.stopStatusPoll();
        this.statusPollTimer = setInterval(async () => {
            try {
                const resp = await API.get(`downloads/status/${type}/${tmdbId}`);
                const dls = resp.downloads || [];
                const active = dls.filter(d => ['queued', 'downloading'].includes(d.status));
                const completed = dls.filter(d => d.status === 'completed');

                const statusText = document.getElementById('dl-status-text');
                const statusBar = document.getElementById('dl-status-bar');

                const pctEl = document.getElementById('dl-status-pct');
                const titleEl = document.querySelector('.dl-status-title');

                if (active.length > 0) {
                    const dl = active[0];
                    const pct = dl.progress || 0;
                    let text = 'Starting...';
                    if (dl.status === 'queued') text = 'Queued';
                    else if (dl.status_text === 'resolving') text = 'Resolving...';
                    else if (pct > 0) {
                        text = `${formatBytes(dl.file_size || 0)} / ${formatBytes(dl.total_size || 0)}`;
                    } else text = 'Connecting...';
                    if (statusText) statusText.textContent = text;
                    if (statusBar) statusBar.style.width = pct + '%';
                    if (pctEl) pctEl.textContent = pct + '%';
                } else if (completed.length > 0) {
                    if (statusText) statusText.textContent = 'Complete';
                    if (statusBar) statusBar.style.width = '100%';
                    if (pctEl) pctEl.textContent = '100%';
                    this.stopStatusPoll();
                    setTimeout(() => {
                        const hash = window.location.hash.replace('#/', '');
                        if (hash.startsWith('media/')) App.navigate(hash, true);
                    }, 1500);
                } else {
                    const failed = dls.find(d => d.status === 'failed');
                    if (failed) {
                        if (statusText) statusText.textContent = 'Download failed.';
                        this.stopStatusPoll();
                    }
                }
            } catch (e) {}
        }, 3000);
    },

    stopStatusPoll() {
        if (this.statusPollTimer) { clearInterval(this.statusPollTimer); this.statusPollTimer = null; }
    },

    async downloadSeason(tvId, season) {
        const detail = this.currentDetail;
        if (!detail) return;

        try {
            const year = (detail.first_air_date || detail.release_date || '').substring(0, 4);
            await API.post('downloads/start', {
                tmdb_id: String(tvId),
                media_type: 'tv',
                title: detail.title,
                year: year,
                poster_path: detail.poster_path || '',
                backdrop_path: detail.backdrop_path || '',
                quality: this.selectedQuality,
                imdb_id: detail.imdb_id || '',
                season: season,
            });
            App.toast(`Downloading Season ${season} of ${detail.title}`, 'success');
            setTimeout(() => Media.loadSeason(tvId, season), 2000);
        } catch (e) {
            App.toast(e.message || 'Failed to start season download', 'error');
        }
    },
};
