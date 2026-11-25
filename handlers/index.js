//handlers/index.js
const { mainMenu, notifMenu } = require('../keyboards');
const { userStates } = require('../state');
const { validateGameName, ParseID } = require('../utils/validators');
const storage = require('../storage');
const format = require('../utils/format');
const config = require('../config');
const broadcaster = require('../broadcast');
const steamApi = require('../steamAPI');
const chart = require('../utils/chart');

const helpText = `
ℹ️ *Довідка з користування ботом*

📌 *Основні команди:*
/start - Запустити бота
/me - Переглянути мій профіль
/help - Показати цю довідку
/cancel - Скасувати поточну дію

🎮 *Відстеження ігор Steam:*
/add <назва гри> - Додати гру у відстеження
/list - Мої відстежувані ігри
/edit <номер> <тип> - Змінити режим (Усі новини|Тільки знижки)
/del <номер> - Видалити гру зі списку

📰 *Новини та знижки:*
/news <назва гри> - Остання новина та ціна гри у Steam
/checkupdates - Перевірити оновлення для моїх ігор
`;

function parseNotifType(input) {
  if (!input) return null;
  const clean = input.trim().toLowerCase().replace(/_/g, ' ');
  if (clean === 'усі новини' || clean === 'всі новини' || clean === 'all') {
    return 'Усі новини';
  }
  if (clean === 'тільки знижки' || clean === 'знижки' || clean === 'discounts') {
    return 'Тільки знижки';
  }
  return null;
}

function showUserGames(ctx) {
  const items = storage.listUserGames(ctx.from.id);
  if (items.length === 0) {
    return ctx.reply(
      'У тебе ще немає відстежуваних ігор.\nНатисни «Додати гру» або введи: /add Cyberpunk 2077',
      mainMenu
    );
  }
  let text = '🎮 *Твої відстежувані ігри Steam:*\n';
  for (let record of items) {
    text += '\n' + format.formatGame(record);
  }
  ctx.replyWithMarkdown(text, mainMenu);
}

function getGamePoints(hours, gameQuery) {
  const records = storage.listHistoryLastHours(hours);
  let targetGame = gameQuery.trim();

  if (!targetGame && records.length > 0) {
    targetGame = records[0].gameName;
  }

  const points = [];
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].gameName.toLowerCase().includes(targetGame.toLowerCase())) {
      targetGame = records[i].gameName;
      points.push({
        time: new Date(records[i].createdAt).getTime(),
        value: Number(records[i].value) || 0
      });
    }
  }

  return { gameName: targetGame, points };
}

const registerHandlers = (bot) => {

//ЗАГАЛЬНІ КОМАНДИ========================================================
  bot.start((ctx) => {
    userStates.delete(ctx.from.id);
    const username = ctx.from.first_name || 'геймере';
    storage.saveUser(ctx.from.id, username, 'Геймер');
    return ctx.reply(
      `Вітаю, ${username}! Я відстежую офіційні новини та знижки ігор у Steam.\nОберіть дію з меню:`,
      mainMenu
    );
  });

  bot.command('me', (ctx) => {
    const user = storage.getUser(ctx.from.id);
    if (user === null) {
      return ctx.reply('Ти ще не зареєстрований. Натисни /start');
    }
    const since = new Date(user.createdAt).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });
    const count = storage.listUserGames(ctx.from.id).length;
    ctx.reply(
      `👤 *Твій профіль:*\n\nІм'я: ${user.name}\nВідстежується ігор: ${count}\nДата реєстрації: ${since}`,
      { parse_mode: 'Markdown', ...mainMenu }
    );
  });

  bot.hears('Допомога', (ctx) => ctx.replyWithMarkdown(helpText, mainMenu));
  bot.help((ctx) => ctx.replyWithMarkdown(helpText, mainMenu));

  bot.command('cancel', (ctx) => {
    if (userStates.has(ctx.from.id)) {
      userStates.delete(ctx.from.id);
      return ctx.reply('Дію скасовано.', mainMenu);
    }
    return ctx.reply('Наразі немає активного діалогу для скасування.', mainMenu);
  });

  //Команда адміністратора-------------------------------------------
  bot.command('broadcast', async (ctx) => {
    if (ctx.from.id !== config.ADMIN_ID) {
      return ctx.reply('Ця команда доступна лише адміністратору.');
    }

    const text = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!text || text.length > 1000) {
      return ctx.reply('Формат: /broadcast <текст> (до 1000 символів).');
    }

    const total = storage.listAllUserIds().length;
    await ctx.reply(`Розсилку запущено для ${total} користувачів...`);

    const result = await broadcaster.broadcastAll(bot, '📢 ' + text);
    ctx.reply(`Розсилку завершено. Доставлено: ${result.delivered}, помилок: ${result.failed}`);
  });

