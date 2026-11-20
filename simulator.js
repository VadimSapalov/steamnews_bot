//simulator.js
const config = require('./config');
const signal = require('./utils/signal');
const outbox = require('./utils/outbox');

const MAX_QUEUE = 100;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendEvent(event) {
  const response = await fetch(config.INGEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.INGEST_KEY
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(config.HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    const error = new Error('Бот відповів помилкою ' + response.status);
    error.status = response.status;
    throw error;
  }

  return await response.json();
}

async function main() {
  const seconds = Number(process.argv[2]) || 4;
  const ticks = Number(process.argv[3]) || 0;
  const seed = Number(process.argv[4]) || 0;

  const random = seed !== 0 ? signal.makeRandom(seed) : Math.random;

  console.log(`Симулятор подій Steam запущено: інтервал ${seconds} с (Зупинити — Ctrl+C)`);
  const queue = [];
  let step = 0;

  while (ticks === 0 || step < ticks) {
    const event = signal.generateEvent(step, random);
    const label = event.type === 'discount'
      ? `${event.gameName} [ЗНИЖКА -${event.discountPercent}% (${event.finalPrice})]`
      : `${event.gameName} [НОВИНА: ${event.title}]`;

    const lost = outbox.addToQueue(queue, event, MAX_QUEUE);
    if (lost > 0) {
      console.error('Черга переповнена: втрачено найстаріших подій: ' + lost);
    }

    const result = await outbox.flushQueue(queue, sendEvent);
    let text = `#${step} ${label} -> надіслано ${result.sent}, у черзі ${result.left}`;

    if (result.dropped > 0) {
      text += `, відхилено ${result.dropped}`;
    }
    if (result.error !== null) {
      text += ` (${result.error})`;
    }

    console.log(text);
    step++;
    await sleep(seconds * 1000);
  }

  console.log('Симулятор завершив роботу. У черзі лишилось: ' + queue.length);
}

main();