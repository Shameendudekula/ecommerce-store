// All communication with the backend goes through this file.
//
// After login the server returns a JWT. We keep it in localStorage and send it with every
// request in the "Authorization: Bearer <token>" header.
const API_BASE = '/api';
const TOKEN_KEY = 'store-token';

const auth = {
  getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  },
  // Send the user to the login page and come back here afterwards
  toLogin(reason) {
    const next = location.pathname + location.search;
    const params = new URLSearchParams({ next });
    if (reason) params.set('reason', reason);
    location.href = '/login?' + params;
  },
};

async function request(path, { method = 'GET', body, auth: needsAuth = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));

  // Session ended: forget the token. Pages that need a login send the user to /login.
  if (res.status === 401 && token && !path.startsWith('/auth/login')) {
    auth.clear();
    if (needsAuth) auth.toLogin('expired');
  }

  if (!res.ok) {
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data.errors || {};
    err.data = data;
    throw err;
  }
  return data;
}

const query = (params = {}) => {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null));
  return new URLSearchParams(clean).toString();
};

const api = {
  meta: () => request('/meta'),

  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me'),

  // Products
  products: (params) => request('/products?' + query(params)),
  product: (id) => request(`/products/${id}`),
  createProduct: (data) => request('/products', { method: 'POST', body: data, auth: true }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: data, auth: true }),
  deleteProduct: (id) => request(`/products/${id}`, { method: 'DELETE', auth: true }),

  // Cart (logged-in users)
  cart: () => request('/cart', { auth: true }),
  addToCart: (productId, quantity) => request('/cart/items', { method: 'POST', body: { productId, quantity }, auth: true }),
  updateCartItem: (productId, quantity) => request(`/cart/items/${productId}`, { method: 'PATCH', body: { quantity }, auth: true }),
  removeCartItem: (productId) => request(`/cart/items/${productId}`, { method: 'DELETE', auth: true }),
  mergeCart: (items) => request('/cart/merge', { method: 'POST', body: { items }, auth: true }),

  // Orders
  placeOrder: (shippingAddress) => request('/orders', { method: 'POST', body: { shippingAddress }, auth: true }),
  myOrders: () => request('/orders', { auth: true }),
  order: (id) => request(`/orders/${id}`, { auth: true }),

  // Admin
  adminStats: () => request('/admin/stats', { auth: true }),
  adminOrders: (params) => request('/admin/orders?' + query(params), { auth: true }),
  setOrderStatus: (id, status) => request(`/admin/orders/${id}/status`, { method: 'PATCH', body: { status }, auth: true }),
};
