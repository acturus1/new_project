// Конфигурация игры 5x3
const CONFIG = {
    symbols: [
        { emoji: "🍒", weight: 25, multipliers: {3: 3, 4: 5, 5: 10} },
        { emoji: "🍋", weight: 20, multipliers: {3: 3, 4: 5, 5: 8} },
        { emoji: "🍊", weight: 18, multipliers: {3: 3, 4: 5, 5: 8} },
        { emoji: "🍇", weight: 15, multipliers: {3: 5, 4: 8, 5: 12} },
        { emoji: "🔔", weight: 10, multipliers: {3: 8, 4: 12, 5: 20} },
        { emoji: "⭐", weight: 5, multipliers: {3: 10, 4: 20, 5: 50} },
        { emoji: "7️⃣", weight: 3, multipliers: {3: 20, 4: 50, 5: 100} },
        { emoji: "🃏", weight: 4, multipliers: {3: 2, 4: 3, 5: 5}, isWild: true }
    ],
    minBet: 1,
    maxBet: 50,
    lines: 20,
    reels: 5,
    rows: 3
};

// Линии выигрыша для 5x3 (20 линий)
const PAYLINES = [
    // Горизонтальные линии
    [[0,0], [1,0], [2,0], [3,0], [4,0]], // Линия 1: верхний ряд
    [[0,1], [1,1], [2,1], [3,1], [4,1]], // Линия 2: средний ряд
    [[0,2], [1,2], [2,2], [3,2], [4,2]], // Линия 3: нижний ряд
    
    // V-образные линии
    [[0,0], [1,1], [2,2], [3,1], [4,0]], // Линия 4: V сверху
    [[0,2], [1,1], [2,0], [3,1], [4,2]], // Линия 5: V снизу
    
    // /\-образные линии
    [[0,1], [1,0], [2,0], [3,0], [4,1]], // Линия 6
    [[0,1], [1,2], [2,2], [3,2], [4,1]], // Линия 7
    
    // Зигзаги
    [[0,0], [1,0], [2,1], [3,2], [4,2]], // Линия 8
    [[0,2], [1,2], [2,1], [3,0], [4,0]], // Линия 9
    [[0,0], [1,1], [2,1], [3,1], [4,0]], // Линия 10
    [[0,2], [1,1], [2,1], [3,1], [4,2]], // Линия 11
    
    // Ступеньки
    [[0,0], [1,1], [2,0], [3,1], [4,0]], // Линия 12
    [[0,2], [1,1], [2,2], [3,1], [4,2]], // Линия 13
    [[0,1], [1,0], [2,1], [3,0], [4,1]], // Линия 14
    [[0,1], [1,2], [2,1], [3,2], [4,1]], // Линия 15
    
    // Угловые
    [[0,0], [1,0], [2,1], [3,2], [4,2]], // Линия 16
    [[0,2], [1,2], [2,1], [3,0], [4,0]], // Линия 17
    [[0,0], [1,1], [2,2], [3,2], [4,2]], // Линия 18
    [[0,2], [1,1], [2,0], [3,0], [4,0]], // Линия 19
    [[0,0], [0,1], [0,2], [1,1], [2,0]]  // Линия 20
];

// Состояние игры
class GameState {
    constructor() {
        this.balance = 1000;
        this.currentBetPerLine = 10;
        this.isSpinning = false;
        this.gamesPlayed = 0;
        this.winsCount = 0;
        this.biggestWin = 0;
        this.userId = this.getUserId();
        this.activeLines = CONFIG.lines;
        this.init();
    }

    init() {
        this.createReelsGrid();
        this.createPaylinesDisplay();
        this.updateDisplay();
        this.setupEventListeners();
        this.loadFromStorage();
        this.setupTelegram();
    }

