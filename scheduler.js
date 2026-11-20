//scheduler.js
const config = require('./config');
const storage = require('./storage');
const steamApi = require('./steamAPI');
const format = require('./utils/format');

let isChecking = false;

async function sendMarkdownSafe(bot, userID, text) {
  try {
    await bot.telegram.sendMessage(userID, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    });
  } catch (error) {
    console.error(`Не вдалося надіслати сповіщення користувачу ${userID}:`, error.message);
  }
}

async function checkAllTrackedGames(bot) {
  if (isChecking) return;
  isChecking = true;

  try {
    const allGames = storage.listAllGames();
    if (allGames.length === 0) return;

    const byAppId = new Map();
    for (let game of allGames) {
      if (!game.appId) continue;
      if (!byAppId.has(game.appId)) {
        byAppId.set(game.appId, []);
      }
      byAppId.get(game.appId).push(game);
    }

    for (let [appId, records] of byAppId.entries()) {
      try {
        const [news, details] = await Promise.all([
          steamApi.fetchOfficialNews(appId).catch(() => null),
          steamApi.fetchStoreDetails(appId).catch(() => null)
        ]);

        for (let record of records) {
          let updatedNewsDate = record.lastNewsDate;
          let updatedDiscount = record.lastDiscount;
          let changed = false;

          //Перевірка нової новини
          if (news && news.date) {
            const isNewerNews = !record.lastNewsDate || new Date(news.date).getTime() > new Date(record.lastNewsDate).getTime();
            if (isNewerNews) {
              updatedNewsDate = news.date;
              changed = true;

              if (record.notifType === 'Усі новини') {
                const msg = format.formatNewNewsAlert(record.gameName, news);
                await sendMarkdownSafe(bot, record.userID, msg);
              }
            }
          }

          //Перевірка нової знижки
          if (details) {
            const currentDiscount = Number(details.discountPercent) || 0;
            const prevDiscount = Number(record.lastDiscount) || 0;

            if (currentDiscount > 0 && currentDiscount !== prevDiscount) {
              updatedDiscount = currentDiscount;
              changed = true;

              const msg = format.formatDiscountAlert(record.gameName, details);
              await sendMarkdownSafe(bot, record.userID, msg);
            } else if (currentDiscount === 0 && prevDiscount > 0) {
              updatedDiscount = 0;
              changed = true;
            }
          }
          if (changed) {
            storage.updateGameTrackingState(record.id, updatedNewsDate, updatedDiscount);
          }
        }
      } catch (err) {
        console.error(`Помилка моніторингу AppID ${appId}:`, err.message);
      }
    }
  } catch (error) {
    console.error('Помилка в планувальнику Steam:', error.message);
  } finally {
    isChecking = false;
  }
}

function start(bot) {
  setTimeout(() => checkAllTrackedGames(bot), 10 * 1000);
  setInterval(() => checkAllTrackedGames(bot), config.STEAM_CHECK_INTERVAL_MS);
}

module.exports = {
  start,
  checkAllTrackedGames
};