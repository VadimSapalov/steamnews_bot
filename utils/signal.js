//utils/signal.js
const fs = require('fs');
const config = require('../config');

const FALLBACK_GAMES = [
  { appId: 730, name: 'Counter-Strike 2', basePrice: 0, isFree: true },
  { appId: 570, name: 'Dota 2', basePrice: 0, isFree: true },
  { appId: 1091500, name: 'Cyberpunk 2077', basePrice: 1099, isFree: false },
  { appId: 292030, name: 'The Witcher 3: Wild Hunt', basePrice: 729, isFree: false }
];

const NEWS_TEMPLATES = [
  {
    title: 'Major Gameplay & Balance Update',
    contents: 'Вийшло велике оновлення балансу, оптимізації продуктивності та виправлення критичних помилок клієнта.'
  },
  {
    title: 'Seasonal Event & New Content Patch',
    contents: 'У грі стартувала нова сезонна подія з унікальними нагородами, оновленими мапами та покращенням матчмейкінгу.'
  },
  {
    title: 'Hotfix & Stability Improvements',
    contents: 'Розробники випустили терміновий патч для стабілізації серверів та усунення збоїв під час запуску.'
  }
];

function makeRandom(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function getTrackedGamesPool() {
  try {
    if (fs.existsSync(config.DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(config.DATA_FILE, 'utf8'));
      if (Array.isArray(raw.games) && raw.games.length > 0) {
        const unique = new Map();
        for (let g of raw.games) {
          if (g.appId && !unique.has(g.appId)) {
            unique.set(g.appId, {
              appId: Number(g.appId),
              name: g.gameName,
              basePrice: 899,
              isFree: g.appId === 730 || g.appId === 570
            });
          }
        }
        if (unique.size > 0) {
          return Array.from(unique.values());
        }
      }
    }
  } catch (e) {}
  return FALLBACK_GAMES;
}

function generateEvent(step, random) {
  const pool = getTrackedGamesPool();
  const game = pool[step % pool.length];
  const nowIso = new Date().toISOString();
  const makeDiscount = !game.isFree && random() < 0.5;

  if (makeDiscount) {
    const discounts = [25, 40, 50, 65, 75];
    const discountPercent = discounts[Math.floor(random() * discounts.length)];
    const finalVal = Math.round(game.basePrice * (1 - discountPercent / 100));

    return {
      eventId: `disc_${game.appId}_${step}_${Date.now()}`,
      type: 'discount',
      appId: game.appId,
      gameName: game.name,
      discountPercent: discountPercent,
      initialPrice: `${game.basePrice}₴`,
      finalPrice: `${finalVal}₴`,
      storeUrl: `https://store.steampowered.com/app/${game.appId}/`,
      time: nowIso
    };
  }

  const tpl = NEWS_TEMPLATES[Math.floor(random() * NEWS_TEMPLATES.length)];
  return {
    eventId: `news_${game.appId}_${step}_${Date.now()}`,
    type: 'news',
    appId: game.appId,
    gameName: game.name,
    title: `${tpl.title} #${step + 1}`,
    contents: tpl.contents,
    url: `https://store.steampowered.com/news/app/${game.appId}`,
    time: nowIso
  };
}

module.exports = {
  makeRandom,
  generateEvent
};