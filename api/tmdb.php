<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'trending':
        handle_trending();
        break;
    case 'search':
        handle_search();
        break;
    case 'movie':
        handle_details('movie');
        break;
    case 'tv':
        handle_details('tv');
        break;
    case 'season':
        handle_season();
        break;
    case 'similar':
        handle_similar();
        break;
    case 'genres':
        handle_genres();
        break;
    case 'discover':
        handle_discover();
        break;
    case 'popular':
        handle_popular();
        break;
    case 'top-rated':
        handle_top_rated();
        break;
    case 'upcoming':
        handle_upcoming();
        break;
    case 'now-playing':
        handle_now_playing();
        break;
    case 'person':
        handle_person();
        break;
    default:
        json_error('Unknown tmdb action', 404);
}

function tmdb_request(string $path, array $params = []): array {
    if (get_maturity() !== 'adult') {
        $params['include_adult'] = 'false';
    }

    $db = get_db();
    $key = get_setting($db, 'tmdb_api_key', '');
    $url = 'https://api.themoviedb.org/3' . $path;
    if ($params) $url .= '?' . http_build_query($params);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer ' . $key,
            'Accept: application/json',
        ],
    ]);

    $response = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code !== 200) {
        json_error('TMDB API error: ' . $code, 502);
    }

    return json_decode($response, true) ?: [];
}

function get_maturity(): string {
    return $_SESSION['maturity'] ?? 'adult';
}

