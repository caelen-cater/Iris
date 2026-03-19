<?php
require_once APP_ROOT . '/includes/db.php';

$user = check_profile();
$db = get_db();
$action = $_GET['action'] ?? '';

switch ($action) {
    case 'toggle':
        require_method('POST');
        handle_toggle($db, $user);
        break;
    case 'check':
        handle_check($db, $user);
        break;
    case 'list':
        handle_list($db, $user);
        break;
    default:
        json_error('Unknown watchlist action', 404);
}

function handle_toggle(PDO $db, array $user): void {
    $data = get_json_body();
    $tmdbId = (int)($data['tmdb_id'] ?? 0);
    $mediaType = $data['media_type'] ?? '';

    if (!$tmdbId || !in_array($mediaType, ['movie', 'tv'])) {
        json_error('Missing tmdb_id or media_type');
    }

    $existing = $db->prepare('SELECT id FROM watchlist WHERE profile_id = ? AND tmdb_id = ? AND media_type = ?');
    $existing->execute([$user['profile_id'], $tmdbId, $mediaType]);

    if ($existing->fetch()) {
        $db->prepare('DELETE FROM watchlist WHERE profile_id = ? AND tmdb_id = ? AND media_type = ?')
           ->execute([$user['profile_id'], $tmdbId, $mediaType]);
        json_response(['added' => false]);
    } else {
        $stmt = $db->prepare('INSERT INTO watchlist (profile_id, tmdb_id, media_type, title, poster_path, backdrop_path) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->execute([
            $user['profile_id'],
            $tmdbId,
            $mediaType,
            sanitize($data['title'] ?? ''),
            $data['poster_path'] ?? null,
            $data['backdrop_path'] ?? null,
        ]);
        json_response(['added' => true]);
    }
}

function handle_check(PDO $db, array $user): void {
    $parts = explode('/', trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/'));
    $idx = array_search('check', $parts);
    $mediaType = $idx !== false ? ($parts[$idx + 1] ?? '') : '';
    $tmdbId = $idx !== false ? (int)($parts[$idx + 2] ?? 0) : 0;

    if (!$tmdbId || !in_array($mediaType, ['movie', 'tv'])) {
        json_response(['on_watchlist' => false]);
        return;
    }

    $stmt = $db->prepare('SELECT id FROM watchlist WHERE profile_id = ? AND tmdb_id = ? AND media_type = ?');
    $stmt->execute([$user['profile_id'], $tmdbId, $mediaType]);
    json_response(['on_watchlist' => (bool)$stmt->fetch()]);
}

function handle_list(PDO $db, array $user): void {
    $stmt = $db->prepare('SELECT tmdb_id, media_type, title, poster_path, backdrop_path, added_at FROM watchlist WHERE profile_id = ? ORDER BY added_at DESC');
    $stmt->execute([$user['profile_id']]);
    $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $results = array_map(function ($item) {
        return [
            'id' => (int)$item['tmdb_id'],
            'media_type' => $item['media_type'],
            'title' => $item['title'],
            'poster_path' => $item['poster_path'],
            'backdrop_path' => $item['backdrop_path'],
            'release_date' => '',
            'added_at' => $item['added_at'],
        ];
    }, $items);

    json_response(['results' => $results]);
}
