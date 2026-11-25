//ingest.js
const http = require('http');
const config = require('./config');
const storage = require('./storage');
const format = require('./utils/format');
const dashboard = require('./dashboard');

const MAX_BODY = 10 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const ALERT_RECENT_MS = 10 * 60 * 1000;

const processedEvents = new Set();

function readBody(req) {
  return new Promise(function (resolve, reject) {
    let body = '';
    let tooLarge = false;

    req.on('data', function (chunk) {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        tooLarge = true;
        reject(new Error('too large'));
      }
    });

    req.on('end', function () {
      resolve(body);
    });

    req.on('error', reject);
  });
}

function sendJson(res, status, object) {
  if (res.headersSent) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(object));
}

function isValidTime(text) {
  if (typeof text !== 'string') return false;
  const moment = new Date(text);
  if (isNaN(moment.getTime()) || moment.toISOString() !== text) return false;
  const age = Date.now() - moment.getTime();
  return age <= MAX_AGE_MS && age >= -MAX_FUTURE_MS;
}

async function handleRequest(bot, req, res) {
  if (dashboard.handle(req, res)) {
    return;
  }

  if (req.url !== '/events') {
    return sendJson(res, 404, { ok: false, error: 'not found' });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'use POST' });
  }

  if (req.headers['x-api-key'] !== config.INGEST_KEY) {
    return sendJson(res, 401, { ok: false, error: 'wrong key' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    res.setHeader('Connection', 'close');
    return sendJson(res, 413, { ok: false, error: 'body too large' });
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: 'invalid json' });
  }

  //Валідація події Steam
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.eventId !== 'string' ||
    !['news', 'discount'].includes(data.type) ||
    !Number.isInteger(data.appId) ||
    typeof data.gameName !== 'string'
  ) {
    return sendJson(res, 400, { ok: false, error: 'invalid event payload' });
  }

  if (!isValidTime(data.time)) {
    return sendJson(res, 400, { ok: false, error: 'invalid time' });
  }

  //Захист від дублікатів
  if (processedEvents.has(data.eventId)) {
    return sendJson(res, 200, { ok: true, duplicate: true });
  }
  processedEvents.add(data.eventId);

  const subscribers = storage.listAllGames().filter(g => g.appId === data.appId);
  let notified = 0;
  const isFresh = Date.now() - new Date(data.time).getTime() < ALERT_RECENT_MS;

  for (let record of subscribers) {
    if (data.type === 'news') {
      storage.updateGameTrackingState(record.id, data.time, record.lastDiscount);

      if (isFresh && record.notifType === 'Усі новини') {
        const text = format.formatNewNewsAlert(record.gameName, {
          title: data.title,
          date: data.time,
          contents: data.contents,
          url: data.url
        });
        await bot.telegram.sendMessage(record.userID, text, { parse_mode: 'Markdown' }).catch(() => {});
        notified++;
      }
    } else if (data.type === 'discount') {
      storage.updateGameTrackingState(record.id, record.lastNewsDate, data.discountPercent);

      //Знижки отримують і "Усі новини" і "Тільки знижки"
      if (isFresh) {
        const text = format.formatDiscountAlert(record.gameName, {
          discountPercent: data.discountPercent,
          finalPrice: data.finalPrice,
          initialPrice: data.initialPrice,
          storeUrl: data.storeUrl
        });
        await bot.telegram.sendMessage(record.userID, text, { parse_mode: 'Markdown' }).catch(() => {});
        notified++;
      }
    }
  }

  sendJson(res, 201, { ok: true, notified });
}

function start(bot) {
  if (!config.INGEST_KEY) {
    console.log('INGEST_KEY не вказано в .env: симулятор подій вимкнено.');
    return null;
  }

  const server = http.createServer(function (req, res) {
    handleRequest(bot, req, res).catch(function (error) {
      console.error('ingest:', error.message);
      if (!res.headersSent) {
        sendJson(res, 500, { ok: false, error: 'server error' });
      }
    });
  });

  server.listen(config.INGEST_PORT, config.INGEST_HOST, function () {
    const base = 'http://' + (config.INGEST_HOST || '127.0.0.1') + ':' + server.address().port;
    console.log('Приймач тестових подій Steam: ' + base + '/events');
    if (config.DASHBOARD_TOKEN) {
      console.log('Веб-дашборд аналітики: ' + base + '/dashboard?token=' + config.DASHBOARD_TOKEN);
    }
  });

  return server;
}

module.exports = { start };