<?php
/**
 * 题库系统云端同步后端API
 * 纯PHP实现，无第三方扩展依赖
 * 支持数据上传和下载功能
 */

// 强制设置响应头 - 在任何输出之前
if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin');
    header('Access-Control-Allow-Credentials: false');
    header('Access-Control-Max-Age: 86400');
    
    // 额外的CORS头
    if (isset($_SERVER['HTTP_ORIGIN'])) {
        header('Access-Control-Allow-Origin: ' . $_SERVER['HTTP_ORIGIN']);
    }
}

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['status' => 'OK', 'message' => 'CORS preflight handled']);
    exit(0);
}

// 配置常量
define('UPLOAD_DIR', './uploads/');
define('SECRET_DIR', './secret/');
define('UUID_FILE', SECRET_DIR . 'uuid.csv');
define('MAX_FILE_SIZE', 50 * 1024 * 1024); // 50MB
define('ALLOWED_MIME_TYPES', ['application/zip', 'application/x-zip-compressed']);

// 确保必要目录存在
if (!is_dir(UPLOAD_DIR)) {
    mkdir(UPLOAD_DIR, 0755, true);
}
if (!is_dir(SECRET_DIR)) {
    mkdir(SECRET_DIR, 0755, true);
}

/**
 * UUID管理模块
 */
class UUIDManager {
    private $uuidFile;
    
    public function __construct($uuidFile = UUID_FILE) {
        $this->uuidFile = $uuidFile;
        $this->initUUIDFile();
    }
    
    /**
     * 初始化UUID文件
     */
    private function initUUIDFile() {
        if (!file_exists($this->uuidFile)) {
            $header = "uuid,created_at,last_used,status\n";
            file_put_contents($this->uuidFile, $header, LOCK_EX);
        }
    }
    
    /**
     * 生成UUID（简化版本，无需第三方扩展）
     */
    private function generateUUID() {
        $data = random_bytes(16);
        $data[6] = chr(ord($data[6]) & 0x0f | 0x40); // 版本 4
        $data[8] = chr(ord($data[8]) & 0x3f | 0x80); // 变体 RFC 4122
        
        return sprintf('%s-%s-%s-%s-%s',
            bin2hex(substr($data, 0, 4)),
            bin2hex(substr($data, 4, 2)),
            bin2hex(substr($data, 6, 2)),
            bin2hex(substr($data, 8, 2)),
            bin2hex(substr($data, 10, 6))
        );
    }
    
