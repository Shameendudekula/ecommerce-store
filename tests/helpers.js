// Shared test setup: a temporary in-memory MongoDB, so tests never touch your Atlas database
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';

const { before, after, beforeEach } = require('node:test');
const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../app');
const User = require('../models/User');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');

function setupDatabase() {
  let mongo;
  before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), Cart.init()]);
  });
  after(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  beforeEach(async () => {
    await Promise.all([User.deleteMany({}), Product.deleteMany({}), Cart.deleteMany({}), Order.deleteMany({})]);
  });
}

// Registers a user and returns { token, user, auth } where auth is the Authorization header value
async function registerUser(overrides = {}) {
  const body = { name: 'Test User', email: 'test@example.com', password: 'secret123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body).expect(201);
  return { token: res.body.token, user: res.body.user, auth: `Bearer ${res.body.token}` };
}

// Creates an admin directly in the database (the API never lets anyone register as admin) and logs in
async function createAdmin() {
  await User.create({ name: 'Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin' });
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'admin1234' }).expect(200);
  return { token: res.body.token, user: res.body.user, auth: `Bearer ${res.body.token}` };
}

const product = (overrides = {}) => ({
  name: 'Wireless Mouse',
  description: 'Quiet ergonomic mouse',
  price: 799,
  category: 'Electronics',
  imageUrl: 'https://picsum.photos/seed/mouse/600/400',
  stock: 10,
  rating: 4.3,
  ...overrides,
});

const address = (overrides = {}) => ({
  fullName: 'Test Customer', phone: '+91 9876543210', line1: '12 MG Road', city: 'Anantapur', postalCode: '515001', country: 'India', ...overrides,
});

module.exports = { app, request, setupDatabase, registerUser, createAdmin, product, address, User, Product, Cart, Order };
