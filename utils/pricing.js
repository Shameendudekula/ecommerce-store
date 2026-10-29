const { FREE_SHIPPING_FROM, SHIPPING_FEE } = require('../config/constants');
const { money } = require('./money');

// Used by both the cart and checkout so the customer always sees the same numbers they pay
function totals(lines) {
  const subtotal = money(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const shippingFee = subtotal === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING_FEE;
  return {
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    shippingFee,
    total: money(subtotal + shippingFee),
  };
}

module.exports = { totals };
