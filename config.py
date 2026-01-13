import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Безопасность
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
    
    # База данных - используем PostgreSQL на Render, SQLite локально
    database_url = os.environ.get('DATABASE_URL')
    if database_url:
        # Render использует PostgreSQL, конвертируем URL
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://', 1)
        SQLALCHEMY_DATABASE_URI = database_url
    else:
        # Локальная разработка с SQLite
        SQLALCHEMY_DATABASE_URI = 'sqlite:///casino.db'
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_recycle': 300,
        'pool_pre_ping': True,
    }
    
    # Настройки админки
    ADMIN_USERNAME = os.environ.get('ADMIN_USERNAME', 'admin')
    ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')
    
    # Настройки игры
    MIN_BET = 10
    MAX_BET = 1000
    JACKPOT_AMOUNT = 5000
    INITIAL_BALANCE = 1000
    
    # Настройки для продакшена
    PREFERRED_URL_SCHEME = 'https'
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
