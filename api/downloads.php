<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'start':
        require_method('POST');
        handle_start();
        break;
    case 'status':
        handle_status();
        break;
    case 'list':
        handle_list();
        break;
    case 'library':
        handle_library();
        break;
    case 'cancel':
        require_method('POST');
        handle_cancel();
        break;
    case 'delete':
        require_method('POST');
        handle_delete();
        break;
    default:
        json_error('Unknown downloads action', 404);
}

function get_cli_settings(): array {
    $db = get_db();
    $keys = ['rd_key', 'service_url', 'movies_dir', 'tv_dir', 'quality_default', 'proxy', 'sftp_host', 'sftp_port', 'sftp_user', 'sftp_pass', 'sftp_path'];
    $settings = [];
    foreach ($keys as $k) {
        $settings[$k] = get_setting($db, $k, '') ?? '';
    }
    return $settings;
}

function build_output_path(array $data, array $settings): string {
    $title = preg_replace('/[<>:"\/\\\\|?*]/', '-', trim($data['title'] ?? 'Unknown'));
    $title = preg_replace('/\s+/', ' ', $title);
    $tmdbId = $data['tmdb_id'] ?? '';
    $year = $data['year'] ?? date('Y');
    $isMovie = ($data['media_type'] ?? '') === 'movie';

    if ($isMovie) {
        $base = rtrim($settings['movies_dir'] ?: '/home/media_lib/Movies', '/');
        return $base . '/' . $title . ' (' . $year . ') [' . $tmdbId . '].mkv';
    }

    $base = rtrim($settings['tv_dir'] ?: '/home/media_lib/TV Shows', '/');
    $season = (int)($data['season'] ?? 0);
    $episode = (int)($data['episode'] ?? 0);
    $epTitle = $data['episode_title'] ?? 'Episode ' . $episode;
    $epTitle = preg_replace('/[<>:"\/\\\\|?*]/', '-', trim($epTitle));
    $epTitle = preg_replace('/\s+/', ' ', $epTitle);
    $showDir = $title . ' [' . $tmdbId . ']';
    $seasonDir = 'Season ' . $season;
    $filename = $title . ' - S' . sprintf('%02d', $season) . 'E' . sprintf('%02d', $episode) . ' - ' . $epTitle . ' [' . $tmdbId . '].mkv';
    return $base . '/' . $showDir . '/' . $seasonDir . '/' . $filename;
}

function build_cli_command(array $data, array $settings): string {
    $binary = defined('BINARY_PATH') ? BINARY_PATH : APP_ROOT . '/media-downloader';
    $cmd = escapeshellarg($binary);

    $cmd .= ' --rd-key ' . escapeshellarg($settings['rd_key']);
    $cmd .= ' --service-url ' . escapeshellarg($settings['service_url']);

    $quality = $data['quality'] ?: ($settings['quality_default'] ?: '1080p');
    $cmd .= ' --quality ' . escapeshellarg($quality);

    $cmd .= ' --type ' . escapeshellarg($data['media_type']);
    $cmd .= ' --tmdb-id ' . escapeshellarg($data['tmdb_id']);

    if (!empty($data['season']) && !empty($data['episode'])) {
        $cmd .= ' --season ' . escapeshellarg($data['season']);
        $cmd .= ' --episode ' . escapeshellarg($data['episode']);
    } elseif (!empty($data['season'])) {
        $cmd .= ' --season ' . escapeshellarg($data['season']);
    }

    $outputPath = build_output_path($data, $settings);
    $cmd .= ' --output-path ' . escapeshellarg($outputPath);

    if ($settings['proxy']) {
        $cmd .= ' --proxy ' . escapeshellarg($settings['proxy']);
    }

    if ($settings['sftp_host']) {
        $cmd .= ' --sftp-host ' . escapeshellarg($settings['sftp_host']);
        $cmd .= ' --sftp-port ' . escapeshellarg($settings['sftp_port'] ?: '22');
        $cmd .= ' --sftp-user ' . escapeshellarg($settings['sftp_user']);
        $cmd .= ' --sftp-pass ' . escapeshellarg($settings['sftp_pass']);
        if ($settings['sftp_path']) {
            $cmd .= ' --sftp-path ' . escapeshellarg($settings['sftp_path']);
        }
    }

    return $cmd;
}