//УПРАВЛІННЯ ІГРАМИ========================================================
  bot.command('add', async (ctx) => {
    const gameInput = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!gameInput) {
      return ctx.reply('Формат: /add <назва_гри>, наприклад:\n/add Cyberpunk 2077', mainMenu);
    }

    const err = validateGameName(gameInput);
    if (err) {
      return ctx.reply(err, mainMenu);
    }

    await ctx.reply(`🔍 Шукаю «${gameInput}» у магазині Steam...`);

    try {
      const found = await steamApi.findGameInSteam(gameInput);
      if (!found) {
        return ctx.reply(`❌ Гру «${gameInput}» не знайдено у Steam. Перевірте правильність назви.`, mainMenu);
      }

      const existing = storage.listUserGames(ctx.from.id).find(g => g.appId === found.appId);
      if (existing) {
        return ctx.reply(`ℹ️ Гра *${found.name}* вже є у твоєму списку відстеження (#${existing.id}).`, {
          parse_mode: 'Markdown',
          ...mainMenu
        });
      }

      const initialState = await steamApi.getInitialGameState(found.appId);
      const record = storage.addGame(
        ctx.from.id,
        found.appId,
        found.name,
        'Усі новини',
        initialState.lastNewsDate,
        initialState.lastDiscount
      );

      ctx.replyWithMarkdown(
        `✅ Додано у відстеження:\n${format.formatGame(record)}\n\n_Режим за замовчуванням: Усі новини. Змінити можна через /edit ${record.id} Тільки знижки_`,
        mainMenu
      );
    } catch (error) {
      console.error('add error:', error.message);
      ctx.reply('❌ Не вдалося зв’язатися зі Steam. Спробуйте пізніше.', mainMenu);
    }
  });

  bot.hears('Додати гру', (ctx) => {
    userStates.set(ctx.from.id, { step: 'WAITING_FOR_GAME_NAME', data: {} });
    ctx.reply('Крок 1/2: Напишіть назву гри зі Steam, яку хочете відстежувати (або /cancel):');
  });

  bot.hears('Мої ігри', (ctx) => showUserGames(ctx));
  bot.command('list', (ctx) => showUserGames(ctx));

  bot.command('edit', (ctx) => {
    const parts = ctx.message.text.trim().split(/\s+/);
    const id = ParseID(parts[1]);
    const rawType = parts.slice(2).join(' ');
    const notifType = parseNotifType(rawType);

    if (id === null || notifType === null) {
      return ctx.reply(
        '❌ Некоректний формат або невідомий режим.\n\n' +
        'Формат: /edit <номер> <режим>\n' +
        'Доступні лише 2 режими:\n' +
        '• Усі новини\n' +
        '• Тільки знижки\n\n' +
        'Приклад: /edit 1 Тільки знижки',
        mainMenu
      );
    }

    const record = storage.getGame(id);
    if (record === null || record.userID !== ctx.from.id) {
      return ctx.reply(format.NOT_FOUND_TEXT, mainMenu);
    }

    try {
      const updated = storage.updateGame(id, notifType);
      ctx.replyWithMarkdown(`✅ Оновлено:\n${format.formatGame(updated)}`, mainMenu);
    } catch (error) {
      console.error('edit error:', error.message);
      ctx.reply(format.SAVE_FAILED_TEXT, mainMenu);
    }
  });

  bot.command('del', (ctx) => {
    const id = ParseID(ctx.message.text.split(' ')[1]);
    if (id === null) {
      return ctx.reply('Формат: /del <номер>, наприклад /del 1', mainMenu);
    }

    const record = storage.getGame(id);
    if (record === null || record.userID !== ctx.from.id) {
      return ctx.reply(format.NOT_FOUND_TEXT, mainMenu);
    }

    userStates.set(ctx.from.id, { step: 'CONFIRM_DELETE', recordId: id });
    ctx.replyWithMarkdown(
      `Видалити ${format.formatGame(record)} зі списку відстеження?\nНапишіть «так» для підтвердження або /cancel.`
    );
  });

