//storage.js
const fs = require('fs');
const path = require('path');
const config = require('./config');

let data = {
  users: {},
  games: [],
  lastGameID: 0
};

function loadData() {
  try {
    const fileContent = fs.readFileSync(config.DATA_FILE, 'utf8');
    const parsed = JSON.parse(fileContent);

    data.users = parsed.users && typeof parsed.users === 'object' ? parsed.users : {};
    data.games = Array.isArray(parsed.games) ? parsed.games : [];
    data.lastGameID = Number(parsed.lastGameID) || 0;

    console.log('Дані успішно завантажені з data.json');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log('Файл data.json не знайдено. Починаємо з порожньої бази.');
      return;
    }
    throw err;
  }
}

function makeCopy() {
  return JSON.parse(JSON.stringify(data));
}

function saveChanges(newData) {
  const json = JSON.stringify(newData, null, 2);
  const tmpFile = config.DATA_FILE + '.tmp';

  fs.mkdirSync(path.dirname(config.DATA_FILE), { recursive: true });
  fs.writeFileSync(tmpFile, json, 'utf8');

  try {
    fs.renameSync(tmpFile, config.DATA_FILE);
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      fs.writeFileSync(config.DATA_FILE, json, 'utf8');
      fs.rmSync(tmpFile, { force: true });
    } else {
      throw err;
    }
  }

  data = newData;
}

//КОРИСТУВАЧІ========================================================
function saveUser(telegramId, name, role = 'Геймер') {
  const copy = makeCopy();
  const key = String(telegramId);
  const createdAt = copy.users[key] ? copy.users[key].createdAt : new Date().toISOString();

  copy.users[key] = {
    telegramId: Number(telegramId),
    name: name,
    role: role,
    createdAt: createdAt
  };

  try {
    saveChanges(copy);
    return true;
  } catch (error) {
    console.error('saveUser:', error.message);
    return false;
  }
}

function getUser(telegramId) {
  return data.users[String(telegramId)] || null;
}

function listAllUserIds() {
  return Object.keys(data.users).map(id => Number(id));
}

//ІГРИ================================================================
function indexOfId(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return i;
  }
  return -1;
}

function addGame(userID, appId, gameName, notifType = 'Усі новини', lastNewsDate = null, lastDiscount = 0) {
  const copy = makeCopy();
  copy.lastGameID = copy.lastGameID + 1;

  const record = {
    id: copy.lastGameID,
    userID: Number(userID),
    appId: Number(appId),
    gameName: gameName,
    notifType: notifType,
    lastNewsDate: lastNewsDate,
    lastDiscount: Number(lastDiscount) || 0,
    createdAt: new Date().toISOString()
  };

  copy.games.push(record);
  saveChanges(copy);
  return record;
}

function getGame(id) {
  const index = indexOfId(data.games, id);
  return index === -1 ? null : data.games[index];
}

function listAllGames() {
  return data.games.slice();
}

function listUserGames(userID) {
  const targetId = Number(userID);
  return data.games.filter(g => Number(g.userID) === targetId);
}

function updateGame(id, notifType) {
  const copy = makeCopy();
  const index = indexOfId(copy.games, id);
  if (index === -1) return null;

  copy.games[index].notifType = notifType;
  copy.games[index].updatedAt = new Date().toISOString();
  saveChanges(copy);
  return copy.games[index];
}

function updateGameTrackingState(id, lastNewsDate, lastDiscount) {
  const copy = makeCopy();
  const index = indexOfId(copy.games, id);
  if (index === -1) return null;

  if (lastNewsDate !== undefined) {
    copy.games[index].lastNewsDate = lastNewsDate;
  }
  if (lastDiscount !== undefined) {
    copy.games[index].lastDiscount = Number(lastDiscount) || 0;
  }
  saveChanges(copy);
  return copy.games[index];
}

function deleteGame(id) {
  const copy = makeCopy();
  const index = indexOfId(copy.games, id);
  if (index === -1) return null;

  const removed = copy.games[index];
  copy.games.splice(index, 1);
  saveChanges(copy);
  return removed;
}

module.exports = {
  loadData,
  saveUser,
  getUser,
  listAllUserIds,
  addGame,
  getGame,
  listAllGames,
  listUserGames,
  updateGame,
  updateGameTrackingState,
  deleteGame
};