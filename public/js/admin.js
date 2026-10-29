// Admin dashboard (admins only): overview stats, product management and order management.
// The open tab is kept in the URL hash (#overview, #products, #orders).

const TABS = ['overview', 'products', 'orders'];
const productState = { page: 1, search: '', category: '', rows: [], request: 0 };
const orderState = { page: 1, status: '', rows: [], request: 0 };

// ---------- Tabs ----------
function showTab() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  for (const t of TABS) {
    document.getElementById(`tab-${t}`).setAttribute('aria-selected', String(t === tab));
    document.getElementById(`panel-${t}`).hidden = t !== tab;
  }
  ({ overview: loadOverview, products: loadProducts, orders: loadOrders })[tab]();
}
window.addEventListener('hashchange', showTab);

const pager = (prefix, p) => {
  const nav = document.getElementById(`${prefix}-pagination`);
  nav.hidden = p.totalPages <= 1;
  document.getElementById(`${prefix}-page-info`).textContent = `Page ${p.page} of ${p.totalPages}`;
  document.getElementById(`${prefix}-prev`).disabled = p.page <= 1;
  document.getElementById(`${prefix}-next`).disabled = p.page >= p.totalPages;
};

// ---------- Overview ----------
async function loadOverview() {
  const panel = document.getElementById('panel-overview');
  panel.innerHTML = stateHtml('loading');
  try {
    const s = await api.adminStats();
    panel.innerHTML = `
      <div class="stats">
        <div class="stat-card"><span class="stat-label">Products</span><span class="stat-value">${s.products}</span></div>
        <div class="stat-card"><span class="stat-label">Orders</span><span class="stat-value">${s.orders}</span></div>
        <div class="stat-card stat-accent"><span class="stat-label">Revenue (excl. cancelled)</span><span class="stat-value">${formatMoney(s.revenue)}</span></div>
        <div class="stat-card"><span class="stat-label">Customers</span><span class="stat-value">${s.customers}</span></div>
      </div>
      <div class="admin-grid">
        <section class="panel" aria-labelledby="ov-status">
          <div class="panel-header"><h2 id="ov-status">Orders by status</h2><a href="#orders" class="btn btn-ghost btn-sm">Manage orders →</a></div>
          <ul class="simple-list">${Object.entries(s.ordersByStatus).map(([k, v]) => `<li>${statusBadge(k)}<strong>${v}</strong></li>`).join('')}</ul>
        </section>
        <section class="panel" aria-labelledby="ov-stock">
          <div class="panel-header"><h2 id="ov-stock">Low stock (5 or fewer)</h2><a href="#products" class="btn btn-ghost btn-sm">Manage products →</a></div>
          ${s.lowStock.length
            ? `<ul class="simple-list">${s.lowStock.map((p) => `<li><span>${escapeHtml(p.name)}</span><span class="${p.stock === 0 ? 'stock-out' : 'stock-low'}">${p.stock === 0 ? 'Out of stock' : `${p.stock} left`}</span></li>`).join('')}</ul>`
            : '<p class="muted">All products are well stocked.</p>'}
        </section>
      </div>
      <section class="panel panel-spaced" aria-labelledby="ov-recent">
        <div class="panel-header"><h2 id="ov-recent">Recent orders</h2></div>
        ${s.recentOrders.length ? ordersTable(s.recentOrders, { compact: true }) : '<p class="muted">No orders yet.</p>'}
      </section>`;
  } catch (err) {
    panel.innerHTML = `<div class="panel">${stateHtml('error', { title: "Couldn't load stats", text: err.message })}</div>`;
  }
}

// ---------- Products ----------
async function loadProducts() {
  const box = document.getElementById('products-table');
  const id = ++productState.request;
  box.innerHTML = stateHtml('loading');
  try {
    const { data, pagination } = await api.products({ search: productState.search, category: productState.category, page: productState.page, limit: 10, sort: 'newest' });
    if (id !== productState.request) return;
    if (data.length === 0 && pagination.total > 0 && productState.page > 1) { productState.page = pagination.totalPages; return loadProducts(); }
    productState.rows = data;
    pager('p', pagination);
    if (data.length === 0) {
      box.innerHTML = stateHtml('empty', { icon: '📦', title: 'No products found', action: '<button type="button" class="btn btn-primary" data-action="add-product">＋ Add product</button>' });
      return;
    }
    box.innerHTML = `<div class="table-wrap"><table class="table responsive">
      <thead><tr><th scope="col"><span class="sr-only">Image</span></th><th scope="col">Name</th><th scope="col">Category</th><th scope="col" class="num">Price</th><th scope="col" class="num">Stock</th><th scope="col" class="num">Rating</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${data
        .map(
          (p) => `<tr>
            <td class="no-label"><img class="thumb" src="${escapeHtml(p.imageUrl)}" alt="" width="56" height="38" loading="lazy"></td>
            <td data-label="Name"><a href="/product?id=${p._id}">${escapeHtml(p.name)}</a></td>
            <td data-label="Category">${escapeHtml(p.category)}</td>
            <td data-label="Price" class="num">${formatMoney(p.price)}</td>
            <td data-label="Stock" class="num ${p.stock === 0 ? 'stock-out' : p.stock <= 5 ? 'stock-low' : ''}">${p.stock}</td>
            <td data-label="Rating" class="num">${p.rating.toFixed(1)}</td>
            <td class="actions">
              <button type="button" class="btn btn-ghost btn-sm" data-edit="${p._id}">Edit</button>
              <button type="button" class="btn btn-ghost btn-sm" data-delete="${p._id}">Delete</button>
            </td>
          </tr>`
        )
        .join('')}</tbody></table></div>`;
  } catch (err) {
    if (id === productState.request) box.innerHTML = stateHtml('error', { title: "Couldn't load products", text: err.message });
  }
}