//НОВИНИ================================================================
  bot.hears('Новини', (ctx) => {
    userStates.set(ctx.from.id, { step: 'WAITING_FOR_NEWS_QUERY' });
    ctx.reply('Введіть назву гри, щоб переглянути останню новину та знижку в Steam (або /cancel):');
  });

  bot.command('news', async (ctx) => {
    const gameInput = ctx.message.text.split(' ').slice(1).join(' ').trim();
    if (!gameInput) {
      return ctx.reply('Формат: /news <назва_гри>, наприклад:\n/news Counter-Strike 2', mainMenu);
    }
    await handleNewsLookup(ctx, gameInput);
  });

  bot.hears('Перевірити оновлення', (ctx) => handleCheckUpdates(ctx));
  bot.command('checkupdates', (ctx) => handleCheckUpdates(ctx));

  bot.command('trend', (ctx) => {
    const parts = ctx.message.text.split(' ');
    const hours = Number(parts[1]) || 24;

    if (hours < 1 || hours > 168) {
      return ctx.reply('Формат: /trend <години> [назва_гри], наприклад: /trend 24 Cyberpunk');
    }

    const gameQuery = parts.slice(2).join(' ');
    const { gameName, points } = getGamePoints(hours, gameQuery);

    if (points.length < 2) {
      return ctx.reply('Для побудови тренду потрібно щонайменше 2 заміри знижок за цей період.');
    }

    const sampled = chart.downsample(points, 24);
    const values = sampled.map(p => p.value);
    let min = points[0].value;
    let max = points[0].value;

    for (const p of points) {
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }

    const text = `📈 *Тренд знижок: ${format.escapeMd(gameName)}* (за ${hours} год)\n`
      + `\`${chart.sparkline(values)}\`\n`
      + `Замірів: ${points.length} · Мін: *-${min}%* · Макс: *-${max}%*`;

    return ctx.reply(text, { parse_mode: 'Markdown' });
  });

  bot.command('chart', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const hours = Number(parts[1]) || 24;

    if (hours < 1 || hours > 168) {
      return ctx.reply('Формат: /chart <години> [назва_гри], наприклад: /chart 24 Cyberpunk');
    }

    const gameQuery = parts.slice(2).join(' ');
    const { gameName, points } = getGamePoints(hours, gameQuery);

    if (points.length < 2) {
      return ctx.reply('Для побудови графіка потрібно щонайменше 2 заміри знижок за цей період.');
    }

    const sampled = chart.downsample(points, 300);
    const image = chart.chartToPng(sampled, {
      min: config.DISCOUNT_LOW || 20,
      max: config.DISCOUNT_HIGH || 70
    });

    try {
      await ctx.replyWithPhoto({ source: image }, {
        caption: `📊 Динаміка знижок: ${gameName} (за ${hours} год, точок: ${points.length})\n`
          + `Зелений маркер - мінімум, червоний - максимум, пунктир - цільовий діапазон (${config.DISCOUNT_LOW || 20}%–${config.DISCOUNT_HIGH || 70}%).`
      });
    } catch (error) {
      console.error('chart:', error.message);
      ctx.reply('Не вдалося надіслати графік. Спробуйте пізніше.');
    }
  });

