const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const constants = require('./config/constants');
const { notFound, errorHandler } = require('./middleware/errorHandler');

// The app is built here and started in server.js, so tests can use it without opening a port
const app = express();

// Render (and most hosts) sit behind a proxy; this lets the rate limiter see the real client IP
app.set('trust proxy', 1);

// The frontend is served by this same server, so CORS only matters if CLIENT_URL is set
app.use(cors(process.env.CLIENT_URL ? { origin: process.env.CLIENT_URL.split(',') } : undefined));
app.use(express.json({ limit: '100kb' }));

// API
app.get('/api/health', (req, res) => {
  const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  res.json({ status: 'ok', database: dbStates[mongoose.connection.readyState] || 'unknown', uptime: Math.round(process.uptime()) });
});
app.get('/api/meta', (req, res) =>
  res.json({
    categories: constants.CATEGORIES,
    orderStatuses: constants.ORDER_STATUSES,
    orderTransitions: constants.ORDER_TRANSITIONS,
    freeShippingFrom: constants.FREE_SHIPPING_FROM,
    shippingFee: constants.SHIPPING_FEE,
    maxQuantity: constants.MAX_QUANTITY_PER_ITEM,
    paymentMethod: constants.PAYMENT_METHOD,
  })
);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', notFound);

// Frontend (public/*.html, css, js)
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.use(errorHandler);

module.exports = app;