function handle_start(): void {
    $user = check_profile();
    $data = get_json_body();

    if (empty($data['tmdb_id']) || empty($data['media_type'])) {
        json_error('tmdb_id and media_type required');
    }

    $db = get_db();
    $settings = get_cli_settings();

    // For a full season download (no episode specified), fetch episode list from TMDB and queue each
    if ($data['media_type'] === 'tv' && !empty($data['season']) && empty($data['episode'])) {
        $key = get_setting($db, 'tmdb_api_key', '');
        $seasonNum = intval($data['season']);
        $url = "https://api.themoviedb.org/3/tv/{$data['tmdb_id']}/season/{$seasonNum}";
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => ["Authorization: Bearer $key", "Accept: application/json"],
        ]);
        $resp = json_decode(curl_exec($ch), true);
        curl_close($ch);
        $episodes = $resp['episodes'] ?? [];

        $queued = 0;
        foreach ($episodes as $ep) {
            $epData = $data;
            $epData['episode'] = $ep['episode_number'];
            $epData['episode_title'] = $ep['name'] ?? '';
            queue_single_download($db, $user, $epData, $settings);
            $queued++;
        }

        json_response(['success' => true, 'message' => "Queued $queued episodes", 'queued' => $queued]);
        return;
    }

    $dlId = queue_single_download($db, $user, $data, $settings);
    json_response(['success' => true, 'download_id' => $dlId]);
}

