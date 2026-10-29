const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, setupDatabase, registerUser, createAdmin, product, User, Product } = require('./helpers');

setupDatabase();

// ---------- Auth & roles ----------
test('register creates a customer and ignores a "role" in the body', async () => {
  const res = await request(app).post('/api/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'secret123', role: 'admin' }).expect(201);
  assert.equal(res.body.user.role, 'customer');
  assert.equal(res.body.user.password, undefined);
  const stored = await User.findOne({ email: 'eve@example.com' }).select('+password').lean();
  assert.match(stored.password, /^\$2[aby]\$12\$/);
});

test('register validation (400), duplicate email (409), login errors (401)', async () => {
  const bad = await request(app).post('/api/auth/register').send({ name: 'A', email: 'x', password: '123' }).expect(400);
  for (const f of ['name', 'email', 'password']) assert.ok(bad.body.errors[f]);
  await registerUser();
  await request(app).post('/api/auth/register').send({ name: 'Dup', email: 'TEST@example.com', password: 'secret123' }).expect(409);
  const a = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'nope-nope' }).expect(401);
  const b = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'secret123' }).expect(401);
  assert.equal(a.body.message, b.body.message);
  await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'secret123' }).expect(200);
});

test('GET /me returns the role; no token -> 401', async () => {
  const { auth } = await registerUser();
  const me = await request(app).get('/api/auth/me').set('Authorization', auth).expect(200);
  assert.equal(me.body.user.role, 'customer');
  await request(app).get('/api/auth/me').expect(401);
});

// ---------- Products: public browsing ----------
async function seedProducts() {
  await Product.create([
    product({ name: 'Laptop Stand', price: 1499, category: 'Electronics', rating: 4.6, description: 'Aluminium stand' }),
    product({ name: 'Cotton T-Shirt', price: 499, category: 'Clothing', rating: 4.1, description: 'Soft and breathable' }),
    product({ name: 'Running Shoes', price: 2999, category: 'Sports', rating: 4.8, description: 'Light running shoes' }),
    product({ name: 'Coffee Mug', price: 299, category: 'Home & Kitchen', rating: 3.9, description: 'Ceramic mug for coffee' }),
    product({ name: 'Novel', price: 399, category: 'Books', rating: 4.4, description: 'A gripping story' }),
  ]);
}

test('product listing is public and supports search, category, sorting and pagination', async () => {
  await seedProducts();
  let res = await request(app).get('/api/products').expect(200);
  assert.equal(res.body.pagination.total, 5);

  res = await request(app).get('/api/products?search=coffee').expect(200);
  assert.deepEqual(res.body.data.map((p) => p.name), ['Coffee Mug'], 'search matches name or description');

  res = await request(app).get('/api/products?category=Sports').expect(200);
  assert.deepEqual(res.body.data.map((p) => p.name), ['Running Shoes']);

  res = await request(app).get('/api/products?sort=price_asc').expect(200);
  assert.deepEqual(res.body.data.map((p) => p.price), [299, 399, 499, 1499, 2999]);
  res = await request(app).get('/api/products?sort=price_desc&limit=2&page=2').expect(200);
  assert.deepEqual(res.body.data.map((p) => p.price), [499, 399]);
  assert.equal(res.body.pagination.totalPages, 3);
  res = await request(app).get('/api/products?sort=rating&limit=1').expect(200);
  assert.equal(res.body.data[0].name, 'Running Shoes');

  await request(app).get('/api/products?sort=cheapest').expect(400);
  await request(app).get('/api/products?category=Toys').expect(400);
  res = await request(app).get('/api/products?search=.*').expect(200);
  assert.equal(res.body.data.length, 0, 'regex characters are matched literally');
});

test('?ids= returns exactly those products (used by the guest cart)', async () => {
  await seedProducts();
  const all = await Product.find().sort({ price: 1 }).lean();
  const res = await request(app).get(`/api/products?ids=${all[0]._id},${all[4]._id}`).expect(200);
  assert.deepEqual(res.body.data.map((p) => p.name).sort(), ['Coffee Mug', 'Running Shoes']);
  await request(app).get('/api/products?ids=abc').expect(400);
});

test('product detail: 200, 404 for unknown id, 400 for malformed id', async () => {
  const p = await Product.create(product());
  const res = await request(app).get(`/api/products/${p._id}`).expect(200);
  assert.equal(res.body.data.name, 'Wireless Mouse');
  await request(app).get('/api/products/aaaaaaaaaaaaaaaaaaaaaaaa').expect(404);
  await request(app).get('/api/products/abc').expect(400);
});

// ---------- Products: admin management ----------
test('only admins can create, update and delete products (401 guest, 403 customer)', async () => {
  const customer = await registerUser();
  const admin = await createAdmin();

  await request(app).post('/api/products').send(product()).expect(401);
  const forbidden = await request(app).post('/api/products').set('Authorization', customer.auth).send(product()).expect(403);
  assert.match(forbidden.body.message, /permission/);

  const created = await request(app).post('/api/products').set('Authorization', admin.auth).send(product({ price: '19.999' })).expect(201);
  assert.equal(created.body.data.price, 20);
  const id = created.body.data._id;

  await request(app).put(`/api/products/${id}`).set('Authorization', customer.auth).send({ price: 1 }).expect(403);
  const upd = await request(app).put(`/api/products/${id}`).set('Authorization', admin.auth).send({ price: 899, stock: 3 }).expect(200);
  assert.equal(upd.body.data.price, 899);
  assert.equal(upd.body.data.stock, 3);

  await request(app).delete(`/api/products/${id}`).set('Authorization', customer.auth).expect(403);
  await request(app).delete(`/api/products/${id}`).set('Authorization', admin.auth).expect(200);
  await request(app).get(`/api/products/${id}`).expect(404);
});

test('product validation: price, stock, category, rating and safe image URLs', async () => {
  const admin = await createAdmin();
  const res = await request(app)
    .post('/api/products')
    .set('Authorization', admin.auth)
    .send({ name: 'X', price: 0, stock: -1, category: 'Toys', rating: 9, imageUrl: 'javascript:alert(1)' })
    .expect(400);
  for (const f of ['name', 'description', 'price', 'stock', 'category', 'rating', 'imageUrl']) assert.ok(res.body.errors[f], `error for ${f}`);
  await request(app).post('/api/products').set('Authorization', admin.auth).send(product({ stock: 2.5 })).expect(400);
});
