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
        user_id_str = str(user_id)
        if user_id_str in self.users:
            self.users[user_id_str].update(data)
        else:
            self.get_user(user_id)
        self.save_users()
        return self.users[user_id_str]

# Инициализация базы
db = CasinoDB(DATABASE_FILE)

# Ссылка на Mini App
MINI_APP_URL = "https://new-project-amber-eight.vercel.app"  # Замените на ваш реальный URL

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /start с кнопкой для Mini App"""
    user = update.effective_user
    user_data = db.get_user(user.id)

    if not user_data.get("name"):
        db.update_user(user.id, {"name": user.first_name})

    # Создаем WebApp URL с параметрами
    webapp_url = f"{MINI_APP_URL}?user_id={user.id}&username={user.username or ''}&name={user.first_name}"
    
    keyboard = [
        [InlineKeyboardButton(
            text="🎮 ОТКРЫТЬ КАЗИНО",
            web_app=WebAppInfo(url=webapp_url)
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
• Слоты 5×5
• Реалистичные анимации
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
        if not update.effective_message or not update.effective_message.web_app_data:
            return
            
        data_json = update.effective_message.web_app_data.data
        data = json.loads(data_json)
        user_id = update.effective_user.id
        request_id = data.get("request_id", "")
        event_type = data.get("event")

        logger.info(f"Данные от Mini App: {event_type}, user_id: {user_id}")

        user_data = db.get_user(user_id)

        response_data = {
            "request_id": request_id,
            "success": True,
            "user_id": user_id
        }

        if event_type == "get_balance":
            # Отправляем текущий баланс
            response_data.update({
                "balance": user_data["balance"],
                "games_played": user_data["games_played"],
                "biggest_win": user_data["biggest_win"],
                "total_wins": user_data["total_wins"],
                "min_bet": 10,
                "max_bet": 500
            })
            
            # Отправляем ответ в чат (будет обработан в Mini App)
            await update.effective_message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                parse_mode=None
            )

        elif event_type == "check_balance":
            # Проверяем достаточно ли средств
            bet = data.get("bet", 0)
            has_enough = user_data["balance"] >= bet
            
            response_data.update({
                "success": has_enough,
                "balance": user_data["balance"],
                "can_play": has_enough,
                "message": "Недостаточно средств" if not has_enough else "OK"
            })
            
            await update.effective_message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                parse_mode=None
            )

        elif event_type == "game_result":
            # Обработка результата игры
            bet = data.get("bet", 0)
            win_amount = data.get("win_amount", 0)
            symbols = data.get("symbols", [])
            
            # Проверяем валидность ставки
            if bet < 10 or bet > 500:
                response_data.update({
                    "success": False,
                    "message": "Некорректная ставка"
                })
                await update.effective_message.reply_text(
                    f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                    parse_mode=None
                )
                return

            # Обновляем баланс и статистику
            new_balance = user_data["balance"] - bet + win_amount
            
            update_data = {
                "balance": new_balance,
                "games_played": user_data["games_played"] + 1
            }
            
            if win_amount > 0:
                update_data["total_wins"] = user_data["total_wins"] + 1
                update_data["biggest_win"] = max(user_data["biggest_win"], win_amount)
            else:
                update_data["total_losses"] = user_data.get("total_losses", 0) + 1

            # Сохраняем изменения
            db.update_user(user_id, update_data)
            
            # Готовим ответ
            response_data.update({
                "new_balance": new_balance,
                "games_played": update_data["games_played"],
                "win_amount": win_amount,
                "bet": bet,
                "is_win": win_amount > 0
            })
            
            # Отправляем уведомление пользователю
            if win_amount > 0:
                await update.effective_message.reply_text(
                    f"🎉 *Вы выиграли {win_amount}₽!*\n"
                    f"💰 Новый баланс: {new_balance}₽\n"
                    f"📊 Всего игр: {update_data['games_played']}",
                    parse_mode='Markdown'
                )
            else:
                await update.effective_message.reply_text(
                    f"😔 *Вы проиграли {bet}₽*\n"
                    f"💰 Новый баланс: {new_balance}₽",
                    parse_mode='Markdown'
                )
            
            # И отдельно отправляем JSON ответ для Mini App
            await update.effective_message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                parse_mode=None
            )

        elif event_type == "get_initial_data":
            # Отправляем все начальные данные
            response_data.update({
                "balance": user_data["balance"],
                "games_played": user_data["games_played"],
                "biggest_win": user_data["biggest_win"],
                "total_wins": user_data["total_wins"],
                "total_losses": user_data.get("total_losses", 0),
                "min_bet": 10,
                "max_bet": 500,
                "daily_bonus_available": not user_data.get("daily_bonus_claimed", False)
            })
            
            await update.effective_message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                parse_mode=None
            )

        else:
            response_data.update({
                "success": False,
                "message": "Неизвестное событие"
            })
            await update.effective_message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps(response_data)}",
                parse_mode=None
            )

    except json.JSONDecodeError:
        logger.error("Ошибка декодирования JSON")
        await update.message.reply_text("❌ Ошибка формата данных")
    except Exception as e:
        logger.error(f"Ошибка обработки WebApp данных: {e}", exc_info=True)
        try:
            await update.message.reply_text(
                f"WEBAPP_RESPONSE:{json.dumps({'success': False, 'message': 'Server error'})}",
                parse_mode=None
            )
        except:
            pass

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
            f"• Проигрышей: {user_data.get('total_losses', 0)}\n"
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
            f"❌ *Проигрышей:* {user_data.get('total_losses', 0)}\n"
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
🎰 *Правила игры в казино*

💰 *Как играть:*
1. Нажмите кнопку "ОТКРЫТЬ КАЗИНО"
2. Выберите сумму ставки
3. Крутите барабаны
4. Получайте выигрыш!

🎪 *Выигрышные комбинации:*
• 3 одинаковых символа = ×5
• 4 одинаковых символа = ×20
• 5 одинаковых символа = ×100
• 5+ одинаковых = ×200 (ДЖЕКПОТ)
• Диагонали ×2

⚡ *Символы и множители:*
🍒 - x5   🍋 - x5   🍊 - x5
🍇 - x8   🔔 - x10  ⭐ - x15  7️⃣ - x20

🎁 *Бонусы:*
• Ежедневный бонус: 50-200₽
• Стартовый баланс: 1000₽

📞 *Поддержка:* @ваш_ник
        """
        await query.edit_message_text(help_text, parse_mode='Markdown')