function queue_single_download(PDO $db, array $user, array $data, array $settings): int {
    $season = $data['season'] ?? null;
    $episode = $data['episode'] ?? null;

    // Check for existing completed/active download of same media
    if ($season !== null && $episode !== null) {
        $check = $db->prepare("SELECT id, status FROM downloads WHERE tmdb_id = ? AND media_type = ? AND season = ? AND episode = ? ORDER BY created_at DESC LIMIT 1");
        $check->execute([$data['tmdb_id'], $data['media_type'], $season, $episode]);
    } else {
        $check = $db->prepare("SELECT id, status FROM downloads WHERE tmdb_id = ? AND media_type = ? AND season IS NULL AND episode IS NULL ORDER BY created_at DESC LIMIT 1");
        $check->execute([$data['tmdb_id'], $data['media_type']]);
    }
    $existing = $check->fetch();

    if ($existing && in_array($existing['status'], ['queued', 'downloading'])) {
        return (int)$existing['id'];
    }

    if ($existing && $existing['status'] === 'completed') {
        $db->prepare("UPDATE downloads SET profile_id = ?, quality = ?, status = 'queued', pid = NULL, progress = 0, file_path = NULL, file_size = 0, started_at = NULL, completed_at = NULL, created_at = NOW() WHERE id = ?")
           ->execute([$user['profile_id'], $data['quality'] ?? '1080p', $existing['id']]);
        $dlId = (int)$existing['id'];
    } else {
        $stmt = $db->prepare('INSERT INTO downloads (profile_id, tmdb_id, media_type, title, poster_path, backdrop_path, season, episode, episode_title, quality, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
        $stmt->execute([
            $user['profile_id'],
            $data['tmdb_id'],
            $data['media_type'],
            $data['title'] ?? '',
            $data['poster_path'] ?? null,
            $data['backdrop_path'] ?? null,
            $season,
            $episode,
            $data['episode_title'] ?? null,
            $data['quality'] ?? '1080p',
            'queued',
        ]);
        $dlId = (int)$db->lastInsertId();
    }

    log_activity($db, $user['user_id'], $user['profile_id'], 'download_start', json_encode([
        'title' => $data['title'],
        'tmdb_id' => $data['tmdb_id'],
        'type' => $data['media_type'],
        'season' => $data['season'] ?? null,
        'episode' => $data['episode'] ?? null,
    ]));

    // Build and launch CLI in background
    $cmd = build_cli_command($data, $settings);
    $logFile = sys_get_temp_dir() . "/iris-dl-{$dlId}.log";
    $fullCmd = "nohup $cmd > " . escapeshellarg($logFile) . " 2>&1 & echo $!";

    $pid = trim(shell_exec($fullCmd) ?? '');

    $db->prepare('UPDATE downloads SET pid = ?, status = ?, started_at = NOW() WHERE id = ?')
       ->execute([$pid ?: null, 'downloading', $dlId]);

    return $dlId;
}

function handle_status(): void {
    check_profile();
    $type = $_GET['param'] ?? '';
    $tmdbId = $_GET['id'] ?? '';

    // URL pattern: /api/downloads/status/movie/640 or /api/downloads/status/tv/1399
    $parts = explode('/', trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/'));
    $idx = array_search('status', $parts);
    if ($idx !== false) {
        $type = $parts[$idx + 1] ?? '';
        $tmdbId = $parts[$idx + 2] ?? '';
    }

    if (!$type || !$tmdbId) json_error('Type and ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT id, pid, status, season, episode, progress, file_path, file_size FROM downloads WHERE tmdb_id = ? AND media_type = ? ORDER BY created_at DESC');
    $stmt->execute([$tmdbId, $type]);
    $downloads = $stmt->fetchAll();

    // Update status for active downloads
    foreach ($downloads as &$dl) {
        if (in_array($dl['status'], ['downloading', 'queued'])) {
            $dl = refresh_download_status($db, $dl);
        }
    }

    json_response(['downloads' => $downloads]);
}

function refresh_download_status(PDO $db, array $dl): array {
    $pid = $dl['pid'] ?? null;
    $logFile = sys_get_temp_dir() . "/iris-dl-{$dl['id']}.log";
    $log = file_exists($logFile) ? file_get_contents($logFile) : '';

    $processRunning = $pid && @posix_kill((int)$pid, 0);

    $filePath = $dl['file_path'] ?? '';
    if (!$filePath && preg_match('/Downloading to:\s*(.+)/i', $log, $m)) {
        $filePath = trim($m[1]);
    }
    if (!$filePath && preg_match('/Download completed:\s*(.+)/i', $log, $m)) {
        $filePath = trim($m[1]);
    }

    if ($processRunning) {
        $progress = 0;
        if (preg_match_all('/(\d+)\s*%/', $log, $matches)) {
            $progress = (int)end($matches[1]);
            if ($progress > 100) $progress = 100;
        }

        $fileSize = 0;
        $totalSize = 0;
        if (preg_match_all('/\(([\d.]+)\s*\/\s*([\d.]+)\s*[MG]B/', $log, $sizeMatches)) {
            $lastIdx = count($sizeMatches[0]) - 1;
            $downloaded = (float)$sizeMatches[1][$lastIdx];
            $total = (float)$sizeMatches[2][$lastIdx];
            $unit = 1024 * 1024;
            if (strpos($sizeMatches[0][$lastIdx], 'GB') !== false) $unit = 1024 * 1024 * 1024;
            $fileSize = (int)($downloaded * $unit);
            $totalSize = (int)($total * $unit);
        }

        $statusText = 'downloading';
        if (preg_match('/Looking up media information/', $log) && !preg_match('/Downloading to:/', $log)) {
            $statusText = 'resolving';
        }

        $db->prepare('UPDATE downloads SET progress = ?, file_path = ?, file_size = ?, status = ? WHERE id = ?')
           ->execute([$progress, $filePath ?: null, $fileSize, 'downloading', $dl['id']]);

        $dl['progress'] = $progress;
        $dl['file_path'] = $filePath;
        $dl['file_size'] = $fileSize;
        $dl['total_size'] = $totalSize;
        $dl['status_text'] = $statusText;
    } else if ($pid) {
        $completed = strpos($log, 'Download completed') !== false;
        $failed = preg_match('/Download failed:|failed to download|fatal/i', $log);
        $newStatus = $completed ? 'completed' : ($failed ? 'failed' : 'completed');

        $fileSize = 0;
        if ($filePath && file_exists($filePath)) {
            $fileSize = filesize($filePath);
        }

        if (!$filePath && !$completed) $newStatus = 'failed';

        $db->prepare('UPDATE downloads SET status = ?, file_path = ?, file_size = ?, progress = ?, completed_at = NOW() WHERE id = ?')
           ->execute([$newStatus, $filePath ?: null, $fileSize, $newStatus === 'completed' ? 100 : 0, $dl['id']]);

        $dl['status'] = $newStatus;
        $dl['file_path'] = $filePath;
        $dl['file_size'] = $fileSize;
        $dl['progress'] = $newStatus === 'completed' ? 100 : 0;
        $dl['log_tail'] = substr($log, -500);
    }

    return $dl;
}

function handle_list(): void {
    check_profile();
    $db = get_db();

    $downloads = $db->query('SELECT * FROM downloads ORDER BY created_at DESC LIMIT 200')->fetchAll();

    foreach ($downloads as &$dl) {
        if (in_array($dl['status'], ['downloading', 'queued'])) {
            $dl = refresh_download_status($db, $dl);
        }
    }

    // Group TV episodes by show; movies stay as individual entries
    $grouped = [];
    $tv_groups = [];

    foreach ($downloads as $dl) {
        if ($dl['media_type'] === 'tv') {
            $key = $dl['tmdb_id'];
            if (!isset($tv_groups[$key])) {
                $tv_groups[$key] = [
                    'id' => $dl['id'],
                    'tmdb_id' => $dl['tmdb_id'],
                    'media_type' => 'tv',
                    'title' => $dl['title'],
                    'poster_path' => $dl['poster_path'],
                    'backdrop_path' => $dl['backdrop_path'],
                    'quality' => $dl['quality'],
                    'created_at' => $dl['created_at'],
                    'episodes' => [],
                    'episode_count' => 0,
                    'status' => 'completed',
                ];
            }
            $tv_groups[$key]['episodes'][] = [
                'id' => $dl['id'],
                'season' => $dl['season'],
                'episode' => $dl['episode'],
                'episode_title' => $dl['episode_title'],
                'status' => $dl['status'],
                'progress' => $dl['progress'],
                'file_size' => $dl['file_size'],
                'file_path' => $dl['file_path'],
            ];
            $tv_groups[$key]['episode_count']++;
            // Show-level status: downloading > queued > failed > completed
            $ep_status = $dl['status'];
            $grp_status = $tv_groups[$key]['status'];
            if ($ep_status === 'downloading') $tv_groups[$key]['status'] = 'downloading';
            elseif ($ep_status === 'queued' && $grp_status !== 'downloading') $tv_groups[$key]['status'] = 'queued';
            elseif ($ep_status === 'failed' && !in_array($grp_status, ['downloading', 'queued'])) $tv_groups[$key]['status'] = 'failed';
            // Keep earliest created_at for ordering
            if ($dl['created_at'] > $tv_groups[$key]['created_at']) {
                $tv_groups[$key]['created_at'] = $dl['created_at'];
            }
        } else {
            $grouped[] = $dl;
        }
    }

    foreach ($tv_groups as $grp) {
        $grouped[] = $grp;
    }

    usort($grouped, fn($a, $b) => strtotime($b['created_at']) - strtotime($a['created_at']));

    json_response(['downloads' => array_values($grouped)]);
}

function handle_library(): void {
    $db = get_db();
    $results = $db->query("SELECT id, tmdb_id, media_type, title, poster_path, backdrop_path, status, quality, file_path, season, episode FROM downloads WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 100")->fetchAll();

    // Deduplicate: one card per tmdb_id
    $seen = [];
    $formatted = [];
    foreach ($results as $d) {
        $key = $d['media_type'] . '_' . $d['tmdb_id'];
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $formatted[] = [
            'id' => $d['tmdb_id'],
            'download_id' => $d['id'],
            'title' => $d['title'],
            'poster_path' => $d['poster_path'],
            'backdrop_path' => $d['backdrop_path'],
            'media_type' => $d['media_type'],
            'release_date' => '',
            'vote_average' => 0,
            'status' => 'completed',
        ];
    }

    json_response(['results' => $formatted]);
}

function handle_cancel(): void {
    $user = check_profile();
    $data = get_json_body();
    if (empty($data['id'])) json_error('Download ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT * FROM downloads WHERE id = ? AND profile_id = ?');
    $stmt->execute([$data['id'], $user['profile_id']]);
    $dl = $stmt->fetch();
    if (!$dl) json_error('Download not found', 404);

    if ($dl['pid'] && posix_kill((int)$dl['pid'], 0)) {
        posix_kill((int)$dl['pid'], SIGTERM);
    }

    $db->prepare("UPDATE downloads SET status = 'failed', completed_at = NOW() WHERE id = ?")
       ->execute([$dl['id']]);

    json_response(['success' => true]);
}

function handle_delete(): void {
    $user = check_profile();
    $data = get_json_body();
    if (empty($data['id'])) json_error('Download ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT * FROM downloads WHERE id = ? AND profile_id = ?');
    $stmt->execute([$data['id'], $user['profile_id']]);
    $dl = $stmt->fetch();
    if (!$dl) json_error('Download not found', 404);

    if ($dl['file_path'] && file_exists($dl['file_path'])) {
        @unlink($dl['file_path']);
    }

    $db->prepare('DELETE FROM downloads WHERE id = ?')->execute([$dl['id']]);

    json_response(['success' => true]);
}
