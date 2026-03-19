const Player = {
    videoEl: null,
    controlsTimeout: null,
    progressInterval: null,
    downloadId: null,

    async render(container, downloadId) {
        this.downloadId = downloadId;

        let resumeTime = 0;
        try {
            const resume = await API.get(`media/resume/${downloadId}`);
            if (resume.progress > 0 && resume.duration > 0) {
                if (resume.progress / resume.duration < 0.95) resumeTime = resume.progress;
            }
        } catch (e) {}

        let title = 'Playing';
        try {
            const resp = await API.get('downloads/list');
            const dl = (resp.downloads || []).find(d => d.id == downloadId);
            if (dl) {
                title = dl.title;
                if (dl.season) title += ` S${dl.season}E${dl.episode}`;
                if (dl.episode_title) title += ` - ${dl.episode_title}`;
            }
        } catch (e) {}

        document.getElementById('nav-container').style.display = 'none';
        container.className = '';
        container.innerHTML = `
            <div class="player-page">
                <button class="player-back" onclick="Player.close()">${Icons.back}</button>
                <video id="player-video" autoplay>
                    <source src="api/media/stream/${downloadId}" type="video/mp4">
                </video>
                <div class="player-controls" id="player-controls">
                    <div class="player-progress" id="player-progress" onclick="Player.seek(event)">
                        <div class="player-progress-bar" id="player-progress-bar"></div>
                    </div>
                    <div class="player-buttons">
                        <button onclick="Player.togglePlay()" id="play-btn">${Icons.pause}</button>
                        <button onclick="Player.skip(-10)">-10s</button>
                        <button onclick="Player.skip(30)">+30s</button>
                        <span class="player-time" id="player-time">0:00 / 0:00</span>
                        <span class="player-title">${title}</span>
                        <button onclick="Player.toggleFullscreen()">${Icons.expand}</button>
                    </div>
                </div>
            </div>`;

        this.videoEl = document.getElementById('player-video');
        const video = this.videoEl;

        if (resumeTime > 0) {
            video.addEventListener('loadedmetadata', () => { video.currentTime = resumeTime; }, { once: true });
        }

        video.addEventListener('timeupdate', () => this.updateProgress());
        video.addEventListener('ended', () => this.onEnded());
        video.addEventListener('play', () => { document.getElementById('play-btn').innerHTML = Icons.pause; });
        video.addEventListener('pause', () => { document.getElementById('play-btn').innerHTML = Icons.play; });

        const playerPage = container.querySelector('.player-page');
        playerPage.addEventListener('mousemove', () => this.showControls());
        playerPage.addEventListener('click', (e) => { if (e.target === video) this.togglePlay(); });

        this.showControls();
        this.startProgressSaving();
    },

    togglePlay() {
        if (!this.videoEl) return;
        if (this.videoEl.paused) this.videoEl.play();
        else this.videoEl.pause();
    },

    skip(seconds) {
        if (!this.videoEl) return;
        this.videoEl.currentTime = Math.max(0, Math.min(this.videoEl.duration, this.videoEl.currentTime + seconds));
    },

    seek(event) {
        if (!this.videoEl) return;
        const bar = document.getElementById('player-progress');
        const rect = bar.getBoundingClientRect();
        this.videoEl.currentTime = ((event.clientX - rect.left) / rect.width) * this.videoEl.duration;
    },

    updateProgress() {
        if (!this.videoEl) return;
        const video = this.videoEl;
        const pct = video.duration ? (video.currentTime / video.duration) * 100 : 0;
        const bar = document.getElementById('player-progress-bar');
        if (bar) bar.style.width = pct + '%';
        const time = document.getElementById('player-time');
        if (time) time.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    },

    showControls() {
        const controls = document.getElementById('player-controls');
        if (controls) controls.classList.remove('hidden');
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            if (this.videoEl && !this.videoEl.paused) controls?.classList.add('hidden');
        }, 3000);
    },

    toggleFullscreen() {
        const page = document.querySelector('.player-page');
        if (!page) return;
        if (document.fullscreenElement) document.exitFullscreen();
        else page.requestFullscreen();
    },

    startProgressSaving() {
        this.stopProgressSaving();
        this.progressInterval = setInterval(() => {
            if (!this.videoEl || this.videoEl.paused) return;
            API.post('media/progress', {
                download_id: this.downloadId,
                progress: Math.floor(this.videoEl.currentTime),
                duration: Math.floor(this.videoEl.duration || 0),
            }).catch(() => {});
        }, 15000);
    },

    stopProgressSaving() {
        if (this.progressInterval) { clearInterval(this.progressInterval); this.progressInterval = null; }
    },

    onEnded() {
        if (this.videoEl) {
            API.post('media/progress', {
                download_id: this.downloadId,
                progress: Math.floor(this.videoEl.duration),
                duration: Math.floor(this.videoEl.duration),
            }).catch(() => {});
        }
        this.showControls();
    },

    close() {
        if (this.videoEl && this.videoEl.currentTime > 0) {
            API.post('media/progress', {
                download_id: this.downloadId,
                progress: Math.floor(this.videoEl.currentTime),
                duration: Math.floor(this.videoEl.duration || 0),
            }).catch(() => {});
        }
        this.stopProgressSaving();
        clearTimeout(this.controlsTimeout);
        if (this.videoEl) { this.videoEl.pause(); this.videoEl.removeAttribute('src'); this.videoEl.load(); this.videoEl = null; }
        if (document.fullscreenElement) document.exitFullscreen();
        document.getElementById('nav-container').style.display = '';
        document.getElementById('app').className = 'main';
        window.history.back();
    },
};

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
}
