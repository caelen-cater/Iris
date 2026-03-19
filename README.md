# Iris

A self-hosted media hub that automates finding, downloading, and organizing media from multiple sources into a clean, ready-to-use library. Think Netflix meets TMDB, with your own media library.

## Features

- **Browse & discover** — Trending, popular, top-rated movies and TV shows via TMDB
- **One-click downloads** — Download movies and episodes directly from the web app
- **Streaming** — Play downloaded media in the browser with range-request support
- **Profiles** — Multiple user profiles with optional PIN/password protection
- **Maturity filtering** — Child, teen, and adult profiles with content restrictions
- **Watchlist** — Save movies and shows to your list
- **Artist pages** — Browse cast members and their filmography
- **Admin dashboard** — Statistics, download management, and settings

## Repository structure

The project uses two branches:

| Branch | Contents |
|--------|----------|
| `main` | PHP web app (api, config, public, templates, etc.) |
| `cli-core` | Go CLI for media downloads (main.go, internal/) |

The web app invokes the `media-downloader` binary for each download. The app specifies the exact output path; the CLI handles stream resolution and file transfer.

## Requirements

- PHP 8+ with PDO, curl, json, session
- MySQL 8+
- Go 1.21+ (for building the CLI)
- Apache with mod_rewrite (or nginx equivalent)

## Installation

### 1. Clone the app

```bash
git clone -b main https://github.com/caelen-cater/Iris.git
cd Iris
cp config/config.sample.php config/config.php
```

### 2. Build the media-downloader CLI

```bash
git clone -b cli-core --single-branch https://github.com/caelen-cater/Iris.git /tmp/iris-cli
cd /tmp/iris-cli
go build -o media-downloader .
cp media-downloader /path/to/Iris/
```

Or build in-place if you have both branches:

```bash
git fetch origin cli-core
git checkout cli-core -- .
go build -o media-downloader .
git checkout main -- .
```

Place the binary in the app root (or set `BINARY_PATH` in config to its location).

### 3. Web installer

Visit your site in a browser. The installer will:

- Create the database schema
- Set up the admin account
- Configure TMDB API key
- Configure Real-Debrid and streaming service
- Set download directories (movies, TV shows)

## Configuration

| Setting | Description |
|---------|-------------|
| `movies_dir` | Base directory for movie downloads |
| `tv_dir` | Base directory for TV show downloads |
| `rd_key` | Real-Debrid API key |
| `service_url` | Streaming service URL |
| `quality_default` | Default quality (e.g. 1080p) |

Output paths use Plex-style naming:

- **Movies**: `{movies_dir}/Movie Title (Year) [TMDB_ID].mkv`
- **TV**: `{tv_dir}/Show Name [TMDB_ID]/Season X/Show - S01E01 - Episode Title [TMDB_ID].mkv`

## Auth modes

- **Login screen** — Users log in with username/password, then select a profile
- **Profile-first** — Profiles are shown on the homepage; each profile can have PIN, password, or no auth

## License

Apache-2.0. See [LICENSE](LICENSE).
