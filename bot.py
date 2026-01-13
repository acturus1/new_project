import os
import json
import logging
import random
import asyncio
from datetime import datetime
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, CallbackQueryHandler, ContextTypes, filters

# Загружаем переменные окружения
load_dotenv()

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
    handlers=[
        logging.FileHandler('bot.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
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
            logger.warning("Нет данных WebApp")
            return
            
        data_json = update.effective_message.web_app_data.data
        logger.info(f"Получены сырые данные WebApp: {data_json}")
        
        try:
            data = json.loads(data_json)
        except json.JSONDecodeError as e:
            logger.error(f"Ошибка декодирования JSON: {e}")
            await update.effective_message.reply_text(
                "❌ Ошибка формата данных. Пожалуйста, перезагрузите приложение."
            )
            return
            
        user_id = update.effective_user.id
        request_id = data.get("request_id", "unknown")
        event_type = data.get("event", "unknown")
        
        logger.info(f"WebApp event: {event_type}, user_id: {user_id}, request_id: {request_id}")
        logger.info(f"Полные данные: {json.dumps(data, ensure_ascii=False)}")

        user_data = db.get_user(user_id)

        # Подготовка базового ответа
        response_data = {
            "request_id": request_id,
            "success": True,
            "user_id": user_id,
            "event": event_type
        }

        if event_type == "get_initial_data":
            # Отправляем начальные данные при открытии Mini App
            response_data.update({
                "balance": user_data["balance"],
                "games_played": user_data["games_played"],
                "biggest_win": user_data["biggest_win"],
                "total_wins": user_data["total_wins"],
                "total_losses": user_data.get("total_losses", 0),
                "min_bet": 10,
                "max_bet": 500,
                "daily_bonus_available": not user_data.get("daily_bonus_claimed", False),
                "name": user_data.get("name", update.effective_user.first_name)
            })
            
            logger.info(f"Отправляем начальные данные: баланс {user_data['balance']}₽")
            
            # Отправляем ответ как обычное сообщение (Telegram сам его обработает)
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"🎰 *Данные загружены!*\n"
                f"💰 Баланс: {user_data['balance']}₽\n"
                f"🎮 Игр сыграно: {user_data['games_played']}\n"
                f"🏆 Рекорд: {user_data['biggest_win']}₽",
                parse_mode='Markdown'
            )
            
            # Также отправляем JSON ответ для WebApp
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )

        elif event_type == "check_balance":
            # Проверяем достаточно ли средств для ставки
            bet = data.get("bet", 0)
            has_enough = user_data["balance"] >= bet
            
            response_data.update({
                "can_play": has_enough,
                "current_balance": user_data["balance"],
                "required_bet": bet,
                "message": "Недостаточно средств" if not has_enough else "Средств достаточно"
            })
            
            if not has_enough:
                response_data["success"] = False
            
            logger.info(f"Проверка баланса: {bet}₽, достаточно: {has_enough}, баланс: {user_data['balance']}₽")
            
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )

        elif event_type == "game_result":
            # Обработка результата игры
            bet = data.get("bet", 0)
            win_amount = data.get("win_amount", 0)
            symbols = data.get("symbols", [])
            
            logger.info(f"Результат игры: ставка {bet}₽, выигрыш {win_amount}₽")
            
            # Валидация ставки
            if bet < 10 or bet > 500:
                response_data.update({
                    "success": False,
                    "message": f"Некорректная ставка: {bet}₽. Допустимо: 10-500₽"
                })
                response_text = json.dumps(response_data)
                await update.effective_message.reply_text(
                    f"WEBAPP_DATA:{response_text}",
                    parse_mode=None
                )
                return
            
            if bet > user_data["balance"]:
                response_data.update({
                    "success": False,
                    "message": f"Недостаточно средств. Ставка: {bet}₽, баланс: {user_data['balance']}₽"
                })
                response_text = json.dumps(response_data)
                await update.effective_message.reply_text(
                    f"WEBAPP_DATA:{response_text}",
                    parse_mode=None
                )
                return

            # Вычисляем новый баланс
            new_balance = user_data["balance"] - bet + win_amount
            
            # Подготавливаем данные для обновления
            update_data = {
                "balance": new_balance,
                "games_played": user_data["games_played"] + 1
            }
            
            if win_amount > 0:
                update_data["total_wins"] = user_data["total_wins"] + 1
                update_data["biggest_win"] = max(user_data["biggest_win"], win_amount)
                win_type = "win"
            else:
                update_data["total_losses"] = user_data.get("total_losses", 0) + 1
                win_type = "loss"

            # Сохраняем изменения
            db.update_user(user_id, update_data)
            
            # Готовим ответ для WebApp
            response_data.update({
                "new_balance": new_balance,
                "old_balance": user_data["balance"],
                "games_played": update_data["games_played"],
                "win_amount": win_amount,
                "bet": bet,
                "is_win": win_amount > 0,
                "win_type": win_type,
                "symbols_count": len(symbols) if symbols else 0
            })
            
            # Отправляем уведомление пользователю в чат
            if win_amount > 0:
                win_message = (
                    f"🎉 *ПОЗДРАВЛЯЕМ!*\n\n"
                    f"💰 *Выигрыш:* {win_amount}₽\n"
                    f"🎰 *Ставка:* {bet}₽\n"
                    f"💎 *Новый баланс:* {new_balance}₽\n"
                    f"📊 *Всего игр:* {update_data['games_played']}\n\n"
                )
                
                if win_amount >= bet * 100:
                    win_message += "🏆 *МЕГА ДЖЕКПОТ!* 🏆\n"
                elif win_amount >= bet * 50:
                    win_message += "🌟 *СУПЕР ВЫИГРЫШ!* 🌟\n"
                elif win_amount >= bet * 20:
                    win_message += "✨ *БОЛЬШОЙ ВЫИГРЫШ!* ✨\n"
                    
                await update.effective_message.reply_text(
                    win_message,
                    parse_mode='Markdown'
                )
            else:
                await update.effective_message.reply_text(
                    f"😔 *Игра завершена*\n\n"
                    f"🎰 *Ставка:* {bet}₽\n"
                    f"💰 *Новый баланс:* {new_balance}₽\n"
                    f"📊 *Всего игр:* {update_data['games_played']}\n\n"
                    f"🎮 *Попробуйте еще раз! Удачи!*",
                    parse_mode='Markdown'
                )
            
            # Отправляем JSON ответ для WebApp
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )
            
            logger.info(f"Игра обработана: новый баланс {new_balance}₽, выигрыш {win_amount}₽")

        elif event_type == "get_balance":
            # Просто запрос текущего баланса
            response_data.update({
                "balance": user_data["balance"],
                "games_played": user_data["games_played"],
                "biggest_win": user_data["biggest_win"],
                "total_wins": user_data["total_wins"]
            })
            
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )
            
            logger.info(f"Запрос баланса: {user_data['balance']}₽")

        elif event_type == "get_user_info":
            # Запрос информации о пользователе
            response_data.update({
                "name": user_data.get("name", update.effective_user.first_name),
                "username": update.effective_user.username,
                "balance": user_data["balance"],
                "created_at": user_data.get("created_at", ""),
                "games_played": user_data["games_played"],
                "win_rate": (user_data["total_wins"] / user_data["games_played"] * 100) if user_data["games_played"] > 0 else 0
            })
            
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )

        else:
            # Неизвестное событие
            response_data.update({
                "success": False,
                "message": f"Неизвестное событие: {event_type}"
            })
            
            logger.warning(f"Неизвестное событие WebApp: {event_type}")
            
            response_text = json.dumps(response_data)
            await update.effective_message.reply_text(
                f"WEBAPP_DATA:{response_text}",
                parse_mode=None
            )

    except json.JSONDecodeError as e:
        logger.error(f"Ошибка декодирования JSON в handle_webapp_data: {e}")
        try:
            await update.effective_message.reply_text(
                "WEBAPP_DATA:" + json.dumps({
                    "success": False,
                    "message": "Ошибка формата JSON данных"
                }),
                parse_mode=None
            )
        except:
            pass
            
    except KeyError as e:
        logger.error(f"Отсутствует ключ в данных: {e}")
        try:
            await update.effective_message.reply_text(
                "WEBAPP_DATA:" + json.dumps({
                    "success": False,
                    "message": f"Отсутствует обязательное поле: {e}"
                }),
                parse_mode=None
            )
        except:
            pass
            
    except Exception as e:
        logger.error(f"Критическая ошибка в handle_webapp_data: {e}", exc_info=True)
        try:
            await update.effective_message.reply_text(
                "WEBAPP_DATA:" + json.dumps({
                    "success": False,
                    "message": f"Внутренняя ошибка сервера: {str(e)}"
                }),
                parse_mode=None
            )
        except:
            # Если даже это не сработает, просто логируем
            logger.error("Не удалось отправить сообщение об ошибке")
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

