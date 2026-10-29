const mongoose = require('mongoose');
const { ORDER_STATUSES, PAYMENT_METHOD } = require('../config/constants');

const required = (label) => [true, `${label} is required`];

const shippingSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: required('Full name'), trim: true, maxlength: 80 },
    phone: { type: String, required: required('Phone'), trim: true, match: [/^\+?[0-9 ]{7,15}$/, 'Phone must be 7–15 digits'] },
    line1: { type: String, required: required('Address'), trim: true, maxlength: 120 },
    line2: { type: String, trim: true, maxlength: 120, default: '' },
    city: { type: String, required: required('City'), trim: true, maxlength: 60 },
    postalCode: { type: String, required: required('Postal code'), trim: true, match: [/^[A-Za-z0-9 -]{3,10}$/, 'Postal code looks invalid'] },
    country: { type: String, required: required('Country'), trim: true, maxlength: 60 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // A snapshot of each product at the moment of purchase. If the admin later changes the price
    // or deletes the product, the order still shows what the customer actually paid.
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        name: { type: String, required: true },
        imageUrl: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    shippingAddress: { type: shippingSchema, required: true },
    paymentMethod: { type: String, default: PAYMENT_METHOD },
    subtotal: { type: Number, required: true },
    shippingFee: { type: Number, required: true },
    total: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'Pending', index: true },
    // Set whenever the status changes, so customers can see when it was shipped/delivered
    statusHistory: [{ _id: false, status: String, at: { type: Date, default: Date.now } }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);
