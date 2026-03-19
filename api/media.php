<?php
require_once APP_ROOT . '/includes/db.php';

$action = $_GET['action'] ?? '';

switch ($action) {
    case 'stream':
        handle_stream();
        break;
    case 'progress':
        require_method('POST');
        handle_progress();
        break;
    case 'resume':
        handle_resume();
        break;
    default:
        json_error('Unknown media action', 404);
}

function handle_stream(): void {
    $user = check_profile();
    $downloadId = $_GET['param'] ?? '';
    if (!$downloadId) json_error('Download ID required');

    $db = get_db();
    $stmt = $db->prepare("SELECT * FROM downloads WHERE id = ? AND status = 'completed'");
    $stmt->execute([$downloadId]);
    $dl = $stmt->fetch();

    if (!$dl) json_error('Download not found or not completed', 404);

    $filePath = $dl['file_path'];
    if (!$filePath || !file_exists($filePath)) {
        // Try to locate the file in the download directory
        $configFile = APP_ROOT . '/config/config.php';
        if (file_exists($configFile)) require_once $configFile;

        $downloadDir = get_setting($db, 'download_dir', './');
        $possiblePaths = glob($downloadDir . '/**/' . basename($filePath ?: ''), GLOB_NOSORT);
        if ($possiblePaths) {
            $filePath = $possiblePaths[0];
            $db->prepare('UPDATE downloads SET file_path = ? WHERE id = ?')->execute([$filePath, $dl['id']]);
        } else {
            json_error('File not found on disk', 404);
        }
    }

    $fileSize = filesize($filePath);
    $mimeType = detect_video_mime($filePath);

    // Log watch activity
    try {
        $stmt = $db->prepare('INSERT INTO watch_history (profile_id, download_id, last_watched) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_watched = NOW()');
        $stmt->execute([$user['profile_id'], $dl['id']]);
    } catch (Exception $e) {}

    // Handle Range requests for seeking
    $start = 0;
    $end = $fileSize - 1;
    $length = $fileSize;

    if (isset($_SERVER['HTTP_RANGE'])) {
        preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches);
        $start = $matches[1] !== '' ? intval($matches[1]) : 0;
        $end = $matches[2] !== '' ? intval($matches[2]) : $fileSize - 1;

        if ($start > $end || $start >= $fileSize) {
            http_response_code(416);
            header("Content-Range: bytes */$fileSize");
            exit;
        }

        $length = $end - $start + 1;
        http_response_code(206);
        header("Content-Range: bytes $start-$end/$fileSize");
    } else {
        http_response_code(200);
    }

    header("Content-Type: $mimeType");
    header("Content-Length: $length");
    header('Accept-Ranges: bytes');
    header('Cache-Control: no-cache');
    header('Content-Disposition: inline');

    $fp = fopen($filePath, 'rb');
    if ($start > 0) fseek($fp, $start);

    $bufferSize = 1024 * 512; // 512KB chunks
    $remaining = $length;

    while (!feof($fp) && $remaining > 0 && !connection_aborted()) {
        $read = min($bufferSize, $remaining);
        echo fread($fp, $read);
        $remaining -= $read;
        flush();
    }

    fclose($fp);
    exit;
}

function handle_progress(): void {
    $user = check_profile();
    $data = get_json_body();

    if (empty($data['download_id'])) json_error('download_id required');

    $db = get_db();
    $stmt = $db->prepare('INSERT INTO watch_history (profile_id, download_id, progress_seconds, duration_seconds, last_watched) VALUES (?, ?, ?, ?, NOW()) ON DUPLICATE KEY UPDATE progress_seconds = ?, duration_seconds = ?, last_watched = NOW()');
    $stmt->execute([
        $user['profile_id'],
        $data['download_id'],
        $data['progress'] ?? 0,
        $data['duration'] ?? 0,
        $data['progress'] ?? 0,
        $data['duration'] ?? 0,
    ]);

    json_response(['success' => true]);
}

function handle_resume(): void {
    $user = check_profile();
    $downloadId = $_GET['param'] ?? '';
    if (!$downloadId) json_error('Download ID required');

    $db = get_db();
    $stmt = $db->prepare('SELECT progress_seconds, duration_seconds FROM watch_history WHERE profile_id = ? AND download_id = ?');
    $stmt->execute([$user['profile_id'], $downloadId]);
    $row = $stmt->fetch();

    json_response([
        'progress' => $row ? (int)$row['progress_seconds'] : 0,
        'duration' => $row ? (int)$row['duration_seconds'] : 0,
    ]);
}

function detect_video_mime(string $path): string {
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    return match ($ext) {
        'mp4', 'm4v' => 'video/mp4',
        'mkv' => 'video/x-matroska',
        'avi' => 'video/x-msvideo',
        'webm' => 'video/webm',
        'mov' => 'video/quicktime',
        'wmv' => 'video/x-ms-wmv',
        'flv' => 'video/x-flv',
        'ts' => 'video/mp2t',
        default => 'video/mp4',
    };
}