async def balance_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /balance"""
    user_id = update.effective_user.id
    user_data = db.get_user(user_id)
    
    await update.message.reply_text(
        f"💰 *Ваш баланс:* {user_data['balance']}₽\n"
        f"🎮 *Игр сыграно:* {user_data['games_played']}",
        parse_mode='Markdown'
    )

async def stats_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /stats"""
    user_id = update.effective_user.id
    user_data = db.get_user(user_id)
    
    total_games = user_data['games_played']
    win_rate = (user_data['total_wins'] / total_games * 100) if total_games > 0 else 0
    
    await update.message.reply_text(
        f"📊 *Ваша статистика*\n\n"
        f"🎰 *Всего игр:* {total_games}\n"
        f"✅ *Выигрышей:* {user_data['total_wins']}\n"
        f"❌ *Проигрышей:* {user_data.get('total_losses', 0)}\n"
        f"📈 *Процент побед:* {win_rate:.1f}%\n"
        f"🏆 *Крупнейший выигрыш:* {user_data['biggest_win']}₽",
        parse_mode='Markdown'
    )

async def bonus_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /bonus"""
    user_id = update.effective_user.id
    user_data = db.get_user(user_id)
    
    if user_data.get("daily_bonus_claimed"):
        await update.message.reply_text(
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

    await update.message.reply_text(
        f"🎁 *Ежедневный бонус!*\n\n"
        f"💰 Вы получили: *{bonus}₽*\n"
        f"📊 Новый баланс: *{new_balance}₽*",
        parse_mode='Markdown'
    )

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

    # Добавляем обработчики команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("balance", balance_command))
    application.add_handler(CommandHandler("stats", stats_command))
    application.add_handler(CommandHandler("bonus", bonus_command))
    application.add_handler(CommandHandler("help", help_command))

    # Обработчики кнопок и WebApp
    application.add_handler(CallbackQueryHandler(button_handler))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))

    # Запускаем
    print("✅ Бот запущен!")
    print("📱 Откройте Telegram и напишите /start")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
