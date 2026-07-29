<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'message' => 'Permanent deletion is disabled. Use an archive endpoint.']);
    exit;
}

try {
    $db = $config['database'];
    $pdo = new PDO(
        "mysql:host={$db['host']};port={$db['port']};dbname={$db['name']};charset=utf8mb4",
        $db['user'],
        $db['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'message' => 'Database connection failed.']);
    exit;
}

function ensureCaseCommentsTable(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS case_comments (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        case_id INT UNSIGNED NOT NULL,
        author_uid VARCHAR(80) NULL,
        author_name VARCHAR(255) NOT NULL,
        author_role ENUM('instructor','admin') NOT NULL DEFAULT 'instructor',
        comment_text TEXT NOT NULL,
        source_key VARCHAR(120) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        archived_at DATETIME NULL,
        archived_by VARCHAR(80) NULL,
        UNIQUE KEY uq_case_comments_source (source_key),
        INDEX idx_case_comments_case (case_id, archived_at, created_at),
        CONSTRAINT fk_case_comments_case FOREIGN KEY (case_id) REFERENCES case_records(id)
          ON UPDATE CASCADE ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

ensureCaseCommentsTable($pdo);
function input(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $_POST;
}

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function requireFields(array $data, array $fields): void
{
    foreach ($fields as $field) {
        if (!isset($data[$field]) || trim((string)$data[$field]) === '') {
            respond(['ok' => false, 'message' => "$field is required."], 422);
        }
    }
}

function passwordMatches(string $plain, string $stored): bool
{
    return password_verify($plain, $stored) || hash_equals($stored, $plain);
}

function bearerToken(): string
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    return preg_match('/^Bearer\s+(.+)$/i', $header, $match) ? trim($match[1]) : '';
}

function currentUser(PDO $pdo, array $roles = []): array
{
    $token = bearerToken();
    if ($token === '') respond(['ok' => false, 'message' => 'Authentication required.'], 401);
    $hash = hash('sha256', $token);
    $stmt = $pdo->prepare('SELECT role, user_uid, expires_at FROM api_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()');
    $stmt->execute([$hash]);
    $user = $stmt->fetch();
    if (!$user) respond(['ok' => false, 'message' => 'Session is invalid or expired.'], 401);
    if ($roles && !in_array($user['role'], $roles, true)) respond(['ok' => false, 'message' => 'Access denied.'], 403);
    return $user;
}

function createSession(PDO $pdo, string $role, string $uid, int $hours): string
{
    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare('INSERT INTO api_sessions (token_hash, role, user_uid, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))');
    $stmt->execute([hash('sha256', $token), $role, $uid, $hours]);
    return $token;
}

function audit(PDO $pdo, array $user, string $action, string $entity, string $entityId = '', array $details = []): void
{
    $stmt = $pdo->prepare('INSERT INTO audit_trail (actor_role, actor_uid, action_name, entity_type, entity_uid, details) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->execute([$user['role'], $user['user_uid'], $action, $entity, $entityId, json_encode($details)]);
}

function pathParts(): array
{
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?: '';
    $marker = '/api/';
    $position = strpos($path, $marker);
    $path = $position === false ? trim($path, '/') : substr($path, $position + strlen($marker));
    return array_values(array_filter(explode('/', trim($path, '/')), 'strlen'));
}