// Product add / edit modal
const modal = document.getElementById('product-modal');
const form = document.getElementById('product-form');
const preview = document.getElementById('pf-preview');
let editingId = null;

function openProductModal(p = null) {
  editingId = p?._id ?? null;
  form.reset();
  form.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  document.getElementById('pm-title').textContent = p ? 'Edit product' : 'Add product';
  document.getElementById('pf-save').textContent = p ? 'Save changes' : 'Add product';
  for (const f of ['name', 'description', 'price', 'stock', 'category', 'rating', 'imageUrl']) form.elements[f].value = p?.[f] ?? '';
  if (!p) form.elements.category.value = appState.meta.categories[0];
  updatePreview();
  modal.showModal();
  form.elements.name.focus();
}

// The preview always takes up its space (an empty tile until the URL is valid), so the form
// never jumps when it appears – otherwise the Save button could move away from the cursor
const EMPTY_PREVIEW = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 400'><rect width='600' height='400' fill='%23e2e8f0'/><text x='300' y='215' font-family='Arial' font-size='26' fill='%2394a3b8' text-anchor='middle'>Image preview</text></svg>";
function updatePreview() {
  const url = form.elements.imageUrl.value.trim();
  delete preview.dataset.failed;
  preview.src = /^https?:\/\/\S+$/i.test(url) ? url : EMPTY_PREVIEW;
}
form.elements.imageUrl.addEventListener('input', debounce(updatePreview, 400));

function validateProduct(d) {
  const e = {};
  if (d.name.length < 2) e.name = 'Name must be at least 2 characters';
  if (!d.description) e.description = 'Description is required';
  if (!(Number(d.price) >= 1)) e.price = 'Price must be at least 1';
  if (d.stock === '' || !Number.isInteger(Number(d.stock)) || Number(d.stock) < 0) e.stock = 'Stock must be a whole number, 0 or more';
  if (d.rating !== '' && !(Number(d.rating) >= 0 && Number(d.rating) <= 5)) e.rating = 'Rating must be between 0 and 5';
  if (!/^https?:\/\/\S+$/i.test(d.imageUrl)) e.imageUrl = 'Image URL must start with http:// or https://';
  return e;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.querySelectorAll('.field-error').forEach((x) => (x.textContent = ''));
  const d = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  const errors = validateProduct(d);
  const show = (errs) => {
    for (const [k, m] of Object.entries(errs)) {
      const slot = form.querySelector(`[data-error-for="${k}"]`);
      if (slot) slot.textContent = m;
      form.elements[k]?.setAttribute('aria-invalid', 'true');
    }
    form.elements[Object.keys(errs)[0]]?.focus();
  };
  if (Object.keys(errors).length) return show(errors);

  const body = { ...d, price: Number(d.price), stock: Number(d.stock), rating: d.rating === '' ? 0 : Number(d.rating) };
  const btn = document.getElementById('pf-save');
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    if (editingId) await api.updateProduct(editingId, body);
    else await api.createProduct(body);
    toast(editingId ? `${body.name} updated` : `${body.name} added`);
    modal.close();
    if (!editingId) productState.page = 1;
    loadProducts();
  } catch (err) {
    if (Object.keys(err.errors).length) show(err.errors);
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});
modal.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === modal) modal.close(); });

