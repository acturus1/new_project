from app import app, db
from database import User, SystemSettings, Jackpot

with app.app_context():
    # Создаем таблицы
    db.create_all()
    
    # Инициализируем настройки если их нет
    if not SystemSettings.query.first():
        settings = SystemSettings()
        db.session.add(settings)
        print("Настройки системы созданы")
    
    # Инициализируем джекпот если его нет
    if not Jackpot.query.first():
        jackpot = Jackpot(amount=5000)
        db.session.add(jackpot)
        print("Джекпот инициализирован")
    
    # Создаем тестового админа если нет пользователей
    if not User.query.first():
        admin = User(
            telegram_id='admin',
            username='admin',
            balance=10000
        )
        db.session.add(admin)
        print("Тестовый админ создан")
    
    db.session.commit()
    print("База данных успешно инициализирована")
