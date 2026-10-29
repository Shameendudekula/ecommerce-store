// Shared helpers and the page header used by every page.

// ---------- Formatting ----------
// Escape user-entered text before putting it into HTML (prevents XSS)
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatMoney = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
const formatDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
// Short, readable order number from the MongoDB id
const orderNumber = (id) => '#' + String(id).slice(-8).toUpperCase();
const stars = (rating) => `<span class="rating" title="Rated ${rating} out of 5"><span class="star" aria-hidden="true">★</span> ${Number(rating).toFixed(1)}</span>`;
const statusBadge = (status) => `<span class="status status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;

const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
const params = () => new URLSearchParams(location.search);

// Broken or slow placeholder images fall back to a neutral tile
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img.tagName === 'IMG' && !img.dataset.failed) {
      img.dataset.failed = '1';
      img.src = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'><rect width='600' height='400' fill='%23e2e8f0'/><text x='300' y='215' font-family='Arial' font-size='28' fill='%2394a3b8' text-anchor='middle'>No image</text></svg>";
    }
  },
  true
);

// ---------- Toasts ----------
function toast(message, type = 'success', { html = false } = {}) {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    box.className = 'toasts';
    box.setAttribute('aria-live', 'polite');
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  if (html) el.innerHTML = message;
  else el.textContent = message;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('hide'); setTimeout(() => el.remove(), 300); }, 4000);
}

// ---------- Loading / empty / error blocks ----------
function stateHtml(kind, { title, text, action, icon } = {}) {
  if (kind === 'loading') return '<div class="state"><div class="spinner" role="status" aria-label="Loading"></div></div>';
  const emoji = icon || (kind === 'error' ? '⚠️' : '🛍️');
  return `<div class="state"><div class="state-icon" aria-hidden="true">${emoji}</div><h3>${escapeHtml(title)}</h3>${text ? `<p class="muted">${escapeHtml(text)}</p>` : ''}${action || ''}</div>`;
}

// ---------- Page shell ----------
const appState = { user: null, meta: null };

// Call at the top of every page.
//   initShell('shop')                          – public page
//   initShell('account', { requireLogin: true }) – sends guests to /login and back
//   initShell('admin', { requireAdmin: true })   – also blocks customers
async function initShell(activePage, { requireLogin = false, requireAdmin = false } = {}) {
  const [meta, me] = await Promise.all([
    api.meta(),
    auth.getToken() ? api.me().catch(() => null) : null,
  ]);
  appState.meta = meta;
  appState.user = me?.user || null;

  if ((requireLogin || requireAdmin) && !appState.user) {
    auth.toLogin();
    return new Promise(() => {}); // the page is navigating away
  }
  if (requireAdmin && appState.user.role !== 'admin') {
    location.replace('/');
    return new Promise(() => {});
  }

  renderHeader(activePage);
  CartStore.refreshBadge();
  showCartAdjustments();
  return appState;
}

function renderHeader(activePage) {
  const user = appState.user;
  const current = (key) => (key === activePage ? ' aria-current="page"' : '');
  const search = params().get('search') || '';
  document.getElementById('topbar').innerHTML = `
    <div class="container topbar-inner">
      <a class="brand" href="/"><span class="brand-logo" aria-hidden="true">M</span><span class="brand-name">Mini Store</span></a>
      <form class="header-search" action="/" role="search">
        <label for="header-search" class="sr-only">Search products</label>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input type="search" id="header-search" name="search" placeholder="Search products" value="${escapeHtml(search)}" autocomplete="off">
      </form>
      <nav class="nav" aria-label="Main">
        <a href="/"${current('shop')}>Shop</a>
        ${user?.role === 'admin' ? `<a href="/admin"${current('admin')}>Admin</a>` : ''}
        ${user
          ? `<a href="/account"${current('account')} title="${escapeHtml(user.email)}"><span aria-hidden="true">👤</span> <span class="nav-label">Account</span></a>
             <button type="button" class="link" id="logout-btn">Log out</button>`
          : `<a href="/login"${current('login')}>Log in</a>`}
        <a href="/cart" class="cart-link"${current('cart')} aria-label="Cart">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l2.4 12.2a2 2 0 002 1.6h7.7a2 2 0 002-1.5L21 8H6"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>
          <span class="cart-badge" id="cart-badge" data-count="0">0</span>
        </a>
      </nav>
    </div>`;

  document.getElementById('logout-btn')?.addEventListener('click', () => {
    auth.clear();
    location.href = '/';
  });
}

// After login the guest cart is merged into the account cart. If some quantities had to be
// lowered (limited stock), login.js leaves the messages here and we show them once.
function showCartAdjustments() {
  let messages = [];
  try {
    messages = JSON.parse(sessionStorage.getItem('cart-adjustments') || '[]');
    sessionStorage.removeItem('cart-adjustments');
  } catch { /* storage unavailable */ }
  for (const m of messages) toast('Cart updated: ' + m, 'error');
}

function shellError(err) {
  const main = document.querySelector('main');
  if (main) main.innerHTML = `<div class="panel">${stateHtml('error', { title: "Couldn't load the page", text: err.message, action: '<button type="button" class="btn btn-ghost" onclick="location.reload()">Try again</button>' })}</div>`;
}

// Reusable "are you sure?" dialog. Resolves true if confirmed.
function confirmDialog({ title, html, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal-sm';
    d.setAttribute('aria-labelledby', 'confirm-title');
    d.innerHTML = `
      <div class="modal-header"><h2 id="confirm-title">${escapeHtml(title)}</h2></div>
      <div class="modal-body"><p>${html}</p></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-ghost" data-answer="no">Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-answer="yes">${escapeHtml(confirmLabel)}</button>
      </div>`;
    document.body.appendChild(d);
    let answered = false;
    const finish = (value) => { if (answered) return; answered = true; d.close(); d.remove(); resolve(value); };
    d.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-answer]');
      if (btn) finish(btn.dataset.answer === 'yes');
      else if (e.target === d) finish(false);
    });
    d.addEventListener('cancel', () => finish(false));
    d.showModal();
  });
}

// Product card used on the shop page
function productCard(p) {
  const tag = p.stock === 0 ? '<span class="stock-tag out">Out of stock</span>' : p.stock <= 5 ? `<span class="stock-tag low">Only ${p.stock} left</span>` : '';
  return `<article class="product-card">
    <a class="image-link" href="/product?id=${p._id}" tabindex="-1" aria-hidden="true">
      <img src="${escapeHtml(p.imageUrl)}" alt="" loading="lazy" width="600" height="400">${tag}
    </a>
    <div class="product-body">
      <span class="product-category">${escapeHtml(p.category)}</span>
      <a class="product-name" href="/product?id=${p._id}">${escapeHtml(p.name)}</a>
      <div class="product-meta"><span class="price">${formatMoney(p.price)}</span>${stars(p.rating)}</div>
      <button type="button" class="btn btn-primary btn-sm" data-add="${p._id}"${p.stock === 0 ? ' disabled' : ''}>${p.stock === 0 ? 'Out of stock' : 'Add to cart'}</button>
    </div>
  </article>`;
}

// Quantity stepper markup (− [n] +)
function qtyStepper({ id, value, max, small = false, label = 'Quantity' }) {
  const top = Math.min(max, appState.meta.maxQuantity);
  return `<div class="qty${small ? ' qty-sm' : ''}" data-qty="${id}">
    <button type="button" data-step="-1" aria-label="Decrease quantity"${value <= 1 ? ' disabled' : ''}>−</button>
    <input type="number" inputmode="numeric" min="1" max="${top}" value="${value}" aria-label="${escapeHtml(label)}">
    <button type="button" data-step="1" aria-label="Increase quantity"${value >= top ? ' disabled' : ''}>+</button>
  </div>`;
}
