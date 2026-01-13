// Конфигурация игры 5×5
const CONFIG = {
    symbols: [
        { emoji: "🍒", weight: 25, multipliers: {3: 5, 4: 20, 5: 100} },
        { emoji: "🍋", weight: 22, multipliers: {3: 5, 4: 20, 5: 100} },
        { emoji: "🍊", weight: 20, multipliers: {3: 5, 4: 20, 5: 100} },
        { emoji: "🍇", weight: 15, multipliers: {3: 8, 4: 30, 5: 150} },
        { emoji: "🔔", weight: 10, multipliers: {3: 10, 4: 40, 5: 200} },
        { emoji: "⭐", weight: 5, multipliers: {3: 15, 4: 60, 5: 300} },
        { emoji: "7️⃣", weight: 3, multipliers: {3: 20, 4: 80, 5: 500} }
    ],
    minBet: 10,
    maxBet: 500,
    gridSize: 5
};

// Глобальные переменные
let game;
let isTelegramWebApp = false;

// Состояние игры
class GameState {
    constructor() {
        this.balance = 1000; // Стартовый баланс по умолчанию
        this.currentBet = 50;
        this.isSpinning = false;
        this.gamesPlayed = 0;
        this.winsCount = 0;
        this.biggestWin = 0;
        this.userId = this.getUserId();
        this.isMobile = this.checkMobile();
        this.init();
    }

    async init() {
        this.createGrid();
        this.setupEventListeners();
        this.setupTelegram();
        await this.loadInitialData();
        this.setupMobileFeatures();
        this.updateDisplay();
    }

    checkMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    getUserId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user_id') || 'demo_user_' + Math.random().toString(36).substr(2, 9);
    }

    setupTelegram() {
        console.log('Проверяем наличие Telegram WebApp...');
        
        if (window.Telegram && window.Telegram.WebApp) {
            console.log('Telegram WebApp обнаружен!');
            isTelegramWebApp = true;
            
            const tg = window.Telegram.WebApp;
            
            // Инициализация WebApp
            tg.ready();
            tg.expand();
            tg.enableClosingConfirmation();
            
            // Настройка темы
            const theme = tg.themeParams;
            if (theme.bg_color) {
                document.documentElement.style.setProperty('--tg-bg-color', theme.bg_color);
            }
            
            // Настройка цветов
            tg.setHeaderColor('#302b63');
            tg.setBackgroundColor('#0f0c29');
            
            // Показываем основную кнопку
            tg.MainButton.setText('Вернуться в бот');
            tg.MainButton.onClick(() => {
                tg.close();
            });
            
            console.log('Telegram WebApp настроен:', {
                version: tg.version,
                platform: tg.platform,
                themeParams: tg.themeParams
            });
            
        } else {
            console.warn('Telegram WebApp не найден. Запуск в режиме демо.');
            isTelegramWebApp = false;
            
            // Для демо-режима создаем заглушку
            window.Telegram = {
                WebApp: {
                    ready: () => console.log('Demo mode ready'),
                    expand: () => console.log('Demo expand'),
                    sendData: (data) => {
                        console.log('Demo sendData:', data);
                        this.handleDemoResponse(data);
                    },
                    close: () => console.log('Demo close'),
                    MainButton: {
                        setText: (text) => console.log('MainButton text:', text),
                        onClick: (callback) => console.log('MainButton click handler'),
                        show: () => console.log('MainButton show'),
                        hide: () => console.log('MainButton hide')
                    },
                    themeParams: {
                        bg_color: '#212121',
                        text_color: '#ffffff'
                    },
                    version: '6.0',
                    platform: 'web'
                }
            };
        }
    }

    async loadInitialData() {
        try {
            if (isTelegramWebApp) {
                // В режиме Telegram пытаемся получить данные от бота
                const data = await this.sendToTelegram('get_initial_data', {});
                console.log('Данные от бота:', data);
                
                if (data && data.success) {
                    this.balance = data.balance || 1000;
                    this.gamesPlayed = data.games_played || 0;
                    this.biggestWin = data.biggest_win || 0;
                    this.winsCount = data.total_wins || 0;
                } else {
                    // Если не удалось получить данные, используем localStorage
                    this.loadFromStorage();
                }
            } else {
                // Демо-режим: загружаем из localStorage
                this.loadFromStorage();
                console.log('Демо-режим: данные загружены из localStorage');
            }
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            this.loadFromStorage();
        }
    }

    createGrid() {
        const grid = document.getElementById('reelsGrid');
        grid.innerHTML = '';

        for (let i = 0; i < CONFIG.gridSize * CONFIG.gridSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'reel-cell';
            cell.id = `cell-${i}`;
            cell.textContent = '?';
            grid.appendChild(cell);
        }
    }

    setupEventListeners() {
        // Кнопки ставок
        document.querySelectorAll('.bet-btn, .quick-bet').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isSpinning) return;
                let bet = e.target.dataset.bet;
                if (bet === 'MAX') bet = Math.min(CONFIG.maxBet, this.balance);
                this.setBet(parseInt(bet));
            });
        });

        // Кнопка вращения
        document.getElementById('spinBtn').addEventListener('click', () => {
            this.spin();
        });

        // Мобильные кнопки +/-
        if (this.isMobile) {
            document.getElementById('betMinus').addEventListener('click', () => {
                this.adjustBet(-10);
            });

            document.getElementById('betPlus').addEventListener('click', () => {
                this.adjustBet(10);
            });
        }

        // Показ/скрытие правил
        if (this.isMobile && document.getElementById('rulesToggle')) {
            document.getElementById('rulesToggle').addEventListener('click', () => {
                this.toggleRules();
            });
        }
    }

    setupMobileFeatures() {
        if (this.isMobile) {
            this.setupTouchEvents();
            this.setupKeyboard();
            this.setupRulesToggle();
        }
    }

    setupTouchEvents() {
        const spinBtn = document.getElementById('spinBtn');

        // Долгое нажатие для быстрого вращения
        let longPressTimer;
        spinBtn.addEventListener('touchstart', () => {
            longPressTimer = setTimeout(() => {
                if (!this.isSpinning && this.currentBet <= this.balance) {
                    this.quickSpin();
                }
            }, 1000);
        });

        spinBtn.addEventListener('touchend', () => {
            clearTimeout(longPressTimer);
        });
    }

    setupKeyboard() {
        if (!this.isMobile) return;

        const keyboard = document.getElementById('mobileKeyboard');
        const showKeyboardBtn = document.getElementById('menuBtn');
        const closeKeyboardBtn = document.getElementById('keyboardClose');
        const customBetInput = document.getElementById('customBet');
        const keySubmit = document.getElementById('keySubmit');
        const keyClear = document.getElementById('keyClear');

        if (!showKeyboardBtn) return;

        showKeyboardBtn.addEventListener('click', () => {
            keyboard.classList.add('show');
            customBetInput.value = this.currentBet;
            customBetInput.focus();
        });

        closeKeyboardBtn.addEventListener('click', () => {
            keyboard.classList.remove('show');
        });

        keySubmit.addEventListener('click', () => {
            const bet = parseInt(customBetInput.value);
            if (bet >= CONFIG.minBet && bet <= CONFIG.maxBet && bet <= this.balance) {
                this.setBet(bet);
                keyboard.classList.remove('show');
            }
        });

        keyClear.addEventListener('click', () => {
            customBetInput.value = '';
        });

        // Кнопки цифр
        document.querySelectorAll('.key[data-key]').forEach(key => {
            key.addEventListener('click', (e) => {
                const value = e.target.dataset.key;
                customBetInput.value += value;
                if (parseInt(customBetInput.value) > CONFIG.maxBet) {
                    customBetInput.value = CONFIG.maxBet;
                }
            });
        });
    }

    toggleRules() {
        const content = document.getElementById('rulesContent');
        const icon = document.querySelector('#rulesToggle i');

        if (content.style.display === 'block') {
            content.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        } else {
            content.style.display = 'block';
            icon.style.transform = 'rotate(180deg)';
        }
    }

    adjustBet(amount) {
        const newBet = this.currentBet + amount;
        if (newBet >= CONFIG.minBet && newBet <= CONFIG.maxBet && newBet <= this.balance) {
            this.setBet(newBet);
        }
    }

    setBet(amount) {
        if (this.isSpinning) return;

        if (amount < CONFIG.minBet) {
            this.showMessage(`Мин: ${CONFIG.minBet}₽`, 'error');
            return;
        }

        if (amount > CONFIG.maxBet) {
            this.showMessage(`Макс: ${CONFIG.maxBet}₽`, 'error');
            return;
        }

        if (amount > this.balance) {
            this.showMessage('Не хватает средств!', 'error');
            return;
        }

        this.currentBet = amount;

        // Обновляем все кнопки ставок
        document.querySelectorAll('.bet-btn, .quick-bet').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === amount ||
                (btn.dataset.bet === 'MAX' && amount === Math.min(CONFIG.maxBet, this.balance))) {
                btn.classList.add('active');
            }
        });

        // Обновляем отображение
        document.getElementById('currentBet').textContent = `${amount} ₽`;
        this.updateDisplay();
    }

    async spin() {
        if (this.isSpinning) return;
        
        // Проверяем баланс
        if (this.currentBet > this.balance) {
            this.showMessage('Не хватает средств!', 'error');
            return;
        }

        this.isSpinning = true;
        this.gamesPlayed++;

        // Блокируем кнопку
        const spinBtn = document.getElementById('spinBtn');
        spinBtn.disabled = true;
        spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';

        // Анимация вращения
        await this.animateSpin();

        // Генерация результата
        const result = this.generateResult();
        this.displayResult(result);

        // Проверка выигрыша
        const winResult = this.checkWin(result);

        if (isTelegramWebApp) {
            // В режиме Telegram отправляем данные боту
            await this.handleTelegramGameResult(winResult, result);
        } else {
            // В демо-режиме обрабатываем локально
            this.handleDemoGameResult(winResult);
        }

        // Разблокируем кнопку
        this.isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-play"></i> КРУТИТЬ!';

        // Сохраняем
        this.saveToStorage();
        this.updateDisplay();
    }

    async handleTelegramGameResult(winResult, result) {
        try {
            const gameData = {
                bet: this.currentBet,
                win_amount: winResult.winAmount,
                symbols: result.map(s => s.emoji)
            };

            // Отправляем данные боту
            const response = await this.sendToTelegram('game_result', gameData);
            
            if (response && response.success) {
                // Обновляем баланс из ответа
                this.balance = response.new_balance || (this.balance - this.currentBet + winResult.winAmount);
                this.gamesPlayed = response.games_played || this.gamesPlayed;
                
                if (winResult.winAmount > 0) {
                    this.winsCount++;
                    this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
                    this.showWin(winResult);
                } else {
                    this.showMessage('😔 Нет выигрыша', 'lose');
                }
            } else {
                // Если ответ от бота не пришел, обрабатываем локально
                this.handleLocalGameResult(winResult);
            }
        } catch (error) {
            console.error('Ошибка отправки данных боту:', error);
            this.handleLocalGameResult(winResult);
        }
    }

    handleDemoGameResult(winResult) {
        // Демо-режим: обрабатываем локально
        const oldBalance = this.balance;
        this.balance = oldBalance - this.currentBet + winResult.winAmount;
        
        if (winResult.winAmount > 0) {
            this.winsCount++;
            this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
            this.showWin(winResult);
            
            // Показываем уведомление в демо-режиме
            this.showMessage(`🎉 Демо-выигрыш: +${winResult.winAmount}₽`, 'win');
        } else {
            this.showMessage('😔 Нет выигрыша', 'lose');
        }
        
        console.log('Демо-игра:', {
            bet: this.currentBet,
            win: winResult.winAmount,
            oldBalance: oldBalance,
            newBalance: this.balance
        });
    }

    handleLocalGameResult(winResult) {
        // Локальная обработка (если Telegram не ответил)
        this.balance = this.balance - this.currentBet + winResult.winAmount;
        
        if (winResult.winAmount > 0) {
            this.winsCount++;
            this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
            this.showWin(winResult);
        } else {
            this.showMessage('😔 Нет выигрыша', 'lose');
        }
    }

    async quickSpin() {
        if (this.isSpinning) return;

        if (this.currentBet > this.balance) {
            this.showMessage('Не хватает средств!', 'error');
            return;
        }

        this.isSpinning = true;
        this.gamesPlayed++;

        // Быстрая анимация
        const cells = document.querySelectorAll('.reel-cell');
        for (let i = 0; i < 10; i++) {
            cells.forEach(cell => {
                const symbol = CONFIG.symbols[Math.floor(Math.random() * CONFIG.symbols.length)];
                cell.textContent = symbol.emoji;
            });
            await this.sleep(50);
        }

        // Результат
        const result = this.generateResult();
        this.displayResult(result);
        const winResult = this.checkWin(result);

        if (isTelegramWebApp) {
            await this.handleTelegramGameResult(winResult, result);
        } else {
            this.handleDemoGameResult(winResult);
        }

        this.isSpinning = false;
        this.saveToStorage();
        this.updateDisplay();
    }

    async animateSpin() {
        const cells = document.querySelectorAll('.reel-cell');
        const totalFrames = this.isMobile ? 20 : 30;

        for (let frame = 0; frame < totalFrames; frame++) {
            cells.forEach(cell => {
                const symbol = CONFIG.symbols[Math.floor(Math.random() * CONFIG.symbols.length)];
                cell.textContent = symbol.emoji;
                cell.style.transform = `scale(${1 + Math.random() * 0.1})`;
            });
            await this.sleep(30 + frame);
        }

        // Завершение
        for (let i = 0; i < 3; i++) {
            cells.forEach(cell => {
                cell.style.transform = 'scale(1.05)';
            });
            await this.sleep(80);
            cells.forEach(cell => {
                cell.style.transform = 'scale(1)';
            });
            await this.sleep(80);
        }
    }

    generateResult() {
        const weightedSymbols = [];
        CONFIG.symbols.forEach(symbol => {
            for (let i = 0; i < symbol.weight; i++) {
                weightedSymbols.push(symbol);
            }
        });

        const result = [];
        for (let i = 0; i < CONFIG.gridSize * CONFIG.gridSize; i++) {
            const randomIndex = Math.floor(Math.random() * weightedSymbols.length);
            result.push(weightedSymbols[randomIndex]);
        }

        return result;
    }

    displayResult(result) {
        const cells = document.querySelectorAll('.reel-cell');

        cells.forEach((cell, index) => {
            cell.textContent = result[index].emoji;
            cell.classList.remove('win', 'big-win');
        });
    }

    checkWin(result) {
        const symbolCount = {};
        result.forEach(symbol => {
            const emoji = symbol.emoji;
            symbolCount[emoji] = (symbolCount[emoji] || 0) + 1;
        });

        let maxCount = 0;
        let winningSymbol = null;

        for (const emoji in symbolCount) {
            if (symbolCount[emoji] > maxCount) {
                maxCount = symbolCount[emoji];
                winningSymbol = result.find(s => s.emoji === emoji);
            }
        }

        const lines = this.checkLines(result);
        let totalWin = 0;
        let winningCells = [];

        if (maxCount >= 3 && winningSymbol) {
            const multiplier = winningSymbol.multipliers[maxCount] || 0;
            totalWin += this.currentBet * multiplier;

            result.forEach((symbol, index) => {
                if (symbol.emoji === winningSymbol.emoji) {
                    winningCells.push(index);
                }
            });
        }

        if (lines.totalWin > 0) {
            totalWin += lines.totalWin;
            winningCells = [...winningCells, ...lines.winningCells];
        }

        return {
            winAmount: totalWin,
            winningCells: [...new Set(winningCells)],
            maxCount: maxCount,
            symbol: winningSymbol
        };
    }

    checkLines(result) {
        const size = CONFIG.gridSize;
        let totalWin = 0;
        let winningCells = [];

        // Горизонтальные линии
        for (let row = 0; row < size; row++) {
            const symbols = [];
            const cells = [];
            for (let col = 0; col < size; col++) {
                const index = row * size + col;
                symbols.push(result[index]);
                cells.push(index);
            }

            const lineWin = this.checkLine(symbols);
            if (lineWin > 0) {
                totalWin += lineWin;
                winningCells.push(...cells);
            }
        }

        // Вертикальные линии
        for (let col = 0; col < size; col++) {
            const symbols = [];
            const cells = [];
            for (let row = 0; row < size; row++) {
                const index = row * size + col;
                symbols.push(result[index]);
                cells.push(index);
            }

            const lineWin = this.checkLine(symbols);
            if (lineWin > 0) {
                totalWin += lineWin;
                winningCells.push(...cells);
            }
        }

        // Диагонали
        const diag1 = [];
        const diag1Cells = [];
        const diag2 = [];
        const diag2Cells = [];

        for (let i = 0; i < size; i++) {
            const index1 = i * size + i;
            diag1.push(result[index1]);
            diag1Cells.push(index1);

            const index2 = i * size + (size - 1 - i);
            diag2.push(result[index2]);
            diag2Cells.push(index2);
        }

        const diag1Win = this.checkLine(diag1);
        if (diag1Win > 0) {
            totalWin += diag1Win * 2;
            winningCells.push(...diag1Cells);
        }

        const diag2Win = this.checkLine(diag2);
        if (diag2Win > 0) {
            totalWin += diag2Win * 2;
            winningCells.push(...diag2Cells);
        }

        return {
            totalWin: totalWin,
            winningCells: winningCells
        };
    }

    checkLine(symbols) {
        const firstSymbol = symbols[0];
        const allSame = symbols.every(s => s.emoji === firstSymbol.emoji);

        if (allSame && symbols.length >= 3) {
            return this.currentBet * (firstSymbol.multipliers[symbols.length] || 0);
        }

        return 0;
    }

    showWin(winResult) {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        const winInfoElement = document.getElementById('winInfo');

        winResult.winningCells.forEach(cellIndex => {
            const cell = document.getElementById(`cell-${cellIndex}`);
            if (cell) {
                cell.classList.add(winResult.winAmount >= this.currentBet * 100 ? 'big-win' : 'win');
            }
        });

        let message = '';
        if (winResult.winAmount >= this.currentBet * 100) {
            message = '🎉 МЕГА ДЖЕКПОТ!';
        } else if (winResult.winAmount >= this.currentBet * 50) {
            message = '🌟 СУПЕР ВЫИГРЫШ!';
        } else if (winResult.winAmount >= this.currentBet * 20) {
            message = '✨ БОЛЬШОЙ ВЫИГРЫШ!';
        } else if (winResult.winAmount >= this.currentBet * 10) {
            message = '👍 ХОРОШИЙ ВЫИГРЫШ!';
        } else {
            message = '👌 ВЫИГРЫШ!';
        }

        resultElement.textContent = message;
        resultElement.style.color = '#00FF00';

        winAmountElement.textContent = `+${winResult.winAmount} ₽`;
        winAmountElement.style.display = 'block';

        if (winResult.maxCount > 0) {
            winInfoElement.textContent = `${winResult.maxCount}× ${winResult.symbol?.emoji || ''}`;
        }

        winAmountElement.classList.add('win-animation');

        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }

    showMessage(text, type = 'info') {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        const winInfoElement = document.getElementById('winInfo');

        document.querySelectorAll('.reel-cell').forEach(cell => {
            cell.classList.remove('win', 'big-win');
        });

        resultElement.textContent = text;
        winAmountElement.textContent = '';
        winInfoElement.textContent = '';
        winAmountElement.style.display = 'none';

        const colors = {
            error: '#FF4444',
            win: '#00FF00',
            lose: '#FF8800',
            info: '#FFFFFF'
        };

        resultElement.style.color = colors[type] || colors.info;
    }

    async sendToTelegram(event, data = {}) {
        return new Promise((resolve) => {
            if (!isTelegramWebApp || !window.Telegram?.WebApp) {
                console.log('Demo mode: Simulating Telegram response');
                // В демо-режиме симулируем ответ бота
                setTimeout(() => {
                    resolve({
                        success: true,
                        new_balance: this.balance,
                        games_played: this.gamesPlayed,
                        demo_mode: true
                    });
                }, 500);
                return;
            }

            const requestId = Date.now();
            const messageData = {
                event: event,
                user_id: this.userId,
                request_id: requestId,
                timestamp: new Date().toISOString(),
                ...data
            };

            console.log('Отправка данных в Telegram:', messageData);
            
            try {
                window.Telegram.WebApp.sendData(JSON.stringify(messageData));
                
                // Telegram обработает ответ через бота
                // Здесь мы просто разрешаем промис
                setTimeout(() => {
                    resolve({
                        success: true,
                        message: 'Data sent to Telegram'
                    });
                }, 100);
                
            } catch (error) {
                console.error('Ошибка отправки данных в Telegram:', error);
                resolve({
                    success: false,
                    error: error.message
                });
            }
        });
    }

    handleDemoResponse(data) {
        // Обработка демо-ответов
        console.log('Demo response received:', data);
    }

    updateDisplay() {
        document.getElementById('balance').textContent = `${this.balance} ₽`;
        document.getElementById('currentBet').textContent = `${this.currentBet} ₽`;

        document.getElementById('gamesCount').textContent = this.gamesPlayed;
        document.getElementById('winsCount').textContent = this.winsCount;
        document.getElementById('biggestWin').textContent = `${this.biggestWin} ₽`;

        document.querySelectorAll('.quick-bet[data-bet="MAX"]').forEach(btn => {
            btn.textContent = `MAX (${Math.min(CONFIG.maxBet, this.balance)}₽)`;
        });

        const balanceEl = document.getElementById('balance');
        if (this.balance < CONFIG.minBet) {
            balanceEl.style.background = 'linear-gradient(45deg, #FF416C, #FF4B2B)';
        } else if (this.balance < 100) {
            balanceEl.style.background = 'linear-gradient(45deg, #FFA500, #FF8C00)';
        } else {
            balanceEl.style.background = 'linear-gradient(45deg, #00b09b, #96c93d)';
        }

        const spinBtn = document.getElementById('spinBtn');
        if (this.balance < CONFIG.minBet) {
            spinBtn.disabled = true;
            spinBtn.style.opacity = '0.6';
        } else {
            spinBtn.disabled = false;
            spinBtn.style.opacity = '1';
        }
    }

    saveToStorage() {
        const data = {
            balance: this.balance,
            currentBet: this.currentBet,
            gamesPlayed: this.gamesPlayed,
            winsCount: this.winsCount,
            biggestWin: this.biggestWin,
            lastPlayed: new Date().toISOString()
        };
        localStorage.setItem(`casino_data_${this.userId}`, JSON.stringify(data));
    }

    loadFromStorage() {
        const data = localStorage.getItem(`casino_data_${this.userId}`);
        if (data) {
            try {
                const saved = JSON.parse(data);
                this.balance = saved.balance || 1000;
                this.currentBet = saved.currentBet || 50;
                this.gamesPlayed = saved.gamesPlayed || 0;
                this.winsCount = saved.winsCount || 0;
                this.biggestWin = saved.biggestWin || 0;
            } catch (e) {
                console.error('Error loading from storage:', e);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализируем игру...');
    
    // Проверяем, запущены ли мы в iframe Telegram
    if (window.parent !== window) {
        console.log('Запущено во фрейме (возможно Telegram WebApp)');
    }
    
    game = new GameState();
    
    // Добавляем информационное сообщение в консоль
    console.log('Игра инициализирована. Режим:', isTelegramWebApp ? 'Telegram WebApp' : 'Демо-режим');
    console.log('User ID:', game.userId);
});

// Обновляем баланс при возвращении на вкладку
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game) {
        game.updateDisplay();
    }
});
