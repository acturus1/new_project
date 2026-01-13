document.addEventListener('DOMContentLoaded', function() {
    // Элементы интерфейса
    const spinBtn = document.getElementById('spin-btn');
    const balanceElement = document.getElementById('balance');
    const jackpotElement = document.getElementById('jackpot-amount');
    const betButtons = document.querySelectorAll('.bet-btn');
    const customBetInput = document.getElementById('custom-bet');
    const setBetButton = document.getElementById('set-bet');
    const winModal = document.getElementById('win-modal');
    const winAmountElement = document.getElementById('win-amount');
    const winSymbolsElement = document.getElementById('win-symbols');
    const continueBtn = document.getElementById('continue-btn');
    const closeModal = document.querySelector('.close');
    
    // Переменные игры
    let currentBalance = parseInt(balanceElement.textContent);
    let currentBet = 10;
    let isSpinning = false;
    
    // Инициализация ставок
    betButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentBet = parseInt(btn.dataset.bet);
            updateBetButtons();
            customBetInput.value = currentBet;
        });
    });
    
    setBetButton.addEventListener('click', () => {
        const newBet = parseInt(customBetInput.value);
        if (!isNaN(newBet)) {
            currentBet = newBet;
            updateBetButtons();
        }
    });
    
    function updateBetButtons() {
        betButtons.forEach(btn => {
            btn.classList.remove('active');
            if (parseInt(btn.dataset.bet) === currentBet) {
                btn.classList.add('active');
            }
        });
        customBetInput.value = currentBet;
    }
    
    // Функция вращения барабанов
    spinBtn.addEventListener('click', async () => {
        if (isSpinning) return;
        if (currentBalance < currentBet) {
            alert('Недостаточно средств!');
            return;
        }
        
        isSpinning = true;
        spinBtn.disabled = true;
        
        // Анимация вращения
        const reels = document.querySelectorAll('.reel');
        reels.forEach(reel => {
            reel.querySelector('.symbol').style.animation = 'spin 0.1s linear infinite';
        });
        
        try {
            // Отправка запроса на сервер
            const response = await fetch('/api/spin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_id: window.userId || 'guest',
                    bet: currentBet
                })
            });
            
            const result = await response.json();
            
            if (result.error) {
                alert(result.error);
                isSpinning = false;
                spinBtn.disabled = false;
                reels.forEach(reel => {
                    reel.querySelector('.symbol').style.animation = 'none';
                });
                return;
            }
            
            // Обновление баланса
            currentBalance = result.balance;
            balanceElement.textContent = currentBalance;
            
            // Обновление джекпота
            if (result.jackpot_amount) {
                jackpotElement.textContent = result.jackpot_amount;
            }
            
            // Остановка анимации и показ результатов
            setTimeout(() => {
                reels.forEach((reel, index) => {
                    reel.querySelector('.symbol').style.animation = 'none';
                    const symbol = result.reels[index];
                    
                    // Эмодзи для символов
                    const emojiMap = {
                        'cherry': '🍒',
                        'lemon': '🍋',
                        'orange': '🍊',
                        'plum': '🫐',
                        'bell': '🔔',
                        'bar': '📊',
                        'seven': '7️⃣',
                        'diamond': '💎'
                    };
                    
                    reel.querySelector('.symbol').textContent = emojiMap[symbol.name] || symbol.name;
                    reel.querySelector('.symbol').dataset.multiplier = symbol.multiplier;
                });
                
                // Если выигрыш
                if (result.is_win) {
                    setTimeout(() => {
                        showWinModal(result.win_amount, result.reels, result.is_jackpot);
                    }, 500);
                    
                    // Анимация выигрыша
                    reels.forEach(reel => {
                        reel.style.animation = 'winGlow 0.5s ease-in-out 3';
                    });
                }
                
                // Добавление в историю
                addToHistory(result);
                
                isSpinning = false;
                spinBtn.disabled = false;
                
            }, 2000); // Длительность вращения
            
        } catch (error) {
            console.error('Ошибка:', error);
            alert('Произошла ошибка при подключении к серверу');
            isSpinning = false;
            spinBtn.disabled = false;
        }
    });
    
    // Показ модального окна выигрыша
    function showWinModal(amount, symbols, isJackpot) {
        winAmountElement.textContent = `+${amount} ₽`;
        
        if (isJackpot) {
            winAmountElement.innerHTML += '<br><span style="color:#ff0000; font-size:2rem;">🎰 ДЖЕКПОТ! 🎰</span>';
        }
        
        winSymbolsElement.innerHTML = symbols.map(s => 
            `<div class="win-symbol">${getSymbolEmoji(s.name)} ×${s.multiplier}</div>`
        ).join('');
        
        winModal.style.display = 'block';
    }
    
    function getSymbolEmoji(name) {
        const emojiMap = {
            'cherry': '🍒',
            'lemon': '🍋',
            'orange': '🍊',
            'plum': '🫐',
            'bell': '🔔',
            'bar': '📊',
            'seven': '7️⃣',
            'diamond': '💎'
        };
        return emojiMap[name] || name;
    }
    
    // Закрытие модального окна
    closeModal.addEventListener('click', () => {
        winModal.style.display = 'none';
    });
    
    continueBtn.addEventListener('click', () => {
        winModal.style.display = 'none';
    });
    
    // Добавление в историю
    function addToHistory(result) {
        const historyElement = document.getElementById('win-history');
        const winItem = document.createElement('div');
        winItem.className = 'win-item';
        
        const date = new Date().toLocaleTimeString();
        const symbolsText = result.reels.map(s => getSymbolEmoji(s.name)).join(' ');
        
        if (result.is_win) {
            winItem.innerHTML = `
                <div><strong>${date}</strong></div>
                <div>${symbolsText}</div>
                <div style="color:#00ff00">+${result.win_amount} ₽</div>
            `;
        } else {
            winItem.innerHTML = `
                <div><strong>${date}</strong></div>
                <div>${symbolsText}</div>
                <div style="color:#ff4444">Проигрыш</div>
            `;
        }
        
        historyElement.insertBefore(winItem, historyElement.firstChild);
        
        // Ограничиваем историю 10 последними записями
        while (historyElement.children.length > 10) {
            historyElement.removeChild(historyElement.lastChild);
        }
    }
    
    // Обновление баланса каждые 30 секунд
    setInterval(async () => {
        if (window.userId && window.userId !== 'guest') {
            try {
                const response = await fetch(`/api/balance/${window.userId}`);
                const data = await response.json();
                currentBalance = data.balance;
                balanceElement.textContent = currentBalance;
            } catch (error) {
                console.error('Ошибка обновления баланса:', error);
            }
        }
    }, 30000);
    
    // Инициализация
    updateBetButtons();
});
