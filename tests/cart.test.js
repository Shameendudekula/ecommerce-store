const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupDatabase, registerUser, createAdmin, product, Product } = require('./helpers');

setupDatabase();

const add = (auth, productId, quantity) => request(app).post('/api/cart/items').set('Authorization', auth).send({ productId: String(productId), quantity });

test('cart requires login', async () => {
  await request(app).get('/api/cart').expect(401);
});

test('a new user has an empty cart', async () => {
  const { auth } = await registerUser();
  const res = await request(app).get('/api/cart').set('Authorization', auth).expect(200);
  assert.deepEqual(res.body.items, []);
  assert.equal(res.body.total, 0);
});

test('add, increase, update and remove items; totals use current prices and shipping rules', async () => {
  const { auth } = await registerUser();
  const mouse = await Product.create(product({ price: 799, stock: 10 }));
  const mug = await Product.create(product({ name: 'Mug', price: 299, stock: 5 }));

  let res = await add(auth, mouse._id, 1).expect(201);
  assert.equal(res.body.itemCount, 1);
  assert.equal(res.body.shippingFee, 99, 'shipping charged below 2000');
  assert.equal(res.body.total, 898);

  res = await add(auth, mouse._id, 2).expect(201);
  assert.equal(res.body.items[0].quantity, 3, 'adding again increases the quantity');

  res = await add(auth, mug._id, 1).expect(201);
  assert.equal(res.body.subtotal, 3 * 799 + 299);
  assert.equal(res.body.shippingFee, 0, 'free shipping from 2000');

  res = await request(app).patch(`/api/cart/items/${mouse._id}`).set('Authorization', auth).send({ quantity: 1 }).expect(200);
  assert.equal(res.body.items.find((i) => String(i.productId) === String(mouse._id)).quantity, 1);

  res = await request(app).patch(`/api/cart/items/${mug._id}`).set('Authorization', auth).send({ quantity: 0 }).expect(200);
  assert.equal(res.body.items.length, 1, 'quantity 0 removes the item');

  res = await request(app).delete(`/api/cart/items/${mouse._id}`).set('Authorization', auth).expect(200);
  assert.equal(res.body.items.length, 0);
  await request(app).delete(`/api/cart/items/${mouse._id}`).set('Authorization', auth).expect(404);
});

test('the cart never holds more than the stock', async () => {
  const { auth } = await registerUser();
  const p = await Product.create(product({ stock: 3 }));
  const soldOut = await Product.create(product({ name: 'Sold out', stock: 0 }));

  await add(auth, p._id, 2).expect(201);
  const tooMany = await add(auth, p._id, 2).expect(409);
  assert.match(tooMany.body.message, /Only 3 .* in stock .*already have 2/);
  await request(app).patch(`/api/cart/items/${p._id}`).set('Authorization', auth).send({ quantity: 4 }).expect(409);
  await add(auth, soldOut._id, 1).expect(409);

  await add(auth, p._id, 0).expect(400);
  await add(auth, p._id, 1.5).expect(400);
  await add(auth, 'abc', 1).expect(400);
  await add(auth, 'aaaaaaaaaaaaaaaaaaaaaaaa', 1).expect(404);
});

test('a line shows available: false when stock later drops below the cart quantity', async () => {
  const { auth } = await registerUser();
  const p = await Product.create(product({ stock: 5 }));
  await add(auth, p._id, 4).expect(201);
  await Product.updateOne({ _id: p._id }, { stock: 2 });
  const res = await request(app).get('/api/cart').set('Authorization', auth).expect(200);
  assert.equal(res.body.items[0].available, false);
  assert.equal(res.body.items[0].stock, 2);
});

test('deleted products disappear from carts', async () => {
  const { auth } = await registerUser();
  const admin = await createAdmin();
  const p = await Product.create(product());
  await add(auth, p._id, 1).expect(201);
  await request(app).delete(`/api/products/${p._id}`).set('Authorization', admin.auth).expect(200);
  const res = await request(app).get('/api/cart').set('Authorization', auth).expect(200);
  assert.equal(res.body.items.length, 0);
});

test('merge adds guest quantities to the saved cart, capped at stock, skipping bad items', async () => {
  const { auth } = await registerUser();
  const a = await Product.create(product({ name: 'Item A', stock: 5 }));
  const b = await Product.create(product({ name: 'Item B', stock: 10 }));
  const soldOut = await Product.create(product({ name: 'Gone', stock: 0 }));

  // Saved cart from an earlier visit: 2 x A
  await add(auth, a._id, 2).expect(201);

  // Guest cart: 2 + 2 more of A (duplicates), 1 of B, a sold-out item, junk
  const res = await request(app)
    .post('/api/cart/merge')
    .set('Authorization', auth)
    .send({
      items: [
        { productId: String(a._id), quantity: 2 },
        { productId: String(a._id), quantity: 2 },
        { productId: String(b._id), quantity: 1 },
        { productId: String(soldOut._id), quantity: 1 },
        { productId: 'not-an-id', quantity: 1 },
        { productId: String(b._id), quantity: -3 },
      ],
    })
    .expect(200);

  const qty = Object.fromEntries(res.body.items.map((i) => [i.name, i.quantity]));
  assert.deepEqual(qty, { 'Item A': 5, 'Item B': 1 }, '2 saved + 4 guest = 6, capped at stock 5');
  assert.ok(res.body.adjustments.some((m) => m.includes('Item A: quantity reduced to 5')));
  assert.ok(res.body.adjustments.some((m) => m.includes('Gone is out of stock')));

  await request(app).post('/api/cart/merge').set('Authorization', auth).send({ items: 'nope' }).expect(400);
});
