//utils/validators.js
function validateGameName(name) {
  if (!name || name.trim().length < 2) {
    return 'Назва гри занадто коротка (мінімум 2 символи).';
  }
  if (name.length > 60) {
    return 'Назва гри занадто довга (максимум 60 символів).';
  }
  return null;
}

function ParseID(text) {
  const value = Number(text);
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  return null;
}

module.exports = {
  validateGameName,
  ParseID
};