    /**
     * 验证UUID是否有效
     */
    public function validateUUID($uuid) {
        if (empty($uuid)) {
            return false;
        }
        
        // 读取CSV文件
        $uuids = $this->readUUIDs();
        
        foreach ($uuids as $record) {
            if ($record['uuid'] === $uuid && $record['status'] === 'active') {
                // 更新最后使用时间
                $this->updateLastUsed($uuid);
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 创建新的UUID
     */
    public function createUUID() {
        $uuid = $this->generateUUID();
        $timestamp = date('Y-m-d H:i:s');
        
        $record = sprintf("%s,%s,%s,active\n", $uuid, $timestamp, $timestamp);
        file_put_contents($this->uuidFile, $record, FILE_APPEND | LOCK_EX);
        
        return $uuid;
    }
    
    /**
     * 读取所有UUID记录
     */
    private function readUUIDs() {
        if (!file_exists($this->uuidFile)) {
            return [];
        }
        
        $lines = file($this->uuidFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $uuids = [];
        
        // 跳过表头
        for ($i = 1; $i < count($lines); $i++) {
            $data = str_getcsv($lines[$i]);
            if (count($data) >= 4) {
                $uuids[] = [
                    'uuid' => $data[0],
                    'created_at' => $data[1],
                    'last_used' => $data[2],
                    'status' => $data[3]
                ];
            }
        }
        
        return $uuids;
    }
    
    /**
     * 更新UUID最后使用时间
     */
    private function updateLastUsed($uuid) {
        $uuids = $this->readUUIDs();
        $updated = false;
        
        foreach ($uuids as &$record) {
            if ($record['uuid'] === $uuid) {
                $record['last_used'] = date('Y-m-d H:i:s');
                $updated = true;
                break;
            }
        }
        
        if ($updated) {
            $this->writeUUIDs($uuids);
        }
    }
    
    /**
     * 写入UUID记录到文件
     */
    private function writeUUIDs($uuids) {
        $content = "uuid,created_at,last_used,status\n";
        
        foreach ($uuids as $record) {
            $content .= sprintf("%s,%s,%s,%s\n",
                $record['uuid'],
                $record['created_at'],
                $record['last_used'],
                $record['status']
            );
        }
        
        file_put_contents($this->uuidFile, $content, LOCK_EX);
    }
}

/**
 * 文件处理模块
 */
class FileHandler {
    private $uploadDir;
    
    public function __construct($uploadDir = UPLOAD_DIR) {
        $this->uploadDir = $uploadDir;
    }
    
    /**
     * 处理文件上传
     */
    public function handleUpload($uuid) {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            throw new Exception('上传操作必须使用POST方法');
        }
        
        if (!isset($_FILES['file'])) {
            throw new Exception('未找到上传文件', 'MISSING_PARAMETERS');
        }
        
        $file = $_FILES['file'];
        
        // 检查上传错误
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new Exception('文件上传失败: ' . $this->getUploadErrorMessage($file['error']), 'FILE_UPLOAD_ERROR');
        }
        
        // 检查文件大小
        if ($file['size'] > MAX_FILE_SIZE) {
            throw new Exception('文件太大，最大允许50MB');
        }
        
        // 检查文件类型
        if (!$this->isValidZipFile($file['tmp_name'])) {
            throw new Exception('只允许上传ZIP文件');
        }
        
        // 生成文件名
        $fileName = 'quiz_data_' . hash('md5', $uuid) . '.zip';
        $filePath = $this->uploadDir . $fileName;
        
        // 移动文件
        if (!move_uploaded_file($file['tmp_name'], $filePath)) {
            throw new Exception('保存文件失败', 'STORAGE_ERROR');
        }
        
        return $fileName;
    }
    
    /**
     * 处理文件下载
     */
    public function handleDownload($uuid) {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            throw new Exception('下载操作必须使用GET方法');
        }
        
        // 生成文件名
        $fileName = 'quiz_data_' . hash('md5', $uuid) . '.zip';
        $filePath = $this->uploadDir . $fileName;
        
        if (!file_exists($filePath)) {
            throw new Exception('文件不存在', 'FILE_NOT_FOUND');
        }
        
        // 发送文件
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="quiz_data.zip"');
        header('Content-Length: ' . filesize($filePath));
        
        readfile($filePath);
        exit;
    }
    
    /**
     * 验证是否为有效的ZIP文件
     */
    private function isValidZipFile($filePath) {
        // 检查文件头
        $handle = fopen($filePath, 'rb');
        if (!$handle) {
            return false;
        }
        
        $header = fread($handle, 4);
        fclose($handle);
        
        // ZIP文件头标识: PK\x03\x04 或 PK\x05\x06 或 PK\x07\x08
        return substr($header, 0, 2) === 'PK';
    }
    
    /**
     * 获取上传错误信息
     */
    private function getUploadErrorMessage($errorCode) {
        $errors = [
            UPLOAD_ERR_INI_SIZE => '文件大小超过php.ini中upload_max_filesize的限制',
            UPLOAD_ERR_FORM_SIZE => '文件大小超过表单中MAX_FILE_SIZE的限制',
            UPLOAD_ERR_PARTIAL => '文件只有部分被上传',
            UPLOAD_ERR_NO_FILE => '没有文件被上传',
            UPLOAD_ERR_NO_TMP_DIR => '找不到临时文件夹',
            UPLOAD_ERR_CANT_WRITE => '文件写入失败',
            UPLOAD_ERR_EXTENSION => '文件上传被扩展程序阻止'
        ];
        
        return isset($errors[$errorCode]) ? $errors[$errorCode] : '未知上传错误';
    }
}

/**
 * 响应处理模块
 */
class ResponseHandler {
    /**
     * 发送错误响应
     */
    public static function sendError($message, $code = null) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'message' => $message,
            'error_code' => $code
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
    
