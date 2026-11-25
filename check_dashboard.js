//check_dashboard.js
const assert = require('assert');
const config = require('./config');
const storage = require('./storage');
const dashboard = require('./dashboard');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  OK  ', name);
    passed++;
  } catch (err) {
    console.log('  FAIL', name, '->', err.message);
    failed++;
  }
}

function mockRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
    },
    end(body) {
      this.body = body;
    }
  };
}

function callHandle(method, url) {
  const req = { method, url };
  const res = mockRes();
  const handled = dashboard.handle(req, res);
  return { handled, res };
}

const origToken = config.DASHBOARD_TOKEN;
const origLow = config.DISCOUNT_LOW;
const origHigh = config.DISCOUNT_HIGH;
const origLatest = storage.latestByGame;
const origListHistory = storage.listHistoryLastHours;

config.DASHBOARD_TOKEN = 'test_secret_token_1234567890abcdef';
config.DISCOUNT_LOW = 20;
config.DISCOUNT_HIGH = 70;

console.log('Перевірка модуля dashboard.js (steamnews_bot):\n');

//Базові функції та екранування
test('escapeHtml екранує &, <, >, ", \'', () => {
  const raw = `<script>alert("x'&")</script>`;
  const escaped = dashboard.escapeHtml(raw);
  assert.strictEqual(escaped, '&lt;script&gt;alert(&quot;x&#39;&amp;&quot;)&lt;/script&gt;');
});

test('statusOf визначає невелику знижку (low)', () => {
  const s = dashboard.statusOf(10);
  assert.strictEqual(s.css, 'low');
});

test('statusOf визначає вигідну знижку (ok)', () => {
  const s = dashboard.statusOf(40);
  assert.strictEqual(s.css, 'ok');
});

test('statusOf визначає великий розпродаж (high)', () => {
  const s = dashboard.statusOf(75);
  assert.strictEqual(s.css, 'high');
});

//Маршрутизація
test('чужий маршрут /events повертає false', () => {
  const { handled } = callHandle('GET', '/events');
  assert.strictEqual(handled, false);
});

test('вимкнений DASHBOARD_TOKEN повертає false', () => {
  config.DASHBOARD_TOKEN = '';
  const { handled } = callHandle('GET', '/dashboard?token=any');
  config.DASHBOARD_TOKEN = 'test_secret_token_1234567890abcdef';
  assert.strictEqual(handled, false);
});

test('метод POST на /dashboard -> 405', () => {
  const { handled, res } = callHandle('POST', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(handled, true);
  assert.strictEqual(res.statusCode, 405);
});

test('без токена -> 401', () => {
  const { handled, res } = callHandle('GET', '/dashboard');
  assert.strictEqual(handled, true);
  assert.strictEqual(res.statusCode, 401);
});

test('неправильний токен -> 401', () => {
  const { handled, res } = callHandle('GET', '/dashboard?token=wrong_token');
  assert.strictEqual(handled, true);
  assert.strictEqual(res.statusCode, 401);
});

test('/chart.png без токена -> 401', () => {
  const { handled, res } = callHandle('GET', '/chart.png?game=Cyberpunk');
  assert.strictEqual(handled, true);
  assert.strictEqual(res.statusCode, 401);
});

//Порожній стан
storage.latestByGame = () => Object.create(null);
storage.listHistoryLastHours = () => [];

test('порожній список ігор показує підказку', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.statusCode, 200);
  assert.ok(String(res.body).includes('Історія знижок порожня'));
});

//Заголовки безпеки
test('встановлено заголовок Cache-Control: no-store', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.headers['Cache-Control'], 'no-store');
});

test('встановлено заголовок Referrer-Policy: no-referrer', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.headers['Referrer-Policy'], 'no-referrer');
});

test('встановлено заголовок X-Content-Type-Options: nosniff', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.headers['X-Content-Type-Options'], 'nosniff');
});

