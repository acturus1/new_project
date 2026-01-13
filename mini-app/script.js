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

// Состояние игры
class GameState {
    constructor() {
        this.balance = 0; // Будет загружено с сервера
        this.currentBet = 50;
        this.isSpinning = false;
        this.gamesPlayed = 0;
        this.winsCount = 0;
        this.biggestWin = 0;
        this.userId = this.getUserId();
        this.isMobile = this.checkMobile();
        this.telegramWebApp = null;
        this.init();
    }

    async init() {
        this.createGrid();
        this.setupEventListeners();
        this.setupTelegram();
        await this.loadInitialData(); // Загружаем данные с сервера
        this.setupMobileFeatures();
        this.updateDisplay();
    }

    checkMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    getUserId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user_id') || 'guest';
    }

    setupTelegram() {
        if (window.Telegram && window.Telegram.WebApp) {
            this.telegramWebApp = window.Telegram.WebApp;
            this.telegramWebApp.expand();
            this.telegramWebApp.ready();
            this.telegramWebApp.setHeaderColor('#302b63');
            this.telegramWebApp.setBackgroundColor('#0f0c29');
            
            // Настраиваем обработчик входящих сообщений
            this.setupMessageHandler();
        }
    }

    setupMessageHandler() {
        // Telegram WebApp сам обрабатывает ответы через sendData
        // Эта функция нужна для дополнительной обработки
    }

    async loadInitialData() {
        try {
            // Запрашиваем начальные данные у бота
            const data = await this.sendToTelegram('get_initial_data', {});
            
            if (data && data.success) {
                this.balance = data.balance || 0;
                this.gamesPlayed = data.games_played || 0;
                this.biggestWin = data.biggest_win || 0;
                this.winsCount = data.total_wins || 0;
                
                console.log('Данные загружены с сервера:', {
                    balance: this.balance,
                    games: this.gamesPlayed
                });
                
                // Если баланс 0 и это новый пользователь, показываем приветствие
                if (this.balance === 0 && this.gamesPlayed === 0) {
                    this.showMessage('🎰 Добро пожаловать! Начните игру!', 'info');
                }
            } else {
                throw new Error('Не удалось загрузить данные');
            }
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            // Загружаем из localStorage как fallback
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

        // Свайп для изменения ставки
        let startX;
        const betControls = document.querySelector('.bet-controls');

        betControls.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
        });

        betControls.addEventListener('touchmove', (e) => {
            if (!startX || this.isSpinning) return;

            const currentX = e.touches[0].clientX;
            const diff = startX - currentX;

            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    this.adjustBet(-10); // Свайп влево
                } else {
                    this.adjustBet(10); // Свайп вправо
                }
                startX = currentX;
            }
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
        
        // Проверяем баланс с сервера
        const balanceCheck = await this.sendToTelegram('check_balance', {
            bet: this.currentBet
        });
        
        if (!balanceCheck || !balanceCheck.success) {
            this.showMessage(balanceCheck?.message || 'Ошибка проверки баланса', 'error');
            if (balanceCheck?.balance !== undefined) {
                this.balance = balanceCheck.balance;
                this.updateDisplay();
            }
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

        // Отправляем результат на сервер
        const gameData = {
            bet: this.currentBet,
            win_amount: winResult.winAmount,
            symbols: result.map(s => s.emoji),
            win_result: {
                winAmount: winResult.winAmount,
                winningCells: winResult.winningCells,
                maxCount: winResult.maxCount
            }
        };

        const serverResponse = await this.sendToTelegram('game_result', gameData);

        if (serverResponse && serverResponse.success) {
            // Обновляем данные с сервера
            this.balance = serverResponse.new_balance;
            this.gamesPlayed = serverResponse.games_played;
            
            if (winResult.winAmount > 0) {
                this.winsCount++;
                this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
                this.showWin(winResult);
            } else {
                this.showMessage('😔 Нет выигрыша', 'lose');
            }
        } else {
            this.showMessage('Ошибка обработки игры', 'error');
        }

        // Разблокируем кнопку
        this.isSpinning = false;
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-play"></i> КРУТИТЬ!';

        // Сохраняем настройки
        this.saveToStorage();
        this.updateDisplay();
    }

    async quickSpin() {
        if (this.isSpinning) return;

        // Проверяем баланс
        const balanceCheck = await this.sendToTelegram('check_balance', {
            bet: this.currentBet
        });
        
        if (!balanceCheck || !balanceCheck.success) {
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

        // Отправляем на сервер
        const gameData = {
            bet: this.currentBet,
            win_amount: winResult.winAmount,
            symbols: result.map(s => s.emoji)
        };

        const serverResponse = await this.sendToTelegram('game_result', gameData);

        if (serverResponse && serverResponse.success) {
            this.balance = serverResponse.new_balance;
            this.gamesPlayed = serverResponse.games_played;
            
            if (winResult.winAmount > 0) {
                this.winsCount++;
                this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
                this.showWin(winResult);
            }
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

        // Ищем максимальное количество одинаковых символов
        let maxCount = 0;
        let winningSymbol = null;

        for (const emoji in symbolCount) {
            if (symbolCount[emoji] > maxCount) {
                maxCount = symbolCount[emoji];
                winningSymbol = result.find(s => s.emoji === emoji);
            }
        }

        // Проверяем линии (горизонтальные, вертикальные, диагонали)
        const lines = this.checkLines(result);
        let totalWin = 0;
        let winningCells = [];

        // Выигрыш за одинаковые символы
        if (maxCount >= 3 && winningSymbol) {
            const multiplier = winningSymbol.multipliers[maxCount] || 0;
            totalWin += this.currentBet * multiplier;

            // Находим выигрышные ячейки
            result.forEach((symbol, index) => {
                if (symbol.emoji === winningSymbol.emoji) {
                    winningCells.push(index);
                }
            });
        }

        // Добавляем выигрыш за линии
        if (lines.totalWin > 0) {
            totalWin += lines.totalWin;
            winningCells = [...winningCells, ...lines.winningCells];
        }

        return {
            winAmount: totalWin,
            winningCells: [...new Set(winningCells)], // Убираем дубликаты
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
        const diag1 = []; // Главная диагональ
        const diag1Cells = [];
        const diag2 = []; // Побочная диагональ
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
            totalWin += diag1Win * 2; // Диагонали ×2
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

        // Подсвечиваем выигрышные ячейки
        winResult.winningCells.forEach(cellIndex => {
            const cell = document.getElementById(`cell-${cellIndex}`);
            if (cell) {
                cell.classList.add(winResult.winAmount >= this.currentBet * 100 ? 'big-win' : 'win');
            }
        });

        // Сообщение в зависимости от выигрыша
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

        // Анимация
        winAmountElement.classList.add('win-animation');

        // Вибрация на мобильных
        if (this.isMobile && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }

    showMessage(text, type = 'info') {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        const winInfoElement = document.getElementById('winInfo');

        // Сбрасываем подсветку
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
            if (!this.telegramWebApp) {
                resolve({ success: false, message: 'Telegram WebApp not available' });
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

            // Отправляем данные
            this.telegramWebApp.sendData(JSON.stringify(messageData));
            
            // Telegram WebApp автоматически обрабатывает ответ через основной чат
            // Просто разрешаем промис после отправки
            // Реальный ответ придет через обработчик в bot.py
            setTimeout(() => {
                resolve({ success: true, sent: true });
            }, 100);
        });
    }

    updateDisplay() {
        // Баланс
        document.getElementById('balance').textContent = `${this.balance} ₽`;
        document.getElementById('currentBet').textContent = `${this.currentBet} ₽`;

        // Статистика
        document.getElementById('gamesCount').textContent = this.gamesPlayed;
        document.getElementById('winsCount').textContent = this.winsCount;
        document.getElementById('biggestWin').textContent = `${this.biggestWin} ₽`;

        // Обновляем кнопку MAX
        document.querySelectorAll('.quick-bet[data-bet="MAX"]').forEach(btn => {
            btn.textContent = `MAX (${Math.min(CONFIG.maxBet, this.balance)}₽)`;
        });

        // Меняем цвет баланса
        const balanceEl = document.getElementById('balance');
        if (this.balance < CONFIG.minBet) {
            balanceEl.style.background = 'linear-gradient(45deg, #FF416C, #FF4B2B)';
        } else if (this.balance < 100) {
            balanceEl.style.background = 'linear-gradient(45deg, #FFA500, #FF8C00)';
        } else {
            balanceEl.style.background = 'linear-gradient(45deg, #00b09b, #96c93d)';
        }

        // Обновляем состояние кнопки вращения
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
        // Сохраняем только настройки
        const data = {
            currentBet: this.currentBet,
            lastPlayed: new Date().toISOString()
        };
        localStorage.setItem(`casino_settings_${this.userId}`, JSON.stringify(data));
    }

    loadFromStorage() {
        const data = localStorage.getItem(`casino_settings_${this.userId}`);
        if (data) {
            try {
                const saved = JSON.parse(data);
                this.currentBet = saved.currentBet || this.currentBet;
            } catch (e) {
                console.error('Error loading settings:', e);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Инициализация при загрузке
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GameState();

    // Добавляем поддержку PWA
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
});

// Обновляем баланс при возвращении на вкладку
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && game && game.telegramWebApp) {
        setTimeout(() => {
            game.loadInitialData();
        }, 1000);
    }
});
