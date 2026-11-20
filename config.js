//config.js
require('dotenv').config();
const path = require('path');

if (!process.env.BOT_TOKEN) {
  console.error('Помилка: Не знайдено BOT_TOKEN у файлі .env!');
  process.exit(1);
}

const DATA_FILE = path.join(__dirname, 'data', 'data.json');
const ADMIN_ID = Number(process.env.ADMIN_ID);
const BROADCAST_PAUSE_MS = 50;

const STEAM_NEWS_URL = 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/';
const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_APPDETAILS_URL = 'https://store.steampowered.com/api/appdetails';
const HTTP_TIMEOUT_MS = 7000;
const STEAM_CACHE_MS = 5 * 60 * 1000;
const STEAM_CHECK_INTERVAL_MS = 5 * 60 * 1000;

const INGEST_KEY = process.env.INGEST_KEY;
const INGEST_PORT = Number(process.env.INGEST_PORT) || 3000;
const INGEST_HOST = '127.0.0.1';
const INGEST_URL = 'http://' + INGEST_HOST + ':' + INGEST_PORT + '/events';

module.exports = {
  token: process.env.BOT_TOKEN,
  DATA_FILE,
  ADMIN_ID,
  BROADCAST_PAUSE_MS,
  STEAM_NEWS_URL,
  STEAM_SEARCH_URL,
  STEAM_APPDETAILS_URL,
  HTTP_TIMEOUT_MS,
  STEAM_CACHE_MS,
  STEAM_CHECK_INTERVAL_MS,
  INGEST_KEY,
  INGEST_PORT,
  INGEST_HOST,
  INGEST_URL
};