//Робота з тестовими даними, XSS та constructor
const now = Date.now();
const mockRecords = [
  { appId: 1091500, gameName: 'Cyberpunk 2077', value: 50, createdAt: new Date(now - 60 * 1000).toISOString() },
  { appId: 1091500, gameName: 'Cyberpunk 2077', value: 25, createdAt: new Date(now - 120 * 1000).toISOString() },
  { appId: 1174180, gameName: 'Red Dead Redemption 2', value: 75, createdAt: new Date(now - 30 * 1000).toISOString() },
  { appId: 730, gameName: 'Stale Game', value: 30, createdAt: new Date(now - 90 * 60 * 1000).toISOString() },
  { appId: 999, gameName: '<b>XSS Game</b>', value: 15, createdAt: new Date(now - 10 * 1000).toISOString() },
  { appId: 888, gameName: 'constructor', value: 45, createdAt: new Date(now - 5 * 1000).toISOString() }
];

storage.latestByGame = () => {
  const map = Object.create(null);
  for (let i = mockRecords.length - 1; i >= 0; i--) {
    if (!map[mockRecords[i].gameName]) {
      map[mockRecords[i].gameName] = mockRecords[i];
    }
  }
  return map;
};
storage.listHistoryLastHours = () => mockRecords;

test('сторінка /dashboard повертає 200 і HTML із заголовком', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.statusCode, 200);
  assert.ok(String(res.body).includes('<h1>Дашборд моніторингу знижок Steam</h1>'));
});

test('сторінка містить meta refresh для автооновлення', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.ok(String(res.body).includes('http-equiv="refresh"'));
});

test('відображає картку вигідної знижки (card ok) та значення -50%', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.ok(String(res.body).includes('card ok'));
  assert.ok(String(res.body).includes('-50%'));
});

test('відображає картку великого розпродажу (card high)', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.ok(String(res.body).includes('card high'));
});

test('відображає застарілі дані як card stale', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.ok(String(res.body).includes('card stale'));
});

test('назва з тегом <b>XSS Game</b> екранована в HTML', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  const html = String(res.body);
  assert.ok(!html.includes('<b>XSS Game</b>'));
  assert.ok(html.includes('&lt;b&gt;XSS Game&lt;/b&gt;'));
});

test('гра з назвою constructor не ламає сторінку', () => {
  const { res } = callHandle('GET', '/dashboard?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.statusCode, 200);
  assert.ok(String(res.body).includes('constructor'));
});

//Перевірка графіка /chart.png
test('/chart.png без параметра game -> 400', () => {
  const { res } = callHandle('GET', '/chart.png?token=test_secret_token_1234567890abcdef');
  assert.strictEqual(res.statusCode, 400);
});

test('/chart.png з некоректним hours=999 -> 400', () => {
  const { res } = callHandle('GET', '/chart.png?token=test_secret_token_1234567890abcdef&game=Cyberpunk%202077&hours=999');
  assert.strictEqual(res.statusCode, 400);
});

test('/chart.png коли менше 2 точок -> 404', () => {
  const { res } = callHandle('GET', '/chart.png?token=test_secret_token_1234567890abcdef&game=Red%20Dead%20Redemption%202&hours=24');
  assert.strictEqual(res.statusCode, 404);
});

test('/chart.png для гри з >=2 точок повертає валідний PNG (200)', () => {
  const { res } = callHandle('GET', '/chart.png?token=test_secret_token_1234567890abcdef&game=Cyberpunk%202077&hours=24');
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers['Content-Type'], 'image/png');
  assert.ok(Buffer.isBuffer(res.body));
  //Перевірка перших 4 байтів PNG
  assert.strictEqual(res.body[0], 0x89);
  assert.strictEqual(res.body[1], 0x50);
  assert.strictEqual(res.body[2], 0x4e);
  assert.strictEqual(res.body[3], 0x47);
});

//Відновлення оригіналу
config.DASHBOARD_TOKEN = origToken;
config.DISCOUNT_LOW = origLow;
config.DISCOUNT_HIGH = origHigh;
storage.latestByGame = origLatest;
storage.listHistoryLastHours = origListHistory;

console.log(`\nПройдено: ${passed}, помилок: ${failed}`);
if (failed > 0) {
  process.exit(1);
}