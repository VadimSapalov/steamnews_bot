//steamAPI.js
const config = require('./config');
const cache = new Map();

async function getJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
    headers: { 'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8' }
  });
  if (!response.ok) {
    throw new Error('Сервіс Steam відповів помилкою ' + response.status);
  }
  return await response.json();
}

async function findGameInSteam(gameInput) {
  if (!gameInput) return null;
  const cleanInput = String(gameInput).trim();

  // Якщо користувач ввів числовий AppID напряму
  if (/^\d+$/.test(cleanInput)) {
    const appId = Number(cleanInput);
    const details = await fetchStoreDetails(appId);
    if (details && details.name) {
      return { appId, name: details.name };
    }
    return null;
  }

  const cacheKey = `search_${cleanInput.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < config.STEAM_CACHE_MS) {
    return cached.value;
  }

  try {
    const url = `${config.STEAM_SEARCH_URL}?term=${encodeURIComponent(cleanInput)}&l=ukrainian&cc=UA`;
    const data = await getJson(url);

    if (data && Array.isArray(data.items) && data.items.length > 0) {
      const first = data.items[0];
      const result = { appId: Number(first.id), name: first.name };
      cache.set(cacheKey, { savedAt: Date.now(), value: result });
      return result;
    }
  } catch (err) {
    console.error('Помилка пошуку гри в Steam:', err.message);
  }

  return null;
}

async function fetchStoreDetails(appId) {
  const cacheKey = `details_${appId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < config.STEAM_CACHE_MS) {
    return cached.value;
  }

  try {
    const url = `${config.STEAM_APPDETAILS_URL}?appids=${appId}&cc=UA&l=ukrainian`;
    const data = await getJson(url);
    const appEntry = data && data[String(appId)];

    if (!appEntry || !appEntry.success || !appEntry.data) {
      return null;
    }

    const info = appEntry.data;
    let isFree = Boolean(info.is_free);
    let discountPercent = 0;
    let finalPrice = isFree ? 'Безкоштовно' : null;
    let initialPrice = null;

    if (!isFree && info.price_overview) {
      discountPercent = Number(info.price_overview.discount_percent) || 0;
      finalPrice = info.price_overview.final_formatted || null;
      initialPrice = info.price_overview.initial_formatted || null;
    }

    const result = {
      appId: Number(appId),
      name: info.name,
      isFree,
      discountPercent,
      finalPrice,
      initialPrice,
      storeUrl: `https://store.steampowered.com/app/${appId}/`
    };

    cache.set(cacheKey, { savedAt: Date.now(), value: result });
    return result;
  } catch (err) {
    console.error(`Помилка отримання ціни для AppID ${appId}:`, err.message);
    return null;
  }
}

function cleanSteamText(text) {
  if (!text) return '';
  return text
    .replace(/\[\/?(b|i|u|h1|h2|h3|p|list|olist|code|quote|url|img|table|tr|td|th|\*)[^\]]*\]/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchOfficialNews(appId) {
  const cacheKey = `news_${appId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < config.STEAM_CACHE_MS) {
    return cached.value;
  }

  const url = `${config.STEAM_NEWS_URL}?appid=${appId}&count=5&l=english&feeds=steam_community_announcements`;
  const data = await getJson(url);

  if (!data || !data.appnews || !Array.isArray(data.appnews.newsitems) || data.appnews.newsitems.length === 0) {
    return null;
  }

  const officialItems = data.appnews.newsitems.filter(item => {
    return item.feedname === 'steam_community_announcements' || !item.is_external_url;
  });

  const item = officialItems[0] || data.appnews.newsitems[0];
  if (!item) {
    return null;
  }

  let cleanedContent = cleanSteamText(item.contents);
  if (cleanedContent.length > 280) {
    cleanedContent = cleanedContent.slice(0, 280) + '...';
  }

  const newsUrl = item.url && item.url.startsWith('http')
    ? item.url
    : `https://store.steampowered.com/news/app/${appId}`;

  const result = {
    appId: Number(appId),
    title: item.title,
    author: item.author || 'Steam',
    url: newsUrl,
    date: new Date(item.date * 1000).toISOString(),
    contents: cleanedContent
  };

  cache.set(cacheKey, { savedAt: Date.now(), value: result });
  return result;
}

async function getInitialGameState(appId) {
  const [news, details] = await Promise.all([
    fetchOfficialNews(appId).catch(() => null),
    fetchStoreDetails(appId).catch(() => null)
  ]);

  return {
    lastNewsDate: news ? news.date : null,
    lastDiscount: details ? details.discountPercent : 0
  };
}

async function getFullGameInfoById(appId, fallbackName = '') {
  const [news, details] = await Promise.all([
    fetchOfficialNews(appId).catch(() => null),
    fetchStoreDetails(appId).catch(() => null)
  ]);

  return {
    appId: Number(appId),
    name: (details && details.name) || fallbackName || `AppID ${appId}`,
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
    isFree: details ? details.isFree : false,
    discountPercent: details ? details.discountPercent : 0,
    finalPrice: details ? details.finalPrice : null,
    initialPrice: details ? details.initialPrice : null,
    news: news
  };
}

async function getFullGameInfo(gameInput) {
  const found = await findGameInSteam(gameInput);
  if (!found) {
    return null;
  }
  return await getFullGameInfoById(found.appId, found.name);
}

function clearCache() {
  cache.clear();
}

module.exports = {
  findGameInSteam,
  fetchStoreDetails,
  fetchOfficialNews,
  getInitialGameState,
  getFullGameInfoById,
  getFullGameInfo,
  clearCache
};