// US movie certifications: G, PG, PG-13, R, NC-17
// US TV ratings: TV-Y, TV-Y7, TV-G, TV-PG, TV-14, TV-MA
function cert_allowed(string $cert, string $maturity): bool {
    if ($maturity === 'adult') return true;
    $cert = strtoupper(trim($cert));
    if (!$cert || $cert === 'NR') return $maturity !== 'child';

    $child_ok = ['G', 'PG', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG'];
    $teen_ok  = ['G', 'PG', 'PG-13', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14'];

    if ($maturity === 'child') return in_array($cert, $child_ok);
    if ($maturity === 'teen')  return in_array($cert, $teen_ok);
    return true;
}

function get_us_certification(array $data, string $type): string {
    if ($type === 'movie') {
        foreach ($data['release_dates']['results'] ?? [] as $country) {
            if (($country['iso_3166_1'] ?? '') === 'US') {
                foreach ($country['release_dates'] ?? [] as $rd) {
                    $cert = trim($rd['certification'] ?? '');
                    if ($cert) return $cert;
                }
            }
        }
    } else {
        foreach ($data['content_ratings']['results'] ?? [] as $cr) {
            if (($cr['iso_3166_1'] ?? '') === 'US') {
                return trim($cr['rating'] ?? '');
            }
        }
    }
    return '';
}

// Max certification string for TMDB discover endpoint
function max_cert_for_maturity(string $maturity, string $type): string {
    if ($maturity === 'adult') return '';
    if ($type === 'movie') {
        return $maturity === 'child' ? 'PG' : 'PG-13';
    }
    return ''; // TV discover doesn't support certification.lte well
}

// Genre-based filter for list endpoints that don't have cert data
function filter_by_maturity(array $results): array {
    $maturity = get_maturity();
    if ($maturity === 'adult') return $results;

    // Genres to block entirely for children
    $child_blocked = [27, 53, 80, 10752, 9648]; // horror, thriller, crime, war, mystery
    // Genres to block for teens
    $teen_blocked = [27]; // horror only

    $blocked = $maturity === 'child' ? $child_blocked : $teen_blocked;

    return array_values(array_filter($results, function ($item) use ($maturity, $blocked) {
        if (!empty($item['adult'])) return false;

        $genres = $item['genre_ids'] ?? [];
        if ($genres && array_intersect($genres, $blocked)) return false;

        return true;
    }));
}

function format_results(array $data, string $type = ''): array {
    $results = $data['results'] ?? [];
    $results = filter_by_maturity($results);

    return array_map(function ($item) use ($type) {
        $mediaType = $type ?: ($item['media_type'] ?? 'movie');
        return [
            'id' => $item['id'],
            'title' => $item['title'] ?? $item['name'] ?? '',
            'overview' => $item['overview'] ?? '',
            'poster_path' => $item['poster_path'] ?? null,
            'backdrop_path' => $item['backdrop_path'] ?? null,
            'media_type' => $mediaType,
            'release_date' => $item['release_date'] ?? $item['first_air_date'] ?? '',
            'vote_average' => $item['vote_average'] ?? 0,
            'genre_ids' => $item['genre_ids'] ?? [],
        ];
    }, $results);
}

function handle_trending(): void {
    $type = $_GET['param'] ?? 'all';
    if (!in_array($type, ['all', 'movie', 'tv'])) $type = 'all';

    $page = max(1, intval($_GET['page'] ?? 1));
    $data = tmdb_request("/trending/$type/week", ['page' => $page]);
    $resultType = $type === 'all' ? '' : $type;

    json_response([
        'results' => format_results($data, $resultType),
        'total_pages' => $data['total_pages'] ?? 1,
        'page' => $data['page'] ?? 1,
    ]);
}

function handle_search(): void {
    $query = $_GET['q'] ?? ($_GET['param'] ?? '');
    if (!$query) json_error('Search query required');

    $page = max(1, intval($_GET['page'] ?? 1));
    $data = tmdb_request('/search/multi', ['query' => $query, 'page' => $page]);

    $results = array_filter($data['results'] ?? [], fn($r) => in_array($r['media_type'] ?? '', ['movie', 'tv']));
    $data['results'] = array_values($results);

    json_response([
        'results' => format_results($data),
        'total_pages' => $data['total_pages'] ?? 1,
        'page' => $data['page'] ?? 1,
    ]);
}

function handle_details(string $type): void {
    $id = $_GET['param'] ?? '';
    if (!$id) json_error('ID required');

    $append = 'credits,external_ids,similar,videos';
    if ($type === 'movie') $append .= ',release_dates';
    else $append .= ',content_ratings';

    $data = tmdb_request("/$type/$id", ['append_to_response' => $append]);

    $certification = get_us_certification($data, $type);
    $maturity = get_maturity();

    if ($certification && !cert_allowed($certification, $maturity)) {
        json_error('This content is rated ' . $certification . ' and is not available for your profile', 403);
    }

    $result = [
        'id' => $data['id'],
        'title' => $data['title'] ?? $data['name'] ?? '',
        'overview' => $data['overview'] ?? '',
        'poster_path' => $data['poster_path'] ?? null,
        'backdrop_path' => $data['backdrop_path'] ?? null,
        'media_type' => $type,
        'release_date' => $data['release_date'] ?? $data['first_air_date'] ?? '',
        'vote_average' => $data['vote_average'] ?? 0,
        'runtime' => $data['runtime'] ?? null,
        'status' => $data['status'] ?? '',
        'tagline' => $data['tagline'] ?? '',
        'genres' => $data['genres'] ?? [],
        'imdb_id' => $data['imdb_id'] ?? ($data['external_ids']['imdb_id'] ?? ''),
        'certification' => $certification,
    ];

    if ($type === 'tv') {
        $result['number_of_seasons'] = $data['number_of_seasons'] ?? 0;
        $result['number_of_episodes'] = $data['number_of_episodes'] ?? 0;
        $result['seasons'] = array_values(array_map(fn($s) => [
            'season_number' => $s['season_number'],
            'name' => $s['name'],
            'episode_count' => $s['episode_count'],
            'air_date' => $s['air_date'] ?? '',
        ], array_filter($data['seasons'] ?? [], fn($s) => $s['season_number'] > 0)));
    }

    $cast = array_slice($data['credits']['cast'] ?? [], 0, 30);
    $result['cast'] = array_map(fn($c) => [
        'id' => $c['id'],
        'name' => $c['name'],
        'character' => $c['character'] ?? '',
        'profile_path' => $c['profile_path'] ?? null,
    ], $cast);

    $similar = array_slice($data['similar']['results'] ?? [], 0, 12);
    $result['similar'] = array_map(fn($s) => [
        'id' => $s['id'],
        'title' => $s['title'] ?? $s['name'] ?? '',
        'poster_path' => $s['poster_path'] ?? null,
        'media_type' => $type,
        'vote_average' => $s['vote_average'] ?? 0,
        'release_date' => $s['release_date'] ?? $s['first_air_date'] ?? '',
    ], $similar);

    json_response($result);
}

function handle_season(): void {
    $tvId = $_GET['param'] ?? '';
    $seasonNum = $_GET['season'] ?? ($_GET['s'] ?? '');
    if (!$tvId || $seasonNum === '') json_error('TV ID and season number required');

    $data = tmdb_request("/tv/$tvId/season/$seasonNum");

    json_response([
        'season_number' => $data['season_number'] ?? $seasonNum,
        'name' => $data['name'] ?? '',
        'overview' => $data['overview'] ?? '',
        'episodes' => array_map(fn($ep) => [
            'episode_number' => $ep['episode_number'],
            'name' => $ep['name'] ?? '',
            'overview' => $ep['overview'] ?? '',
            'air_date' => $ep['air_date'] ?? '',
            'still_path' => $ep['still_path'] ?? null,
            'runtime' => $ep['runtime'] ?? null,
            'vote_average' => $ep['vote_average'] ?? 0,
        ], $data['episodes'] ?? []),
    ]);
}

function handle_similar(): void {
    $type = $_GET['param'] ?? 'movie';
    $id = $_GET['id'] ?? '';
    if (!$id) json_error('ID required');

    $data = tmdb_request("/$type/$id/similar");
    json_response(['results' => format_results($data, $type)]);
}

function handle_genres(): void {
    $movies = tmdb_request('/genre/movie/list');
    $tv = tmdb_request('/genre/tv/list');

    json_response([
        'movie' => $movies['genres'] ?? [],
        'tv' => $tv['genres'] ?? [],
    ]);
}

function handle_popular(): void {
    $type = $_GET['param'] ?? 'movie';
    if (!in_array($type, ['movie', 'tv'])) $type = 'movie';
    $data = tmdb_request("/$type/popular");
    json_response(['results' => format_results($data, $type)]);
}

function handle_top_rated(): void {
    $type = $_GET['param'] ?? 'movie';
    if (!in_array($type, ['movie', 'tv'])) $type = 'movie';
    $data = tmdb_request("/$type/top_rated");
    json_response(['results' => format_results($data, $type)]);
}

function handle_upcoming(): void {
    $data = tmdb_request('/movie/upcoming');
    json_response(['results' => format_results($data, 'movie')]);
}

function handle_now_playing(): void {
    $data = tmdb_request('/movie/now_playing');
    json_response(['results' => format_results($data, 'movie')]);
}

function handle_discover(): void {
    $type = $_GET['param'] ?? 'movie';
    $genre = $_GET['genre'] ?? '';
    $page = max(1, intval($_GET['page'] ?? 1));

    $params = ['page' => $page, 'sort_by' => 'popularity.desc'];
    if ($genre) $params['with_genres'] = $genre;

    $maturity = get_maturity();
    $maxCert = max_cert_for_maturity($maturity, $type);
    if ($maxCert && $type === 'movie') {
        $params['certification_country'] = 'US';
        $params['certification.lte'] = $maxCert;
    }

    $data = tmdb_request("/discover/$type", $params);

    json_response([
        'results' => format_results($data, $type),
        'total_pages' => $data['total_pages'] ?? 1,
        'page' => $data['page'] ?? 1,
    ]);
}

function handle_person(): void {
    $id = $_GET['param'] ?? '';
    if (!$id) json_error('Person ID required');

    $data = tmdb_request("/person/$id", ['append_to_response' => 'combined_credits,external_ids,images']);

    $credits = $data['combined_credits']['cast'] ?? [];
    usort($credits, fn($a, $b) => ($b['popularity'] ?? 0) <=> ($a['popularity'] ?? 0));
    $credits = array_slice($credits, 0, 50);

    $filmography = array_map(fn($c) => [
        'id' => $c['id'],
        'title' => $c['title'] ?? $c['name'] ?? '',
        'poster_path' => $c['poster_path'] ?? null,
        'backdrop_path' => $c['backdrop_path'] ?? null,
        'media_type' => $c['media_type'] ?? 'movie',
        'release_date' => $c['release_date'] ?? $c['first_air_date'] ?? '',
        'vote_average' => $c['vote_average'] ?? 0,
        'character' => $c['character'] ?? '',
    ], $credits);

    json_response([
        'id' => $data['id'],
        'name' => $data['name'] ?? '',
        'biography' => $data['biography'] ?? '',
        'birthday' => $data['birthday'] ?? null,
        'deathday' => $data['deathday'] ?? null,
        'place_of_birth' => $data['place_of_birth'] ?? '',
        'profile_path' => $data['profile_path'] ?? null,
        'known_for_department' => $data['known_for_department'] ?? '',
        'also_known_as' => array_slice($data['also_known_as'] ?? [], 0, 5),
        'imdb_id' => $data['external_ids']['imdb_id'] ?? '',
        'filmography' => $filmography,
    ]);
}