    /**
     * 发送成功响应
     */
    public static function sendSuccess($message, $data = null) {
        $response = [
            'success' => true,
            'message' => $message,
            'timestamp' => date('c')
        ];
        
        if ($data) {
            $response = array_merge($response, $data);
        }
        
        echo json_encode($response, JSON_UNESCAPED_UNICODE);
        exit;
    }
}

/**
 * 主控制器
 */
class CloudSyncController {
    private $uuidManager;
    private $fileHandler;
    
    public function __construct() {
        $this->uuidManager = new UUIDManager();
        $this->fileHandler = new FileHandler();
    }
    
    /**
     * 处理请求
     */
    public function handleRequest() {
        try {
            // 获取参数
            $action = $_REQUEST['action'] ?? '';
            
            // 验证必需参数
            if (empty($action)) {
                ResponseHandler::sendError('缺少action参数', 'MISSING_PARAMETERS');
            }
            
            // 处理不同操作
            switch ($action) {
                case 'upload':
                case 'download':
                    // 这些操作需要API密钥
                    $apiKey = $_REQUEST['api_key'] ?? '';
                    if (empty($apiKey)) {
                        ResponseHandler::sendError('缺少api_key参数', 'MISSING_PARAMETERS');
                    }
                    
                    // 验证API密钥（UUID）
                    if (!$this->uuidManager->validateUUID($apiKey)) {
                        ResponseHandler::sendError('无效的API密钥', 'INVALID_API_KEY');
                    }
                    
                    if ($action === 'upload') {
                        $this->handleUploadAction($apiKey);
                    } else {
                        $this->handleDownloadAction($apiKey);
                    }
                    break;
                case 'create_key':
                    // 创建密钥操作不需要api_key，使用admin_key
                    $this->handleCreateKeyAction();
                    break;
                default:
                    ResponseHandler::sendError('无效的操作类型', 'INVALID_ACTION');
            }
            
        } catch (Exception $e) {
            $code = $e->getCode() ? $e->getCode() : null;
            ResponseHandler::sendError($e->getMessage(), $code);
        }
    }
    
    /**
     * 处理上传操作
     */
    private function handleUploadAction($apiKey) {
        $fileName = $this->fileHandler->handleUpload($apiKey);
        ResponseHandler::sendSuccess('数据上传成功', ['filename' => $fileName]);
    }
    
    /**
     * 处理下载操作
     */
    private function handleDownloadAction($apiKey) {
        $this->fileHandler->handleDownload($apiKey);
    }
    
    /**
     * 处理创建密钥操作（管理员功能）
     */
    private function handleCreateKeyAction() {
        // 简单的管理员验证（可以根据需要增强）
        $adminKey = $_REQUEST['admin_key'] ?? '';
        
        if (empty($adminKey)) {
            ResponseHandler::sendError('缺少admin_key参数', 'MISSING_ADMIN_KEY');
        }
        
        if ($adminKey !== 'admin123') { // 实际使用时应该使用更安全的验证
            ResponseHandler::sendError('无权限创建API密钥', 'UNAUTHORIZED');
        }
        
        $newUUID = $this->uuidManager->createUUID();
        ResponseHandler::sendSuccess('API密钥创建成功', ['api_key' => $newUUID]);
    }
}

// 错误处理
set_error_handler(function($severity, $message, $file, $line) {
    if (error_reporting() & $severity) {
        ResponseHandler::sendError("系统错误: $message", 'SYSTEM_ERROR');
    }
});

set_exception_handler(function($exception) {
    ResponseHandler::sendError("未处理的异常: " . $exception->getMessage(), 'UNHANDLED_EXCEPTION');
});

// 启动应用
$controller = new CloudSyncController();
$controller->handleRequest();
?>
