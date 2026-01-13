from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    telegram_id = db.Column(db.String(100), unique=True, nullable=False)
    username = db.Column(db.String(100))
    balance = db.Column(db.Integer, default=1000)
    total_bets = db.Column(db.Integer, default=0)
    total_wins = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f'<User {self.username}>'

class GameSession(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    bet_amount = db.Column(db.Integer, nullable=False)
    win_amount = db.Column(db.Integer, default=0)
    symbols = db.Column(db.String(50))  # Например: "cherry,seven,bar"
    is_win = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('games', lazy=True))

class Jackpot(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    amount = db.Column(db.Integer, default=5000)
    last_winner = db.Column(db.String(100))
    last_win_date = db.Column(db.DateTime)
    
class SystemSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    min_bet = db.Column(db.Integer, default=10)
    max_bet = db.Column(db.Integer, default=1000)
    house_edge = db.Column(db.Float, default=0.05)  # 5% казино
    jackpot_chance = db.Column(db.Float, default=0.001)  # 0.1% шанс джекпота
    is_maintenance = db.Column(db.Boolean, default=False)
