//utils/stats.js
function calcStats(records) {
  if (!records || records.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let r of records) {
    const val = Number(r.value);
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
  }

  return {
    count: records.length,
    min,
    max,
    avg: sum / records.length
  };
}

function groupByGame(records) {
  const groups = Object.create(null);
  for (let r of records) {
    const key = r.gameName || 'unknown';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(r);
  }
  return groups;
}

module.exports = { calcStats, groupByGame };