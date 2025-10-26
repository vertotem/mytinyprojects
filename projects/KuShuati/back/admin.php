<?php
/**
 * 简单的管理工具
 * 用于生成和管理API密钥
 */

// 简单的身份验证
session_start();
$admin_password = 'admin123'; // 实际使用时应该使用更安全的密码

if ($_POST['password'] ?? '' === $admin_password) {
    $_SESSION['admin'] = true;
}

if ($_GET['logout'] ?? false) {
    session_destroy();
    header('Location: admin.php');
    exit;
}

$is_admin = $_SESSION['admin'] ?? false;

// 包含UUID管理器
require_once 'upload.php';

if ($is_admin && $_POST['action'] === 'create_key') {
    $uuidManager = new UUIDManager();
    $newKey = $uuidManager->createUUID();
    $success_message = "新API密钥已创建: " . $newKey;
}

if ($is_admin && $_POST['action'] === 'list_keys') {
    $uuidManager = new UUIDManager();
    // 这里需要添加一个公共方法来获取UUID列表
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>云端同步管理后台</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input[type="password"], input[type="text"] {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        button {
            background: #007cba;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover {
            background: #005a87;
        }
        .success {
            background: #d4edda;
            color: #155724;
            padding: 10px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .info {
            background: #d1ecf1;
            color: #0c5460;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .logout {
            float: right;
            background: #dc3545;
        }
        .logout:hover {
            background: #c82333;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>云端同步管理后台</h1>
        
        <?php if (!$is_admin): ?>
            <form method="post">
                <div class="form-group">
                    <label for="password">管理员密码:</label>
                    <input type="password" id="password" name="password" required>
                </div>
                <button type="submit">登录</button>
            </form>
        <?php else: ?>
            <div style="margin-bottom: 20px;">
                <a href="?logout=1" class="logout" style="text-decoration: none; color: white; padding: 8px 16px; border-radius: 4px;">退出登录</a>
                <div style="clear: both;"></div>
            </div>
            
            <?php if (isset($success_message)): ?>
                <div class="success"><?= htmlspecialchars($success_message) ?></div>
            <?php endif; ?>
            
            <div class="info">
                <h3>使用说明</h3>
                <p>1. 点击"生成新API密钥"创建新的访问密钥</p>
                <p>2. 将生成的密钥提供给用户用于云端同步</p>
                <p>3. 密钥存储在 <code>secret/uuid.csv</code> 文件中</p>
                <p>4. 用户数据存储在 <code>uploads/</code> 目录中</p>
            </div>
            
            <form method="post">
                <input type="hidden" name="action" value="create_key">
                <button type="submit">生成新API密钥</button>
            </form>
            
            <h3>API端点</h3>
            <div class="info">
                <p><strong>上传:</strong> POST /upload.php</p>
                <p><strong>下载:</strong> GET /upload.php?action=download&api_key=YOUR_KEY</p>
                <p><strong>测试:</strong> <a href="test.php" target="_blank">打开测试页面</a></p>
            </div>
        <?php endif; ?>
    </div>
</body>
</html>
