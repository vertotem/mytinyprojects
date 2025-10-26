# 题库系统云端同步后端

## 概述

这是一个纯PHP实现的云端同步后端，无需任何第三方扩展，支持题库数据的上传和下载功能。

## 文件结构

```
back/
├── upload.php          # 主API文件
├── admin.php           # 管理后台
├── test.php            # 测试工具
├── README.md           # 说明文档
├── secret/
│   └── uuid.csv        # UUID存储文件
└── uploads/            # 上传文件存储目录（自动创建）
```

## 功能特性

- **纯PHP实现**: 无需任何第三方扩展或库
- **UUID管理**: 使用CSV文件存储和管理API密钥
- **文件安全**: 严格的文件类型和大小验证
- **模块化设计**: 代码结构清晰，易于维护
- **完整的错误处理**: 详细的错误信息和状态码
- **管理界面**: 简单易用的管理后台
- **测试工具**: 完整的API测试界面

## API接口

### 1. 上传数据
- **URL**: `POST /upload.php`
- **参数**:
  - `action`: "upload"
  - `api_key`: API密钥
  - `file`: ZIP文件
- **响应**: JSON格式的成功或错误信息

### 2. 下载数据
- **URL**: `GET /upload.php?action=download&api_key=YOUR_KEY`
- **响应**: ZIP文件或JSON错误信息

### 3. 创建API密钥（管理员功能）
- **URL**: `POST /upload.php`
- **参数**:
  - `action`: "create_key"
  - `admin_key`: 管理员密钥（默认: admin123）
- **响应**: 新生成的API密钥

## 安装部署

1. **上传文件**: 将整个`back`文件夹上传到Web服务器
2. **设置权限**: 确保PHP可以读写`secret`和`uploads`目录
3. **配置PHP**: 确保以下配置满足要求：
   ```ini
   upload_max_filesize = 50M
   post_max_size = 50M
   max_execution_time = 300
   ```
4. **访问管理后台**: 打开`admin.php`生成API密钥

## 使用方法

### 管理员操作

1. 访问 `admin.php`
2. 使用默认密码 `admin123` 登录
3. 点击"生成新API密钥"创建密钥
4. 将密钥提供给用户

### 用户配置

1. 在题库系统设置页面配置：
   - 上传URL: `https://your-domain.com/back/upload.php`
   - API密钥: 管理员提供的密钥
2. 使用云端同步功能上传/下载数据

### 测试验证

1. 访问 `test.php`
2. 生成测试API密钥
3. 测试文件上传和下载功能

## 安全配置

### 1. 修改管理员密码
编辑 `admin.php` 和 `upload.php` 中的管理员密码：
```php
$admin_password = 'your_secure_password';
```

### 2. 配置HTTPS
强烈建议使用HTTPS来保护数据传输：
```apache
# .htaccess
RewriteEngine On
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]
```

### 3. 限制文件访问
在 `secret` 目录添加 `.htaccess` 文件：
```apache
Deny from all
```

### 4. 定期清理
建议定期清理过期的上传文件和无效的UUID记录。

## 错误代码

| 错误代码 | 描述 |
|---------|------|
| `INVALID_API_KEY` | API密钥无效 |
| `MISSING_PARAMETERS` | 缺少必需参数 |
| `FILE_UPLOAD_ERROR` | 文件上传失败 |
| `FILE_NOT_FOUND` | 文件不存在 |
| `STORAGE_ERROR` | 存储错误 |
| `INVALID_ACTION` | 无效的操作类型 |
| `UNAUTHORIZED` | 无权限操作 |

## 技术实现

### UUID生成
使用PHP内置的`random_bytes()`函数生成符合RFC 4122标准的UUID v4。

### 文件验证
- 检查文件头标识（PK）验证ZIP格式
- 限制文件大小（默认50MB）
- 验证MIME类型

### 数据存储
- UUID存储在CSV文件中，包含创建时间、最后使用时间和状态
- 上传文件使用UUID的MD5哈希命名，避免冲突

### 错误处理
- 全局错误处理器捕获所有错误
- 详细的错误日志和用户友好的错误信息

## 维护建议

1. **定期备份**: 备份`secret/uuid.csv`和`uploads/`目录
2. **监控日志**: 检查PHP错误日志和访问日志
3. **清理文件**: 定期清理过期的上传文件
4. **更新密钥**: 定期更换管理员密码和API密钥
5. **性能监控**: 监控磁盘空间和服务器性能

## 故障排除

### 常见问题

1. **文件上传失败**
   - 检查PHP配置中的上传限制
   - 确认目录权限设置正确
   - 检查磁盘空间是否充足

2. **API密钥无效**
   - 确认UUID格式正确
   - 检查`uuid.csv`文件是否存在
   - 验证密钥状态是否为"active"

3. **权限错误**
   - 确保Web服务器对目录有读写权限
   - 检查SELinux或其他安全策略

## 联系支持

如有问题，请检查：
1. PHP错误日志
2. Web服务器访问日志
3. 文件权限设置
4. PHP配置参数
