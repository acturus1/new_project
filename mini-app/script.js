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
        // Получаем данные из URL параметров (от бота)
        const urlParams = new URLSearchParams(window.location.search);
        this.userId = urlParams.get('user_id') || 'guest';
        this.initialBalance = parseInt(urlParams.get('balance')) || 1000;
        this.signature = urlParams.get('signature') || '';
        
        // Инициализируем состояние
        this.balance = this.initialBalance;
        this.currentBet = 50;
        this.isSpinning = false;
        this.gamesPlayed = 0;
        this.winsCount = 0;
        this.biggestWin = 0;
        this.isMobile = this.checkMobile();
        
        this.init();
    }

    init() {
        this.createGrid();
        this.updateDisplay();
        this.setupEventListeners();
        this.loadFromStorage();
        this.setupTelegram();
        this.setupMobileFeatures();
        
        // Настраиваем статус синхронизации
        if (window.Telegram && window.Telegram.WebApp) {
            this.updateSyncStatus('ready');
        } else {
            this.updateSyncStatus('offline');
        }
    }

    checkMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
               window.innerWidth <= 768;
    }

    setupTelegram() {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.expand();
            tg.ready();
            tg.setHeaderColor('#302b63');
            tg.setBackgroundColor('#0f0c29');
            
            // Показываем пользователя
            const user = tg.initDataUnsafe?.user;
            if (user) {
                console.log('Telegram user:', user.first_name, user.id);
            }
        }
    }

    updateSyncStatus(status, message) {
        const syncDot = document.getElementById('syncDot');
        const syncText = document.getElementById('syncText');
        const syncInfo = document.getElementById('syncInfo');
        
        if (!syncDot || !syncText || !syncInfo) return;
        
        const statusConfig = {
            'ready': { color: '#2ecc71', text: 'Готов к синхронизации' },
            'syncing': { color: '#f39c12', text: 'Синхронизация...', animate: true },
            'success': { color: '#27ae60', text: 'Баланс обновлен' },
            'error': { color: '#e74c3c', text: 'Ошибка синхронизации' },
            'offline': { color: '#95a5a6', text: 'Офлайн режим' }
        };
        
        const config = statusConfig[status] || statusConfig.ready;
        
        syncDot.style.background = config.color;
        syncText.textContent = message || config.text;
        
        if (config.animate) {
            syncDot.classList.add('syncing');
        } else {
            syncDot.classList.remove('syncing');
        }
        
        // Показываем/скрываем блок в зависимости от платформы
        if (window.Telegram && window.Telegram.WebApp) {
            syncInfo.style.display = 'block';
        } else {
            syncInfo.style.display = 'none';
        }
    }

    setupMobileFeatures() {
        if (this.isMobile) {
            this.setupTouchEvents();
            this.setupKeyboard();
            this.setupRulesToggle();
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
        if (this.currentBet > this.balance) {
            this.showMessage('Не хватает средств!', 'error');
            return;
        }

        this.isSpinning = true;
        this.gamesPlayed++;
        
        // Сохраняем старый баланс для отката при ошибке
        const oldBalance = this.balance;
        
        // Снимаем ставку
        this.balance -= this.currentBet;
        this.updateDisplay();
        
        // Блокируем кнопки
        const spinBtn = document.getElementById('spinBtn');
        spinBtn.disabled = true;
        spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';

        try {
            // Обновляем статус синхронизации
            if (window.Telegram && window.Telegram.WebApp) {
                this.updateSyncStatus('syncing', 'Отправка данных боту...');
            }
            
            // Анимация вращения
            await this.animateSpin();
            
            // Генерация результата
            const result = this.generateResult();
            this.displayResult(result);
            
            // Проверка выигрыша
            const winResult = this.checkWin(result);
            
            if (winResult.winAmount > 0) {
                // Выигрыш
                this.balance += winResult.winAmount;
                this.winsCount++;
                this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
                this.showWin(winResult);
                
                // Отправляем результат боту
                await this.sendResultToBot(winResult.winAmount);
            } else {
                // Проигрыш
                this.showMessage('😔 Нет выигрыша', 'lose');
                await this.sendResultToBot(0);
            }

        } catch (error) {
            console.error('Ошибка в игре:', error);
            // Откатываем баланс при ошибке
            this.balance = oldBalance;
            this.showMessage('❌ Ошибка игры', 'error');
            this.updateSyncStatus('error', 'Ошибка игры');
        } finally {
            // Разблокируем
            this.isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = '<i class="fas fa-play"></i> КРУТИТЬ!';
            
            // Сохраняем локально
            this.saveToStorage();
            this.updateDisplay();
        }
    }

    async quickSpin() {
        if (this.isSpinning) return;
        
        this.isSpinning = true;
        this.gamesPlayed++;
        this.balance -= this.currentBet;
        
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
        
        if (winResult.winAmount > 0) {
            this.balance += winResult.winAmount;
            this.winsCount++;
            this.biggestWin = Math.max(this.biggestWin, winResult.winAmount);
            this.showWin(winResult);
            await this.sendResultToBot(winResult.winAmount);
        } else {
            await this.sendResultToBot(0);
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
        // Проверяем линию на одинаковые символы
        const firstSymbol = symbols[0];
        const allSame = symbols.every(s => s.emoji === firstSymbol.emoji);
        
        if (allSame && symbols.length >= 3) {
            return this.currentBet * (firstSymbol.multipliers[symbols.length] || 0);
        }
        
        return 0;
    }

    async sendResultToBot(winAmount) {
        if (!window.Telegram || !window.Telegram.WebApp) {
            this.updateSyncStatus('offline', 'Офлайн режим');
            return;
        }
        
        try {
            this.updateSyncStatus('syncing', 'Синхронизация...');
            
            const tg = window.Telegram.WebApp;
            
            // Генерируем подпись для безопасности
            const signature = await this.generateSignature(this.userId, this.balance);
            
            const data = {
                event: 'sync_balance',
                user_id: this.userId,
                balance: this.balance,
                bet: this.currentBet,
                win: winAmount,
                result: winAmount > 0 ? 'win' : 'loss',
                signature: signature,
                timestamp: new Date().toISOString(),
                game: 'slots_5x5',
                platform: this.isMobile ? 'mobile' : 'desktop'
            };
            
            // Отправляем данные боту
            tg.sendData(JSON.stringify(data));
            console.log('Данные отправлены боту:', data);
            
            this.updateSyncStatus('success', 'Баланс обновлен');
            
            // Через 3 секунды возвращаем в обычный статус
            setTimeout(() => {
                this.updateSyncStatus('ready');
            }, 3000);
            
        } catch (error) {
            this.updateSyncStatus('error', 'Ошибка синхронизации');
            console.error('Ошибка отправки данных боту:', error);
        }
    }

    async generateSignature(userId, balance) {
        try {
            // Используем SubtleCrypto если доступен
            if (window.crypto && window.crypto.subtle) {
                const encoder = new TextEncoder();
                const data = encoder.encode(`${userId}:${balance}:${this.signature}`);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
        } catch (e) {
            console.warn('SubtleCrypto не доступен, используем простую подпись');
        }
        
        // Fallback для старых браузеров
        return btoa(`${userId}:${balance}:${Date.now()}`).slice(0, 32);
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
        
        // Показываем статус синхронизации
        if (window.Telegram && window.Telegram.WebApp) {
            winInfoElement.innerHTML += '<br><small>🔄 Синхронизация с ботом...</small>';
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

    updateDisplay() {
        // Баланс
        document.getElementById('balance').textContent = `${this.balance} ₽`;
        document.getElementById('currentBet').textContent = `${this.currentBet} ₽`;
        
        // Статистика
        document.getElementById('gamesCount').textContent = this.gamesPlayed;
        document.getElementById('winsCount').textContent = this.winsCount;
        document.getElementById('biggestWin').textContent = `${this.biggestWin} ₽`;
        
        // Обновляем кнопку MAX если нужно
        document.querySelectorAll('.quick-bet[data-bet="MAX"]').forEach(btn => {
            btn.textContent = `MAX (${Math.min(CONFIG.maxBet, this.balance)}₽)`;
        });
        
        // Меняем цвет баланса если мало средств
        const balanceEl = document.getElementById('balance');
        if (this.balance < CONFIG.minBet) {
            balanceEl.style.background = 'linear-gradient(45deg, #FF416C, #FF4B2B)';
        } else if (this.balance < 100) {
            balanceEl.style.background = 'linear-gradient(45deg, #FFA500, #FF8C00)';
        } else {
            balanceEl.style.background = 'linear-gradient(45deg, #00b09b, #96c93d)';
        }
    }

    saveToStorage() {
        const data = {
            balance: this.balance,
            gamesPlayed: this.gamesPlayed,
            winsCount: this.winsCount,
            biggestWin: this.biggestWin,
            currentBet: this.currentBet,
            lastPlayed: new Date().toISOString(),
            userId: this.userId
        };
        
        localStorage.setItem(`casino_5x5_${this.userId}`, JSON.stringify(data));
    }

    loadFromStorage() {
        const data = localStorage.getItem(`casino_5x5_${this.userId}`);
        if (data) {
            try {
                const saved = JSON.parse(data);
                this.balance = saved.balance || this.balance;
                this.gamesPlayed = saved.gamesPlayed || this.gamesPlayed;
                this.winsCount = saved.winsCount || this.winsCount;
                this.biggestWin = saved.biggestWin || this.biggestWin;
                this.currentBet = saved.currentBet || this.currentBet;
                this.updateDisplay();
            } catch (e) {
                console.error('Error loading from storage:', e);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Инициализация игры при загрузке
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GameState();
    
    // Показываем информацию о пользователе
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user_id');
    const balance = urlParams.get('balance');
    
    if (userId && balance) {
        console.log(`Игра для пользователя ${userId}, начальный баланс: ${balance}₽`);
        
        // Можно показать приветствие
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            const user = tg.initDataUnsafe?.user;
            if (user) {
                const balanceEl = document.getElementById('balance');
                balanceEl.innerHTML = `${balance} ₽<br><small>${user.first_name}</small>`;
            }
        }
    }
    
    // Добавляем поддержку PWA
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
        navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
});

// Обработка изменения ориентации
window.addEventListener('orientationchange', () => {
    setTimeout(() => {
        location.reload();
    }, 100);
});

// Предотвращаем зум на мобильных
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
        e.preventDefault();
    }
}, { passive: false });

document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
});

// Обработка сообщений от бота (если нужно)
if (window.Telegram && window.Telegram.WebApp) {
    const tg = window.Telegram.WebApp;
    
    // Можно добавить обработку входящих сообщений от бота
    tg.onEvent('viewportChanged', (event) => {
        console.log('Viewport changed:', event);
    });
    
    tg.onEvent('themeChanged', () => {
        console.log('Theme changed');
    });
}

// Экспортируем для отладки
window.Game = GameState;
