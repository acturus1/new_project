// Конфигурация игры
const CONFIG = {
    symbols: [
        { emoji: "🍒", weight: 30, multiplier: 2 },
        { emoji: "🍋", weight: 25, multiplier: 3 },
        { emoji: "🍊", weight: 20, multiplier: 4 },
        { emoji: "🍇", weight: 15, multiplier: 5 },
        { emoji: "🔔", weight: 7, multiplier: 10 },
        { emoji: "⭐", weight: 2, multiplier: 20 },
        { emoji: "7️⃣", weight: 1, multiplier: 100 }
    ],
    minBet: 10,
    maxBet: 500
};

// Состояние игры
class GameState {
    constructor() {
        this.balance = 1000;
        this.currentBet = 100;
        this.isSpinning = false;
        this.gamesPlayed = 0;
        this.winsCount = 0;
        this.biggestWin = 0;
        this.userId = this.getUserId();
        this.init();
    }

    init() {
        this.updateDisplay();
        this.setupEventListeners();
        this.loadFromStorage();
        this.setupTelegram();
    }

    getUserId() {
        // Получаем user_id из URL параметров
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('user_id') || 'guest';
    }

    setupTelegram() {
        // Интеграция с Telegram Web App
        if (window.Telegram && window.Telegram.WebApp) {
            const tg = window.Telegram.WebApp;
            
            // Разворачиваем на весь экран
            tg.expand();
            tg.ready();
            
            // Меняем цвет интерфейса Telegram
            tg.setHeaderColor('#302b63');
            tg.setBackgroundColor('#0f0c29');
            
            console.log('Telegram WebApp initialized for user:', tg.initDataUnsafe?.user);
            
            // Получаем данные пользователя из бота
            this.fetchUserData();
        }
    }

    async fetchUserData() {
        try {
            // Здесь можно добавить запрос к API бота для получения данных
            // Пока используем локальные данные
            console.log('Fetching user data for ID:', this.userId);
        } catch (error) {
            console.error('Error fetching user data:', error);
        }
    }

