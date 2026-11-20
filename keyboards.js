//keyboards.js
const { Markup } = require('telegraf');

const mainMenu = Markup.keyboard([
  ['Мої ігри', 'Додати гру'],
  ['Новини', 'Перевірити оновлення'],
  ['Допомога']
]).resize().oneTime(false);

const notifMenu = Markup.keyboard([
  ['Усі новини', 'Тільки знижки'],
  ['❌ Скасувати']
]).resize();

module.exports = {
  mainMenu,
  notifMenu
};