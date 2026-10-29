const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { MAX_QUANTITY_PER_ITEM, FREE_SHIPPING_FROM } = require('../config/constants');
const { totals } = require('../utils/pricing');
const { money } = require('../utils/money');

const isObjectId = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);

function parseQuantity(value, { allowZero = false } = {}) {
  const q = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(q) || q < min || q > MAX_QUANTITY_PER_ITEM) return null;
  return q;
}

async function getOrCreateCart(userId) {
  // upsert: returns the existing cart or creates an empty one in a single atomic step
  return Cart.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId, items: [] } }, { upsert: true, returnDocument: 'after' });
}

// Turns the stored { product, quantity } pairs into display lines with current price and stock.
// Products that were deleted since they were added are dropped from the cart.
async function serialize(cart) {
  const ids = cart.items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: ids } }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  const kept = cart.items.filter((i) => byId.has(String(i.product)));
  if (kept.length !== cart.items.length) {
    cart.items = kept;
    await cart.save();
  }

  const lines = kept.map((i) => {
    const p = byId.get(String(i.product));
    return {
      productId: p._id,
      name: p.name,
      imageUrl: p.imageUrl,
      category: p.category,
      price: p.price,
      stock: p.stock,
      quantity: i.quantity,
      lineTotal: money(p.price * i.quantity),
      // false if stock dropped below what's in the cart (e.g. someone else bought it)
      available: p.stock >= i.quantity,
    };
  });

  return { items: lines, ...totals(lines), freeShippingFrom: FREE_SHIPPING_FROM };
}

// GET /api/cart
exports.getCart = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  res.json(await serialize(cart));
};

// POST /api/cart/items  { productId, quantity }  – adds to the quantity already in the cart
exports.addItem = async (req, res) => {
  const { productId } = req.body || {};
  const quantity = parseQuantity(req.body?.quantity ?? 1);
  if (!isObjectId(productId)) return res.status(400).json({ message: 'Invalid product id' });
  if (quantity === null) return res.status(400).json({ message: `Quantity must be a whole number from 1 to ${MAX_QUANTITY_PER_ITEM}` });

  const product = await Product.findById(productId).lean();
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const cart = await getOrCreateCart(req.user._id);
  const line = cart.items.find((i) => String(i.product) === productId);
  const wanted = (line?.quantity || 0) + quantity;

  if (product.stock === 0) return res.status(409).json({ message: `${product.name} is out of stock` });
  if (wanted > product.stock) {
    return res.status(409).json({ message: `Only ${product.stock} of ${product.name} in stock${line ? ` (you already have ${line.quantity} in your cart)` : ''}` });
  }
  if (wanted > MAX_QUANTITY_PER_ITEM) return res.status(400).json({ message: `You can order at most ${MAX_QUANTITY_PER_ITEM} of each product` });

  if (line) line.quantity = wanted;
  else cart.items.push({ product: productId, quantity });
  await cart.save();

  res.status(201).json({ message: `${product.name} added to cart`, ...(await serialize(cart)) });
};

// PATCH /api/cart/items/:productId  { quantity }  – sets the quantity (0 removes the item)
exports.updateItem = async (req, res) => {
  const { productId } = req.params;
  const quantity = parseQuantity(req.body?.quantity, { allowZero: true });
  if (!isObjectId(productId)) return res.status(400).json({ message: 'Invalid product id' });
  if (quantity === null) return res.status(400).json({ message: `Quantity must be a whole number from 0 to ${MAX_QUANTITY_PER_ITEM}` });

  const cart = await getOrCreateCart(req.user._id);
  const line = cart.items.find((i) => String(i.product) === productId);
  if (!line) return res.status(404).json({ message: 'That product is not in your cart' });

  if (quantity === 0) {
    cart.items = cart.items.filter((i) => i !== line);
  } else {
    const product = await Product.findById(productId).lean();
    if (product && quantity > product.stock) {
      return res.status(409).json({ message: `Only ${product.stock} of ${product.name} in stock` });
    }
    line.quantity = quantity;
  }
  await cart.save();
  res.json(await serialize(cart));
};

// DELETE /api/cart/items/:productId
exports.removeItem = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  const before = cart.items.length;
  cart.items = cart.items.filter((i) => String(i.product) !== req.params.productId);
  if (cart.items.length === before) return res.status(404).json({ message: 'That product is not in your cart' });
  await cart.save();
  res.json(await serialize(cart));
};

// DELETE /api/cart
exports.clearCart = async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  res.json(await serialize(cart));
};

// POST /api/cart/merge  { items: [{ productId, quantity }] }
//
// Called right after login with the cart the visitor built as a guest (kept in localStorage).
// For each guest item:
//   - invalid ids, unknown and out-of-stock products are skipped
//   - quantities for a product already in the account's cart are ADDED together
//   - the result is capped at the available stock and the per-item maximum
// The response lists any adjustments so the UI can tell the user what changed.
exports.mergeCart = async (req, res) => {
  const guestItems = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : null;
  if (!guestItems) return res.status(400).json({ message: 'items must be an array' });

  // Combine duplicates inside the guest cart first
  const wantedById = new Map();
  for (const item of guestItems) {
    const q = parseQuantity(item?.quantity);
    if (!isObjectId(item?.productId) || q === null) continue;
    wantedById.set(item.productId, (wantedById.get(item.productId) || 0) + q);
  }

  const cart = await getOrCreateCart(req.user._id);
  const products = await Product.find({ _id: { $in: [...wantedById.keys()] } }).lean();
  const adjustments = [];

  for (const product of products) {
    const id = String(product._id);
    const line = cart.items.find((i) => String(i.product) === id);
    const requested = (line?.quantity || 0) + wantedById.get(id);
    const allowed = Math.min(requested, product.stock, MAX_QUANTITY_PER_ITEM);

    if (allowed < requested) {
      adjustments.push(
        allowed === 0 ? `${product.name} is out of stock and was not added` : `${product.name}: quantity reduced to ${allowed} (limited stock)`
      );
    }
    if (allowed === 0) continue;
    if (line) line.quantity = allowed;
    else cart.items.push({ product: product._id, quantity: allowed });
  }
  await cart.save();

  res.json({ message: 'Cart merged', adjustments, ...(await serialize(cart)) });
};
