// Single source of truth for store settings. The frontend loads these from GET /api/meta.
const CATEGORIES = ['Electronics', 'Clothing', 'Home & Kitchen', 'Books', 'Sports'];

const ROLES = ['customer', 'admin'];

// Order lifecycle. Each status lists the statuses it may move to next.
// Delivered and Cancelled are final.
const ORDER_TRANSITIONS = {
  Pending: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Cancelled'],
  Delivered: [],
  Cancelled: [],
};
const ORDER_STATUSES = Object.keys(ORDER_TRANSITIONS);

// Shipping: free from this subtotal upwards, otherwise a flat fee (INR)
const FREE_SHIPPING_FROM = 2000;
const SHIPPING_FEE = 99;

const MAX_QUANTITY_PER_ITEM = 10;
const PAYMENT_METHOD = 'Cash on delivery (demo)';

module.exports = { CATEGORIES, ROLES, ORDER_TRANSITIONS, ORDER_STATUSES, FREE_SHIPPING_FROM, SHIPPING_FEE, MAX_QUANTITY_PER_ITEM, PAYMENT_METHOD };
