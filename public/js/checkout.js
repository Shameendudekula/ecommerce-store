// Checkout: shipping address form + order summary. Requires login.
// The server builds the order from the saved cart and current prices; we only send the address.

const box = document.getElementById('checkout');
const ADDRESS_KEY = 'store-last-address';
const FIELDS = [
  ['fullName', 'Full name', 'text', 'name', true],
  ['phone', 'Phone', 'tel', 'tel', false],
  ['line1', 'Address', 'text', 'address-line1', true],
  ['line2', 'Apartment, landmark (optional)', 'text', 'address-line2', true],
  ['city', 'City', 'text', 'address-level2', false],
  ['postalCode', 'Postal code', 'text', 'postal-code', false],
  ['country', 'Country', 'text', 'country-name', true],
];

function savedAddress() {
  try { return JSON.parse(localStorage.getItem(ADDRESS_KEY)) || {}; } catch { return {}; }
}

function render(cart) {
  const saved = { fullName: appState.user.name, country: 'India', ...savedAddress() };
  box.innerHTML = `
    <div class="two-col">
      <section class="panel" aria-labelledby="ship-title">
        <h2 id="ship-title" class="panel-header">Shipping address</h2>
        <form id="address-form" class="form-grid" novalidate>
          ${FIELDS.map(([name, label, type, autocomplete, full]) => `
            <div class="field${full ? ' field-full' : ''}">
              <label for="a-${name}">${label}${name === 'line2' ? '' : ' *'}</label>
              <input id="a-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" value="${escapeHtml(saved[name] || '')}"${name === 'line2' ? '' : ' required'}>
              <small class="field-error" data-error-for="${name}"></small>
            </div>`).join('')}
          <div class="field field-full">
            <span class="label"><strong>Payment</strong></span>
            <p class="muted">${escapeHtml(appState.meta.paymentMethod)} – no payment is taken in this demo store.</p>
          </div>
        </form>
      </section>

      <aside class="panel summary" aria-labelledby="summary-title">
        <h2 id="summary-title" class="panel-header">Order summary</h2>
        <ul class="summary-items">
          ${cart.items.map((l) => `<li><span>${escapeHtml(l.name)} <span class="qty-x">× ${l.quantity}</span></span><span>${formatMoney(l.lineTotal)}</span></li>`).join('')}
        </ul>
        <div class="summary-row"><span>Subtotal</span><span>${formatMoney(cart.subtotal)}</span></div>
        <div class="summary-row"><span>Shipping</span><span>${cart.shippingFee === 0 ? 'Free' : formatMoney(cart.shippingFee)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${formatMoney(cart.total)}</span></div>
        <p class="summary-note muted">Pay ${formatMoney(cart.total)} on delivery.</p>
        <button type="submit" form="address-form" class="btn btn-primary btn-block btn-lg" id="place-btn">Place order</button>
        <a href="/cart" class="btn btn-ghost btn-block">Back to cart</a>
      </aside>
    </div>`;

  document.getElementById('address-form').addEventListener('submit', placeOrder);
  document.getElementById('address-form').addEventListener('input', (e) => {
    e.target.removeAttribute('aria-invalid');
    const slot = box.querySelector(`[data-error-for="${e.target.name}"]`);
    if (slot) slot.textContent = '';
  });
}

function validate(a) {
  const errors = {};
  if (!a.fullName) errors.fullName = 'Full name is required';
  if (!a.phone) errors.phone = 'Phone is required';
  else if (!/^\+?[0-9 ]{7,15}$/.test(a.phone)) errors.phone = 'Phone must be 7–15 digits';
  if (!a.line1) errors.line1 = 'Address is required';
  if (!a.city) errors.city = 'City is required';
  if (!a.postalCode) errors.postalCode = 'Postal code is required';
  else if (!/^[A-Za-z0-9 -]{3,10}$/.test(a.postalCode)) errors.postalCode = 'Postal code looks invalid';
  if (!a.country) errors.country = 'Country is required';
  return errors;
}

function showErrors(errors) {
  let first;
  for (const [key, message] of Object.entries(errors)) {
    const field = key.replace('shippingAddress.', '');
    const slot = box.querySelector(`[data-error-for="${field}"]`);
    const input = document.getElementById(`a-${field}`);
    if (slot) slot.textContent = message;
    if (input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
  }
  first?.focus();
}

async function placeOrder(e) {
  e.preventDefault();
  const form = e.target;
  const address = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, String(v).trim()]));
  const errors = validate(address);
  if (Object.keys(errors).length) return showErrors(errors);

  const btn = document.getElementById('place-btn');
  btn.disabled = true;
  btn.textContent = 'Placing order…';
  try {
    const { data: order } = await api.placeOrder(address);
    try { localStorage.setItem(ADDRESS_KEY, JSON.stringify(address)); } catch { /* optional */ }
    CartStore.setBadge(0);
    location.href = `/order?id=${order._id}&placed=1`;
  } catch (err) {
    if (Object.keys(err.errors).length) showErrors(err.errors);
    // 409 = stock changed since the item was added. Send the user back to the cart to fix it.
    if (err.status === 409) {
      toast(`${escapeHtml(err.message)} · <a href="/cart">Review cart</a>`, 'error', { html: true });
    } else {
      toast(err.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Place order';
  }
}

(async () => {
  try {
    await initShell('cart', { requireLogin: true });
    box.innerHTML = stateHtml('loading');
    const cart = await CartStore.get();
    if (cart.items.length === 0) return location.replace('/cart');
    if (cart.items.some((l) => !l.available)) return location.replace('/cart');
    render(cart);
  } catch (err) {
    shellError(err);
  }
})();
