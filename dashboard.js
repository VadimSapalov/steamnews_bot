//dashboard.js
const config = require('./config');
const storage = require('./storage');
const stats = require('./utils/stats');
const chart = require('./utils/chart');
const format = require('./utils/format');

const PERIOD_HOURS = 24;
const STALE_MS = 60 * 60 * 1000;
const TABLE_ROWS = 12;

function escapeHtml(text) {
  let result = String(text);
  result = result.split('&').join('&amp;');
  result = result.split('<').join('&lt;');
  result = result.split('>').join('&gt;');
  result = result.split('"').join('&quot;');
  result = result.split("'").join('&#39;');
  return result;
}

function statusOf(discount) {
  const low = config.DISCOUNT_LOW || 20;
  const high = config.DISCOUNT_HIGH || 70;

  if (discount <= 0) {
    return { css: 'stale', text: 'без знижки' };
  }
  if (discount < low) {
    return { css: 'low', text: 'невелика знижка' };
  }
  if (discount >= high) {
    return { css: 'high', text: 'великий розпродаж!' };
  }
  return { css: 'ok', text: 'вигідна знижка' };
}

function timeText(ms) {
  return new Date(ms).toLocaleTimeString('uk-UA', {
    timeZone: 'Europe/Kyiv',
    hour12: false
  });
}

function buildCard(record, nowMs) {
  const age = nowMs - new Date(record.createdAt).getTime();
  const status = statusOf(record.value);
  let css = status.css;
  let note = status.text;

  if (age > STALE_MS) {
    css = 'stale';
    note = 'очікує оновлення';
  }

  const agoText = typeof format.formatAgo === 'function'
    ? format.formatAgo(record.createdAt)
    : timeText(new Date(record.createdAt).getTime());

  return '<div class="card ' + css + '">'
    + '<div class="name">' + escapeHtml(record.gameName) + '</div>'
    + '<div class="value">-' + record.value + '%</div>'
    + '<div class="note">' + note + ' · ' + escapeHtml(agoText) + '</div>'
    + '</div>';
}

const CSS_STYLES = [
  'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f4f6f9;color:#1a1d21;margin:0;padding:24px;line-height:1.45;}',
  'h1{margin:0 0 4px;font-size:26px;}',
  'h2{margin:28px 0 12px;font-size:18px;}',
  '.small{color:#667085;font-size:13px;margin-bottom:20px;}',
  '.cards{display:flex;flex-wrap:wrap;gap:14px;}',
  '.card{background:#fff;border-radius:12px;padding:16px 20px;min-width:200px;box-shadow:0 1px 3px rgba(0,0,0,.08);border-left:6px solid #2e9e5b;}',
  '.card.low{border-left-color:#2b7de9;}',
  '.card.high{border-left-color:#e53935;}',
  '.card.stale{border-left-color:#98a2b3;opacity:.8;}',
  '.card .name{font-weight:700;font-size:15px;margin-bottom:6px;}',
  '.card .value{font-size:34px;font-weight:700;line-height:1.1;margin-bottom:6px;}',
  '.card .note{font-size:13px;color:#667085;}',
  'table{border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:16px;}',
  'th,td{padding:9px 14px;border:1px solid #e4e7ec;text-align:left;font-size:14px;}',
  'th{background:#f9fafb;font-weight:600;}',
  'img{max-width:100%;background:#fff;border-radius:8px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin:6px 0 18px;}'
].join('');

