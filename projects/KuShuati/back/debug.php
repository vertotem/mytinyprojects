<?php
/**
 * 简单的调试脚本
 * 用于测试服务器基本功能
 */

// 设置响应头
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Access-Control-Max-Age: 86400');

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// 基本信息
$debug_info = [
    'success' => true,
    'message' => '服务器运行正常',
    'timestamp' => date('c'),
    'server_info' => [
        'php_version' => phpversion(),
        'request_method' => $_SERVER['REQUEST_METHOD'],
        'request_uri' => $_SERVER['REQUEST_URI'] ?? 'N/A',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'N/A',
        'remote_addr' => $_SERVER['REMOTE_ADDR'] ?? 'N/A'
    ],
    'post_data' => $_POST,
    'get_data' => $_GET,
    'files' => $_FILES
];

// 检查目录权限
$upload_dir = './uploads/';
$secret_dir = './secret/';

$debug_info['directory_check'] = [
    'upload_dir_exists' => is_dir($upload_dir),
    'upload_dir_writable' => is_writable($upload_dir),
    'secret_dir_exists' => is_dir($secret_dir),
    'secret_dir_writable' => is_writable($secret_dir)
];

// 输出调试信息
echo json_encode($debug_info, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
?>