    getUserId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user_id') || 'guest';
    }

    setupTelegram() {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            tg.expand();
            tg.ready();
            console.log('Telegram WebApp initialized');
        }
    }

    createReelsGrid() {
        const grid = document.getElementById('reelsGrid');
        grid.innerHTML = '';
        
        // Создаем сетку 3 ряда × 5 колонок
        for (let row = 0; row < CONFIG.rows; row++) {
            for (let col = 0; col < CONFIG.reels; col++) {
                const cell = document.createElement('div');
                cell.className = 'reel-cell';
                cell.id = `reel-${col}-${row}`;
                cell.textContent = '?';
                grid.appendChild(cell);
            }
        }
    }

    createPaylinesDisplay() {
        const grid = document.getElementById('paylinesGrid');
        grid.innerHTML = '';
        
        for (let i = 0; i < CONFIG.lines; i++) {
            const btn = document.createElement('button');
            btn.className = 'payline-btn active';
            btn.textContent = `L${i + 1}`;
            btn.dataset.line = i;
            btn.addEventListener('click', (e) => {
                this.toggleLine(parseInt(e.target.dataset.line));
            });
            grid.appendChild(btn);
        }
    }

    toggleLine(lineIndex) {
        const btn = document.querySelector(`.payline-btn[data-line="${lineIndex}"]`);
        btn.classList.toggle('active');
        this.activeLines = document.querySelectorAll('.payline-btn.active').length;
        this.updateDisplay();
    }

    setupEventListeners() {
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isSpinning) return;
                const bet = parseInt(e.target.dataset.bet);
                this.setBet(bet);
            });
        });

        document.getElementById('spinBtn').addEventListener('click', () => {
            this.spin();
        });

        document.getElementById('refreshBalance').addEventListener('click', () => {
            this.fetchUserData();
        });
    }

    setBet(amount) {
        if (this.isSpinning) return;
        
        if (amount < CONFIG.minBet) {
            this.showMessage(`Минимальная ставка: ${CONFIG.minBet}₽`, 'error');
            return;
        }
        
        if (amount > CONFIG.maxBet) {
            this.showMessage(`Максимальная ставка: ${CONFIG.maxBet}₽`, 'error');
            return;
        }
        
        const totalBet = amount * this.activeLines;
        if (totalBet > this.balance) {
            this.showMessage('Недостаточно средств!', 'error');
            return;
        }
        
        this.currentBetPerLine = amount;
        
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === amount) {
                btn.classList.add('active');
            }
        });
        
        this.updateDisplay();
    }

    async spin() {
        if (this.isSpinning) return;
        
        const totalBet = this.currentBetPerLine * this.activeLines;
        if (totalBet > this.balance) {
            this.showMessage('Недостаточно средств!', 'error');
            return;
        }

        this.isSpinning = true;
        this.gamesPlayed++;
        
        this.balance -= totalBet;
        this.updateDisplay();
        
        document.getElementById('spinBtn').disabled = true;
        document.getElementById('spinBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> КРУТИТСЯ...';

        await this.animateSpin();
        
        const result = this.generateResult();
        this.displayResult(result);
        
        const winResult = this.checkAllLines(result);
        
        if (winResult.totalWin > 0) {
            this.balance += winResult.totalWin;
            this.winsCount++;
            this.biggestWin = Math.max(this.biggestWin, winResult.totalWin);
            this.showWin(winResult);
            this.sendToTelegram('win', winResult.totalWin);
        } else {
            this.showMessage('😔 Нет выигрыша', 'lose');
            this.sendToTelegram('loss', totalBet);
        }

        this.isSpinning = false;
        document.getElementById('spinBtn').disabled = false;
        document.getElementById('spinBtn').innerHTML = '<i class="fas fa-play"></i> КРУТИТЬ!';
        
        this.saveToStorage();
        this.updateDisplay();
    }

    async animateSpin() {
        const cells = document.querySelectorAll('.reel-cell');
        const symbols = CONFIG.symbols;
        
        for (let i = 0; i < 30; i++) {
            cells.forEach(cell => {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                cell.textContent = randomSymbol.emoji;
                cell.style.transform = `scale(${1 + Math.random() * 0.2})`;
            });
            await this.sleep(50 + i * 2);
        }
        
        for (let i = 0; i < 3; i++) {
            cells.forEach(cell => {
                cell.style.transform = 'scale(1.1)';
            });
            await this.sleep(100);
            cells.forEach(cell => {
                cell.style.transform = 'scale(1)';
            });
            await this.sleep(100);
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
        for (let row = 0; row < CONFIG.rows; row++) {
            for (let col = 0; col < CONFIG.reels; col++) {
                const randomIndex = Math.floor(Math.random() * weightedSymbols.length);
                result.push(weightedSymbols[randomIndex]);
            }
        }

        return result;
    }

    displayResult(result) {
        const cells = document.querySelectorAll('.reel-cell');
        
        cells.forEach((cell, index) => {
            cell.textContent = result[index].emoji;
            cell.classList.remove('win', 'wild');
            
            if (result[index].isWild) {
                cell.classList.add('wild');
            }
        });
    }

    checkAllLines(result) {
        const winningLines = [];
        let totalWin = 0;
        
        PAYLINES.forEach((line, lineIndex) => {
            const lineSymbols = [];
            let hasWild = false;
            
            line.forEach(([col, row]) => {
                const index = row * CONFIG.reels + col;
                lineSymbols.push(result[index]);
                if (result[index].isWild) {
                    hasWild = true;
                }
            });
            
            const win = this.checkLine(lineSymbols, hasWild);
            if (win > 0) {
                winningLines.push({
                    line: lineIndex + 1,
                    win: win,
                    symbols: lineSymbols
                });
                totalWin += win;
            }
        });
        
        return {
            winningLines: winningLines,
            totalWin: totalWin
        };
    }

    checkLine(symbols, hasWild) {
        let mainSymbol = null;
        let count = 0;
        
        for (let i = 0; i < symbols.length; i++) {
            if (symbols[i].isWild) {
                count++;
                continue;
            }
            
            if (!mainSymbol) {
                mainSymbol = symbols[i];
                count++;
            } else if (symbols[i].emoji === mainSymbol.emoji) {
                count++;
            } else {
                break;
            }
        }
        
        if (count >= 3 && mainSymbol) {
            const multiplier = mainSymbol.multipliers[count] || 0;
            return this.currentBetPerLine * multiplier;
        }
        
        return 0;
    }

    showWin(winResult) {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        const winLinesElement = document.getElementById('winLines');
        
        winResult.winningLines.forEach(winLine => {
            PAYLINES[winLine.line - 1].forEach(([col, row]) => {
                const cell = document.getElementById(`reel-${col}-${row}`);
                cell.classList.add('win');
            });
        });
        
        resultElement.textContent = `🎉 ВЫИГРЫШ ПО ${winResult.winningLines.length} ЛИНИЯМ!`;
        resultElement.style.color = '#00FF00';
        
        winAmountElement.textContent = `+${winResult.totalWin} ₽`;
        winAmountElement.style.display = 'block';
        
        if (winResult.winningLines.length > 0) {
            winLinesElement.textContent = `Линии: ${winResult.winningLines.map(w => w.line).join(', ')}`;
        }
        
        winAmountElement.classList.add('win-animation');
        setTimeout(() => {
            winAmountElement.classList.remove('win-animation');
        }, 1500);
    }

    showMessage(text, type = 'info') {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        const winLinesElement = document.getElementById('winLines');
        
        resultElement.textContent = text;
        winAmountElement.textContent = '';
        winLinesElement.textContent = '';
        winAmountElement.style.display = 'none';
        
        if (type === 'error') {
            resultElement.style.color = '#FF4444';
        } else if (type === 'win') {
            resultElement.style.color = '#00FF00';
        } else if (type === 'lose') {
            resultElement.style.color = '#FF8800';
        } else {
            resultElement.style.color = '#FFFFFF';
        }
    }

    updateDisplay() {
        const totalBet = this.currentBetPerLine * this.activeLines;
        
        document.getElementById('balance').textContent = `${this.balance} ₽`;
        document.getElementById('totalBet').textContent = `${totalBet} ₽`;
        document.getElementById('activeLines').textContent = this.activeLines;
        document.getElementById('winningLines').textContent = '0';
        document.getElementById('totalMultiplier').textContent = '0x';
        
        document.getElementById('gamesPlayed').textContent = this.gamesPlayed;
        document.getElementById('winsCount').textContent = this.winsCount;
        document.getElementById('biggestWin').textContent = `${this.biggestWin} ₽`;
        
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === this.currentBetPerLine) {
                btn.classList.add('active');
            }
        });
    }

    sendToTelegram(event, amount) {
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            
            const data = {
                event: 'game_result',
                user_id: this.userId,
                bet: this.currentBetPerLine * this.activeLines,
                win: event === 'win' ? amount : 0,
                result: event,
                balance: this.balance,
                timestamp: new Date().toISOString()
            };
            
            tg.sendData(JSON.stringify(data));
        }
    }

    saveToStorage() {
        const data = {
            balance: this.balance,
            gamesPlayed: this.gamesPlayed,
            winsCount: this.winsCount,
            biggestWin: this.biggestWin,
            lastPlayed: new Date().toISOString()
        };
        
        localStorage.setItem(`casino_5x_${this.userId}`, JSON.stringify(data));
    }

    loadFromStorage() {
        const data = localStorage.getItem(`casino_5x_${this.userId}`);
        if (data) {
            try {
                const saved = JSON.parse(data);
                this.balance = saved.balance || this.balance;
                this.gamesPlayed = saved.gamesPlayed || this.gamesPlayed;
                this.winsCount = saved.winsCount || this.winsCount;
                this.biggestWin = saved.biggestWin || this.biggestWin;
                this.updateDisplay();
            } catch (e) {
                console.error('Error loading from storage:', e);
            }
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    fetchUserData() {
        console.log('Fetching user data for ID:', this.userId);
    }
}

// Инициализация игры
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GameState();
});

// Экспортируем для отладки
window.Game = GameState;
