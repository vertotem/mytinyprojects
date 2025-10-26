// 数据库管理类
class DatabaseManager {
    constructor() {
        this.sqlDB = null; // sql.js 数据库实例
        this.indexedDB = null; // IndexedDB 连接
        this.dbName = 'QuizAppDB';
        this.dbVersion = 1;
        this.questionBanks = new Map(); // 存储加载的题库
        this.currentImages = new Map(); // 存储当前会话的图片URL
    }

    // 初始化数据库
    async init() {
        try {
            // 初始化 sql.js
            const SQL = await initSqlJs({
                locateFile: file => `lib/${file}`
            });
            this.SQL = SQL;

            // 初始化 IndexedDB
            await this.initIndexedDB();
            
            console.log('数据库初始化成功');
            return true;
        } catch (error) {
            console.error('数据库初始化失败:', error);
            return false;
        }
    }

    // 初始化 IndexedDB
    initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                reject(new Error('IndexedDB 打开失败'));
            };

            request.onsuccess = (event) => {
                this.indexedDB = event.target.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 创建错题本存储
                if (!db.objectStoreNames.contains('wrongQuestions')) {
                    const wrongStore = db.createObjectStore('wrongQuestions', { keyPath: 'id', autoIncrement: true });
                    wrongStore.createIndex('questionId', 'question_id_fk', { unique: false });
                    wrongStore.createIndex('notebookId', 'notebook_id', { unique: false });
                    wrongStore.createIndex('errorCount', 'error_count', { unique: false });
                }

                // 创建错题本配置存储
                if (!db.objectStoreNames.contains('notebooks')) {
                    const notebookStore = db.createObjectStore('notebooks', { keyPath: 'id' });
                    notebookStore.createIndex('name', 'name', { unique: true });
                }

                // 创建用户进度存储
                if (!db.objectStoreNames.contains('progress')) {
                    const progressStore = db.createObjectStore('progress', { keyPath: 'id' });
                }

                // 创建用户设置存储
                if (!db.objectStoreNames.contains('settings')) {
                    const settingsStore = db.createObjectStore('settings', { keyPath: 'key' });
                }

                // 创建题库元数据存储
                if (!db.objectStoreNames.contains('questionBankMeta')) {
                    const metaStore = db.createObjectStore('questionBankMeta', { keyPath: 'id' });
                }
            };
        });
    }

    // 导入题库 ZIP 文件
    async importQuestionBank(file) {
        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            let dbFile = null;
            const images = {};
            
            // 遍历 ZIP 文件内容
            for (const [filename, fileData] of Object.entries(zipContent.files)) {
                if (filename.endsWith('.db')) {
                    // 找到数据库文件
                    dbFile = await fileData.async('uint8array');
                } else if (filename.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)) {
                    // 处理图片文件
                    const imageBlob = await fileData.async('blob');
                    const imageUrl = URL.createObjectURL(imageBlob);
                    images[filename] = imageUrl;
                }
            }

            if (!dbFile) {
                throw new Error('ZIP 文件中未找到 .db 文件');
            }

            // 加载数据库
            const db = new this.SQL.Database(dbFile);
            
            // 验证数据库结构
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            if (!tables[0] || !tables[0].values.some(row => row[0] === 'questions')) {
                throw new Error('数据库文件格式不正确，缺少 questions 表');
            }

            // 获取题库信息
            const bankInfo = this.extractBankInfo(db);
            const bankId = bankInfo.id || `bank_${Date.now()}`;
            
            // 存储题库
            this.questionBanks.set(bankId, {
                db: db,
                info: bankInfo,
                images: images
            });

            // 更新当前图片映射
            for (const [filename, url] of Object.entries(images)) {
                this.currentImages.set(filename, url);
            }

            // 保存题库元数据到 IndexedDB
            await this.saveQuestionBankMeta(bankId, bankInfo);

            console.log(`题库 ${bankInfo.name} 导入成功`);
            return { success: true, bankId, bankInfo };

        } catch (error) {
            console.error('导入题库失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 提取题库信息
    extractBankInfo(db) {
        try {
            // 尝试获取题库元信息
            let bankInfo = {
                id: null,
                name: '未命名题库',
                description: '',
                questionCount: 0,
                isExamMode: false,
                timeLimit: 120 // 默认120分钟
            };

            // 获取题目数量
            const countResult = db.exec("SELECT COUNT(*) as count FROM questions");
            if (countResult[0]) {
                bankInfo.questionCount = countResult[0].values[0][0];
            }

            // 尝试获取题库配置（如果存在）
            try {
                const configResult = db.exec("SELECT * FROM question_bank_config LIMIT 1");
                if (configResult[0] && configResult[0].values[0]) {
                    const config = this.parseConfigRow(configResult[0].columns, configResult[0].values[0]);
                    Object.assign(bankInfo, config);
                }
            } catch (e) {
                // 配置表不存在，使用默认值
            }

            // 如果没有配置表，尝试从第一个题目获取题库ID
            if (!bankInfo.id) {
                const firstQuestionResult = db.exec("SELECT question_bank_id FROM questions LIMIT 1");
                if (firstQuestionResult[0] && firstQuestionResult[0].values[0]) {
                    bankInfo.id = firstQuestionResult[0].values[0][0] || `bank_${Date.now()}`;
                    bankInfo.name = bankInfo.id;
                }
            }

            return bankInfo;
        } catch (error) {
            console.error('提取题库信息失败:', error);
            return {
                id: `bank_${Date.now()}`,
                name: '未命名题库',
                description: '',
                questionCount: 0,
                isExamMode: false,
                timeLimit: 120
            };
        }
    }

    // 解析配置行数据
    parseConfigRow(columns, values) {
        const config = {};
        columns.forEach((col, index) => {
            config[col] = values[index];
        });
        return config;
    }

    // 保存题库元数据
    async saveQuestionBankMeta(bankId, bankInfo) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['questionBankMeta'], 'readwrite');
            const store = transaction.objectStore('questionBankMeta');
            
            const request = store.put({
                id: bankId,
                ...bankInfo,
                importTime: new Date().toISOString()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 获取所有题库
    async getAllQuestionBanks() {
        const banks = [];
        for (const [bankId, bankData] of this.questionBanks) {
            banks.push({
                id: bankId,
                ...bankData.info
            });
        }
        return banks;
    }

    // 从题库获取题目
    getQuestionsFromBanks(bankIds, limit = null, shuffle = true) {
        const allQuestions = [];
        
        for (const bankId of bankIds) {
            const bankData = this.questionBanks.get(bankId);
            if (!bankData) continue;

            try {
                const result = bankData.db.exec("SELECT * FROM questions");
                if (result[0]) {
                    const questions = result[0].values.map(row => 
                        this.parseQuestionRow(result[0].columns, row, bankId)
                    );
                    allQuestions.push(...questions);
                }
            } catch (error) {
                console.error(`从题库 ${bankId} 获取题目失败:`, error);
            }
        }

        // 随机打乱
        if (shuffle) {
            this.shuffleArray(allQuestions);
        }

        // 限制数量
        if (limit && limit > 0) {
            return allQuestions.slice(0, limit);
        }

        return allQuestions;
    }

    // 解析题目行数据
    parseQuestionRow(columns, values, bankId) {
        const question = { bankId };
        columns.forEach((col, index) => {
            question[col] = values[index];
        });

        // 解析选项
        if (question.options_html) {
            try {
                question.options = JSON.parse(question.options_html);
            } catch (e) {
                // 如果不是JSON格式，尝试按行分割
                question.options = this.parseOptionsText(question.options_html);
            }
        }

        // 解析正确答案
        if (question.correct_option_keys) {
            question.correctKeys = question.correct_option_keys.split(',').map(k => k.trim());
        }

        return question;
    }

    // 解析选项文本
    parseOptionsText(optionsText) {
        const options = {};
        const lines = optionsText.split('\n').filter(line => line.trim());
        
        lines.forEach(line => {
            const match = line.match(/^([A-Z])[.、:]?\s*(.+)$/);
            if (match) {
                options[match[1]] = match[2].trim();
            }
        });

        return options;
    }

    // 数组随机打乱
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // 获取图片URL
    getImageUrl(filename) {
        return this.currentImages.get(filename) || null;
    }

    // 清理图片URL
    cleanupImages() {
        for (const url of this.currentImages.values()) {
            URL.revokeObjectURL(url);
        }
        this.currentImages.clear();
    }

    // IndexedDB 操作方法

            });
        };
        
        // 删除错题本
        const deleteRequest = notebookStore.delete(notebookId);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = () => reject(deleteRequest.error);
    });
}

