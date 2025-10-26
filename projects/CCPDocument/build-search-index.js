const fs = require('fs');
const path = require('path');

// 读取所有markdown文件并构建索引
function buildSearchIndex() {
    const searchIndex = [];
    const articleDir = path.join(__dirname, 'article');
    
    function readMarkdownFiles(dir, basePath = '') {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                readMarkdownFiles(filePath, path.join(basePath, file));
            } else if (file.endsWith('.md')) {
                const content = fs.readFileSync(filePath, 'utf-8');
                const relativePath = path.join(basePath, file).replace(/\\/g, '/');
                
                // 提取标题
                const titleMatch = content.match(/^#\s+(.+)$/m);
                const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
                
                // 移除markdown标记，保留纯文本
                const plainText = content
                    .replace(/^#+\s+/gm, '') // 移除标题标记
                    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // 移除链接，保留文本
                    .replace(/[*_~`]/g, '') // 移除格式标记
                    .replace(/^>\s*/gm, '') // 移除引用标记
                    .replace(/^-\s+/gm, '') // 移除列表标记
                    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '') // 移除图片
                    .trim();
                
                searchIndex.push({
                    title: title,
                    path: `/article/${relativePath}`,
                    content: plainText.substring(0, 500), // 只保留前500字符作为预览
                    fullContent: plainText // 用于搜索的完整内容
                });
            }
        });
    }
    
    // 读取books目录
    const booksDir = path.join(__dirname, 'books');
    if (fs.existsSync(booksDir)) {
        const files = fs.readdirSync(booksDir);
        files.forEach(file => {
            if (file.endsWith('.md')) {
                const content = fs.readFileSync(path.join(booksDir, file), 'utf-8');
                const titleMatch = content.match(/^#\s+(.+)$/m);
                const title = titleMatch ? titleMatch[1] : file.replace('.md', '');
                
                const plainText = content
                    .replace(/^#+\s+/gm, '')
                    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
                    .replace(/[*_~`]/g, '')
                    .replace(/^>\s*/gm, '')
                    .replace(/^-\s+/gm, '')
                    .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
                    .trim();
                
                searchIndex.push({
                    title: title,
                    path: `/books/${file}`,
                    content: plainText.substring(0, 500),
                    fullContent: plainText
                });
            }
        });
    }
    
    readMarkdownFiles(articleDir);
    
    // 写入索引文件
    fs.writeFileSync(
        path.join(__dirname, 'search-index.json'),
        JSON.stringify(searchIndex, null, 2),
        'utf-8'
    );
    
    console.log(`搜索索引已生成，共包含 ${searchIndex.length} 个文档`);
}

buildSearchIndex();

