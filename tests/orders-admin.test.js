const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupDatabase, registerUser, createAdmin, product, address, Product, Order } = require('./helpers');

setupDatabase();

const add = (auth, productId, quantity) => request(app).post('/api/cart/items').set('Authorization', auth).send({ productId: String(productId), quantity }).expect(201);
const checkout = (auth, body = { shippingAddress: address() }) => request(app).post('/api/orders').set('Authorization', auth).send(body);
const stockOf = async (id) => (await Product.findById(id).lean()).stock;

// ---------- Placing orders ----------
test('placing an order reduces stock, snapshots prices, empties the cart', async () => {
  const { auth, user } = await registerUser();
  const mouse = await Product.create(product({ price: 799, stock: 10 }));
  const mug = await Product.create(product({ name: 'Mug', price: 299, stock: 4 }));
  await add(auth, mouse._id, 2);
  await add(auth, mug._id, 1);

  const res = await checkout(auth).expect(201);
  const order = res.body.data;
  assert.equal(order.user, user._id);
  assert.equal(order.status, 'Pending');
  assert.equal(order.paymentMethod, 'Cash on delivery (demo)');
  assert.equal(order.subtotal, 1897);
  assert.equal(order.shippingFee, 99);
  assert.equal(order.total, 1996);
  assert.deepEqual(order.items.map((i) => [i.name, i.price, i.quantity]), [['Wireless Mouse', 799, 2], ['Mug', 299, 1]]);

  assert.equal(await stockOf(mouse._id), 8);
  assert.equal(await stockOf(mug._id), 3);
  const cart = await request(app).get('/api/cart').set('Authorization', auth).expect(200);
  assert.equal(cart.body.items.length, 0);

  // Changing the product later doesn't change the order
  await Product.updateOne({ _id: mouse._id }, { price: 5000, name: 'Renamed' });
  const again = await request(app).get(`/api/orders/${order._id}`).set('Authorization', auth).expect(200);
  assert.equal(again.body.data.items[0].price, 799);
  assert.equal(again.body.data.items[0].name, 'Wireless Mouse');
});

test('prices and items come from the server, not from the request', async () => {
  const { auth } = await registerUser();
  const p = await Product.create(product({ price: 799 }));
  await add(auth, p._id, 1);
  const res = await checkout(auth, { shippingAddress: address(), total: 1, items: [{ product: p._id, price: 1, quantity: 99 }] }).expect(201);
  assert.equal(res.body.data.total, 898);
  assert.equal(res.body.data.items[0].quantity, 1);
});

test('empty cart -> 400; invalid address -> 400 without touching stock', async () => {
  const { auth } = await registerUser();
  await checkout(auth).expect(400);

  const p = await Product.create(product({ stock: 5 }));
  await add(auth, p._id, 2);
  const bad = await checkout(auth, { shippingAddress: { fullName: '', phone: 'abc', postalCode: '!' } }).expect(400);
  for (const f of ['fullName', 'phone', 'line1', 'city', 'postalCode', 'country']) {
    assert.ok(Object.keys(bad.body.errors).some((k) => k.endsWith(f)), `error for ${f}`);
  }
  assert.equal(await stockOf(p._id), 5);
});

test('ordering more than the stock is blocked and nothing is reserved (rollback)', async () => {
  const { auth } = await registerUser();
  const plenty = await Product.create(product({ name: 'Plenty', stock: 10 }));
  const scarce = await Product.create(product({ name: 'Scarce', stock: 3 }));
  await add(auth, plenty._id, 2);
  await add(auth, scarce._id, 3);

  // Someone else buys 2 of the scarce item after it was added to this cart
  await Product.updateOne({ _id: scarce._id }, { $inc: { stock: -2 } });

  const res = await checkout(auth).expect(409);
  assert.match(res.body.message, /Only 1 of Scarce left/);
  assert.equal(await stockOf(plenty._id), 10, 'the reservation for Plenty was rolled back');
  assert.equal(await stockOf(scarce._id), 1);
  assert.equal(await Order.countDocuments(), 0);
});

