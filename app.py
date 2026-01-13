from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from config import Config
from database import db, User, GameSession, Jackpot, SystemSettings
import random
import json
from datetime import datetime
import logging

# Настройка логирования
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config.from_object(Config)

# Инициализация БД
db.init_app(app)

# Инициализация Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'admin_login'

@login_manager.user_loader
def load_user(user_id):
    return User.query.get(int(user_id))

# Health check для Render
@app.route('/health')
def health_check():
    return jsonify({'status': 'healthy', 'timestamp': datetime.utcnow().isoformat()})

# Проверка работы БД
@app.route('/health/db')
def health_db():
    try:
        db.session.execute('SELECT 1')
        return jsonify({'database': 'connected'})
    except Exception as e:
        return jsonify({'database': 'error', 'message': str(e)}), 500

# Создаем таблицы при первом запуске
with app.app_context():
    db.create_all()
    # Инициализируем настройки если их нет
    if not SystemSettings.query.first():
        settings = SystemSettings()
        db.session.add(settings)
        db.session.commit()
    if not Jackpot.query.first():
        jackpot = Jackpot()
        db.session.add(jackpot)
        db.session.commit()

# Символы для слота
SYMBOLS = [
    {'name': 'cherry', 'multiplier': 3, 'weight': 30},
    {'name': 'lemon', 'multiplier': 4, 'weight': 25},
    {'name': 'orange', 'multiplier': 5, 'weight': 20},
    {'name': 'plum', 'multiplier': 6, 'weight': 15},
    {'name': 'bell', 'multiplier': 8, 'weight': 7},
    {'name': 'bar', 'multiplier': 10, 'weight': 3},
    {'name': 'seven', 'multiplier': 15, 'weight': 1},
    {'name': 'diamond', 'multiplier': 20, 'weight': 1}
]

# Главная страница игры
@app.route('/')
def index():
    user_id = request.args.get('user_id', 'guest')
    username = request.args.get('username', 'Guest')
    
    # Создаем или получаем пользователя
    user = User.query.filter_by(telegram_id=user_id).first()
    if not user and user_id != 'guest':
        user = User(telegram_id=user_id, username=username)
        db.session.add(user)
        db.session.commit()
    
    settings = SystemSettings.query.first()
    jackpot = Jackpot.query.first()
    
    return render_template('index.html', 
                         user=user,
                         symbols=SYMBOLS,
                         settings=settings,
                         jackpot=jackpot)

# API для игры
@app.route('/api/spin', methods=['POST'])
def spin():
    data = request.json
    user_id = data.get('user_id')
    bet_amount = int(data.get('bet', 10))
    
    # Проверяем минимальную и максимальную ставку
    settings = SystemSettings.query.first()
    if bet_amount < settings.min_bet or bet_amount > settings.max_bet:
        return jsonify({'error': f'Ставка должна быть от {settings.min_bet} до {settings.max_bet}'})
    
    user = User.query.filter_by(telegram_id=user_id).first()
    if not user:
        return jsonify({'error': 'Пользователь не найден'})
    
    # Проверяем баланс
    if user.balance < bet_amount:
        return jsonify({'error': 'Недостаточно средств'})
    
    # Снимаем ставку
    user.balance -= bet_amount
    user.total_bets += bet_amount
    
    # Генерируем результат
    reels = []
    total_weight = sum(s['weight'] for s in SYMBOLS)
    
    for _ in range(3):
        rand = random.randint(1, total_weight)
        current_weight = 0
        for symbol in SYMBOLS:
            current_weight += symbol['weight']
            if rand <= current_weight:
                reels.append(symbol)
                break
    
    # Проверяем выигрыш
    win_amount = 0
    is_win = False
    is_jackpot = False
    
    # Проверка на 3 одинаковых символа
    if reels[0]['name'] == reels[1]['name'] == reels[2]['name']:
        win_amount = bet_amount * reels[0]['multiplier']
        is_win = True
        
        # Проверка на джекпот (для символа seven)
        if reels[0]['name'] == 'seven' and random.random() < settings.jackpot_chance:
            jackpot = Jackpot.query.first()
            win_amount += jackpot.amount
            jackpot.amount = 5000  # Сбрасываем джекпот
            jackpot.last_winner = user.username
            jackpot.last_win_date = datetime.utcnow()
            is_jackpot = True
        else:
            # Пополняем джекпот
            jackpot = Jackpot.query.first()
            jackpot.amount += int(bet_amount * 0.01)  # 1% от ставки идет в джекпот
    
    # Начисляем выигрыш
    if is_win:
        user.balance += win_amount
        user.total_wins += win_amount
    
    # Сохраняем игровую сессию
    game = GameSession(
        user_id=user.id,
        bet_amount=bet_amount,
        win_amount=win_amount,
        symbols=','.join([s['name'] for s in reels]),
        is_win=is_win
    )
    
    db.session.add(game)
    db.session.commit()
    
    return jsonify({
        'success': True,
        'reels': reels,
        'win_amount': win_amount,
        'balance': user.balance,
        'is_win': is_win,
        'is_jackpot': is_jackpot,
        'jackpot_amount': Jackpot.query.first().amount
    })

