// npm run seed – resets the store to the sample catalogue:
//   - creates/resets the admin and demo customer accounts (other accounts are kept)
//   - replaces ALL products with the 20 sample products
//   - replaces the demo customer's orders and cart with a few sample orders
require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const { totals } = require('../utils/pricing');
const { ADMIN, CUSTOMER, PRODUCTS, ORDERS, DEMO_ADDRESS } = require('./sampleData');

async function upsertUser(data) {
  let user = await User.findOne({ email: data.email });
  if (!user) user = new User(data);
  user.set(data); // resets name, password (re-hashed) and role
  await user.save();
  return user;
}

async function seedStore() {
  await Promise.all([User.init(), Cart.init()]);
  const [admin, customer] = await Promise.all([upsertUser(ADMIN), upsertUser(CUSTOMER)]);

  await Product.deleteMany({});
  const products = await Product.insertMany(PRODUCTS);
  const byName = new Map(products.map((p) => [p.name, p]));

  await Promise.all([Order.deleteMany({ user: customer._id }), Cart.deleteMany({ user: customer._id })]);

  for (const [daysAgo, status, lines] of ORDERS) {
    const items = lines.map(([name, quantity]) => {
      const p = byName.get(name);
      return { product: p._id, name: p.name, imageUrl: p.imageUrl, price: p.price, quantity };
    });
    const placedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    const history = ['Pending', 'Shipped', 'Delivered'].slice(0, ['Pending', 'Shipped', 'Delivered'].indexOf(status) + 1);
    await Order.create({
      user: customer._id,
      items,
      shippingAddress: DEMO_ADDRESS,
      ...totals(items),
      status,
      statusHistory: history.map((s, i) => ({ status: s, at: new Date(placedAt.getTime() + i * 2 * 24 * 60 * 60 * 1000) })),
      createdAt: placedAt,
    });
    // The sample orders "used" stock, just like real ones
    for (const i of items) await Product.updateOne({ _id: i.product }, { $inc: { stock: -i.quantity } });
  }

  return { admin, customer, products: products.length, orders: ORDERS.length };
}

if (require.main === module) {
  (async () => {
    try {
      await connectDB(process.env.MONGO_URI);
      const r = await seedStore();
      console.log(`Inserted ${r.products} products and ${r.orders} sample orders.`);
      console.log(`Admin:    ${ADMIN.email} / ${ADMIN.password}`);
      console.log(`Customer: ${CUSTOMER.email} / ${CUSTOMER.password}`);
    } catch (err) {
      console.error('Seeding failed:', err.message);
      process.exitCode = 1;
    } finally {
      await mongoose.disconnect();
    }
  })();
}

module.exports = { seedStore };
