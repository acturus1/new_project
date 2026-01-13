document.addEventListener('DOMContentLoaded', function() {
    // Навигация по разделам
    const navLinks = document.querySelectorAll('.nav-menu a');
    const sections = document.querySelectorAll('section');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href').substring(1);
            
            // Показать нужный раздел
            sections.forEach(section => {
                section.style.display = 'none';
            });
            
            document.getElementById(targetId).style.display = 'block';
            
            // Обновить активное меню
            navLinks.forEach(link => link.parentElement.classList.remove('active'));
            this.parentElement.classList.add('active');
        });
    });
    
    // Инициализация - показываем dashboard
    document.getElementById('dashboard').style.display = 'block';
});

// Сохранение настроек
async function saveSettings() {
    const settings = {
        min_bet: document.getElementById('min_bet').value,
        max_bet: document.getElementById('max_bet').value,
        house_edge: document.getElementById('house_edge').value / 100,
        jackpot_chance: document.getElementById('jackpot_chance').value / 100,
        is_maintenance: document.getElementById('is_maintenance').checked
    };
    
    try {
        const response = await fetch('/admin/api/update_settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Настройки успешно сохранены!');
        } else {
            alert('Ошибка сохранения настроек');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка при сохранении');
    }
}

// Сброс джекпота
async function resetJackpot() {
    if (!confirm('Вы уверены, что хотите сбросить джекпот?')) return;
    
    try {
        const response = await fetch('/admin/api/reset_jackpot', {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Джекпот сброшен!');
            location.reload();
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка');
    }
}

// Установка джекпота
async function setJackpot() {
    const amount = document.getElementById('set_jackpot').value;
    
    if (!amount || amount < 1000) {
        alert('Минимальная сумма джекпота: 1000');
        return;
    }
    
    try {
        const response = await fetch('/admin/api/set_jackpot', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount: parseInt(amount) })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Джекпот обновлен!');
            location.reload();
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Произошла ошибка');
    }
}

// Автообновление статистики каждые 30 секунд
setInterval(() => {
    // Здесь можно добавить обновление данных через AJAX
}, 30000);
