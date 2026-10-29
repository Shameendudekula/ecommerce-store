const mongoose = require('mongoose');
const { CATEGORIES } = require('../config/constants');
const { money } = require('../utils/money');

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must be at most 100 characters'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description must be at most 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [1, 'Price must be at least 1'],
      max: [10_000_000, 'Price is too high'],
      set: money,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: CATEGORIES, message: 'Category must be one of: ' + CATEGORIES.join(', ') },
    },
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
      // Only http(s) links, so a "javascript:" URL can never end up in an <img src>
      match: [/^https?:\/\/\S+$/i, 'Image URL must start with http:// or https://'],
    },
    stock: {
      type: Number,
      required: [true, 'Stock is required'],
      min: [0, 'Stock cannot be negative'],
      validate: { validator: Number.isInteger, message: 'Stock must be a whole number' },
    },
    rating: {
      type: Number,
      min: [0, 'Rating must be between 0 and 5'],
      max: [5, 'Rating must be between 0 and 5'],
      default: 0,
      set: (v) => (v === '' || v == null ? v : Math.round(Number(v) * 10) / 10),
    },
  },
  { timestamps: true }
);

productSchema.index({ category: 1, price: 1 });
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
