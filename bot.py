import os
import json
import logging
import random
import hashlib
import hmac
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters

# Загружаем переменные окружения
load_dotenv()

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Получаем токен
TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
if not TOKEN:
    print("❌ Ошибка: Токен не найден!")
    print("Создайте файл .env и добавьте TELEGRAM_BOT_TOKEN=ваш_токен")
    exit(1)

# Секретный ключ для подписи данных
SECRET_KEY = os.getenv('SECRET_KEY', 'your-secret-key-change-this')

# База данных
DATABASE_FILE = "casino_users.json"

# Ссылка на ваш Mini App (замените на свою!)
MINI_APP_URL = "https://new-project-amber-eight.vercel.app"

class CasinoDB:
    def __init__(self, filename):
        self.filename = filename
        self.users = self.load_users()
    
    def load_users(self):
        try:
            if os.path.exists(self.filename):
                with open(self.filename, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Ошибка загрузки БД: {e}")
        return {}
    
    def save_users(self):
        try:
            with open(self.filename, 'w', encoding='utf-8') as f:
                json.dump(self.users, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"Ошибка сохранения БД: {e}")
    
    def get_user(self, user_id):
        user_id_str = str(user_id)
        if user_id_str not in self.users:
            self.users[user_id_str] = {
                "balance": 1000,
                "name": "",
                "games_played": 0,
                "total_wins": 0,
                "total_losses": 0,
                "biggest_win": 0,
                "daily_bonus_claimed": False,
                "created_at": datetime.now().isoformat(),
                "last_played": None
            }
            self.save_users()
        return self.users[user_id_str]
    
    def update_user(self, user_id, data):
        user = self.get_user(user_id)
        user.update(data)
        self.save_users()
        return user

# Инициализация базы
db = CasinoDB(DATABASE_FILE)

def generate_signature(user_id, balance):
    """Генерация подписи для проверки данных"""
    message = f"{user_id}:{balance}"
    return hmac.new(
        SECRET_KEY.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /start с кнопкой для Mini App"""
    user = update.effective_user
    user_data = db.get_user(user.id)
    
    # Сохраняем имя пользователя если еще нет
    if not user_data.get("name"):
        db.update_user(user.id, {"name": user.first_name})
    
    # Генерируем подпись для безопасности
    balance = user_data['balance']
    signature = generate_signature(user.id, balance)
    
    # Создаем URL с данными пользователя И временной меткой
    timestamp = int(datetime.now().timestamp())
    mini_app_url = f"{MINI_APP_URL}?user_id={user.id}&balance={balance}&signature={signature}&ts={timestamp}"
    
    # Также сохраняем последний известный баланс для быстрого доступа
    context.user_data['last_balance'] = balance
    
    keyboard = [
        [InlineKeyboardButton(
            text="🎮 ОТКРЫТЬ КАЗИНО", 
            web_app=WebAppInfo(url=mini_app_url)
        )],
        [
            InlineKeyboardButton("💰 Баланс", callback_data="balance"),
            InlineKeyboardButton("📊 Статистика", callback_data="stats")
        ],
        [
            InlineKeyboardButton("🎁 Бонус", callback_data="bonus"),
            InlineKeyboardButton("❓ Помощь", callback_data="help")
        ]
    ]
    
    welcome_text = f"""
🎰 *ДОБРО ПОЖАЛОВАТЬ В КАЗИНО, {user.first_name}!*

💰 *Ваш баланс:* {user_data['balance']}₽

🔄 *Баланс автоматически синхронизируется!*

🚀 *Нажмите кнопку ниже, чтобы открыть игровой автомат!*
    """
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

async def refresh_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обновить игру с актуальным балансом"""
    user = update.effective_user
    user_data = db.get_user(user.id)
    
    # Генерируем новую ссылку с актуальным балансом
    balance = user_data['balance']
    signature = generate_signature(user.id, balance)
    timestamp = int(datetime.now().timestamp())
    
    mini_app_url = f"{MINI_APP_URL}?user_id={user.id}&balance={balance}&signature={signature}&ts={timestamp}"
    
    keyboard = [[InlineKeyboardButton(
        text="🔄 ОБНОВИТЬ ИГРУ", 
        web_app=WebAppInfo(url=mini_app_url)
    )]]
    
    await update.message.reply_text(
        f"🔄 *Игра обновлена!*\n\n💰 *Актуальный баланс:* {balance}₽\n\nНажмите кнопку чтобы открыть игру с новым балансом:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )
async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка данных из Mini App - СИНХРОНИЗАЦИЯ БАЛАНСА"""
    try:
        # Получаем данные от Mini App
        data_json = update.effective_message.web_app_data.data
        data = json.loads(data_json)
        user_id = update.effective_user.id
        
        logger.info(f"Данные от Mini App пользователя {user_id}: {data}")
        
        # Получаем тип события
        event_type = data.get("event")
        
        if event_type == "sync_balance":
            # Синхронизация баланса
            new_balance = data.get("balance", 0)
            bet = data.get("bet", 0)
            win = data.get("win", 0)
            
            user_data = db.get_user(user_id)
            
            # Проверяем подпись для безопасности
            signature = data.get("signature")
            expected_signature = generate_signature(user_id, new_balance)
            
            if signature != expected_signature:
                logger.warning(f"Неверная подпись от пользователя {user_id}")
                await update.message.reply_text("❌ Ошибка безопасности!")
                return
            
            # Обновляем баланс в БД бота
            old_balance = user_data["balance"]
            user_data["balance"] = new_balance
            
            # Обновляем статистику
            user_data["games_played"] += 1
            user_data["last_played"] = datetime.now().isoformat()
            
            if win > 0:
                user_data["total_wins"] += 1
                user_data["biggest_win"] = max(user_data["biggest_win"], win)
                message = f"🎉 *Поздравляем!* Вы выиграли {win}₽"
            else:
                user_data["total_losses"] += 1
                message = f"😔 Вы проиграли {bet}₽"
            
            db.save_users()
            
            # Отправляем подтверждение
            await update.message.reply_text(
                f"{message}\n\n"
                f"💰 *Баланс обновлен:* {old_balance}₽ → {new_balance}₽\n"
                f"📊 *Всего игр:* {user_data['games_played']}\n"
                f"✅ *Выигрышей:* {user_data['total_wins']}\n"
                f"❌ *Проигрышей:* {user_data['total_losses']}",
                parse_mode='Markdown'
            )
            
        elif event_type == "get_balance":
            # Запрос баланса из Mini App
            user_data = db.get_user(user_id)
            signature = generate_signature(user_id, user_data["balance"])
            
            # Отправляем баланс обратно в Mini App
            await update.message.reply_text(
                f"💰 *Ваш баланс:* {user_data['balance']}₽\n"
                f"🔐 *Подпись:* {signature}",
                parse_mode='Markdown'
            )
            
    except json.JSONDecodeError:
        logger.error("Невалидный JSON от Mini App")
        await update.message.reply_text("❌ Ошибка формата данных")
    except Exception as e:
        logger.error(f"Ошибка обработки WebApp данных: {e}")
        await update.message.reply_text("❌ Произошла ошибка при обработке данных игры")

async def button_handler(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка inline-кнопок"""
    query = update.callback_query
    await query.answer()
    
    user_id = query.from_user.id
    user_data = db.get_user(user_id)
    
    data = query.data
    
    if data == "balance":
        await query.edit_message_text(
            f"💰 *Ваш баланс:* {user_data['balance']}₽\n\n"
            f"🎮 *Статистика:*\n"
            f"• Игр сыграно: {user_data['games_played']}\n"
            f"• Выигрышей: {user_data['total_wins']}\n"
            f"• Проигрышей: {user_data['total_losses']}\n"
            f"• Рекорд: {user_data['biggest_win']}₽",
            parse_mode='Markdown'
        )
        
    elif data == "stats":
        total_games = user_data['games_played']
        win_rate = (user_data['total_wins'] / total_games * 100) if total_games > 0 else 0
        
        await query.edit_message_text(
            f"📊 *Ваша статистика*\n\n"
            f"🎰 *Всего игр:* {total_games}\n"
            f"✅ *Выигрышей:* {user_data['total_wins']}\n"
            f"❌ *Проигрышей:* {user_data['total_losses']}\n"
            f"📈 *Процент побед:* {win_rate:.1f}%\n\n"
            f"💰 *Баланс:* {user_data['balance']}₽\n"
            f"🏆 *Крупнейший выигрыш:* {user_data['biggest_win']}₽",
            parse_mode='Markdown'
        )
        
    elif data == "bonus":
        today = datetime.now().strftime("%Y-%m-%d")
        
        if user_data.get("daily_bonus_claimed"):
            await query.edit_message_text(
                "🎁 *Бонус уже получен сегодня!*\n\n"
                "Приходите завтра за новым бонусом! 🎰",
                parse_mode='Markdown'
            )
            return
        
        bonus = random.randint(50, 200)
        new_balance = user_data['balance'] + bonus
        db.update_user(user_id, {
            'balance': new_balance,
            'daily_bonus_claimed': True
        })
        
        await query.edit_message_text(
            f"🎁 *Ежедневный бонус!*\n\n"
            f"💰 Вы получили: *{bonus}₽*\n"
            f"📊 Новый баланс: *{new_balance}₽*\n\n"
            f"🎰 Нажмите 'ОТКРЫТЬ КАЗИНО' чтобы начать игру!",
            parse_mode='Markdown'
        )
        
    elif data == "help":
        help_text = """
🎰 *Правила игры в казино 5×5*

💰 *Как играть:*
1. Нажмите кнопку "ОТКРЫТЬ КАЗИНО"
2. Выберите сумму ставки
3. Крутите барабаны
4. Получайте выигрыш!

🎪 *Выигрышные комбинации:*
• 3+ одинаковых символа = множитель
• 5 одинаковых = ДЖЕКПОТ ×100
• Диагонали дают ×2

⚡ *Символы и множители:*
🍒 - x5   🍋 - x5   🍊 - x5
🍇 - x8   🔔 - x10  ⭐ - x15  7️⃣ - x20

🎁 *Бонусы:*
• Ежедневный бонус: 50-200₽
• Стартовый баланс: 1000₽

🔒 *Баланс синхронизируется с ботом!*
        """
        await query.edit_message_text(help_text, parse_mode='Markdown')

async def balance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /balance"""
    user = update.effective_user
    user_data = db.get_user(user.id)
    
    await update.message.reply_text(
        f"💰 *Ваш баланс:* {user_data['balance']}₽\n\n"
        f"🎮 Статистика:\n"
        f"• Игр: {user_data['games_played']}\n"
        f"• Побед: {user_data['total_wins']}\n"
        f"• Рекорд: {user_data['biggest_win']}₽",
        parse_mode='Markdown'
    )

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /stats"""
    user = update.effective_user
    user_data = db.get_user(user.id)
    
    total_games = user_data['games_played']
    win_rate = (user_data['total_wins'] / total_games * 100) if total_games > 0 else 0
    
    await update.message.reply_text(
        f"📊 *Статистика*\n\n"
        f"👤 Игрок: {user.first_name}\n"
        f"🎰 Игр: {total_games}\n"
        f"✅ Побед: {user_data['total_wins']}\n"
        f"❌ Поражений: {user_data['total_losses']}\n"
        f"📈 Win Rate: {win_rate:.1f}%\n\n"
        f"💰 Баланс: {user_data['balance']}₽\n"
        f"🏆 Рекорд: {user_data['biggest_win']}₽",
        parse_mode='Markdown'
    )

async def bonus_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /bonus"""
    user = update.effective_user
    await button_handler(update, context)

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /help"""
    await update.message.reply_text(
        "ℹ️ *Доступные команды:*\n\n"
        "/start - Открыть казино\n"
        "/balance - Ваш баланс\n"
        "/stats - Статистика\n"
        "/bonus - Ежедневный бонус\n"
        "/help - Эта справка\n\n"
        "🎰 *Баланс синхронизируется между ботом и игрой!*\n"
        "🔒 *Играйте ответственно!*",
        parse_mode='Markdown'
    )

def main():
    """Запуск бота"""
    print("🎰 Запуск бота-казино с синхронизацией баланса...")
    print(f"📱 Mini App URL: {MINI_APP_URL}")
    print(f"🔐 Секретный ключ: {SECRET_KEY[:10]}...")
    
    # Проверяем файл БД
    if os.path.exists(DATABASE_FILE):
        print(f"📁 База данных: {DATABASE_FILE} ({os.path.getsize(DATABASE_FILE)} байт)")
    else:
        print("📁 База данных: создана новая")
    
    # Создаем приложение
    application = Application.builder().token(TOKEN).build()
    
    # Добавляем обработчики команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance_command))
    application.add_handler(CommandHandler("stats", stats_command))
    application.add_handler(CommandHandler("bonus", bonus_command))
    application.add_handler(CommandHandler("help", help_command))
    
    # Обработчики кнопок
    application.add_handler(CallbackQueryHandler(button_handler))
    
    # Обработчик данных из Mini App (важно - должен быть после остальных!)
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    
    # Запускаем
    print("✅ Бот запущен!")
    print("📱 Откройте Telegram и напишите /start")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
