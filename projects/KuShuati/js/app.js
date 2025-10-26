// Vue 应用主文件
const { createApp } = Vue;

createApp({
    data() {
        return {
            // 当前视图
            currentView: 'home',
            
            // 题库相关
            questionBanks: [],
            selectedBanks: [],
            
            // 练习模式相关
            practiceStarted: false,
            practiceQuestions: [],
            currentQuestionIndex: 0,
            currentQuestion: null,
            userAnswer: null,
            showAnswer: false,
            showMasteryLevel: false,
            canProceed: false,
            questionAnswered: false, // 选择题是否已回答
            
            // 考试模式相关
            examStarted: false,
            selectedPaper: null,
            selectedPaperInfo: null,
            examQuestions: [],
            examAnswers: {},
            timeLeft: 0,
            examTimer: null,
            
            // 错题本相关
            notebooks: [],
            showCreateNotebook: false,
            newNotebookName: '',
            showWrongQuestionModal: false,
            currentWrongQuestion: null,
            selectedNotebookForWrong: null,
            wrongQuestionRemark: '',
            
            // 错题本详细查看
            viewingNotebook: null,
            notebookQuestions: [],
            showNotebookDetail: false,
            
            // 设置相关
            settings: {
                autoAddToNotebook: 'default',
                defaultNotebook: null,
                largeQuestionMode: 'click', // 'click' 或 'input'
                exportWithQuestionBanks: true, // 导出时是否包含题库
                cloudSync: {
                    uploadUrl: '',
                    apiKey: ''
                }
            },
            
            // 云端同步状态
            cloudSyncLoading: false,
            cloudSyncMessage: null,
            
            // 统计数据
            stats: {
                totalQuestions: 0,
                practiceCount: 0,
                wrongCount: 0,
                accuracy: 0
            },
            
            // 应用状态
            loading: false,
            initialized: false,
            
            // 进度保存定时器
            saveProgressTimer: null,
            
            // 手动保存的进度状态
            hasSavedProgress: false
        }
    },
    
    async mounted() {
        await this.initializeApp();
    },
    
    updated() {
        // 在DOM更新后渲染MathJax
        this.$nextTick(() => {
            if (window.renderAllMath) {
                window.renderAllMath();
            }
        });
    },
    
    methods: {
        // 初始化应用
        async initializeApp() {
            this.loading = true;
            try {
                // 初始化数据库
                const success = await window.dbManager.init();
                if (!success) {
                    throw new Error('数据库初始化失败');
                }
                
                // 加载数据
                await this.loadData();
                
                this.initialized = true;
                console.log('应用初始化成功');
            } catch (error) {
                console.error('应用初始化失败:', error);
                alert('应用初始化失败，请刷新页面重试');
            } finally {
                this.loading = false;
            }
        },
        
        // 加载数据
        async loadData() {
            try {
                // 加载题库列表
                this.questionBanks = await window.dbManager.getAllQuestionBanks();
                
                // 调试：检查题库的考试模式状态
                console.log('加载的题库:', this.questionBanks.map(bank => ({
                    name: bank.name,
                    isExamMode: bank.isExamMode,
                    id: bank.id
                })));
                
                // 加载错题本列表
                this.notebooks = await window.dbManager.getNotebooks();
                
                // 确保默认错题本存在
                await this.ensureDefaultNotebook();
                
                // 加载设置
                this.settings.largeQuestionMode = await window.dbManager.getSetting('largeQuestionMode', 'click');
                this.settings.exportWithQuestionBanks = await window.dbManager.getSetting('exportWithQuestionBanks', true);
                this.settings.cloudSync.uploadUrl = await window.dbManager.getSetting('cloudSyncUploadUrl', '');
                this.settings.cloudSync.apiKey = await window.dbManager.getSetting('cloudSyncApiKey', '');
                
                // 加载统计数据
                await this.updateStats()
                
                // 检查是否有手动保存的进度
                await this.checkSavedProgress()
                
            } catch (error) {
                console.error('加载数据失败:', error);
            }
        },
        
        // 更新统计数据
        async updateStats() {
            try {
                let totalQuestions = 0;
                this.questionBanks.forEach(bank => {
                    totalQuestions += bank.questionCount || 0;
                });
                this.stats.totalQuestions = totalQuestions;
                
                // 从 IndexedDB 获取其他统计数据
                this.stats.practiceCount = await window.dbManager.getSetting('practiceCount', 0);
                this.stats.wrongCount = await window.dbManager.getSetting('wrongCount', 0);
                
                // 计算正确率
                if (this.stats.practiceCount > 0) {
                    this.stats.accuracy = Math.round(((this.stats.practiceCount - this.stats.wrongCount) / this.stats.practiceCount) * 100);
                }
            } catch (error) {
                console.error('更新统计数据失败:', error);
            }
        },
        
        // 确保默认错题本存在
        async ensureDefaultNotebook() {
            const defaultNotebook = this.notebooks.find(nb => nb.name === '默认错题本');
            if (!defaultNotebook) {
                try {
                    const notebookId = await window.dbManager.createNotebook('默认错题本');
                    this.notebooks.push({
                        id: notebookId,
                        name: '默认错题本',
                        questionCount: 0
                    });
                    console.log('已创建默认错题本');
                } catch (error) {
                    console.error('创建默认错题本失败:', error);
                }
            }
        },
        
        // 导入题库（支持批量导入）
        async importQuestionBank(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            this.loading = true;
            try {
                const results = await window.dbManager.importQuestionBanks(file);
                
                let successCount = 0;
                let errorMessages = [];
                
                for (const result of results) {
                    if (result.success) {
                        successCount++;
                    } else {
                        errorMessages.push(`${result.filename}: ${result.error}`);
                    }
                }
                
                let message = `成功导入 ${successCount} 个题库`;
                if (errorMessages.length > 0) {
                    message += `\n\n导入失败的文件:\n${errorMessages.join('\n')}`;
                }
                
                alert(message);
                await this.loadData(); // 重新加载数据
                
            } catch (error) {
                console.error('导入题库失败:', error);
                alert('导入题库失败，请检查文件格式');
            } finally {
                this.loading = false;
                // 清空文件输入
                event.target.value = '';
            }
        },
        
        // 进入练习模式（检查是否有未完成的进度）
        async enterPracticeMode() {
            console.log('🔍 进入练习模式，检查进度...');
            try {
                // 检查是否有未完成的练习
                const progress = await window.dbManager.getProgress();
                console.log('📊 获取到的进度数据:', progress);
                
                if (progress && progress.practiceQuestions && progress.practiceQuestions.length > 0) {
                    console.log('✅ 发现未完成的练习，题目数量:', progress.practiceQuestions.length);
                    const resume = confirm('检测到未完成的练习，是否继续？\n\n点击"确定"继续上次的练习\n点击"取消"开始新的练习');
                    if (resume) {
                        console.log('🔄 用户选择继续练习');
                        await this.resumePractice(progress);
                        return; // 直接返回，不需要显示练习设置页面
                    } else {
                        console.log('🗑️ 用户选择不继续，清除旧进度');
                        // 用户选择不继续，清除旧进度
                        await window.dbManager.saveProgress({});
                    }
                } else {
                    console.log('❌ 没有发现未完成的练习进度');
                }
                
                // 没有进度或用户选择不继续，显示练习设置页面
                console.log('📝 显示练习设置页面');
                this.currentView = 'practice';
                
            } catch (error) {
                console.error('❌ 检查练习进度失败:', error);
                this.currentView = 'practice';
            }
        },

        // 开始练习
        async startPractice() {
            if (this.selectedBanks.length === 0) {
                alert('请至少选择一个题库');
                return;
            }
            
            try {
                // 获取题目
                this.practiceQuestions = window.dbManager.getQuestionsFromBanks(this.selectedBanks);
                
                if (this.practiceQuestions.length === 0) {
                    alert('所选题库中没有题目');
                    return;
                }
                
                // 初始化练习状态
                this.practiceStarted = true;
                this.currentQuestionIndex = 0;
                this.loadCurrentQuestion();
                
                // 保存进度
                await this.saveProgress();
                
            } catch (error) {
                console.error('开始练习失败:', error);
                alert('开始练习失败');
            }
        },
        
        // 加载当前题目
        loadCurrentQuestion(preserveState = false) {
            if (this.currentQuestionIndex < this.practiceQuestions.length) {
                this.currentQuestion = this.practiceQuestions[this.currentQuestionIndex];
                
                // 只有在不需要保持状态时才重置
                if (!preserveState) {
                    this.resetQuestionState();
                }
                
                // 处理图片引用
                this.processQuestionImages();
                
                // 渲染MathJax
                this.$nextTick(() => {
                    if (window.renderAllMath) {
                        window.renderAllMath();
                    }
                });
            }
        },
        
        // 重置题目状态
        resetQuestionState() {
            this.userAnswer = this.currentQuestion.type === 'multi' ? [] : null;
            this.showAnswer = false;
            this.showMasteryLevel = false;
            this.canProceed = false;
            this.questionAnswered = false;
        },
        
        // 处理题目中的图片引用
        processQuestionImages() {
            if (!this.currentQuestion) return;
            
            // 替换题目内容中的图片路径
            if (this.currentQuestion.content_html) {
                this.currentQuestion.content_html = this.replaceImagePaths(this.currentQuestion.content_html);
            }
            
            // 替换选项中的图片路径
            if (this.currentQuestion.options) {
                for (const key in this.currentQuestion.options) {
                    this.currentQuestion.options[key] = this.replaceImagePaths(this.currentQuestion.options[key]);
                }
            }
            
            // 替换参考答案中的图片路径
            if (this.currentQuestion.reference_answer_html) {
                this.currentQuestion.reference_answer_html = this.replaceImagePaths(this.currentQuestion.reference_answer_html);
            }
        },
        
        // 替换图片路径
        replaceImagePaths(html) {
            return html.replace(/src="([^"]+)"/g, (match, src) => {
                const imageUrl = window.dbManager.getImageUrl(src);
                return imageUrl ? `src="${imageUrl}"` : match;
            });
        },
        
        // 提交大题答案
        async submitLargeAnswer() {
            if (!this.userAnswer || this.userAnswer.trim() === '') {
                alert('请输入答案');
                return;
            }
            this.showAnswer = true;
            
            // 渲染MathJax（答案显示后）
            this.$nextTick(() => {
                if (window.renderAllMath) {
                    window.renderAllMath();
                }
            });
            
            // 保存进度
            await this.saveProgress();
        },

        // 大题点击模式：我想好了
        async showLargeAnswer() {
            this.showAnswer = true;
            
            // 渲染MathJax（答案显示后）
            this.$nextTick(() => {
                if (window.renderAllMath) {
                    window.renderAllMath();
                }
            });
            
            // 保存进度
            await this.saveProgress();
        },
        
        // 自我判断（大题）
        async selfJudge(isCorrect) {
            this.showAnswer = true;
            
            if (!isCorrect) {
                // 答错了，显示掌握程度选择，不立即显示错题本选择
                this.showMasteryLevel = true;
            } else {
                // 答对了，直接进入下一题
                this.canProceed = true;
            }
            
            // 更新统计
            await this.updatePracticeStats(isCorrect);
            
            // 保存进度
            await this.saveProgress();
        },
        
        // 设置掌握程度
        async setMasteryLevel(level) {
            this.showMasteryLevel = false;
            this.canProceed = true;
            
            // 如果选择了错题本，添加到错题本
            if (this.selectedNotebookForWrong) {
                await this.addToWrongNotebook(level);
            }
            
            // 保存进度
            await this.saveProgress();
        },
        
        // 提交选择题答案
        async submitChoiceAnswer() {
            if (!this.userAnswer || (Array.isArray(this.userAnswer) && this.userAnswer.length === 0)) {
                alert('请选择答案');
                return;
            }
            
            const isCorrect = this.checkAnswer();
            await this.updatePracticeStats(isCorrect);
            
            // 显示答案解析，不立即显示错题本选择
            this.questionAnswered = true;
            this.canProceed = true;
            
            // 渲染MathJax（答案显示后）
            this.$nextTick(() => {
                if (window.renderAllMath) {
                    window.renderAllMath();
                }
            });
            
            // 保存进度
            await this.saveProgress();
        },
        
        // 下一题
        async nextQuestion() {
            // 进入下一题
            this.currentQuestionIndex++;
            
            if (this.currentQuestionIndex < this.practiceQuestions.length) {
                this.loadCurrentQuestion();
                await this.saveProgress();
            } else {
                // 练习完成
                await this.completePractice();
            }
        },
        
        // 检查答案
        checkAnswer() {
            if (!this.currentQuestion.correctKeys) return false;
            
            if (this.currentQuestion.type === 'single') {
                return this.currentQuestion.correctKeys.includes(this.userAnswer);
            } else if (this.currentQuestion.type === 'multi') {
                if (!Array.isArray(this.userAnswer)) return false;
                
                const userSet = new Set(this.userAnswer);
                const correctSet = new Set(this.currentQuestion.correctKeys);
                
                return userSet.size === correctSet.size && 
                       [...userSet].every(key => correctSet.has(key));
            }
            
            return false;
        },
        
        // 更新练习统计
        async updatePracticeStats(isCorrect) {
            this.stats.practiceCount++;
            if (!isCorrect) {
                this.stats.wrongCount++;
            }
            
            // 重新计算正确率
            this.stats.accuracy = Math.round(((this.stats.practiceCount - this.stats.wrongCount) / this.stats.practiceCount) * 100);
            
            // 保存到数据库
            await window.dbManager.saveSetting('practiceCount', this.stats.practiceCount);
            await window.dbManager.saveSetting('wrongCount', this.stats.wrongCount);
        },
        
        // 显示错题本选择对话框
        showWrongQuestionSelection() {
            this.currentWrongQuestion = {
                question: this.currentQuestion,
                userAnswer: this.userAnswer
            };
            this.selectedNotebookForWrong = null;
            this.wrongQuestionRemark = '';
            this.showWrongQuestionModal = true;
        },
        
        // 手动加入错题本（用于答案解析后的按钮）
        async addToWrongNotebookManual() {
            // 确保有默认错题本
            await this.ensureDefaultNotebook();
            
            // 设置默认错题本
            if (this.notebooks.length > 0) {
                this.selectedNotebookForWrong = this.notebooks.find(nb => nb.name === '默认错题本')?.id || this.notebooks[0].id;
            }
            
            this.showWrongQuestionSelection();
        },
        
        // 添加到错题本
        async addToWrongNotebook(masteryLevel) {
            if (!this.selectedNotebookForWrong) return;
            
            // 确定要保存的题目和答案
            const questionToSave = this.currentWrongQuestion?.question || this.currentQuestion;
            const userAnswerToSave = this.currentWrongQuestion?.userAnswer || this.userAnswer;
            
            if (!questionToSave) {
                console.error('没有找到要保存的题目');
                alert('保存错题失败：没有找到题目信息');
                return;
            }
            
            try {
                await window.dbManager.saveWrongQuestion({
                    questionId: questionToSave.id,
                    notebookId: this.selectedNotebookForWrong,
                    userAnswer: JSON.stringify(userAnswerToSave),
                    masteryLevel: masteryLevel || 'vague',
                    remark: this.wrongQuestionRemark
                });
                console.log('错题已添加到错题本:', {
                    questionId: questionToSave.id,
                    notebookId: this.selectedNotebookForWrong,
                    userAnswer: userAnswerToSave
                });
                this.showWrongQuestionModal = false;
                
                // 重新加载错题本列表以更新数量
                this.notebooks = await window.dbManager.getNotebooks();
            } catch (error) {
                console.error('保存错题失败:', error);
                alert('保存错题失败');
            }
        },
        
        // 取消添加错题
        cancelAddWrongQuestion() {
            this.showWrongQuestionModal = false;
            this.currentWrongQuestion = null;
            this.selectedNotebookForWrong = null;
            this.wrongQuestionRemark = '';
        },
        
        // 保存练习进度
        async saveProgress() {
            try {
                // 如果没有练习题目，不保存进度
                if (!this.practiceQuestions || this.practiceQuestions.length === 0) {
                    console.log('⚠️ 没有练习题目，跳过进度保存');
                    return;
                }
                
                // 序列化题目数据，只保留必要的字段，避免 DataCloneError
                const serializedQuestions = this.practiceQuestions.map(q => ({
                    id: q.id,
                    bankId: q.bankId,
                    type: q.type,
                    content_html: q.content_html,
                    options: q.options,
                    correctKeys: q.correctKeys,
                    reference_answer_html: q.reference_answer_html,
                    score_value: q.score_value
                }));
                
                const progressData = {
                    practiceQuestions: serializedQuestions,
                    currentQuestionIndex: this.currentQuestionIndex,
                    selectedBanks: [...this.selectedBanks], // 确保是纯数组
                    // 保存当前题目状态 - 确保所有值都是可序列化的
                    currentQuestionState: {
                        userAnswer: this.serializeUserAnswer(this.userAnswer),
                        showAnswer: Boolean(this.showAnswer),
                        questionAnswered: Boolean(this.questionAnswered),
                        canProceed: Boolean(this.canProceed),
                        showMasteryLevel: Boolean(this.showMasteryLevel)
                    },
                    // 保存统计数据
                    sessionStats: {
                        practiceCount: Number(this.stats.practiceCount),
                        wrongCount: Number(this.stats.wrongCount),
                        accuracy: Number(this.stats.accuracy)
                    },
                    // 保存时间戳
                    savedAt: new Date().toISOString(),
                    // 保存练习模式标识
                    practiceStarted: Boolean(this.practiceStarted)
                };
                
                console.log('💾 保存进度数据:', {
                    questionsCount: progressData.practiceQuestions?.length || 0,
                    currentIndex: progressData.currentQuestionIndex,
                    practiceStarted: progressData.practiceStarted
                });
                
                await window.dbManager.saveProgress(progressData);
                console.log('✅ 进度保存成功');
            } catch (error) {
                console.error('❌ 保存进度失败:', error);
            }
        },
        
        // 恢复练习
        async resumePractice(progress) {
            this.practiceQuestions = progress.practiceQuestions;
            this.currentQuestionIndex = progress.currentQuestionIndex;
            this.selectedBanks = progress.selectedBanks;
            this.practiceStarted = progress.practiceStarted !== undefined ? progress.practiceStarted : true;
            
            // 恢复当前题目状态
            if (progress.currentQuestionState) {
                this.userAnswer = progress.currentQuestionState.userAnswer;
                this.showAnswer = progress.currentQuestionState.showAnswer;
                this.questionAnswered = progress.currentQuestionState.questionAnswered;
                this.canProceed = progress.currentQuestionState.canProceed;
                this.showMasteryLevel = progress.currentQuestionState.showMasteryLevel;
            }
            
            // 恢复统计数据（如果有的话）
            if (progress.sessionStats) {
                this.stats.practiceCount = progress.sessionStats.practiceCount;
                this.stats.wrongCount = progress.sessionStats.wrongCount;
                this.stats.accuracy = progress.sessionStats.accuracy;
            }
            
            this.currentView = 'practice';
            this.loadCurrentQuestion(true); // 保持状态，不重置
            
            console.log('练习进度已恢复', {
                currentIndex: this.currentQuestionIndex,
                totalQuestions: this.practiceQuestions.length,
                savedAt: progress.savedAt
            });
        },
        
        // 检查是否有手动保存的进度
        async checkSavedProgress() {
            try {
                const savedProgress = await window.dbManager.getSetting('manualSavedProgress', null);
                this.hasSavedProgress = savedProgress !== null && savedProgress !== undefined;
                console.log('检查手动保存进度:', this.hasSavedProgress ? '有保存的进度' : '无保存的进度');
            } catch (error) {
                console.error('检查保存进度失败:', error);
                this.hasSavedProgress = false;
            }
        },
        
        // 手动保存进度
        async saveProgressManually() {
            try {
                // 检查是否在练习或考试中
                if (!this.practiceStarted && !this.examStarted) {
                    alert('当前没有进行中的练习或考试');
                    return;
                }
                
                let progressData;
                
                if (this.practiceStarted) {
                    // 练习模式进度
                    progressData = {
                        type: 'practice',
                        practiceQuestions: this.practiceQuestions,
                        currentQuestionIndex: this.currentQuestionIndex,
                        selectedBanks: this.selectedBanks,
                        currentQuestionState: {
                            userAnswer: this.userAnswer,
                            showAnswer: this.showAnswer,
                            questionAnswered: this.questionAnswered,
                            canProceed: this.canProceed,
                            showMasteryLevel: this.showMasteryLevel
                        },
                        sessionStats: {
                            practiceCount: this.stats.practiceCount,
                            wrongCount: this.stats.wrongCount,
                            accuracy: this.stats.accuracy
                        },
                        savedAt: new Date().toISOString(),
                        practiceStarted: this.practiceStarted
                    };
                } else if (this.examStarted) {
                    // 考试模式进度
                    progressData = {
                        type: 'exam',
                        examQuestions: this.examQuestions,
                        examAnswers: this.examAnswers,
                        currentQuestionIndex: this.currentQuestionIndex,
                        selectedPaper: this.selectedPaper,
                        selectedPaperInfo: this.selectedPaperInfo,
                        timeLeft: this.timeLeft,
                        savedAt: new Date().toISOString(),
                        examStarted: this.examStarted
                    };
                }
                
                // 深度克隆进度数据，确保没有 Vue 响应式属性
                const cleanProgressData = JSON.parse(JSON.stringify(progressData));
                
                // 保存到专门的手动保存进度存储
                await window.dbManager.saveSetting('manualSavedProgress', cleanProgressData);
                this.hasSavedProgress = true;
                
                alert('✅ 进度保存成功！可以在主界面点击"加载进度"继续学习。');
                console.log('✅ 手动保存进度成功:', progressData);
                
            } catch (error) {
                console.error('❌ 手动保存进度失败:', error);
                alert('❌ 保存进度失败，请重试');
            }
        },
        
        // 加载手动保存的进度
        async loadSavedProgress() {
            try {
                const savedProgress = await window.dbManager.getSetting('manualSavedProgress', null);
                
                if (!savedProgress) {
                    alert('没有找到保存的进度');
                    return;
                }
                
                const confirmMessage = `发现保存的${savedProgress.type === 'practice' ? '练习' : '考试'}进度：\n` +
                    `保存时间: ${new Date(savedProgress.savedAt).toLocaleString()}\n` +
                    `是否要加载此进度？`;
                
                if (!confirm(confirmMessage)) {
                    return;
                }
                
                if (savedProgress.type === 'practice') {
                    // 恢复练习进度
                    await this.resumePractice(savedProgress);
                } else if (savedProgress.type === 'exam') {
                    // 恢复考试进度
                    await this.resumeExam(savedProgress);
                }
                
                console.log('✅ 手动保存的进度加载成功');
                
            } catch (error) {
                console.error('❌ 加载保存进度失败:', error);
                alert('❌ 加载进度失败，请重试');
            }
        },
        
        // 恢复考试进度
        async resumeExam(progress) {
            this.examQuestions = progress.examQuestions;
            this.examAnswers = progress.examAnswers || {};
            this.currentQuestionIndex = progress.currentQuestionIndex;
            this.selectedPaper = progress.selectedPaper;
            this.selectedPaperInfo = progress.selectedPaperInfo;
            this.timeLeft = progress.timeLeft;
            this.examStarted = progress.examStarted !== undefined ? progress.examStarted : true;
            
            this.currentView = 'exam';
            this.loadCurrentQuestion();
            
            // 重新启动计时器
            if (this.timeLeft > 0) {
                this.startExamTimer();
            }
            
            console.log('考试进度已恢复', {
                currentIndex: this.currentQuestionIndex,
                totalQuestions: this.examQuestions.length,
                timeLeft: this.timeLeft,
                savedAt: progress.savedAt
            });
        },
        
        // 完成练习
        async completePractice() {
            alert('练习完成！');
            this.exitPractice();
        },
        
        // 退出练习
        async exitPractice() {
            this.practiceStarted = false;
            this.practiceQuestions = [];
            this.currentQuestionIndex = 0;
            this.currentQuestion = null;
            this.selectedBanks = [];
            
            // 清除保存的进度
            try {
                await window.dbManager.saveProgress({});
            } catch (error) {
                console.error('清除进度失败:', error);
            }
        },
        
        // 退出考试
        async exitExam() {
            if (!confirm('确定要退出考试吗？已答题目将不会保存。')) {
                return;
            }
            
            // 停止计时器
            if (this.examTimer) {
                clearInterval(this.examTimer);
                this.examTimer = null;
            }
            
            // 重置考试状态
            this.examStarted = false;
            this.examQuestions = [];
            this.examAnswers = {};
            this.selectedPaper = null;
            this.selectedPaperInfo = null;
            this.currentQuestionIndex = 0;
            this.currentQuestion = null;
            this.timeLeft = 0;
        },
        
        // 考试模式相关方法
        
        // 开始考试
        async startExam() {
            if (!this.selectedPaper) {
                alert('请选择试卷');
                return;
            }
            
            try {
                // 获取试卷信息
                this.selectedPaperInfo = this.examPapers.find(p => p.id === this.selectedPaper);
                
                // 获取试卷题目（按顺序，不打乱）
                this.examQuestions = window.dbManager.getQuestionsFromBanks([this.selectedPaper], null, false);
                
                if (this.examQuestions.length === 0) {
                    alert('试卷中没有题目');
                    return;
                }
                
                // 初始化考试状态
                this.examStarted = true;
                this.currentQuestionIndex = 0;
                this.examAnswers = {};
                this.timeLeft = this.selectedPaperInfo.timeLimit * 60; // 转换为秒
                
                // 开始计时
                this.startExamTimer();
                
                // 加载第一题
                this.loadCurrentQuestion();
                
            } catch (error) {
                console.error('开始考试失败:', error);
                alert('开始考试失败');
            }
        },
        
        // 开始考试计时
        startExamTimer() {
            this.examTimer = setInterval(() => {
                this.timeLeft--;
                if (this.timeLeft <= 0) {
                    this.submitExam();
                }
            }, 1000);
        },
        
        // 格式化时间显示
        formatTime(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            
            if (hours > 0) {
                return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            } else {
                return `${minutes}:${secs.toString().padStart(2, '0')}`;
            }
        },
        
        // 跳转到指定题目
        goToQuestion(index) {
            this.currentQuestionIndex = index;
            this.loadCurrentQuestion();
        },
        
        // 上一题
        async prevQuestion() {
            if (this.currentQuestionIndex > 0) {
                this.currentQuestionIndex--;
                this.loadCurrentQuestion();
                
                // 如果是练习模式，保存进度
                if (this.practiceStarted) {
                    await this.saveProgress();
                }
            }
        },
        
        // 提交试卷
        async submitExam() {
            if (this.examTimer) {
                clearInterval(this.examTimer);
                this.examTimer = null;
            }
            
            // 计算得分
            let totalScore = 0;
            let userScore = 0;
            
            this.examQuestions.forEach((question, index) => {
                totalScore += question.score_value || 1;
                
                const userAnswer = this.examAnswers[index];
                if (userAnswer !== undefined && this.checkExamAnswer(question, userAnswer)) {
                    userScore += question.score_value || 1;
                }
            });
            
            const percentage = Math.round((userScore / totalScore) * 100);
            
            alert(`考试完成！\n得分：${userScore}/${totalScore} (${percentage}%)`);
            
            // 重置考试状态
            this.examStarted = false;
            this.examQuestions = [];
            this.examAnswers = {};
            this.selectedPaper = null;
            this.currentQuestionIndex = 0;
        },
        
        // 检查考试答案
        checkExamAnswer(question, userAnswer) {
            if (!question.correctKeys) return false;
            
            if (question.type === 'single') {
                return question.correctKeys.includes(userAnswer);
            } else if (question.type === 'multi') {
                if (!Array.isArray(userAnswer)) return false;
                
                const userSet = new Set(userAnswer);
                const correctSet = new Set(question.correctKeys);
                
                return userSet.size === correctSet.size && 
                       [...userSet].every(key => correctSet.has(key));
            }
            
            // 大题暂时无法自动判分
            return false;
        },
        
        // 错题本相关方法
        
        // 查看错题本详情
        async viewNotebook(notebookId) {
            try {
                const wrongQuestions = await window.dbManager.getWrongQuestionsByNotebook(notebookId);
                const notebook = this.notebooks.find(nb => nb.id === notebookId);
                
                if (wrongQuestions.length === 0) {
                    alert(`错题本 "${notebook?.name || '未知'}" 中暂无错题`);
                    return;
                }
                
                // 获取完整题目信息
                const detailedQuestions = [];
                for (const wq of wrongQuestions) {
                    const questionDetail = await this.getQuestionDetail(wq.question_id_fk);
                    if (questionDetail) {
                        detailedQuestions.push({
                            ...wq,
                            questionDetail
                        });
                    }
                }
                
                this.viewingNotebook = notebook;
                this.notebookQuestions = detailedQuestions;
                this.showNotebookDetail = true;
                this.currentView = 'notebook-detail';
                
            } catch (error) {
                console.error('查看错题本失败:', error);
                alert('查看错题本失败');
            }
        },
        
        // 获取题目详情
        async getQuestionDetail(questionId) {
            for (const [bankId, bankData] of window.dbManager.questionBanks) {
                try {
                    const result = bankData.db.exec(`SELECT * FROM questions WHERE id = '${questionId}'`);
                    if (result[0] && result[0].values.length > 0) {
                        return window.dbManager.parseQuestionRow(result[0].columns, result[0].values[0], bankId);
                    }
                } catch (error) {
                    console.error(`从题库 ${bankId} 获取题目详情失败:`, error);
                }
            }
            return null;
        },
        
        // 关闭错题本详情
        closeNotebookDetail() {
            this.showNotebookDetail = false;
            this.viewingNotebook = null;
            this.notebookQuestions = [];
            this.currentView = 'notebook';
        },
        
        // 从错题本移除题目
        async removeFromNotebook(wrongQuestionId) {
            if (!confirm('确定要从错题本中移除这道题吗？')) return;
            
            try {
                await window.dbManager.removeWrongQuestion(wrongQuestionId);
                // 重新加载错题本内容
                await this.viewNotebook(this.viewingNotebook.id);
                alert('题目已从错题本中移除');
            } catch (error) {
                console.error('移除错题失败:', error);
                alert('移除失败');
            }
        },
        
        // 更新错题备注
        async updateWrongQuestionRemark(wrongQuestionId, newRemark) {
            try {
                await window.dbManager.updateWrongQuestion(wrongQuestionId, {
                    user_remark: newRemark
                });
                console.log('备注更新成功');
            } catch (error) {
                console.error('更新备注失败:', error);
                alert('更新备注失败');
            }
        },
        
        // 重刷错题本
        async practiceNotebook(notebookId) {
            try {
                const wrongQuestions = await window.dbManager.getWrongQuestionsByNotebook(notebookId);
                
                if (wrongQuestions.length === 0) {
                    alert('该错题本中暂无错题');
                    return;
                }
                
                // 获取错题对应的完整题目信息
                const questionIds = wrongQuestions.map(wq => wq.question_id_fk);
                const questions = [];
                
                // 从已加载的题库中查找对应题目
                for (const [bankId, bankData] of window.dbManager.questionBanks) {
                    try {
                        const result = bankData.db.exec(`SELECT * FROM questions WHERE id IN (${questionIds.map(id => `'${id}'`).join(',')})`);
                        if (result[0]) {
                            const bankQuestions = result[0].values.map(row => 
                                window.dbManager.parseQuestionRow(result[0].columns, row, bankId)
                            );
                            questions.push(...bankQuestions);
                        }
                    } catch (error) {
                        console.error(`从题库 ${bankId} 获取错题失败:`, error);
                    }
                }
                
                if (questions.length === 0) {
                    alert('无法找到对应的题目，请确保相关题库已导入');
                    return;
                }
                
                // 开始错题练习
                this.practiceQuestions = questions;
                this.practiceStarted = true;
                this.currentQuestionIndex = 0;
                this.currentView = 'practice';
                this.loadCurrentQuestion();
                
                alert(`开始重刷错题本，共 ${questions.length} 道题目`);
                
            } catch (error) {
                console.error('重刷错题本失败:', error);
                alert('重刷错题本失败');
            }
        },
        
        // 删除错题本
        async deleteNotebook(notebookId) {
            if (!confirm('确定要删除这个错题本吗？')) return;
            
            try {
                await window.dbManager.deleteNotebook(notebookId);
                this.notebooks = this.notebooks.filter(nb => nb.id !== notebookId);
                
                // 如果删除的是默认错题本，清除设置
                if (this.settings.defaultNotebook === notebookId) {
                    this.settings.defaultNotebook = null;
                    await window.dbManager.saveSetting('defaultNotebook', null);
                }
                
                alert('错题本删除成功');
            } catch (error) {
                console.error('删除错题本失败:', error);
                alert('删除失败');
            }
        },
        
        // 创建错题本
        async createNotebook() {
            if (!this.newNotebookName.trim()) {
                alert('请输入错题本名称');
                return;
            }
            
            try {
                const notebook = await window.dbManager.createNotebook(this.newNotebookName.trim());
                this.notebooks.push(notebook);
                this.showCreateNotebook = false;
                this.newNotebookName = '';
                alert('错题本创建成功');
            } catch (error) {
                console.error('创建错题本失败:', error);
                alert('创建失败');
            }
        },
        
        // 数据导入导出
        
        // 导出数据
        async exportData() {
            try {
                let blob, filename;
                
                if (this.settings.exportWithQuestionBanks) {
                    // 导出包含题库的完整数据
                    blob = await window.dbManager.exportUserData();
                    filename = `quiz_complete_data_${new Date().toISOString().slice(0, 10)}.zip`;
                } else {
                    // 仅导出用户数据
                    blob = await window.dbManager.exportUserDataOnly();
                    filename = `quiz_user_data_${new Date().toISOString().slice(0, 10)}.db`;
                }
                
                saveAs(blob, filename);
            } catch (error) {
                console.error('导出数据失败:', error);
                alert('导出失败');
            }
        },
        
        // 导入数据
        async importData(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            try {
                let result;
                
                if (file.name.endsWith('.zip')) {
                    // 导入完整数据包（包含题库）
                    result = await window.dbManager.importCompleteData(file);
                } else {
                    // 导入用户数据
                    result = await window.dbManager.importUserData(file);
                }
                
                if (result.success) {
                    alert('数据导入成功！页面将刷新以加载新数据。');
                    location.reload();
                } else {
                    alert(`导入失败: ${result.error}`);
                }
            } catch (error) {
                console.error('导入数据失败:', error);
                alert('导入失败');
            } finally {
                event.target.value = '';
            }
        },

        // 题库管理相关方法

        // 导出单个题库
        async exportSingleBank(bankId) {
            try {
                const bankInfo = this.questionBanks.find(bank => bank.id === bankId);
                if (!bankInfo) {
                    alert('题库不存在');
                    return;
                }

                const zipData = await window.dbManager.exportQuestionBank(bankId);
                if (zipData) {
                    const blob = new Blob([zipData], { type: 'application/zip' });
                    const filename = `${bankInfo.name || bankId}_${new Date().toISOString().slice(0, 10)}.zip`;
                    saveAs(blob, filename);
                } else {
                    alert('导出失败');
                }
            } catch (error) {
                console.error('导出题库失败:', error);
                alert('导出失败');
            }
        },

        // 删除题库
        async deleteBank(bankId) {
            const bankInfo = this.questionBanks.find(bank => bank.id === bankId);
            if (!bankInfo) {
                alert('题库不存在');
                return;
            }

            if (!confirm(`确定要删除题库 "${bankInfo.name}" 吗？此操作不可恢复。`)) {
                return;
            }

            try {
                await window.dbManager.deleteQuestionBank(bankId);
                
                // 从本地数组中移除
                this.questionBanks = this.questionBanks.filter(bank => bank.id !== bankId);
                
                // 更新统计数据
                await this.updateStats();
                
                alert('题库删除成功');
            } catch (error) {
                console.error('删除题库失败:', error);
                alert('删除失败');
            }
        },

        // 格式化日期
        formatDate(dateString) {
            if (!dateString) return '未知';
            try {
                const date = new Date(dateString);
                return date.toLocaleDateString('zh-CN');
            } catch (error) {
                return '未知';
            }
        },

        // 清空所有数据
        async clearAllData() {
            if (!confirm('⚠️ 确定要清空所有数据吗？\n\n此操作将删除：\n- 所有题库\n- 所有错题本\n- 所有设置\n- 练习进度\n\n此操作不可恢复！')) {
                return;
            }

            if (!confirm('请再次确认：真的要删除所有数据吗？')) {
                return;
            }

            try {
                await window.dbManager.clearAllData();
                alert('所有数据已清空！页面将刷新。');
                location.reload();
            } catch (error) {
                console.error('清空数据失败:', error);
                alert('清空数据失败，请尝试手动清除浏览器数据');
            }
        },

        // 保存云端同步设置
        async saveCloudSyncSettings() {
            try {
                this.cloudSyncMessage = null;
                
                // 验证URL格式
                if (!this.settings.cloudSync.uploadUrl.startsWith('http')) {
                    this.cloudSyncMessage = {
                        type: 'error',
                        text: '请输入有效的URL（以http://或https://开头）'
                    };
                    return;
                }
                
                // 设置会通过watch自动保存
                this.cloudSyncMessage = {
                    type: 'success',
                    text: '云端同步配置已保存'
                };
                
                // 3秒后清除消息
                setTimeout(() => {
                    this.cloudSyncMessage = null;
                }, 3000);
                
            } catch (error) {
                console.error('保存云端同步设置失败:', error);
                this.cloudSyncMessage = {
                    type: 'error',
                    text: '保存配置失败：' + error.message
                };
            }
        },

        // 上传到云端
        async uploadToCloud() {
            if (!this.isCloudSyncConfigured) {
                this.cloudSyncMessage = {
                    type: 'error',
                    text: '请先配置上传URL和密钥'
                };
                return;
            }

            this.cloudSyncLoading = true;
            this.cloudSyncMessage = null;

            try {
                // 导出数据
                const blob = await window.dbManager.exportUserData();
                
                // 创建FormData
                const formData = new FormData();
                formData.append('file', blob, 'quiz_data.zip');
                formData.append('api_key', this.settings.cloudSync.apiKey);
                formData.append('action', 'upload');

                // 发送到服务器
                const response = await fetch(this.settings.cloudSync.uploadUrl, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                
                if (result.success) {
                    this.cloudSyncMessage = {
                        type: 'success',
                        text: '数据已成功上传到云端'
                    };
                } else {
                    throw new Error(result.message || '上传失败');
                }

            } catch (error) {
                console.error('上传到云端失败:', error);
                this.cloudSyncMessage = {
                    type: 'error',
                    text: '上传失败：' + error.message
                };
            } finally {
                this.cloudSyncLoading = false;
                
                // 5秒后清除消息
                setTimeout(() => {
                    this.cloudSyncMessage = null;
                }, 5000);
            }
        },

        // 从云端下载
        async downloadFromCloud() {
            if (!this.isCloudSyncConfigured) {
                this.cloudSyncMessage = {
                    type: 'error',
                    text: '请先配置上传URL和密钥'
                };
                return;
            }

            if (!confirm('从云端下载数据将覆盖当前所有数据，确定要继续吗？')) {
                return;
            }

            this.cloudSyncLoading = true;
            this.cloudSyncMessage = null;

            try {
                // 构建下载URL
                const downloadUrl = new URL(this.settings.cloudSync.uploadUrl);
                downloadUrl.searchParams.append('action', 'download');
                downloadUrl.searchParams.append('api_key', this.settings.cloudSync.apiKey);

                // 从服务器下载
                const response = await fetch(downloadUrl.toString());

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const contentType = response.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    // 服务器返回错误信息
                    const result = await response.json();
                    throw new Error(result.message || '下载失败');
                }

                // 获取文件数据
                const blob = await response.blob();
                
                if (blob.size === 0) {
                    throw new Error('下载的文件为空');
                }

                // 导入数据
                await window.dbManager.importUserData(blob);
                
                this.cloudSyncMessage = {
                    type: 'success',
                    text: '数据已成功从云端下载，页面将刷新'
                };

                // 延迟刷新页面
                setTimeout(() => {
                    location.reload();
                }, 2000);

            } catch (error) {
                console.error('从云端下载失败:', error);
                this.cloudSyncMessage = {
                    type: 'error',
                    text: '下载失败：' + error.message
                };
            } finally {
                this.cloudSyncLoading = false;
                
                // 5秒后清除消息
                setTimeout(() => {
                    this.cloudSyncMessage = null;
                }, 5000);
            }
        },

        // 获取正确答案文本（显示选项内容而非ABCD）
        getCorrectAnswerText(questionDetail) {
            if (!questionDetail || !questionDetail.correctKeys || !questionDetail.options) {
                return '见参考答案';
            }
            
            const correctTexts = questionDetail.correctKeys.map(key => {
                return questionDetail.options[key] || key;
            });
            
            return correctTexts.join('；');
        },

        // 获取用户答案文本（显示选项内容而非ABCD）
        getUserAnswerText(questionDetail, lastUserAnswer) {
            if (!lastUserAnswer || !questionDetail || !questionDetail.options) {
                return '无答案';
            }
            
            try {
                const userAnswer = JSON.parse(lastUserAnswer);
                
                if (Array.isArray(userAnswer)) {
                    // 多选题
                    const answerTexts = userAnswer.map(key => {
                        return questionDetail.options[key] || key;
                    });
                    return answerTexts.join('；');
                } else {
                    // 单选题
                    return questionDetail.options[userAnswer] || userAnswer;
                }
            } catch (error) {
                return lastUserAnswer;
            }
        },

        // 安全序列化用户答案
        serializeUserAnswer(userAnswer) {
            try {
                if (userAnswer === null || userAnswer === undefined) {
                    return null;
                }
                
                if (Array.isArray(userAnswer)) {
                    // 多选题：确保数组中只包含字符串
                    return userAnswer.filter(item => typeof item === 'string' || typeof item === 'number').map(String);
                } else if (typeof userAnswer === 'string' || typeof userAnswer === 'number') {
                    // 单选题：确保是字符串
                    return String(userAnswer);
                } else {
                    // 其他类型转为字符串
                    return String(userAnswer);
                }
            } catch (error) {
                console.warn('序列化用户答案失败:', error);
                return null;
            }
        }
    },
    
    computed: {
        // 获取考试模式的题库（支持考试模式的题库）
        examPapers() {
            return this.questionBanks.filter(bank => bank.isExamMode === true);
        },
        
        // 获取练习模式的题库（所有题库都可以用于练习）
        practiceBanks() {
            return this.questionBanks;
        },
        
        // 检查云端同步是否已配置
        isCloudSyncConfigured() {
            return this.settings.cloudSync.uploadUrl && this.settings.cloudSync.apiKey;
        }
    },
    
    watch: {
        // 监听设置变化并保存
        'settings.autoAddToNotebook'(newValue) {
            window.dbManager.saveSetting('autoAddToNotebook', newValue);
        },
        
        'settings.defaultNotebook'(newValue) {
            window.dbManager.saveSetting('defaultNotebook', newValue);
        },
        
        'settings.largeQuestionMode'(newValue) {
            window.dbManager.saveSetting('largeQuestionMode', newValue);
        },

        'settings.exportWithQuestionBanks'(newValue) {
            window.dbManager.saveSetting('exportWithQuestionBanks', newValue);
        },

        'settings.cloudSync.uploadUrl'(newValue) {
            window.dbManager.saveSetting('cloudSyncUploadUrl', newValue);
        },

        'settings.cloudSync.apiKey'(newValue) {
            window.dbManager.saveSetting('cloudSyncApiKey', newValue);
        },

        // 监听用户答案变化，自动保存进度
        userAnswer: {
            handler(newValue, oldValue) {
                // 只有在练习模式下且答案确实发生变化时才保存
                if (this.practiceStarted && newValue !== oldValue && this.currentQuestion) {
                    // 使用防抖，避免频繁保存
                    clearTimeout(this.saveProgressTimer);
                    this.saveProgressTimer = setTimeout(() => {
                        this.saveProgress();
                    }, 500); // 500ms 防抖
                }
            },
            deep: true // 监听数组变化（多选题）
        }
    }
}).mount('#app');
