# 刷题网站

一个完全基于前端技术的刷题平台，支持题库管理、错题记录和模拟考试功能。

## 功能特性

- ✅ **纯前端实现** - 无需后端服务器，所有数据存储在本地
- ✅ **题库管理** - 支持导入ZIP格式的题库文件（包含.db文件和图片）
- ✅ **多种题型** - 支持单选、多选、主观题（点击模式和输入模式）
- ✅ **练习模式** - 支持多题库混合练习，自动记忆进度
- ✅ **考试模式** - 支持限时考试，按题库顺序出题
- ✅ **错题本** - 自动记录错题，支持多个错题本管理
- ✅ **数据导出** - 支持导出用户数据为.db文件

## 技术架构

- **前端框架**: Vue.js 3
- **数据库**: sql.js (SQLite in browser)
- **本地存储**: IndexedDB
- **文件处理**: JSZip
- **文件下载**: FileSaver.js

## 使用方法

### 1. 启动应用

直接在浏览器中打开 `index.html` 文件即可使用。

### 2. 导入题库

1. 点击首页的"导入题库"按钮
2. 选择ZIP格式的题库文件
3. ZIP文件应包含：
   - 一个或多个 `.db` 文件（SQLite数据库）
   - 图片文件夹（可选）

### 3. 题库数据格式

题库的 `.db` 文件应包含 `questions` 表，表结构如下：

```sql
CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    question_bank_id TEXT,
    type TEXT,  -- 'single', 'multi', 'large-click', 'large-input'
    content_html TEXT,
    options_html TEXT,  -- JSON格式的选项
    reference_answer_html TEXT,
    correct_option_keys TEXT,  -- 正确答案的键，用逗号分隔
    score_value INTEGER,
    is_options_shuffled BOOLEAN
);
```

### 4. 开始练习

1. 在练习模式中选择要练习的题库
2. 点击"开始练习"
3. 系统会自动记忆练习进度

### 5. 模拟考试

1. 在考试模式中选择试卷（需要题库标记为考试模式）
2. 设置考试时间
3. 开始限时考试

### 6. 错题管理

- 答错的题目会自动加入错题本
- 可以创建多个错题本分类管理
- 支持重刷错题本

## 文件结构

```
题库/
├── index.html          # 主页面
├── css/
│   └── style.css      # 样式文件
├── js/
│   ├── app.js         # Vue应用主文件
│   └── database.js    # 数据库管理类
├── lib/               # 第三方库（本地存储）
│   ├── vue.js
│   ├── sql.js
│   ├── sql-wasm.wasm
│   ├── jszip.min.js
│   └── FileSaver.min.js
└── README.md          # 说明文档
```

## 数据存储

- **题库数据**: 使用 sql.js 在内存中处理 SQLite 数据库
- **用户数据**: 使用 IndexedDB 存储错题本、进度、设置等
- **图片资源**: 使用 URL.createObjectURL() 创建临时访问链接

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 注意事项

1. 首次使用需要导入题库文件
2. 所有数据存储在浏览器本地，清除浏览器数据会丢失用户数据
3. 建议定期导出用户数据进行备份
4. 图片文件会在当前会话中保持可访问，刷新页面后需要重新导入题库

## 开发说明

本项目严格按照需求文档开发，实现了：

- 纯前端架构，无后端依赖
- 所有第三方库本地化存储
- 完整的题库管理和练习功能
- 数据持久化和导入导出
- 响应式设计，支持移动端

如需扩展功能或修改，请参考源代码中的注释说明。