test('two customers racing for the last item: exactly one order succeeds', async () => {
  const a = await registerUser({ email: 'a@example.com' });
  const b = await registerUser({ email: 'b@example.com' });
  const last = await Product.create(product({ name: 'Last one', stock: 1 }));
  await add(a.auth, last._id, 1);
  await add(b.auth, last._id, 1);

  const results = await Promise.all([checkout(a.auth), checkout(b.auth)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await stockOf(last._id), 0, 'stock never goes negative');
  assert.equal(await Order.countDocuments(), 1);
});

test("customers see only their own orders; admins can open any order", async () => {
  const a = await registerUser({ email: 'a@example.com' });
  const b = await registerUser({ email: 'b@example.com' });
  const admin = await createAdmin();
  const p = await Product.create(product());
  await add(a.auth, p._id, 1);
  const { body } = await checkout(a.auth).expect(201);

  const mine = await request(app).get('/api/orders').set('Authorization', a.auth).expect(200);
  assert.equal(mine.body.data.length, 1);
  const theirs = await request(app).get('/api/orders').set('Authorization', b.auth).expect(200);
  assert.equal(theirs.body.data.length, 0);

  await request(app).get(`/api/orders/${body.data._id}`).set('Authorization', b.auth).expect(404);
  await request(app).get(`/api/orders/${body.data._id}`).set('Authorization', admin.auth).expect(200);
  await request(app).get('/api/orders').expect(401);
});

// ---------- Admin ----------
test('admin routes: 401 for guests, 403 for customers', async () => {
  const { auth } = await registerUser();
  await request(app).get('/api/admin/stats').expect(401);
  await request(app).get('/api/admin/stats').set('Authorization', auth).expect(403);
  await request(app).get('/api/admin/orders').set('Authorization', auth).expect(403);
});

test('admin stats count products, orders, customers and revenue (excluding cancelled)', async () => {
  const admin = await createAdmin();
  const c = await registerUser();
  const p = await Product.create(product({ price: 1000, stock: 4 }));
  await Product.create(product({ name: 'Other', stock: 50 }));
  await add(c.auth, p._id, 1);
  const first = (await checkout(c.auth).expect(201)).body.data;
  await add(c.auth, p._id, 2);
  await checkout(c.auth).expect(201);
  await request(app).patch(`/api/admin/orders/${first._id}/status`).set('Authorization', admin.auth).send({ status: 'Cancelled' }).expect(200);

  const { body } = await request(app).get('/api/admin/stats').set('Authorization', admin.auth).expect(200);
  assert.equal(body.products, 2);
  assert.equal(body.orders, 2);
  assert.equal(body.customers, 1, 'admins are not counted as customers');
  assert.equal(body.revenue, 2000, 'only the non-cancelled order (2 x 1000, free shipping)');
  assert.equal(body.ordersByStatus.Pending, 1);
  assert.equal(body.ordersByStatus.Cancelled, 1);
  assert.deepEqual(body.lowStock.map((l) => [l.name, l.stock]), [['Wireless Mouse', 2]]);
  assert.equal(body.recentOrders[0].user.email, 'test@example.com');
});

test('order status: allowed transitions only; cancelling restores stock exactly once', async () => {
  const admin = await createAdmin();
  const c = await registerUser();
  const p = await Product.create(product({ stock: 5 }));
  const patch = (id, status) => request(app).patch(`/api/admin/orders/${id}/status`).set('Authorization', admin.auth).send({ status });

  await add(c.auth, p._id, 2);
  const o1 = (await checkout(c.auth).expect(201)).body.data;
  assert.equal(await stockOf(p._id), 3);

  await patch(o1._id, 'Delivered').expect(400); // Pending -> Delivered skips Shipped
  await patch(o1._id, 'Flying').expect(400);
  const shipped = await patch(o1._id, 'Shipped').expect(200);
  assert.deepEqual(shipped.body.data.statusHistory.map((h) => h.status), ['Pending', 'Shipped']);
  await patch(o1._id, 'Delivered').expect(200);
  const final = await patch(o1._id, 'Cancelled').expect(400);
  assert.match(final.body.message, /can't be changed/);
  assert.equal(await stockOf(p._id), 3, 'delivered orders keep their stock');

  await add(c.auth, p._id, 1);
  const o2 = (await checkout(c.auth).expect(201)).body.data;
  assert.equal(await stockOf(p._id), 2);
  // Two admins cancel at the same moment: one wins, stock is restored once
  const results = await Promise.all([patch(o2._id, 'Cancelled'), patch(o2._id, 'Cancelled')]);
  assert.ok(results.some((r) => r.status === 200));
  assert.ok(results.every((r) => [200, 400, 409].includes(r.status)));
  assert.equal(await stockOf(p._id), 3, 'cancelled quantity returned once');

  // The customer sees the new status
  const mine = await request(app).get(`/api/orders/${o1._id}`).set('Authorization', c.auth).expect(200);
  assert.equal(mine.body.data.status, 'Delivered');
});

test('admin order list filters by status and includes the customer', async () => {
  const admin = await createAdmin();
  const c = await registerUser();
  const p = await Product.create(product());
  await add(c.auth, p._id, 1);
  const o = (await checkout(c.auth).expect(201)).body.data;
  await add(c.auth, p._id, 1);
  await checkout(c.auth).expect(201);
  await request(app).patch(`/api/admin/orders/${o._id}/status`).set('Authorization', admin.auth).send({ status: 'Shipped' }).expect(200);

  let res = await request(app).get('/api/admin/orders').set('Authorization', admin.auth).expect(200);
  assert.equal(res.body.pagination.total, 2);
  assert.equal(res.body.data[0].user.name, 'Test User');
  res = await request(app).get('/api/admin/orders?status=Shipped').set('Authorization', admin.auth).expect(200);
  assert.equal(res.body.data.length, 1);
  await request(app).get('/api/admin/orders?status=Lost').set('Authorization', admin.auth).expect(400);
});
