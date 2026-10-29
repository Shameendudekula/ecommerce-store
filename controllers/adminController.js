const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { ORDER_TRANSITIONS, ORDER_STATUSES } = require('../config/constants');
const { releaseStock } = require('../utils/stock');
const { money } = require('../utils/money');

const firstValue = (v) => (Array.isArray(v) ? v[0] : v);

// GET /api/admin/stats – numbers for the admin dashboard
exports.getStats = async (req, res) => {
  const [products, orders, customers, revenueAgg, byStatus, lowStock, recentOrders] = await Promise.all([
    Product.countDocuments(),
    Order.countDocuments(),
    User.countDocuments({ role: 'customer' }),
    // Revenue = total of every order that wasn't cancelled
    Order.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, revenue: { $sum: '$total' } } }]),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Product.find({ stock: { $lte: 5 } }).sort({ stock: 1, name: 1 }).limit(8).select('name stock').lean(),
    Order.find().sort({ createdAt: -1 }).limit(5).populate('user', 'name email').lean(),
  ]);

  const ordersByStatus = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
  for (const s of byStatus) ordersByStatus[s._id] = s.count;

  res.json({
    products,
    orders,
    customers,
    revenue: money(revenueAgg[0]?.revenue || 0),
    ordersByStatus,
    lowStock,
    recentOrders,
  });
};

// GET /api/admin/orders?status=&page=&limit=
exports.getOrders = async (req, res) => {
  const status = firstValue(req.query.status);
  const page = Math.max(1, parseInt(firstValue(req.query.page), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(firstValue(req.query.limit), 10) || 20));

  const filter = {};
  if (status) {
    if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ message: `Unknown status "${status}"` });
    filter.status = status;
  }

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).populate('user', 'name email').lean(),
    Order.countDocuments(filter),
  ]);
  res.json({ data: orders, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
};

// PATCH /api/admin/orders/:id/status  { status }
//
// Only moves allowed by ORDER_TRANSITIONS are accepted (e.g. Delivered can't go back to Pending).
// Cancelling puts the ordered quantities back into stock.
exports.updateOrderStatus = async (req, res) => {
  const next = req.body?.status;
  if (!ORDER_STATUSES.includes(next)) return res.status(400).json({ message: 'Status must be one of: ' + ORDER_STATUSES.join(', ') });

  const order = await Order.findById(req.params.id).lean();
  if (!order) return res.status(404).json({ message: 'Order not found' });

  const allowed = ORDER_TRANSITIONS[order.status];
  if (!allowed.includes(next)) {
    return res.status(400).json({
      message: allowed.length ? `A ${order.status} order can only be changed to: ${allowed.join(', ')}` : `A ${order.status} order can't be changed`,
    });
  }

  // Only update if the status is still what we just read. If two admins click at the same time,
  // the second one gets 409 instead of e.g. restoring the stock twice.
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: { status: next }, $push: { statusHistory: { status: next, at: new Date() } } },
    { returnDocument: 'after' }
  ).populate('user', 'name email');
  if (!updated) return res.status(409).json({ message: 'This order was just updated by someone else. Please refresh.' });

  if (next === 'Cancelled') {
    await Promise.all(order.items.map((i) => releaseStock(i.product, i.quantity)));
  }

  res.json({ message: `Order marked as ${next}`, data: updated });
};