async def handle_webapp_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработка текстовых сообщений, которые могут содержать данные WebApp"""
    try:
        text = update.message.text
        logger.info(f"Получено текстовое сообщение: {text[:100]}...")
        
        # Проверяем, не является ли это JSON данными от WebApp
        if text.strip().startswith('{') and text.strip().endswith('}'):
            try:
                data = json.loads(text)
                if 'event' in data or 'request_id' in data:
                    logger.info("Обнаружены JSON данные в текстовом сообщении")
                    # Создаем fake web_app_data объект
                    class FakeWebAppData:
                        def __init__(self, data_str):
                            self.data = data_str
                    
                    update.effective_message.web_app_data = FakeWebAppData(text)
                    await handle_webapp_data(update, context)
                    return
            except json.JSONDecodeError:
                pass
                
        # Если это не WebApp данные, игнорируем
        logger.info("Текстовое сообщение не содержит WebApp данных, игнорируем")
        
    except Exception as e:
        logger.error(f"Ошибка в handle_webapp_text: {e}")

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

    # Обработчики кнопок
    application.add_handler(CallbackQueryHandler(button_handler))
    
    # ВАЖНО: WebApp данные обрабатываем отдельно
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, handle_webapp_data))
    
    # Также обрабатываем текстовые сообщения (на случай если WebApp отправит как текст)
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_webapp_text))

    # Запускаем
    print("✅ Бот запущен!")
    print("📱 Откройте Telegram и напишите /start")
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
