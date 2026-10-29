const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { totals } = require('../utils/pricing');
const { reserveStock, releaseStock } = require('../utils/stock');

const ADDRESS_FIELDS = ['fullName', 'phone', 'line1', 'line2', 'city', 'postalCode', 'country'];

function pickAddress(body = {}) {
  const src = body.shippingAddress || {};
  const address = {};
  for (const f of ADDRESS_FIELDS) if (typeof src[f] === 'string') address[f] = src[f];
  return address;
}

// POST /api/orders  { shippingAddress: { fullName, phone, line1, line2?, city, postalCode, country } }
//
// The order is built from the user's server-side cart and current database prices.
// The client never sends prices or items, so nobody can change what they pay.
exports.placeOrder = async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || cart.items.length === 0) return res.status(400).json({ message: 'Your cart is empty' });

  // 1. Current product data for every cart line
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const missing = cart.items.filter((i) => !byId.has(String(i.product)));
  if (missing.length) return res.status(409).json({ message: 'Some products in your cart are no longer available. Please review your cart.' });

  const items = cart.items.map((i) => {
    const p = byId.get(String(i.product));
    return { product: p._id, name: p.name, imageUrl: p.imageUrl, price: p.price, quantity: i.quantity };
  });
  const { subtotal, shippingFee, total } = totals(items);

  // 2. Validate the address BEFORE touching stock, so a typo never reserves anything
  const order = new Order({
    user: req.user._id,
    items,
    shippingAddress: pickAddress(req.body),
    subtotal,
    shippingFee,
    total,
    status: 'Pending',
    statusHistory: [{ status: 'Pending' }],
  });
  await order.validate(); // throws a ValidationError -> 400 with a message per field

  // 3. Reserve stock item by item. If any item can't be reserved, give back what was already
  //    taken (rollback) so a failed order never leaves stock reduced.
  const reserved = [];
  for (const item of items) {
    if (await reserveStock(item.product, item.quantity)) {
      reserved.push(item);
      continue;
    }
    await Promise.all(reserved.map((r) => releaseStock(r.product, r.quantity)));
    const current = await Product.findById(item.product).lean();
    const left = current?.stock ?? 0;
    return res.status(409).json({
      message: left === 0 ? `${item.name} is out of stock` : `Only ${left} of ${item.name} left in stock – please update your cart`,
      productId: item.product,
      available: left,
    });
  }

  // 4. Save the order and empty the cart. If saving fails, release the stock again.
  try {
    await order.save();
  } catch (err) {
    await Promise.all(reserved.map((r) => releaseStock(r.product, r.quantity)));
    throw err;
  }
  cart.items = [];
  await cart.save();

  res.status(201).json({ message: 'Order placed', data: order });
};

// GET /api/orders – the logged-in customer's orders, newest first
exports.getMyOrders = async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ data: orders });
};

// GET /api/orders/:id – your own order (admins may view any order)
exports.getOrder = async (req, res) => {
  const filter = { _id: req.params.id };
  if (req.user.role !== 'admin') filter.user = req.user._id; // other people's orders -> 404
  const order = await Order.findOne(filter).lean();
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json({ data: order });
};