    setupEventListeners() {
        // Кнопки ставок
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (this.isSpinning) return;
                const bet = parseInt(e.target.dataset.bet);
                this.setBet(bet);
            });
        });

        // Кнопки +/- ставки
        document.getElementById('betMinus').addEventListener('click', () => {
            if (this.isSpinning) return;
            this.setBet(Math.max(CONFIG.minBet, this.currentBet - 10));
        });

        document.getElementById('betPlus').addEventListener('click', () => {
            if (this.isSpinning) return;
            this.setBet(Math.min(CONFIG.maxBet, this.currentBet + 10));
        });

        // Кнопка вращения
        document.getElementById('spinBtn').addEventListener('click', () => {
            this.spin();
        });

        // Кнопка обновления баланса
        document.getElementById('refreshBalance').addEventListener('click', () => {
            this.fetchUserData();
        });
    }

    setBet(amount) {
        if (this.isSpinning) return;
        
        // Проверяем минимальную ставку
        if (amount < CONFIG.minBet) {
            this.showMessage(`Минимальная ставка: ${CONFIG.minBet}₽`, 'error');
            return;
        }
        
        // Проверяем максимальную ставку
        if (amount > CONFIG.maxBet) {
            this.showMessage(`Максимальная ставка: ${CONFIG.maxBet}₽`, 'error');
            return;
        }
        
        // Проверяем баланс
        if (amount > this.balance) {
            this.showMessage('Недостаточно средств!', 'error');
            return;
        }
        
        this.currentBet = amount;
        
        // Обновляем активную кнопку
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === amount) {
                btn.classList.add('active');
            }
        });
        
        // Обновляем отображение
        document.getElementById('currentBet').textContent = `${amount} ₽`;
    }

    async spin() {
        if (this.isSpinning) return;
        if (this.currentBet > this.balance) {
            this.showMessage('Недостаточно средств!', 'error');
            return;
        }

        this.isSpinning = true;
        this.gamesPlayed++;
        
        // Снимаем ставку
        this.balance -= this.currentBet;
        this.updateDisplay();
        
        // Блокируем кнопки
        document.getElementById('spinBtn').disabled = true;
        document.getElementById('spinBtn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> КРУТИТСЯ...';

        // Анимация вращения
        await this.animateSpin();
        
        // Генерация результата
        const result = this.generateResult();
        
        // Отображение результата
        this.displayResult(result);
        
        // Проверка выигрыша
        const win = this.checkWin(result);
        
        if (win > 0) {
            // Выигрыш
            this.balance += win;
            this.winsCount++;
            this.biggestWin = Math.max(this.biggestWin, win);
            this.showWin(win);
            
            // Отправляем результат в Telegram бот
            this.sendToTelegram('win', win);
        } else {
            // Проигрыш
            this.showMessage('😔 Нет выигрыша', 'lose');
            this.sendToTelegram('loss', this.currentBet);
        }

        // Разблокируем кнопки
        this.isSpinning = false;
        document.getElementById('spinBtn').disabled = false;
        document.getElementById('spinBtn').innerHTML = '<i class="fas fa-play"></i> КРУТИТЬ!';
        
        // Сохраняем состояние
        this.saveToStorage();
        this.updateDisplay();
    }

    async animateSpin() {
        const reels = document.querySelectorAll('.reel');
        const symbols = CONFIG.symbols;
        
        // Быстрая анимация вращения
        for (let i = 0; i < 20; i++) {
            reels.forEach(reel => {
                const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
                reel.textContent = randomSymbol.emoji;
                reel.style.transform = `scale(${1 + Math.random() * 0.2})`;
            });
            await this.sleep(50 + i * 5); // Замедляемся
        }
        
        // Завершающая анимация
        for (let i = 0; i < 3; i++) {
            reels.forEach(reel => {
                reel.style.transform = 'scale(1.1)';
            });
            await this.sleep(100);
            reels.forEach(reel => {
                reel.style.transform = 'scale(1)';
            });
            await this.sleep(100);
        }
    }

    generateResult() {
        // Генерация результата с учетом весов символов
        const weightedSymbols = [];
        CONFIG.symbols.forEach(symbol => {
            for (let i = 0; i < symbol.weight; i++) {
                weightedSymbols.push(symbol);
            }
        });

        const result = [];
        for (let i = 0; i < 3; i++) {
            const randomIndex = Math.floor(Math.random() * weightedSymbols.length);
            result.push(weightedSymbols[randomIndex]);
        }

        // Отображаем результат
        const reels = document.querySelectorAll('.reel');
        reels.forEach((reel, index) => {
            reel.textContent = result[index].emoji;
        });

        return result;
    }

    checkWin(result) {
        // Проверяем три одинаковых символа
        if (result[0].emoji === result[1].emoji && result[1].emoji === result[2].emoji) {
            return this.currentBet * result[0].multiplier;
        }
        
        // Проверяем два одинаковых символа
        if (result[0].emoji === result[1].emoji || 
            result[0].emoji === result[2].emoji || 
            result[1].emoji === result[2].emoji) {
            return this.currentBet * 2;
        }
        
        return 0;
    }

    displayResult(result) {
        const reels = document.querySelectorAll('.reel');
        reels.forEach((reel, index) => {
            reel.textContent = result[index].emoji;
            reel.classList.add('win-animation');
        });
        
        setTimeout(() => {
            reels.forEach(reel => {
                reel.classList.remove('win-animation');
            });
        }, 1500);
    }

    showWin(amount) {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        
        // Определяем уровень выигрыша
        let message = '';
        if (amount >= this.currentBet * 100) {
            message = '🎉 ДЖЕКПОТ!';
        } else if (amount >= this.currentBet * 20) {
            message = '🌟 ОГРОМНЫЙ ВЫИГРЫШ!';
        } else if (amount >= this.currentBet * 10) {
            message = '✨ БОЛЬШОЙ ВЫИГРЫШ!';
        } else if (amount >= this.currentBet * 5) {
            message = '👍 ОТЛИЧНЫЙ ВЫИГРЫШ!';
        } else {
            message = '👌 ХОРОШИЙ ВЫИГРЫШ!';
        }
        
        resultElement.textContent = message;
        resultElement.style.color = '#00FF00';
        
        winAmountElement.textContent = `+${amount} ₽`;
        winAmountElement.style.display = 'block';
        
        // Анимация
        winAmountElement.classList.add('win-animation');
        setTimeout(() => {
            winAmountElement.classList.remove('win-animation');
        }, 1500);
        
        // Звук выигрыша (можно добавить позже)
        // this.playSound('win');
    }

    showMessage(text, type = 'info') {
        const resultElement = document.getElementById('result');
        const winAmountElement = document.getElementById('winAmount');
        
        resultElement.textContent = text;
        winAmountElement.textContent = '';
        winAmountElement.style.display = 'none';
        
        // Цвет в зависимости от типа сообщения
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
        // Баланс
        document.getElementById('balance').textContent = `${this.balance} ₽`;
        
        // Текущая ставка
        document.getElementById('currentBet').textContent = `${this.currentBet} ₽`;
        
        // Статистика
        document.getElementById('gamesPlayed').textContent = this.gamesPlayed;
        document.getElementById('winsCount').textContent = this.winsCount;
        document.getElementById('biggestWin').textContent = `${this.biggestWin} ₽`;
        
        // Обновляем активную кнопку ставки
        document.querySelectorAll('.bet-btn').forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === this.currentBet) {
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
                bet: this.currentBet,
                win: event === 'win' ? amount : 0,
                result: event,
                balance: this.balance,
                timestamp: new Date().toISOString()
            };
            
            // Отправляем данные в бота
            tg.sendData(JSON.stringify(data));
            console.log('Data sent to Telegram:', data);
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
        
        localStorage.setItem(`casino_${this.userId}`, JSON.stringify(data));
    }

    loadFromStorage() {
        const data = localStorage.getItem(`casino_${this.userId}`);
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

    // Метод для воспроизведения звуков (можно добавить позже)
    playSound(soundName) {
        // const audio = new Audio(`sounds/${soundName}.mp3`);
        // audio.play().catch(e => console.log('Audio play failed:', e));
    }
}

// Инициализация игры при загрузке страницы
let game;

document.addEventListener('DOMContentLoaded', () => {
    game = new GameState();
    
    // Добавляем стили для анимаций
    const style = document.createElement('style');
    style.textContent = `
        @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .blink {
            animation: blink 0.5s ease-in-out 3;
        }
    `;
    document.head.appendChild(style);
});

// Экспортируем для отладки
window.Game = GameState;
