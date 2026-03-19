const Browse = {
    IMG_BASE: 'https://image.tmdb.org/t/p/',

    poster(path, size = 'w342') {
        return path ? this.IMG_BASE + size + path : '';
    },

    backdrop(path, size = 'w1280') {
        return path ? this.IMG_BASE + size + path : '';
    },

    async render(container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

        try {
            const [trending, popularMovies, popularTV, topMovies, topTV, upcoming, nowPlaying, downloaded, watchlist] = await Promise.all([
                API.get('tmdb/trending/all'),
                API.get('tmdb/popular/movie'),
                API.get('tmdb/popular/tv'),
                API.get('tmdb/top-rated/movie'),
                API.get('tmdb/top-rated/tv'),
                API.get('tmdb/upcoming').catch(() => ({ results: [] })),
                API.get('tmdb/now-playing').catch(() => ({ results: [] })),
                API.get('downloads/library').catch(() => ({ results: [] })),
                API.get('watchlist/list').catch(() => ({ results: [] })),
            ]);

            const hero = trending.results[0];
            const recentlyDownloaded = downloaded.results || [];
            const myList = watchlist.results || [];

            let html = '';

            if (hero) {
                html += `
                    <div class="hero">
                        <div class="hero-backdrop" style="background-image:url('${this.backdrop(hero.backdrop_path, 'original')}')" onclick="App.navigate('media/${hero.media_type}/${hero.id}')"></div>
                        <div class="hero-search">
                            <div class="hero-search-box">
                                <span class="search-icon">${Icons.search}</span>
                                <input type="text" placeholder="Search movies and TV shows..." oninput="App.onHeroSearchInput(this.value)" onkeydown="if(event.key==='Enter')App.submitSearch(this.value)">
                                <div class="hero-search-dropdown hidden" id="hero-search-dropdown"></div>
                            </div>
                        </div>
                        <div class="hero-content">
                            <h1>${hero.title}</h1>
                            <div class="meta">
                                <span class="rating">${(hero.vote_average || 0).toFixed(1)}</span>
                                <span>${(hero.release_date || '').substring(0, 4)}</span>
                                <span>${hero.media_type === 'tv' ? 'TV Show' : 'Movie'}</span>
                            </div>
                            <p class="overview">${hero.overview}</p>
                            <button class="btn btn-primary btn-lg" onclick="App.navigate('media/${hero.media_type}/${hero.id}')">More Info</button>
                        </div>
                    </div>`;
            } else {
                html += `
                    <div style="padding:4rem 2rem;text-align:center">
                        <div class="hero-search" style="position:relative;top:auto;left:auto;transform:none;max-width:640px;margin:0 auto">
                            <div class="hero-search-box">
                                <span class="search-icon">${Icons.search}</span>
                                <input type="text" placeholder="Search movies and TV shows..." oninput="App.onHeroSearchInput(this.value)" onkeydown="if(event.key==='Enter')App.submitSearch(this.value)">
                                <div class="hero-search-dropdown hidden" id="hero-search-dropdown"></div>
                            </div>
                        </div>
                    </div>`;
            }

            if (myList.length > 0) html += this.renderRow('My List', myList);
            if (recentlyDownloaded.length > 0) html += this.renderRow('Recently Downloaded', recentlyDownloaded);

            html += this.renderRow('Trending This Week', trending.results?.slice(1) || []);
            html += this.renderRow('Now Playing in Theaters', nowPlaying.results || []);
            html += this.renderRow('Popular Movies', popularMovies.results || []);
            html += this.renderRow('Popular TV Shows', popularTV.results || []);
            html += this.renderRow('Upcoming Movies', upcoming.results || []);
            html += this.renderRow('Top Rated Movies', topMovies.results || []);
            html += this.renderRow('Top Rated TV Shows', topTV.results || []);

            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<div class="empty-state"><h3>Error loading content</h3><p>${e.message}</p></div>`;
        }
    },

    renderRow(title, items) {
        if (!items.length) return '';
        return `
            <div class="content-row">
                <h2>${title}</h2>
                <div class="card-scroller">
                    ${items.map(item => this.renderCard(item)).join('')}
                </div>
            </div>`;
    },

    renderCard(item) {
        const poster = this.poster(item.poster_path);
        const year = (item.release_date || '').substring(0, 4);
        const type = item.media_type || 'movie';
        const rating = item.vote_average ? parseFloat(item.vote_average).toFixed(1) : '';
        const posterHtml = poster
            ? `<div class="media-card-poster-wrap"><img class="media-card-poster" src="${poster}" alt="${item.title}" loading="lazy"></div>`
            : `<div class="media-card-poster-wrap media-card-poster-placeholder"><span>${item.title}</span></div>`;

        const ratingBadge = rating && rating > 0 ? `<div class="rating-badge">${Icons.star || '&#9733;'} ${rating}</div>` : '';
        const certBadge = item.certification ? `<div class="cert-badge">${item.certification}</div>` : '';

        return `
            <div class="media-card" onclick="App.navigate('media/${type}/${item.id}')">
                ${posterHtml}
                ${item.status === 'completed' ? '<div class="badge"></div>' : ''}
                ${ratingBadge}
                <div class="media-card-info">
                    <div class="title">${item.title}</div>
                    <div class="year">${year}${certBadge}</div>
                </div>
            </div>`;
    },

    renderSearchResults(container, results) {
        if (!results.length) {
            container.innerHTML = '<div class="page"><div class="empty-state"><h3>No results found</h3></div></div>';
            return;
        }

        container.innerHTML = `
            <div class="page">
                <h1 style="margin-bottom:1.5rem">Search Results</h1>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem">
                    ${results.map(item => this.renderCard(item)).join('')}
                </div>
            </div>`;
    },

    renderSearchDropdown(results) {
        if (!results.length) return '<div style="padding:1rem;color:var(--text-muted)">No results</div>';

        return results.slice(0, 8).map(item => {
            const poster = this.poster(item.poster_path, 'w92');
            const year = (item.release_date || '').substring(0, 4);
            return `
                <div class="search-result-item" onclick="App.navigate('media/${item.media_type}/${item.id}')">
                    ${poster ? `<img src="${poster}" alt="">` : '<div style="width:40px;height:60px;background:var(--bg-card);border-radius:4px"></div>'}
                    <div class="info">
                        <div class="title">${item.title}</div>
                        <div class="meta">${year} &middot; ${item.media_type === 'tv' ? 'TV' : 'Movie'}</div>
                    </div>
                </div>`;
        }).join('');
    }
};
