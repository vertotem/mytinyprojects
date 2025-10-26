# CSS 主题说明 / CSS Themes Documentation

本目录包含了从 Typora 主题转换而来的通用网页 CSS 文件，以及原始的通用 CSS 文件。

This directory contains general web CSS files converted from Typora themes, as well as original general-purpose CSS files.

## 文件结构 / File Structure

### 原始通用 CSS / Original General CSS
- `nexmoe.css` - Nexmoe 主题（现代简约风格）
- `sakura.css` - Sakura 主题（极简主义风格）

### 从 Typora 转换的通用 CSS / Converted from Typora

#### Pie 系列 / Pie Series
- `pie-web.css` - Pie 浅色主题，现代设计风格
- `pie-dark-web.css` - Pie 深色主题，适合夜间阅读

#### Notion 系列 / Notion Series
- `notion-light-classic-web.css` - Notion 浅色经典主题
- `notion-light-enhanced-web.css` - Notion 浅色增强主题
- `notion-dark-classic-web.css` - Notion 深色经典主题
- `notion-dark-enhanced-web.css` - Notion 深色增强主题

#### LaTeX 系列 / LaTeX Series
- `latex-web.css` - LaTeX 风格主题，学术论文样式
- `latex-dark-web.css` - LaTeX 深色主题

#### 其他主题 / Other Themes
- `pixyll-web.css` - Pixyll 主题，强调内容的美观主题
- `newsprint-web.css` - 新闻报纸风格主题
- `pku-web.css` - 北京大学风格主题
- `zj-web.css` - ZJ 主题，简洁优雅的红色调

## 使用方法 / Usage

在 HTML 文件的 `<head>` 标签中引入 CSS 文件：

Include the CSS file in the `<head>` tag of your HTML file:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Page Title</title>
    <link rel="stylesheet" href="path/to/theme-name.css">
</head>
<body>
    <h1>Your Content</h1>
    <p>Your paragraph text...</p>
</body>
</html>
```

## 主题特点 / Theme Features

### 所有主题都支持 / All Themes Support
- ✅ 响应式设计（适配手机、平板、桌面）
- ✅ 打印样式优化
- ✅ 代码高亮
- ✅ 表格样式
- ✅ 引用块样式
- ✅ 列表样式
- ✅ 图片自适应

### Responsive design (mobile, tablet, desktop)
### Print style optimization
### Code highlighting
### Table styles
### Blockquote styles
### List styles
### Responsive images

## 主题对比 / Theme Comparison

| 主题 Theme | 风格 Style | 适用场景 Use Case |
|-----------|-----------|------------------|
| nexmoe.css | 现代简约 Modern Minimal | 个人博客、文档 |
| sakura.css | 极简主义 Minimalist | 简单网页、Markdown 预览 |
| pie-web.css | 现代设计 Modern Design | 专业博客、文章页面 |
| pie-dark-web.css | 深色主题 Dark Theme | 夜间阅读、深色界面 |
| notion-light-classic-web.css | Notion 风格 Notion Style | 知识库、笔记页面 |
| notion-dark-classic-web.css | Notion 深色 Notion Dark | 深色笔记、知识管理 |
| latex-web.css | 学术风格 Academic Style | 学术论文、研究报告 |
| pixyll-web.css | 内容优先 Content First | 博客文章、长文阅读 |
| newsprint-web.css | 报纸风格 Newspaper Style | 新闻网站、文章发布 |
| pku-web.css | 北大风格 PKU Style | 学术网站、机构页面 |
| zj-web.css | 简洁红调 Clean Red | 个人网站、博客 |

## 自定义 / Customization

每个主题都使用 CSS 变量（CSS Variables），你可以轻松自定义颜色和字体：

Each theme uses CSS Variables, making it easy to customize colors and fonts:

```css
:root {
  --primary-color: #your-color;
  --text-color: #your-text-color;
  --font-family: 'Your Font', sans-serif;
}
```

## 原始 Typora 主题 / Original Typora Themes

原始的 Typora 主题文件保存在 `typora/` 子目录中，仅供参考。

Original Typora theme files are kept in the `typora/` subdirectory for reference only.

## 许可证 / License

- 原始 Typora 主题遵循其各自的许可证
- 转换后的通用 CSS 文件可自由使用和修改

- Original Typora themes follow their respective licenses
- Converted general CSS files are free to use and modify

## 贡献 / Contributing

如果你发现任何问题或有改进建议，欢迎提出！

If you find any issues or have suggestions for improvement, feel free to contribute!

---

**注意** / **Note**: 这些主题已经从 Typora 专用格式转换为通用网页格式，移除了编辑器特定的样式，保留了核心的排版和美化效果。

These themes have been converted from Typora-specific format to general web format, with editor-specific styles removed while preserving core typography and aesthetic effects.