async function deleteProduct(p) {
  const ok = await confirmDialog({
    title: 'Delete product?',
    html: `<strong>${escapeHtml(p.name)}</strong> will be removed from the store and from every cart. Past orders keep their details. This can't be undone.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  try {
    await api.deleteProduct(p._id);
    toast(`${p.name} deleted`);
    loadProducts();
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ---------- Orders ----------
function statusControl(o) {
  const next = appState.meta.orderTransitions[o.status];
  if (next.length === 0) return statusBadge(o.status);
  return `<label class="sr-only" for="st-${o._id}">Status of order ${orderNumber(o._id)}</label>
    <select id="st-${o._id}" data-status="${o._id}">
      <option value="${o.status}" selected>${o.status}</option>
      ${next.map((s) => `<option value="${s}">→ ${s}</option>`).join('')}
    </select>`;
}

function ordersTable(orders, { compact = false } = {}) {
  return `<div class="table-wrap"><table class="table responsive">
    <thead><tr><th scope="col">Order</th><th scope="col">Date</th><th scope="col">Customer</th><th scope="col" class="num">Items</th><th scope="col" class="num">Total</th><th scope="col">Status</th>${compact ? '' : '<th scope="col"><span class="sr-only">Actions</span></th>'}</tr></thead>
    <tbody>${orders
      .map(
        (o) => `<tr>
          <td data-label="Order"><a class="order-id" href="/order?id=${o._id}">${orderNumber(o._id)}</a></td>
          <td data-label="Date">${formatDate(o.createdAt)}</td>
          <td data-label="Customer">${escapeHtml(o.user?.name || 'Deleted user')}<br><span class="muted">${escapeHtml(o.user?.email || '')}</span></td>
          <td data-label="Items" class="num">${o.items.reduce((n, i) => n + i.quantity, 0)}</td>
          <td data-label="Total" class="num">${formatMoney(o.total)}</td>
          <td data-label="Status">${compact ? statusBadge(o.status) : statusControl(o)}</td>
          ${compact ? '' : `<td class="actions"><a class="btn btn-ghost btn-sm" href="/order?id=${o._id}">Details</a></td>`}
        </tr>`
      )
      .join('')}</tbody></table></div>`;
}

async function loadOrders() {
  const box = document.getElementById('orders-table');
  const id = ++orderState.request;
  box.innerHTML = stateHtml('loading');
  try {
    const { data, pagination } = await api.adminOrders({ status: orderState.status, page: orderState.page, limit: 15 });
    if (id !== orderState.request) return;
    orderState.rows = data;
    pager('o', pagination);
    box.innerHTML = data.length ? ordersTable(data) : stateHtml('empty', { icon: '📦', title: orderState.status ? `No ${orderState.status.toLowerCase()} orders` : 'No orders yet' });
  } catch (err) {
    if (id === orderState.request) box.innerHTML = stateHtml('error', { title: "Couldn't load orders", text: err.message });
  }
}

async function changeStatus(select) {
  const order = orderState.rows.find((o) => o._id === select.dataset.status);
  const next = select.value;
  if (next === order.status) return;
  if (next === 'Cancelled') {
    const ok = await confirmDialog({
      title: 'Cancel this order?',
      html: `Order <strong>${orderNumber(order._id)}</strong> will be cancelled and its ${order.items.reduce((n, i) => n + i.quantity, 0)} item(s) will be put back into stock.`,
      confirmLabel: 'Cancel order',
    });
    if (!ok) { select.value = order.status; return; }
  }
  select.disabled = true;
  try {
    await api.setOrderStatus(order._id, next);
    toast(`Order ${orderNumber(order._id)} marked as ${next}${next === 'Cancelled' ? ' – stock restored' : ''}`);
  } catch (err) {
    toast(err.message, 'error');
  }
  loadOrders();
}

// ---------- Events ----------
document.addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) openProductModal(productState.rows.find((p) => p._id === edit.dataset.edit));
  const del = e.target.closest('[data-delete]');
  if (del) deleteProduct(productState.rows.find((p) => p._id === del.dataset.delete));
  if (e.target.closest('#add-product, [data-action="add-product"]')) openProductModal();
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-status]')) changeStatus(e.target); });

document.getElementById('p-search').addEventListener('input', debounce((e) => { productState.search = e.target.value.trim(); productState.page = 1; loadProducts(); }, 300));
document.getElementById('p-category').addEventListener('change', (e) => { productState.category = e.target.value; productState.page = 1; loadProducts(); });
document.getElementById('p-prev').addEventListener('click', () => { productState.page--; loadProducts(); });
document.getElementById('p-next').addEventListener('click', () => { productState.page++; loadProducts(); });
document.getElementById('o-status').addEventListener('change', (e) => { orderState.status = e.target.value; orderState.page = 1; loadOrders(); });
document.getElementById('o-prev').addEventListener('click', () => { orderState.page--; loadOrders(); });
document.getElementById('o-next').addEventListener('click', () => { orderState.page++; loadOrders(); });

(async () => {
  try {
    await initShell('admin', { requireAdmin: true });
    const opts = (list) => list.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    document.getElementById('p-category').insertAdjacentHTML('beforeend', opts(appState.meta.categories));
    document.getElementById('pf-category').innerHTML = opts(appState.meta.categories);
    document.getElementById('o-status').insertAdjacentHTML('beforeend', opts(appState.meta.orderStatuses));
    showTab();
  } catch (err) {
    shellError(err);
  }
})();
