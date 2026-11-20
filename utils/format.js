//utils/format.js
const NOT_FOUND_TEXT = 'Запису з таким номером немає.';
const SAVE_FAILED_TEXT = 'Не вдалося зберегти зміни. Спробуй пізніше.';

function escapeMd(text) {
  if (!text) return '';
  return String(text).replace(/([_*`\[])/g, '\\$1');
}

function formatGame(record) {
  const modeIcon = record.notifType === 'Тільки знижки' ? '🏷' : '📰';
  return `#${record.id} · *${escapeMd(record.gameName)}* · ${modeIcon} ${record.notifType}`;
}

function formatSteamFullInfo(info) {
  let text = `🎮 *${escapeMd(info.name)}* (AppID: \`${info.appId}\`)\n`;

  if (info.isFree) {
    text += `💰 Ціна: Безкоштовно (Free-to-Play)\n`;
  } else if (info.discountPercent > 0) {
    text += `🏷 *ЗНИЖКА -${info.discountPercent}%!* Ціна: *${info.finalPrice}* _(було ${info.initialPrice})_\n`;
  } else if (info.finalPrice) {
    text += `💰 Ціна: ${info.finalPrice}\n`;
  }

  text += `🔗 [Сторінка у Steam](${info.storeUrl})\n`;

  if (info.news) {
    const dateStr = new Date(info.news.date).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });
    text += `\n📰 *Остання офіційна новина:*\n*${escapeMd(info.news.title)}*\n🕒 ${dateStr}\n\n${escapeMd(info.news.contents)}\n\n👉 [Читати в Steam](${info.news.url})`;
  } else {
    text += `\n📰 _Офіційних новин у Steam поки не знайдено._`;
  }

  return text;
}

function formatNewNewsAlert(gameName, news) {
  const dateStr = new Date(news.date).toLocaleString('uk-UA', { timeZone: 'Europe/Kiev' });
  return (
    `📰 *Нова публікація у Steam для ${escapeMd(gameName)}!*\n\n` +
    `*${escapeMd(news.title)}*\n` +
    `🕒 ${dateStr}\n\n` +
    `${escapeMd(news.contents)}\n\n` +
    `👉 [Читати повністю у Steam](${news.url})`
  );
}

function formatDiscountAlert(gameName, details) {
  return (
    `🏷 *Знижка у Steam на ${escapeMd(gameName)}!*\n\n` +
    `🔥 Знижка: *-${details.discountPercent}%*\n` +
    `💰 Нова ціна: *${details.finalPrice}* _(звичайна ціна: ${details.initialPrice})_\n\n` +
    `🛒 [Відкрити в магазині Steam](${details.storeUrl})`
  );
}

module.exports = {
  NOT_FOUND_TEXT,
  SAVE_FAILED_TEXT,
  escapeMd,
  formatGame,
  formatSteamFullInfo,
  formatNewNewsAlert,
  formatDiscountAlert
};