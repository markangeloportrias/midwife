<?php
declare(strict_types=1);

return [
    'database' => [
        'host' => getenv('THESIS_DB_HOST') ?: '127.0.0.1',
        'port' => getenv('THESIS_DB_PORT') ?: '3306',
        'name' => getenv('THESIS_DB_NAME') ?: 'thesis_portal',
        'user' => getenv('THESIS_DB_USER') ?: 'root',
        'password' => getenv('THESIS_DB_PASSWORD') ?: '',
    ],
    'session_hours' => 12,
];

