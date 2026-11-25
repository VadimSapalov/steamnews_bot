//seed_chart.js
require('dotenv').config();
const storage = require('./storage');

storage.loadData();

const allGames = storage.listAllGames();
const uniqueGames = new Map();

for (let g of allGames) {
  if (g.appId && g.gameName && !uniqueGames.has(g.appId)) {
    uniqueGames.set(g.appId, g.gameName);
  }
}

if (uniqueGames.size === 0) {
  uniqueGames.set(1091500, 'Cyberpunk 2077');
  uniqueGames.set(1174180, 'Red Dead Redemption 2');
}

const STEAM_TIERS = [0, 0, 10, 15, 20, 25, 33, 40, 50, 60, 67, 75, 80];

function generateDiscountSeries(count) {
  const series = [];
  let current = STEAM_TIERS[Math.floor(Math.random() * 5)];

  for (let i = 0; i < count; i++) {
    series.push(current);
    if (Math.random() < 0.7) {
      current = STEAM_TIERS[Math.floor(Math.random() * STEAM_TIERS.length)];
    }
  }
  return series;
}

const now = Date.now();
const pointsCount = 10;

for (let [appId, gameName] of uniqueGames.entries()) {
  const series = generateDiscountSeries(pointsCount);
  const jitterMs = Math.floor(Math.random() * 12) * 60 * 1000;

  for (let i = 0; i < series.length; i++) {
    const time = new Date(now - (series.length - i) * 32 * 60 * 1000 - jitterMs).toISOString();
    storage.recordDiscountPoint(appId, gameName, series[i], time);
  }
  console.log(`Згенеровано для "${gameName}": [${series.join('%, ')}%]`);
}