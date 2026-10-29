const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { CATEGORIES } = require('../config/constants');

const EDITABLE_FIELDS = ['name', 'description', 'price', 'category', 'imageUrl', 'stock', 'rating'];
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
  rating: { rating: -1, _id: -1 },
};

const firstValue = (v) => (Array.isArray(v) ? v[0] : v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isObjectId = (s) => /^[0-9a-fA-F]{24}$/.test(s);

function pickEditable(body = {}) {
  const data = {};
  for (const f of EDITABLE_FIELDS) if (body[f] !== undefined) data[f] = body[f];
  return data;
}

// GET /api/products?search=&category=&sort=&page=&limit=&ids=
exports.getProducts = async (req, res) => {
  const search = String(firstValue(req.query.search) ?? '').trim();
  const category = firstValue(req.query.category);
  const sortKey = firstValue(req.query.sort) || 'newest';
  const ids = String(firstValue(req.query.ids) ?? '').trim();
  const page = Math.max(1, parseInt(firstValue(req.query.page), 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(firstValue(req.query.limit), 10) || 12));

  if (!SORTS[sortKey]) return res.status(400).json({ message: 'Sort must be one of: ' + Object.keys(SORTS).join(', ') });

  const filter = {};
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { description: rx }];
  }
  if (category) {
    if (!CATEGORIES.includes(category)) return res.status(400).json({ message: `Unknown category "${category}"` });
    filter.category = category;
  }
  // ?ids=a,b,c – used by the guest cart to look up the products it holds
  if (ids) {
    const list = ids.split(',').slice(0, 50);
    if (!list.every(isObjectId)) return res.status(400).json({ message: 'Invalid product id in ids' });
    filter._id = { $in: list };
  }

  const [products, total] = await Promise.all([
    Product.find(filter).sort(SORTS[sortKey]).skip((page - 1) * limit).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  res.json({ data: products, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
};

// GET /api/products/:id
exports.getProduct = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json({ data: product });
};

// POST /api/products (admin)
exports.createProduct = async (req, res) => {
  const product = await Product.create(pickEditable(req.body));
  res.status(201).json({ message: 'Product created', data: product });
};

// PUT /api/products/:id (admin)
exports.updateProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  product.set(pickEditable(req.body));
  await product.save();
  res.json({ message: 'Product updated', data: product });
};

// DELETE /api/products/:id (admin)
// Past orders keep their own copy of the product details, so they are unaffected.
exports.deleteProduct = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  // Remove it from every cart so nobody can try to order it
  await Cart.updateMany({}, { $pull: { items: { product: product._id } } });
  res.json({ message: 'Product deleted', data: { _id: product._id } });
};