function buildPage(token, nowMs) {
  const latest = storage.latestByGame();
  const names = [];
  for (let name in latest) {
    names.push(name);
  }
  names.sort();

  const refreshS = config.DASHBOARD_REFRESH_S || 30;
  const low = config.DISCOUNT_LOW || 20;
  const high = config.DISCOUNT_HIGH || 70;

  let html = '<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="refresh" content="' + refreshS + '">'
    + '<title>Дашборд моніторингу Steam</title>'
    + '<style>' + CSS_STYLES + '</style></head><body>';

  html += '<h1>Дашборд моніторингу знижок Steam</h1>';
  html += '<div class="small">Оновлено о ' + timeText(nowMs)
    + ' · автооновлення кожні ' + refreshS
    + ' с · цільовий діапазон знижок: від ' + low + '% до ' + high + '%</div>';

  if (names.length === 0) {
    html += '<p>Історія знижок порожня. Запустіть <code>node seed_chart.js</code> або симулятор <code>node simulator.js 3</code>.</p></body></html>';
    return html;
  }

  //Картки ігор
  html += '<h2>Поточний статус відстежуваних ігор</h2><div class="cards">';
  for (let name of names) {
    html += buildCard(latest[name], nowMs);
  }
  html += '</div>';

  //Статистика за період
  const recent = storage.listHistoryLastHours(PERIOD_HOURS, nowMs);
  const groups = stats.groupByGame(recent);

  html += '<h2>Зведення знижок за ' + PERIOD_HOURS
    + ' год</h2><table><tr><th>Гра</th><th>Замірів</th><th>Мін (%)</th><th>Середня (%)</th><th>Макс (%)</th></tr>';

  for (let name of names) {
    const summary = stats.calcStats(groups[name] || []);
    if (summary === null) {
      html += '<tr><td>' + escapeHtml(name) + '</td><td colspan="4">немає даних</td></tr>';
    } else {
      html += '<tr><td>' + escapeHtml(name) + '</td><td>' + summary.count + '</td><td>'
        + summary.min.toFixed(0) + '%</td><td>' + summary.avg.toFixed(1) + '%</td><td>'
        + summary.max.toFixed(0) + '%</td></tr>';
    }
  }
  html += '</table>';

  //Графіки знижок
  html += '<h2>Динаміка знижок за ' + PERIOD_HOURS + ' год</h2>';
  for (let name of names) {
    const src = '/chart.png?token=' + encodeURIComponent(token)
      + '&game=' + encodeURIComponent(name)
      + '&hours=' + PERIOD_HOURS;
    html += '<div><b>' + escapeHtml(name) + '</b><br><img src="' + escapeHtml(src)
      + '" alt="графік ' + escapeHtml(name) + '"></div>';
  }

  html += '<h2>Останні зафіксовані зміни</h2><table><tr><th>Час</th><th>Гра</th><th>Знижка</th></tr>';
  for (let i = 0; i < recent.length && i < TABLE_ROWS; i++) {
    html += '<tr><td>' + timeText(new Date(recent[i].createdAt).getTime()) + '</td><td>'
      + escapeHtml(recent[i].gameName) + '</td><td>-' + recent[i].value + '%</td></tr>';
  }
  html += '</table></body></html>';

  return html;
}

function sendResponse(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function handle(req, res) {
  const pathname = req.url.split('?')[0];
  if (pathname !== '/dashboard' && pathname !== '/chart.png') {
    return false;
  }

  if (!config.DASHBOARD_TOKEN) {
    return false;
  }

  if (req.method !== 'GET') {
    sendResponse(res, 405, 'text/plain; charset=utf-8', 'Використовуйте GET');
    return true;
  }

  let query;
  try {
    query = new URL(req.url, 'http://localhost').searchParams;
  } catch (error) {
    sendResponse(res, 400, 'text/plain; charset=utf-8', 'Некоректна адреса');
    return true;
  }

  const token = query.get('token');
  if (token !== config.DASHBOARD_TOKEN) {
    sendResponse(res, 401, 'text/plain; charset=utf-8', 'Потрібен правильний токен: /dashboard?token=...');
    return true;
  }

  if (pathname === '/dashboard') {
    sendResponse(res, 200, 'text/html; charset=utf-8', buildPage(token, Date.now()));
    return true;
  }

  const game = query.get('game');
  const hours = Number(query.get('hours') || PERIOD_HOURS);
  if (!game || !(hours >= 1 && hours <= 168)) {
    sendResponse(res, 400, 'text/plain; charset=utf-8', 'Потрібні game і hours (від 1 до 168)');
    return true;
  }

  const records = storage.listHistoryLastHours(hours, Date.now());
  const points = [];
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i].gameName === game) {
      points.push({
        time: new Date(records[i].createdAt).getTime(),
        value: records[i].value
      });
    }
  }

  if (points.length < 2) {
    sendResponse(res, 404, 'text/plain; charset=utf-8', 'Для графіка потрібно щонайменше 2 точки');
    return true;
  }

  const image = chart.chartToPng(chart.downsample(points, 300), {
    min: config.DISCOUNT_LOW || 20,
    max: config.DISCOUNT_HIGH || 70
  });
  sendResponse(res, 200, 'image/png', image);
  return true;
}

module.exports = { handle, buildPage, escapeHtml, statusOf };