//ОБРОБНИК ПОКРОКОВИХ ДІАЛОГІВ====================================================
  bot.on('text', async (ctx, next) => {
    const userID = ctx.from.id;
    const userState = userStates.get(userID);

    if (!userState || ctx.message.text.startsWith('/')) {
      return next();
    }

    const text = ctx.message.text.trim();

    if (text === '❌ Скасувати') {
      userStates.delete(userID);
      return ctx.reply('Дію скасовано.', mainMenu);
    }

    //Підтвердження видалення---------------------------------------
    if (userState.step === 'CONFIRM_DELETE') {
      userStates.delete(userID);
      if (text.toLowerCase() !== 'так') {
        return ctx.reply('Видалення скасовано.', mainMenu);
      }
      const removed = storage.deleteGame(userState.recordId);
      if (!removed) {
        return ctx.reply(format.NOT_FOUND_TEXT, mainMenu);
      }
      return ctx.replyWithMarkdown(`🗑 Видалено: ${format.formatGame(removed)}`, mainMenu);
    }

    //Запит новин через кнопку "Новини"-----------------------------
    if (userState.step === 'WAITING_FOR_NEWS_QUERY') {
      userStates.delete(userID);
      return await handleNewsLookup(ctx, text);
    }

    //Крок 1/2 додавання гри----------------------------------------
    if (userState.step === 'WAITING_FOR_GAME_NAME') {
      const err = validateGameName(text);
      if (err) {
        return ctx.reply(err + '\nСпробуйте ще раз або натисніть «❌ Скасувати»:');
      }

      await ctx.reply(`🔍 Шукаю «${text}» у Steam...`);

      try {
        const found = await steamApi.findGameInSteam(text);
        if (!found) {
          return ctx.reply(`❌ Гру «${text}» не знайдено у Steam. Введіть іншу назву або натисніть «❌ Скасувати»:`);
        }

        const existing = storage.listUserGames(userID).find(g => g.appId === found.appId);
        if (existing) {
          userStates.delete(userID);
          return ctx.replyWithMarkdown(
            `ℹ️ Гра *${found.name}* вже є у твоєму списку (#${existing.id}).`,
            mainMenu
          );
        }

        userState.data.appId = found.appId;
        userState.data.gameName = found.name;
        userState.step = 'WAITING_FOR_NOTIF_TYPE';

        return ctx.replyWithMarkdown(
          `Знайдено гру: *${found.name}*\n\nКрок 2/2: Оберіть, які сповіщення ви хочете отримувати:`,
          notifMenu
        );
      } catch (error) {
        userStates.delete(userID);
        console.error('dialog search error:', error.message);
        return ctx.reply('❌ Помилка з’єднання зі Steam. Спробуйте пізніше.', mainMenu);
      }
    }

    //Крок 2/2 додавання гри------------------------------------------------
    if (userState.step === 'WAITING_FOR_NOTIF_TYPE') {
      if (text !== 'Усі новини' && text !== 'Тільки знижки') {
        return ctx.reply('Будь ласка, оберіть один із варіантів на клавіатурі: «Усі новини» або «Тільки знижки».');
      }

      const { appId, gameName } = userState.data;
      userStates.delete(userID);

      try {
        const initialState = await steamApi.getInitialGameState(appId);
        const record = storage.addGame(
          userID,
          appId,
          gameName,
          text,
          initialState.lastNewsDate,
          initialState.lastDiscount
        );

        return ctx.replyWithMarkdown(
          `✅ Гру додано у відстеження:\n${format.formatGame(record)}`,
          mainMenu
        );
      } catch (error) {
        console.error('dialog save error:', error.message);
        return ctx.reply(format.SAVE_FAILED_TEXT, mainMenu);
      }
    }
  });
};

//Функція пошуку новин і ціни по назві гри-----------------------------------
async function handleNewsLookup(ctx, gameInput) {
  await ctx.reply(`🔍 Отримую актуальну інформацію зі Steam для «${gameInput}»...`);
  try {
    const info = await steamApi.getFullGameInfo(gameInput);
    if (!info) {
      return ctx.reply(`❌ Гру «${gameInput}» не знайдено у Steam.`, mainMenu);
    }

    const previewOptions = info.news
      ? { link_preview_options: { url: info.news.url, prefer_large_media: true } }
      : { link_preview_options: { url: info.storeUrl } };

    await ctx.replyWithMarkdown(format.formatSteamFullInfo(info), {
      ...previewOptions,
      ...mainMenu
    });
  } catch (error) {
    console.error('news lookup error:', error.message);
    ctx.reply('❌ Не вдалося отримати дані зі Steam. Спробуйте пізніше.', mainMenu);
  }
}

//Допоміжна функція ручної перевірки оновлень по списку користувача-----------
async function handleCheckUpdates(ctx) {
  const userGames = storage.listUserGames(ctx.from.id);
  if (userGames.length === 0) {
    return ctx.reply('У тебе ще немає відстежуваних ігор. Натисни «Додати гру».', mainMenu);
  }

  await ctx.reply(`🔄 Перевіряю останні новини та знижки для твоїх ігор (${userGames.length})...`);
  let report = '📊 *Актуальний стан твоїх ігор у Steam:*\n';

  for (let game of userGames) {
    try {
      const info = await steamApi.getFullGameInfoById(game.appId, game.gameName);
      let line = `\n🎮 *${game.gameName}* _(${game.notifType})_`;

      if (info.discountPercent > 0) {
        line += `\n   🏷 *Знижка -${info.discountPercent}%!* Ціна: ${info.finalPrice}`;
      } else if (info.finalPrice) {
        line += `\n   💰 Ціна: ${info.finalPrice} (без знижки)`;
      }

      if (info.news) {
        const newsDate = new Date(info.news.date).toLocaleDateString('uk-UA', { timeZone: 'Europe/Kiev' });
        line += `\n   📰 Новина (${newsDate}): [${info.news.title}](${info.news.url})`;
      } else {
        line += `\n   📰 Офіційних новин немає`;
      }

      report += line + '\n';
    } catch (err) {
      report += `\n🎮 *${game.gameName}*: ⚠️ Помилка запиту до Steam\n`;
    }
  }

  ctx.replyWithMarkdown(report, { disable_web_page_preview: true, ...mainMenu });
}

module.exports = registerHandlers;