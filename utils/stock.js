const Product = require('../models/Product');

// Takes `quantity` units of a product, but only if at least that many are in stock.
// The check and the decrement happen in ONE database operation (a conditional update), so two
// customers buying the last item at the same moment can't both succeed: the second update finds
// stock < quantity, matches nothing and returns modifiedCount 0.
async function reserveStock(productId, quantity) {
  const result = await Product.updateOne({ _id: productId, stock: { $gte: quantity } }, { $inc: { stock: -quantity } });
  return result.modifiedCount === 1;
}

// Puts units back (failed checkout or cancelled order). If the product was deleted, nothing happens.
function releaseStock(productId, quantity) {
  return Product.updateOne({ _id: productId }, { $inc: { stock: quantity } });
}

module.exports = { reserveStock, releaseStock };
