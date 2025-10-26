# 云端同步API文档

## 概述

本文档描述了题库系统云端同步功能所需的后端API接口规范。后端需要实现一个PHP脚本（upload.php），支持数据的上传和下载功能。

## API端点

**URL**: `https://your-domain.com/upload.php`

## 支持的操作

### 1. 上传数据 (POST)

**请求方式**: POST  
**Content-Type**: multipart/form-data

**请求参数**:
- `action` (string): 固定值 "upload"
- `api_key` (string): API密钥，用于身份验证
- `file` (file): 上传的ZIP文件，包含用户数据

**请求示例**:
```javascript
const formData = new FormData();
formData.append('file', blob, 'quiz_data.zip');
formData.append('api_key', 'your-api-key');
formData.append('action', 'upload');

fetch('https://your-domain.com/upload.php', {
    method: 'POST',
    body: formData
});
```

**成功响应**:
```json
{
    "success": true,
    "message": "数据上传成功",
    "timestamp": "2024-01-01T12:00:00Z"
}
```

**错误响应**:
```json
{
    "success": false,
    "message": "错误描述",
    "error_code": "ERROR_CODE"
}
```

### 2. 下载数据 (GET)

**请求方式**: GET

**请求参数**:
- `action` (string): 固定值 "download"
- `api_key` (string): API密钥，用于身份验证

**请求示例**:
```
GET https://your-domain.com/upload.php?action=download&api_key=your-api-key
```

**成功响应**:
- **Content-Type**: `application/zip`
- **响应体**: ZIP文件的二进制数据

**错误响应**:
```json
{
    "success": false,
    "message": "错误描述",
    "error_code": "ERROR_CODE"
}
```

## 错误代码

| 错误代码 | 描述 |
|---------|------|
| `INVALID_API_KEY` | API密钥无效 |
| `MISSING_PARAMETERS` | 缺少必需参数 |
| `FILE_UPLOAD_ERROR` | 文件上传失败 |
| `FILE_NOT_FOUND` | 文件不存在 |
| `STORAGE_ERROR` | 存储错误 |
| `INVALID_ACTION` | 无效的操作类型 |

## PHP实现示例

```php
<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// 处理预检请求
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 配置
$VALID_API_KEYS = ['your-secret-api-key-1', 'your-secret-api-key-2'];
$UPLOAD_DIR = './uploads/';
$MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// 确保上传目录存在
if (!is_dir($UPLOAD_DIR)) {
    mkdir($UPLOAD_DIR, 0755, true);
}

function sendError($message, $code = null) {
    echo json_encode([
        'success' => false,
        'message' => $message,
        'error_code' => $code
    ]);
    exit;
}

function sendSuccess($message, $data = null) {
    $response = [
        'success' => true,
        'message' => $message,
        'timestamp' => date('c')
    ];
    if ($data) {
        $response = array_merge($response, $data);
    }
    echo json_encode($response);
    exit;
}

// 验证API密钥
$apiKey = $_REQUEST['api_key'] ?? '';
if (!in_array($apiKey, $VALID_API_KEYS)) {
    sendError('无效的API密钥', 'INVALID_API_KEY');
}

$action = $_REQUEST['action'] ?? '';

switch ($action) {
    case 'upload':
        handleUpload($apiKey);
        break;
    case 'download':
        handleDownload($apiKey);
        break;
    default:
        sendError('无效的操作类型', 'INVALID_ACTION');
}

function handleUpload($apiKey) {
    global $UPLOAD_DIR, $MAX_FILE_SIZE;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError('上传操作必须使用POST方法');
    }
    
    if (!isset($_FILES['file'])) {
        sendError('未找到上传文件', 'MISSING_PARAMETERS');
    }
    
    $file = $_FILES['file'];
    
    // 检查上传错误
    if ($file['error'] !== UPLOAD_ERR_OK) {
        sendError('文件上传失败: ' . $file['error'], 'FILE_UPLOAD_ERROR');
    }
    
    // 检查文件大小
    if ($file['size'] > $MAX_FILE_SIZE) {
        sendError('文件太大，最大允许50MB');
    }
    
    // 检查文件类型
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $file['tmp_name']);
    finfo_close($finfo);
    
    if ($mimeType !== 'application/zip') {
        sendError('只允许上传ZIP文件');
    }
    
    // 生成文件名
    $fileName = 'quiz_data_' . hash('md5', $apiKey) . '.zip';
    $filePath = $UPLOAD_DIR . $fileName;
    
    // 移动文件
    if (!move_uploaded_file($file['tmp_name'], $filePath)) {
        sendError('保存文件失败', 'STORAGE_ERROR');
    }
    
    sendSuccess('数据上传成功');
}

function handleDownload($apiKey) {
    global $UPLOAD_DIR;
    
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        sendError('下载操作必须使用GET方法');
    }
    
    // 生成文件名
    $fileName = 'quiz_data_' . hash('md5', $apiKey) . '.zip';
    $filePath = $UPLOAD_DIR . $fileName;
    
    if (!file_exists($filePath)) {
        sendError('文件不存在', 'FILE_NOT_FOUND');
    }
    
    // 发送文件
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="quiz_data.zip"');
    header('Content-Length: ' . filesize($filePath));
    
    readfile($filePath);
    exit;
}
?>
```

## 安全考虑

1. **API密钥管理**
   - 使用强随机生成的API密钥
   - 定期更换API密钥
   - 不要在客户端代码中硬编码API密钥

2. **文件安全**
   - 限制上传文件大小
   - 验证文件类型
   - 使用安全的文件名生成策略
   - 定期清理过期文件

3. **访问控制**
   - 实现CORS策略
   - 限制请求频率
   - 记录访问日志

4. **数据保护**
   - 使用HTTPS传输
   - 考虑对敏感数据进行加密
   - 实现数据备份策略

## 部署说明

1. 将PHP脚本部署到支持PHP的Web服务器
2. 确保服务器支持文件上传
3. 配置适当的文件权限
4. 设置合适的PHP配置（upload_max_filesize, post_max_size等）
5. 配置HTTPS证书（推荐）

## 测试

可以使用以下工具测试API：

1. **Postman**: 测试上传和下载功能
2. **curl**: 命令行测试
3. **浏览器**: 直接访问下载链接

**curl测试示例**:
```bash
# 上传测试
curl -X POST \
  -F "action=upload" \
  -F "api_key=your-api-key" \
  -F "file=@quiz_data.zip" \
  https://your-domain.com/upload.php

# 下载测试
curl "https://your-domain.com/upload.php?action=download&api_key=your-api-key" \
  -o downloaded_data.zip
```

## 注意事项

1. 确保服务器有足够的存储空间
2. 考虑实现文件版本管理
3. 定期备份用户数据
4. 监控API使用情况
5. 实现适当的错误日志记录
