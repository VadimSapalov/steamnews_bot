//bot.js
const { Telegraf } = require('telegraf');
const config = require('./config');
const registerHandlers = require('./handlers');
const { loadData } = require('./storage');
const scheduler = require('./scheduler');
const ingest = require('./ingest');

const bot = new Telegraf(config.token);

registerHandlers(bot);

bot.catch((err, ctx) => {
  console.error(`Глобальна помилка для ${ctx.updateType}:`, err);
  ctx.reply('Виникла внутрішня помилка. Спробуйте пізніше.');
});

async function main() {
  try {
    loadData();
    scheduler.start(bot);
    ingest.start(bot);
    await bot.launch();
    console.log('Bot online');
  } catch (error) {
    console.error('Не вдалося запустити бота:', error.message);
    process.exit(1);
  }
}

main();