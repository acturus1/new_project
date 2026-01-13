import os
import json
import logging
import random
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

# База данных
DATABASE_FILE = "casino_users.json"

class CasinoDB:
    def __init__(self, filename):
        self.filename = filename
        self.users = self.load_users()
    
    def load_users(self):
        try:
            if os.path.exists(self.filename):
                with open(self.filename, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except:
            pass
        return {}
    
    def save_users(self):
        with open(self.filename, 'w', encoding='utf-8') as f:
            json.dump(self.users, f, indent=2, ensure_ascii=False)
    
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
                "created_at": datetime.now().isoformat()
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

# Ссылка на ваше Mini App (пока заглушка, потом замените)
MINI_APP_URL = "https://telegram-webapp-stub.vercel.app/" # Замените на свою ссылку

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /start с кнопкой для Mini App"""
    user = update.effective_user
    user_data = db.get_user(user.id)
    
    # Если нет имени, сохраняем
    if not user_data.get("name"):
        db.update_user(user.id, {"name": user.first_name})
    
    # Главное меню с кнопкой для Mini App
    keyboard = [
        [InlineKeyboardButton(
            text="🎮 ОТКРЫТЬ КАЗИНО", 
            web_app=WebAppInfo(url=f"{MINI_APP_URL}?user_id={user.id}")
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

🚀 *Нажмите кнопку ниже, чтобы открыть игровой автомат!*

🎮 *В игре вас ждет:*
• Анимированные слоты
• Реалистичные звуки
• Профессиональный дизайн
• Выигрышные комбинации

⚡ *Минимальная ставка:* 10₽
⚡ *Максимальная ставка:* 500₽
    """
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode='Markdown'
    )

async def handle_webapp_data(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка данных из Mini App"""
    try:
        # Получаем данные от Mini App
        data_json = update.effective_message.web_app_data.data
        data = json.loads(data_json)
        user_id = update.effective_user.id
        
        logger.info(f"Данные от Mini App: {data}")
        
        # Обработка разных событий
        event_type = data.get("event")
        
        if event_type == "game_result":
            # Результат игры
            bet = data.get("bet", 0)
            win = data.get("win", 0)
            result = data.get("result", "")
            
            user_data = db.get_user(user_id)
            
            # Обновляем баланс
            if win > 0:
                user_data["balance"] += win
                user_data["total_wins"] += 1
                user_data["biggest_win"] = max(user_data["biggest_win"], win)
                message = f"🎉 *Поздравляем!* Вы выиграли {win}₽"
            else:
                user_data["balance"] -= bet
                user_data["total_losses"] += 1
                message = f"😔 Вы проиграли {bet}₽"
            
            user_data["games_played"] += 1
            db.save_users()
            
            # Отправляем ответ пользователю
            await update.message.reply_text(
                f"{message}\n\n"
                f"💰 *Новый баланс:* {user_data['balance']}₽\n"
                f"📊 *Всего игр:* {user_data['games_played']}",
                parse_mode='Markdown'
            )
            
        elif event_type == "get_balance":
            # Запрос баланса из Mini App
            user_data = db.get_user(user_id)
            await update.message.reply_text(
                f"💰 *Ваш баланс:* {user_data['balance']}₽",
                parse_mode='Markdown'
            )
            
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
        user_data['balance'] += bonus
        db.update_user(user_id, {
            'balance': user_data['balance'],
            'daily_bonus_claimed': True
        })
        
        await query.edit_message_text(
            f"🎁 *Ежедневный бонус!*\n\n"
            f"💰 Вы получили: *{bonus}₽*\n"
            f"📊 Новый баланс: *{user_data['balance']}₽*\n\n"
            f"🎰 Нажмите 'ОТКРЫТЬ КАЗИНО' чтобы начать игру!",
            parse_mode='Markdown'
        )
        
    elif data == "help":
        help_text = """
🎰 *Правила игры в казино*

💰 *Как играть:*
1. Нажмите кнопку "ОТКРЫТЬ КАЗИНО"
2. Выберите сумму ставки
3. Крутите барабаны
4. Получайте выигрыш!

🎪 *Выигрышные комбинации:*
• 2 одинаковых символа = ×2 ставки
• 3 одинаковых символа = множитель символа

⚡ *Символы и множители:*
🍒 - x2   🍋 - x3   🍊 - x4
🍇 - x5   🔔 - x10  ⭐ - x20  7️⃣ - x100

🎁 *Бонусы:*
• Ежедневный бонус: 50-200₽
• Стартовый баланс: 1000₽

📞 *Поддержка:* @ваш_ник
        """
        await query.edit_message_text(help_text, parse_mode='Markdown')

async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /help"""
    await update.message.reply_text(
        "ℹ️ *Доступные команды:*\n\n"
        "/start - Открыть казино\n"
        "/balance - Ваш баланс\n"
        "/stats - Статистика\n"
        "/bonus - Ежедневный бонус\n"
        "/help - Эта справка\n\n"
        "🎰 *Играйте ответственно!*",
        parse_mode='Markdown'
    )

def main():
    """Запуск бота"""
    print("🎰 Запуск бота-казино с Mini App...")
    print(f"📱 Mini App URL: {MINI_APP_URL}")
    
    # Создаем приложение
    application = Application.builder().token(TOKEN).build()
    
    # Добавляем обработчики
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("balance", lambda u, c: button_handler(u, c)))
    application.add_handler(CommandHandler("stats", lambda u, c: button_handler(u, c)))
    application.add_handler(CommandHandler("bonus", lambda u, c: button_handler(u, c)))
    
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    
    # Запускаем
    print("✅ Бот запущен!")
    print("📱 Откройте Telegram и напишите /start")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