# Получение баланса
@app.route('/api/balance/<user_id>')
def get_balance(user_id):
    user = User.query.filter_by(telegram_id=user_id).first()
    if user:
        return jsonify({'balance': user.balance})
    return jsonify({'balance': 0})

# АДМИН-ПАНЕЛЬ
# Страница входа в админку
@app.route('/admin/login', methods=['GET', 'POST'])
def admin_login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        if username == app.config['ADMIN_USERNAME'] and password == app.config['ADMIN_PASSWORD']:
            # Создаем временного пользователя для админа
            admin_user = User.query.filter_by(username='admin').first()
            if not admin_user:
                admin_user = User(telegram_id='admin', username='admin')
                db.session.add(admin_user)
                db.session.commit()
            
            login_user(admin_user)
            return redirect(url_for('admin_panel'))
    
    return render_template('login.html')

# Админ-панель
@app.route('/admin')
@login_required
def admin_panel():
    if current_user.username != 'admin':
        return redirect(url_for('index'))
    
    # Статистика
    total_users = User.query.count()
    total_games = GameSession.query.count()
    total_bets = db.session.query(db.func.sum(User.total_bets)).scalar() or 0
    total_wins = db.session.query(db.func.sum(User.total_wins)).scalar() or 0
    
    # Последние игры
    recent_games = GameSession.query.order_by(GameSession.created_at.desc()).limit(10).all()
    
    settings = SystemSettings.query.first()
    jackpot = Jackpot.query.first()
    
    return render_template('admin.html',
                         total_users=total_users,
                         total_games=total_games,
                         total_bets=total_bets,
                         total_wins=total_wins,
                         recent_games=recent_games,
                         settings=settings,
                         jackpot=jackpot)

# API для админки
@app.route('/admin/api/update_settings', methods=['POST'])
@login_required
def update_settings():
    if current_user.username != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.json
    settings = SystemSettings.query.first()
    
    if 'min_bet' in data:
        settings.min_bet = int(data['min_bet'])
    if 'max_bet' in data:
        settings.max_bet = int(data['max_bet'])
    if 'house_edge' in data:
        settings.house_edge = float(data['house_edge'])
    if 'jackpot_chance' in data:
        settings.jackpot_chance = float(data['jackpot_chance'])
    if 'is_maintenance' in data:
        settings.is_maintenance = bool(data['is_maintenance'])
    
    db.session.commit()
    return jsonify({'success': True})

@app.route('/admin/api/reset_jackpot', methods=['POST'])
@login_required
def reset_jackpot():
    if current_user.username != 'admin':
        return jsonify({'error': 'Unauthorized'}), 403
    
    jackpot = Jackpot.query.first()
    jackpot.amount = 5000
    jackpot.last_winner = None
    jackpot.last_win_date = None
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/admin/logout')
@login_required
def admin_logout():
    logout_user()
    return redirect(url_for('index'))

if __name__ == '__main__':
    app.run(debug=True)