// 导入用户数据
async importUserData(data) {
    try {
        // 创建事务
        const transaction = this.indexedDB.transaction(['wrongQuestions', 'notebooks', 'progress', 'settings'], 'readwrite');
        
        // 导入错题数据
        const wrongQuestionsStore = transaction.objectStore('wrongQuestions');
        data.wrongQuestions.forEach(wq => {
            wrongQuestionsStore.add(wq);
        });
        
        // 导入错题本数据
        const notebooksStore = transaction.objectStore('notebooks');
        data.notebooks.forEach(nb => {
            notebooksStore.add(nb);
            const store = transaction.objectStore('wrongQuestions');
            
            const getRequest = store.get(id);
            getRequest.onsuccess = () => {
                const wrongQuestion = getRequest.result;
                if (wrongQuestion) {
                    Object.assign(wrongQuestion, updates);
                    wrongQuestion.updated_time = new Date().toISOString();
                    
                    const putRequest = store.put(wrongQuestion);
                    putRequest.onsuccess = () => resolve();
                    putRequest.onerror = () => reject(putRequest.error);
                } else {
                    reject(new Error('错题不存在'));
                }
            };
            getRequest.onerror = () => reject(getRequest.error);
        });
    }

    // 获取错题本列表
    async getNotebooks() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['notebooks'], 'readonly');
            const store = transaction.objectStore('notebooks');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 创建错题本
    async createNotebook(name, description = '') {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['notebooks'], 'readwrite');
            const store = transaction.objectStore('notebooks');
            
            const notebook = {
                id: `notebook_${Date.now()}`,
                name: name,
                description: description,
                created_time: new Date().toISOString(),
                question_count: 0
            };

            const request = store.add(notebook);
            request.onsuccess = () => resolve(notebook);
            request.onerror = () => reject(request.error);
        });
    }

    // 保存用户进度
    async saveProgress(progressData) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['progress'], 'readwrite');
            const store = transaction.objectStore('progress');
            
            const request = store.put({
                id: 'current_practice',
                ...progressData,
                updated_time: new Date().toISOString()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 获取用户进度
    async getProgress() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['progress'], 'readonly');
            const store = transaction.objectStore('progress');
            const request = store.get('current_practice');

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    // 保存设置
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 获取设置
    async getSetting(key, defaultValue = null) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : defaultValue);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // 导出用户数据
    async exportUserData() {
        try {
            // 创建新的 SQLite 数据库
            const exportDB = new this.SQL.Database();
            
            // 创建表结构
            exportDB.exec(`
                CREATE TABLE wrong_questions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    question_id_fk TEXT,
                    notebook_id TEXT,
                    error_count INTEGER,
                    last_user_answer TEXT,
                    user_remark TEXT,
                    user_error_reason TEXT,
                    user_mastery_level TEXT,
                    created_time TEXT,
                    updated_time TEXT
                );
                
                CREATE TABLE notebooks (
                    id TEXT PRIMARY KEY,
                    name TEXT,
                    description TEXT,
                    created_time TEXT,
                    question_count INTEGER
                );
                
                CREATE TABLE progress (
                    id TEXT PRIMARY KEY,
                    data TEXT,
                    updated_time TEXT
                );
                
                CREATE TABLE settings (
                    key TEXT PRIMARY KEY,
                    value TEXT
                );
            `);

            // 导出错题数据
            const wrongQuestions = await this.getAllWrongQuestions();
            for (const wq of wrongQuestions) {
                exportDB.exec(`
                    INSERT INTO wrong_questions VALUES (
                        ${wq.id}, '${wq.question_id_fk}', '${wq.notebook_id}', 
                        ${wq.error_count}, '${wq.last_user_answer}', '${wq.user_remark}',
                        '${wq.user_error_reason}', '${wq.user_mastery_level}',
                        '${wq.created_time}', '${wq.updated_time}'
                    )
                `);
            }

            // 导出错题本数据
            const notebooks = await this.getNotebooks();
            for (const nb of notebooks) {
                exportDB.exec(`
                    INSERT INTO notebooks VALUES (
                        '${nb.id}', '${nb.name}', '${nb.description}',
                        '${nb.created_time}', ${nb.question_count}
                    )
                `);
            }

            // 导出进度数据
            const progress = await this.getProgress();
            if (progress) {
                exportDB.exec(`
                    INSERT INTO progress VALUES (
                        '${progress.id}', '${JSON.stringify(progress)}', '${progress.updated_time}'
                    )
                `);
            }

            // 导出设置数据
            const settings = await this.getAllSettings();
            for (const [key, value] of Object.entries(settings)) {
                exportDB.exec(`
                    INSERT INTO settings VALUES ('${key}', '${JSON.stringify(value)}')
                `);
            }

            // 获取数据库二进制数据
            const data = exportDB.export();
            exportDB.close();

            return new Blob([data], { type: 'application/octet-stream' });

        } catch (error) {
            console.error('导出用户数据失败:', error);
            throw error;
        }
    }

    // 获取所有错题
    async getAllWrongQuestions() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readonly');
            const store = transaction.objectStore('wrongQuestions');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 获取所有设置
    async getAllSettings() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.getAll();

            request.onsuccess = () => {
                const settings = {};
                request.result.forEach(item => {
                    settings[item.key] = item.value;
                });
                resolve(settings);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // 获取指定错题本中的错题
    async getWrongQuestionsByNotebook(notebookId) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readonly');
            const store = transaction.objectStore('wrongQuestions');
            const index = store.index('notebookId');
            const request = index.getAll(notebookId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 删除错题本
    async deleteNotebook(notebookId) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['notebooks', 'wrongQuestions'], 'readwrite');
            
            // 删除错题本记录
            const notebookStore = transaction.objectStore('notebooks');
            const deleteNotebookRequest = notebookStore.delete(notebookId);
            
            // 删除该错题本中的所有错题
            const wrongStore = transaction.objectStore('wrongQuestions');
            const index = wrongStore.index('notebookId');
            const getWrongQuestionsRequest = index.getAll(notebookId);
            
            getWrongQuestionsRequest.onsuccess = () => {
                const wrongQuestions = getWrongQuestionsRequest.result;
                wrongQuestions.forEach(wq => {
                    wrongStore.delete(wq.id);
                });
            };
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // 导入用户数据
    async importUserData(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // 使用 sql.js 读取导入的数据库文件
            const importDB = new this.SQL.Database(uint8Array);
            
            // 清空现有用户数据（可选，根据需求决定）
            const confirmOverwrite = confirm('导入数据将覆盖现有的用户数据，是否继续？');
            if (!confirmOverwrite) {
                importDB.close();
                return { success: false, error: '用户取消导入' };
            }
            
            // 清空现有数据
            await this.clearUserData();
            
            // 导入错题本数据
            try {
                const notebooksResult = importDB.exec('SELECT * FROM notebooks');
                if (notebooksResult[0]) {
                    for (const row of notebooksResult[0].values) {
                        const notebook = this.parseNotebookRow(notebooksResult[0].columns, row);
                        await this.importNotebook(notebook);
                    }
                }
            } catch (e) {
                console.warn('导入错题本数据失败:', e);
            }
            
            // 导入错题数据
            try {
                const wrongQuestionsResult = importDB.exec('SELECT * FROM wrong_questions');
                if (wrongQuestionsResult[0]) {
                    for (const row of wrongQuestionsResult[0].values) {
                        const wrongQuestion = this.parseWrongQuestionRow(wrongQuestionsResult[0].columns, row);
                        await this.importWrongQuestion(wrongQuestion);
                    }
                }
            } catch (e) {
                console.warn('导入错题数据失败:', e);
            }
            
            // 导入设置数据
            try {
                const settingsResult = importDB.exec('SELECT * FROM settings');
                if (settingsResult[0]) {
                    for (const row of settingsResult[0].values) {
                        const [key, valueStr] = row;
                        const value = JSON.parse(valueStr);
                        await this.saveSetting(key, value);
                    }
                }
            } catch (e) {
                console.warn('导入设置数据失败:', e);
            }
            
            importDB.close();
            return { success: true };
            
        } catch (error) {
            console.error('导入用户数据失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 清空用户数据
    async clearUserData() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['notebooks', 'wrongQuestions', 'settings', 'progress'], 'readwrite');
            
            const stores = ['notebooks', 'wrongQuestions', 'settings', 'progress'];
            stores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                store.clear();
            });
            
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // 解析错题本行数据
    parseNotebookRow(columns, values) {
        const notebook = {};
        columns.forEach((col, index) => {
            notebook[col] = values[index];
        });
        return notebook;
    }

    // 解析错题行数据
    parseWrongQuestionRow(columns, values) {
        const wrongQuestion = {};
        columns.forEach((col, index) => {
            wrongQuestion[col] = values[index];
        });
        return wrongQuestion;
    }

    // 导入错题本
    async importNotebook(notebook) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['notebooks'], 'readwrite');
            const store = transaction.objectStore('notebooks');
            
            const request = store.put(notebook);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 导入错题
    async importWrongQuestion(wrongQuestion) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readwrite');
            const store = transaction.objectStore('wrongQuestions');
            
            // 移除 id 字段，让 IndexedDB 自动生成
            const { id, ...questionData } = wrongQuestion;
            
            const request = store.add(questionData);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// 全局数据库实例
window.dbManager = new DatabaseManager();
