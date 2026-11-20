//broadcast.js
const config = require('./config');
const storage = require('./storage');

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

async function broadcastAll(bot, text) {
  const ids = storage.listAllUserIds();
  let delivered = 0;
  let failed = 0;

  for (let userID of ids) {
    try {
      await bot.telegram.sendMessage(userID, text);
      delivered++;
    } catch (error) {
      failed++;
      console.error(`Розсилка: не вдалося надіслати ${userID}:`, error.message);
    }
    await sleep(config.BROADCAST_PAUSE_MS);
  }

  return { delivered, failed };
}

module.exports = {
  broadcastAll,
  sleep
};