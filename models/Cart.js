const mongoose = require('mongoose');
const { MAX_QUANTITY_PER_ITEM } = require('../config/constants');

// One cart per logged-in user. Only product ids and quantities are stored;
// names, prices and stock are always read fresh from the Product collection.
const cartSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    items: [
      {
        _id: false,
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1, max: MAX_QUANTITY_PER_ITEM },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
