// Round money to 2 decimals. EPSILON avoids float errors such as 1.005 * 100 = 100.4999… -> 1.00
function money(v) {
  if (v === '' || v === null || v === undefined) return v;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 100) / 100 : v;
}

module.exports = { money };
