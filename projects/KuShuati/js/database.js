// 数据库管理类
class DatabaseManager {
    constructor() {
        this.sqlDB = null; // sql.js 数据库实例
        this.indexedDB = null; // IndexedDB 连接
        this.dbName = 'QuizAppDB';
        this.dbVersion = 2;
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
            
            // 从本地存储加载题库
            await this.loadQuestionBanksFromStorage();
            
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

                // 创建题库数据存储
                if (!db.objectStoreNames.contains('questionBankData')) {
                    const bankDataStore = db.createObjectStore('questionBankData', { keyPath: 'id' });
                }

                // 创建题库图片存储
                if (!db.objectStoreNames.contains('questionBankImages')) {
                    const imagesStore = db.createObjectStore('questionBankImages', { keyPath: 'id', autoIncrement: true });
                    imagesStore.createIndex('bankId', 'bankId', { unique: false });
                    imagesStore.createIndex('filename', 'filename', { unique: false });
                }
            };
        });
    }

    // 批量导入题库（支持单个ZIP或包含多个ZIP的大ZIP）
    async importQuestionBanks(file) {
        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            const results = [];
            const zipFiles = [];
            
            // 检查是否是包含多个ZIP的大ZIP
            for (const [filename, fileData] of Object.entries(zipContent.files)) {
                if (filename.endsWith('.zip')) {
                    // 包含子ZIP文件
                    const subZipData = await fileData.async('uint8array');
                    zipFiles.push({ filename, data: subZipData });
                } else if (filename.endsWith('.db') || filename.match(/\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i)) {
                    // 直接包含数据库或图片文件，作为单个题库处理
                    zipFiles.push({ filename: file.name, data: await file.arrayBuffer() });
                    break;
                }
            }
            
            // 如果没有找到ZIP文件，就将整个文件作为单个题库处理
            if (zipFiles.length === 0) {
                zipFiles.push({ filename: file.name, data: await file.arrayBuffer() });
            }
            
            // 逐个处理ZIP文件
            for (const zipFile of zipFiles) {
                try {
                    const result = await this.importSingleQuestionBank(zipFile.data, zipFile.filename);
                    results.push({ ...result, filename: zipFile.filename });
                } catch (error) {
                    results.push({ 
                        success: false, 
                        error: error.message, 
                        filename: zipFile.filename 
                    });
                }
            }
            
            return results;
            
        } catch (error) {
            console.error('批量导入题库失败:', error);
            return [{ success: false, error: error.message, filename: file.name }];
        }
    }
    
    // 导入单个题库 ZIP 文件
    async importSingleQuestionBank(fileData, filename) {
        const uint8Array = fileData instanceof Uint8Array ? fileData : new Uint8Array(fileData);
        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(uint8Array);
            
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
            
            // 如果题库已存在，先清理旧数据
            if (this.questionBanks.has(bankId)) {
                const oldBankData = this.questionBanks.get(bankId);
                // 清理旧的图片URL
                if (oldBankData.images) {
                    for (const url of Object.values(oldBankData.images)) {
                        URL.revokeObjectURL(url);
                    }
                }
                oldBankData.db.close();
            }
            
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

            // 保存题库数据到 IndexedDB
            await this.saveQuestionBankData(bankId, dbFile);

            // 保存题库图片到 IndexedDB
            await this.saveQuestionBankImages(bankId, images);

            console.log(`题库 ${bankInfo.name} 导入成功`);
            return { success: true, bankId, bankInfo, filename };

        } catch (error) {
            console.error('导入题库失败:', error);
            return { success: false, error: error.message, filename };
        }
    }
    
    // 导入题库 ZIP 文件（兼容旧接口）
    async importQuestionBank(file) {
        const results = await this.importQuestionBanks(file);
        return results[0] || { success: false, error: '导入失败' };
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
            let key = col;
            let value = values[index];
            
            // 处理字段名映射
            if (col === 'is_exam_mode') {
                key = 'isExamMode';
                value = Boolean(value); // 确保转换为布尔值
            } else if (col === 'time_limit') {
                key = 'timeLimit';
                value = Number(value); // 确保转换为数字
            }
            
            config[key] = value;
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

    // 保存题库数据
    async saveQuestionBankData(bankId, dbFile) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['questionBankData'], 'readwrite');
            const store = transaction.objectStore('questionBankData');
            
            const request = store.put({
                id: bankId,
                data: dbFile,
                savedTime: new Date().toISOString()
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // 保存题库图片
    async saveQuestionBankImages(bankId, images) {
        try {
            // 如果没有图片，直接返回
            if (!images || Object.keys(images).length === 0) {
                return Promise.resolve();
            }

            // 先处理图片数据
            const processedImages = [];
            for (const [filename, url] of Object.entries(images)) {
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    const arrayBuffer = await blob.arrayBuffer();
                    
                    processedImages.push({
                        bankId: bankId,
                        filename: filename,
                        data: new Uint8Array(arrayBuffer),
                        mimeType: blob.type,
                        savedTime: new Date().toISOString()
                    });
                } catch (error) {
                    console.error(`处理图片 ${filename} 失败:`, error);
                }
            }

            // 保存到 IndexedDB
            return new Promise((resolve, reject) => {
                const transaction = this.indexedDB.transaction(['questionBankImages'], 'readwrite');
                const store = transaction.objectStore('questionBankImages');
                
                // 先删除该题库的旧图片
                const index = store.index('bankId');
                const deleteRequest = index.getAll(bankId);
                
                deleteRequest.onsuccess = () => {
                    const oldImages = deleteRequest.result;
                    
                    // 删除旧图片
                    oldImages.forEach(img => {
                        store.delete(img.id);
                    });
                    
                    // 保存新图片
                    processedImages.forEach(imgData => {
                        const saveReq = store.add(imgData);
                        saveReq.onerror = () => console.error(`保存图片 ${imgData.filename} 失败`);
                    });
                };
                
                deleteRequest.onerror = () => {
                    console.error('删除旧图片失败，继续保存新图片');
                    // 即使删除失败，也尝试保存新图片
                    processedImages.forEach(imgData => {
                        const saveReq = store.add(imgData);
                        saveReq.onerror = () => console.error(`保存图片 ${imgData.filename} 失败`);
                    });
                };
                
                transaction.oncomplete = () => resolve();
                transaction.onerror = (event) => {
                    console.error('保存图片事务失败:', event);
                    resolve(); // 图片保存失败不应该阻止题库导入
                };
            });
            
        } catch (error) {
            console.error('保存题库图片失败:', error);
            return Promise.resolve(); // 图片保存失败不应该阻止题库导入
        }
    }

    // 从本地存储加载题库
    async loadQuestionBanksFromStorage() {
        try {
            // 获取所有题库元数据
            const bankMetas = await this.getAllQuestionBankMetas();
            
            for (const meta of bankMetas) {
                try {
                    // 加载题库数据
                    const bankData = await this.getQuestionBankData(meta.id);
                    if (!bankData) continue;
                    
                    // 创建数据库实例
                    const db = new this.SQL.Database(bankData.data);
                    
                    // 加载题库图片
                    const images = await this.getQuestionBankImages(meta.id);
                    const imageMap = {};
                    
                    for (const img of images) {
                        // 创建 Blob URL
                        const blob = new Blob([img.data], { type: img.mimeType });
                        const url = URL.createObjectURL(blob);
                        imageMap[img.filename] = url;
                        this.currentImages.set(img.filename, url);
                    }
                    
                    // 存储到内存中
                    this.questionBanks.set(meta.id, {
                        db: db,
                        info: meta,
                        images: imageMap
                    });
                    
                    console.log(`从本地存储加载题库: ${meta.name}`);
                    
                } catch (error) {
                    console.error(`加载题库 ${meta.id} 失败:`, error);
                }
            }
            
        } catch (error) {
            console.error('从本地存储加载题库失败:', error);
        }
    }

    // 获取所有题库元数据
    async getAllQuestionBankMetas() {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['questionBankMeta'], 'readonly');
            const store = transaction.objectStore('questionBankMeta');
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 获取题库数据
    async getQuestionBankData(bankId) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['questionBankData'], 'readonly');
            const store = transaction.objectStore('questionBankData');
            const request = store.get(bankId);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // 获取题库图片
    async getQuestionBankImages(bankId) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['questionBankImages'], 'readonly');
            const store = transaction.objectStore('questionBankImages');
            const index = store.index('bankId');
            const request = index.getAll(bankId);

            request.onsuccess = () => resolve(request.result);
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

    // 保存错题
    async saveWrongQuestion(questionData) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readwrite');
            const store = transaction.objectStore('wrongQuestions');
            const index = store.index('questionId');
            
            // 先检查是否已存在该题目的错题记录
            const checkRequest = index.get(questionData.questionId);
            
            checkRequest.onsuccess = () => {
                const existingRecord = checkRequest.result;
                
                if (existingRecord) {
                    // 如果已存在，更新错误次数
                    existingRecord.error_count += 1;
                    existingRecord.last_user_answer = questionData.userAnswer;
                    existingRecord.user_mastery_level = questionData.masteryLevel || 'vague';
                    if (questionData.remark) {
                        existingRecord.user_remark = questionData.remark;
                    }
                    existingRecord.updated_time = new Date().toISOString();
                    
                    const updateRequest = store.put(existingRecord);
                    updateRequest.onsuccess = () => resolve(existingRecord.id);
                    updateRequest.onerror = () => reject(updateRequest.error);
                } else {
                    // 如果不存在，创建新记录
                    const newRecord = {
                        question_id_fk: questionData.questionId,
                        notebook_id: questionData.notebookId,
                        error_count: 1,
                        last_user_answer: questionData.userAnswer,
                        user_remark: questionData.remark || '',
                        user_error_reason: '',
                        user_mastery_level: questionData.masteryLevel || 'vague',
                        created_time: new Date().toISOString(),
                        updated_time: new Date().toISOString()
                    };
                    
                    const addRequest = store.add(newRecord);
                    addRequest.onsuccess = () => resolve(addRequest.result);
                    addRequest.onerror = () => reject(addRequest.error);
                }
            };
            
            checkRequest.onerror = () => reject(checkRequest.error);
        });
    }

    // 更新错题
    async updateWrongQuestion(id, updates) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readwrite');
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
            try {
                const transaction = this.indexedDB.transaction(['notebooks', 'wrongQuestions'], 'readonly');
                const notebookStore = transaction.objectStore('notebooks');
                const wrongStore = transaction.objectStore('wrongQuestions');
                const wrongIndex = wrongStore.index('notebookId');
                
                const notebookRequest = notebookStore.getAll();
                
                notebookRequest.onsuccess = async () => {
                    try {
                        const notebooks = notebookRequest.result;
                        
                        // 为每个错题本计算错题数量
                        const countPromises = notebooks.map(notebook => {
                            return new Promise((res, rej) => {
                                const countRequest = wrongIndex.count(notebook.id);
                                countRequest.onsuccess = () => {
                                    notebook.questionCount = countRequest.result;
                                    console.log(`错题本 ${notebook.name} (${notebook.id}) 有 ${countRequest.result} 道错题`);
                                    res();
                                };
                                countRequest.onerror = () => {
                                    console.error(`获取错题本 ${notebook.id} 的错题数量失败:`, countRequest.error);
                                    notebook.questionCount = 0;
                                    res(); // 即使失败也要继续
                                };
                            });
                        });
                        
                        // 等待所有计数完成
                        await Promise.all(countPromises);
                        
                        console.log('所有错题本数量计算完成:', notebooks.map(nb => ({name: nb.name, count: nb.questionCount})));
                        resolve(notebooks);
                    } catch (error) {
                        console.error('计算错题本数量时出错:', error);
                        reject(error);
                    }
                };
                
                notebookRequest.onerror = () => reject(notebookRequest.error);
                
            } catch (error) {
                reject(error);
            }
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
            
            // 深度克隆进度数据，确保没有 Vue 响应式属性
            const cleanProgressData = JSON.parse(JSON.stringify(progressData));
            
            const request = store.put({
                id: 'current_practice',
                data: cleanProgressData,
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

            request.onsuccess = () => {
                const result = request.result;
                if (result && result.data) {
                    resolve(result.data);
                } else {
                    resolve(null);
                }
            };
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

    // 导入完整数据包（包含题库）
    async importCompleteData(file) {
        try {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);
            
            // 查找用户数据文件
            let userDataFile = null;
            const questionBankFiles = [];
            
            for (const [filename, fileData] of Object.entries(zipContent.files)) {
                if (filename === 'user_data.db') {
                    userDataFile = await fileData.async('uint8array');
                } else if (filename.startsWith('question_banks/') && filename.endsWith('.zip')) {
                    const bankZipData = await fileData.async('uint8array');
                    questionBankFiles.push({
                        filename: filename.replace('question_banks/', ''),
                        data: bankZipData
                    });
                }
            }
            
            // 导入用户数据
            if (userDataFile) {
                const userResult = await this.importUserData(new File([userDataFile], 'user_data.db'));
                if (!userResult.success) {
                    return { success: false, error: `导入用户数据失败: ${userResult.error}` };
                }
            }
            
            // 导入题库
            let successCount = 0;
            let errorMessages = [];
            
            for (const bankFile of questionBankFiles) {
                try {
                    const result = await this.importSingleQuestionBank(bankFile.data, bankFile.filename);
                    if (result.success) {
                        successCount++;
                    } else {
                        errorMessages.push(`${bankFile.filename}: ${result.error}`);
                    }
                } catch (error) {
                    errorMessages.push(`${bankFile.filename}: ${error.message}`);
                }
            }
            
            let message = `导入完成！`;
            if (userDataFile) message += `用户数据导入成功。`;
            if (successCount > 0) message += `成功导入 ${successCount} 个题库。`;
            if (errorMessages.length > 0) {
                message += `\n\n导入失败的题库:\n${errorMessages.join('\n')}`;
            }
            
            return { success: true, message };
            
        } catch (error) {
            console.error('导入完整数据失败:', error);
            return { success: false, error: error.message };
        }
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
            
            // 导入进度数据
            try {
                const progressResult = importDB.exec('SELECT * FROM progress');
                if (progressResult[0] && progressResult[0].values.length > 0) {
                    for (const row of progressResult[0].values) {
                        const [id, dataStr, updatedTime] = row;
                        const progressData = JSON.parse(dataStr);
                        await this.saveProgress(progressData);
                    }
                }
            } catch (e) {
                console.warn('导入进度数据失败:', e);
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

    // 清空所有数据（包括题库）
    async clearAllData() {
        return new Promise((resolve, reject) => {
            const storeNames = ['notebooks', 'wrongQuestions', 'settings', 'progress', 'questionBankMeta', 'questionBankData', 'questionBankImages'];
            const availableStores = storeNames.filter(name => this.indexedDB.objectStoreNames.contains(name));
            
            if (availableStores.length === 0) {
                resolve();
                return;
            }
            
            const transaction = this.indexedDB.transaction(availableStores, 'readwrite');
            
            availableStores.forEach(storeName => {
                const store = transaction.objectStore(storeName);
                store.clear();
            });
            
            transaction.oncomplete = () => {
                // 清空内存中的数据
                this.questionBanks.clear();
                this.cleanupImages();
                resolve();
            };
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

    // 导出用户数据（包含题库）
    async exportUserData() {
        try {
            // 创建 ZIP 文件
            const zip = new JSZip();
            
            // 导出用户数据到 SQLite 数据库
            const userDataBlob = await this.exportUserDataOnly();
            zip.file('user_data.db', userDataBlob);
            
            // 导出所有题库
            const questionBanks = await this.getAllQuestionBankMetas();
            for (const bankMeta of questionBanks) {
                try {
                    const bankZip = await this.exportQuestionBank(bankMeta.id);
                    if (bankZip) {
                        zip.file(`question_banks/${bankMeta.name || bankMeta.id}.zip`, bankZip);
                    }
                } catch (error) {
                    console.error(`导出题库 ${bankMeta.id} 失败:`, error);
                }
            }
            
            // 生成最终的 ZIP 文件
            return await zip.generateAsync({ type: 'blob' });
            
        } catch (error) {
            console.error('导出数据失败:', error);
            throw error;
        }
    }

    // SQL字符串转义函数
    escapeSQLString(str) {
        if (str === null || str === undefined) return 'NULL';
        return "'" + String(str).replace(/'/g, "''") + "'";
    }

    // 仅导出用户数据
    async exportUserDataOnly() {
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
                        ${wq.id}, ${this.escapeSQLString(wq.question_id_fk)}, ${this.escapeSQLString(wq.notebook_id)}, 
                        ${wq.error_count}, ${this.escapeSQLString(wq.last_user_answer)}, ${this.escapeSQLString(wq.user_remark)},
                        ${this.escapeSQLString(wq.user_error_reason)}, ${this.escapeSQLString(wq.user_mastery_level)},
                        ${this.escapeSQLString(wq.created_time)}, ${this.escapeSQLString(wq.updated_time)}
                    )
                `);
            }

            // 导出错题本数据
            const notebooks = await this.getNotebooks();
            for (const nb of notebooks) {
                exportDB.exec(`
                    INSERT INTO notebooks VALUES (
                        ${this.escapeSQLString(nb.id)}, ${this.escapeSQLString(nb.name)}, ${this.escapeSQLString(nb.description)},
                        ${this.escapeSQLString(nb.created_time)}, ${nb.question_count}
                    )
                `);
            }

            // 导出进度数据
            const progress = await this.getProgress();
            if (progress) {
                exportDB.exec(`
                    INSERT INTO progress VALUES (
                        'current_practice', ${this.escapeSQLString(JSON.stringify(progress))}, ${this.escapeSQLString(new Date().toISOString())}
                    )
                `);
            }

            // 导出设置数据
            const settings = await this.getAllSettings();
            for (const [key, value] of Object.entries(settings)) {
                exportDB.exec(`
                    INSERT INTO settings VALUES (${this.escapeSQLString(key)}, ${this.escapeSQLString(JSON.stringify(value))})
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

    // 移除错题
    async removeWrongQuestion(wrongQuestionId) {
        return new Promise((resolve, reject) => {
            const transaction = this.indexedDB.transaction(['wrongQuestions'], 'readwrite');
            const store = transaction.objectStore('wrongQuestions');
            
            const request = store.delete(wrongQuestionId);
            request.onsuccess = () => resolve();
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

    // 导出单个题库
    async exportQuestionBank(bankId) {
        try {
            // 获取题库数据
            const bankData = await this.getQuestionBankData(bankId);
            if (!bankData) {
                throw new Error('题库数据不存在');
            }

            // 获取题库图片
            const images = await this.getQuestionBankImages(bankId);

            // 创建 ZIP 文件
            const zip = new JSZip();
            
            // 添加数据库文件
            zip.file(`${bankId}.db`, bankData.data);
            
            // 添加图片文件
            for (const img of images) {
                const blob = new Blob([img.data], { type: img.mimeType });
                zip.file(img.filename, blob);
            }
            
            // 生成 ZIP 文件
            return await zip.generateAsync({ type: 'uint8array' });
            
        } catch (error) {
            console.error(`导出题库 ${bankId} 失败:`, error);
            return null;
        }
    }

    // 删除题库
    async deleteQuestionBank(bankId) {
        try {
            // 从内存中移除
            this.questionBanks.delete(bankId);
            
            // 从 IndexedDB 中删除
            const transaction = this.indexedDB.transaction(['questionBankMeta', 'questionBankData', 'questionBankImages'], 'readwrite');
            
            // 删除元数据
            const metaStore = transaction.objectStore('questionBankMeta');
            metaStore.delete(bankId);
            
            // 删除数据
            const dataStore = transaction.objectStore('questionBankData');
            dataStore.delete(bankId);
            
            // 删除图片
            const imagesStore = transaction.objectStore('questionBankImages');
            const index = imagesStore.index('bankId');
            const getImagesRequest = index.getAll(bankId);
            
            getImagesRequest.onsuccess = () => {
                const images = getImagesRequest.result;
                images.forEach(img => {
                    imagesStore.delete(img.id);
                });
            };
            
            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => resolve();
                transaction.onerror = () => reject(transaction.error);
            });
            
        } catch (error) {
            console.error(`删除题库 ${bankId} 失败:`, error);
            throw error;
        }
    }
}

// 全局数据库实例
window.dbManager = new DatabaseManager();
