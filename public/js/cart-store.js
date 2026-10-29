// One cart interface for the whole frontend.
//
//   Guest (not logged in): the cart lives in localStorage as [{ productId, quantity }].
//                          Product details are looked up with GET /api/products?ids=...
//   Logged in:             the cart lives in MongoDB and every change goes through /api/cart.
//
// When a guest logs in, mergeGuestCart() sends the localStorage cart to POST /api/cart/merge,
// which adds the quantities to the account's saved cart (capped at the stock), and then clears it.
const GUEST_CART_KEY = 'store-guest-cart';

const CartStore = {
  isGuest: () => !appState.user,

  // ----- guest storage -----
  readGuest() {
    try {
      const items = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]');
      return Array.isArray(items) ? items.filter((i) => i && typeof i.productId === 'string' && Number.isInteger(i.quantity) && i.quantity > 0) : [];
    } catch {
      return [];
    }
  },
  writeGuest(items) {
    try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  },
  clearGuest() {
    try { localStorage.removeItem(GUEST_CART_KEY); } catch { /* ignore */ }
  },

  // Same shape as GET /api/cart, built in the browser for guests
  async guestCart() {
    const stored = this.readGuest();
    if (stored.length === 0) return this.summarize([]);
    const { data: products } = await api.products({ ids: stored.map((i) => i.productId).join(','), limit: 50 });
    const byId = new Map(products.map((p) => [p._id, p]));
    const kept = stored.filter((i) => byId.has(i.productId));
    if (kept.length !== stored.length) this.writeGuest(kept); // drop products that no longer exist
    const lines = kept.map((i) => {
      const p = byId.get(i.productId);
      return { productId: p._id, name: p.name, imageUrl: p.imageUrl, category: p.category, price: p.price, stock: p.stock, quantity: i.quantity, lineTotal: p.price * i.quantity, available: p.stock >= i.quantity };
    });
    return this.summarize(lines);
  },

  summarize(lines) {
    const { freeShippingFrom, shippingFee } = appState.meta;
    const subtotal = Math.round(lines.reduce((s, l) => s + l.price * l.quantity, 0) * 100) / 100;
    const fee = subtotal === 0 || subtotal >= freeShippingFrom ? 0 : shippingFee;
    return { items: lines, itemCount: lines.reduce((n, l) => n + l.quantity, 0), subtotal, shippingFee: fee, total: subtotal + fee, freeShippingFrom };
  },

  // ----- public API used by the pages -----
  async get() {
    const cart = this.isGuest() ? await this.guestCart() : await api.cart();
    this.setBadge(cart.itemCount);
    return cart;
  },

  // product = { _id, name, stock } so guests can be checked against the stock right away
  async add(product, quantity = 1) {
    if (!this.isGuest()) {
      const cart = await api.addToCart(product._id, quantity);
      this.setBadge(cart.itemCount);
      return cart;
    }
    const items = this.readGuest();
    const line = items.find((i) => i.productId === product._id);
    const wanted = (line?.quantity || 0) + quantity;
    const max = Math.min(product.stock, appState.meta.maxQuantity);
    if (product.stock === 0) throw new Error(`${product.name} is out of stock`);
    if (wanted > max) throw new Error(product.stock < appState.meta.maxQuantity ? `Only ${product.stock} of ${product.name} in stock${line ? ` (you already have ${line.quantity} in your cart)` : ''}` : `You can order at most ${max} of each product`);
    if (line) line.quantity = wanted;
    else items.push({ productId: product._id, quantity });
    this.writeGuest(items);
    this.setBadge(items.reduce((n, i) => n + i.quantity, 0));
    return null;
  },

  async setQuantity(line, quantity) {
    if (!this.isGuest()) return api.updateCartItem(line.productId, quantity);
    if (quantity > line.stock) throw new Error(`Only ${line.stock} of ${line.name} in stock`);
    const items = this.readGuest().map((i) => (i.productId === line.productId ? { ...i, quantity } : i)).filter((i) => i.quantity > 0);
    this.writeGuest(items);
    return null;
  },

  async remove(line) {
    if (!this.isGuest()) return api.removeCartItem(line.productId);
    this.writeGuest(this.readGuest().filter((i) => i.productId !== line.productId));
    return null;
  },

  // Called right after login. Returns the list of adjustments (e.g. "quantity reduced") to show.
  async mergeGuestCart() {
    const items = this.readGuest();
    if (items.length === 0) return [];
    const result = await api.mergeCart(items);
    this.clearGuest();
    return result.adjustments || [];
  },

  // ----- navbar badge -----
  setBadge(count) {
    const badge = document.getElementById('cart-badge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.dataset.count = String(count);
    badge.parentElement?.setAttribute('aria-label', `Cart, ${count} item${count === 1 ? '' : 's'}`);
  },

  async refreshBadge() {
    if (this.isGuest()) {
      this.setBadge(this.readGuest().reduce((n, i) => n + i.quantity, 0));
      return;
    }
    try {
      const cart = await api.cart();
      this.setBadge(cart.itemCount);
    } catch {
      /* badge is not essential */
    }
  },
};

// Every page with "Add to cart" buttons (data-add="<productId>") uses this one handler
async function handleAddToCart(button, product, quantity = 1) {
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Adding…';
  try {
    await CartStore.add(product, quantity);
    toast(`${escapeHtml(product.name)} added to cart · <a href="/cart">View cart</a>`, 'success', { html: true });
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button.disabled = product.stock === 0;
    button.textContent = label;
  }
}
