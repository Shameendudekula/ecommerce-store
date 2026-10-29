// Cart page: works the same for guests (localStorage) and logged-in users (server), via CartStore.

const box = document.getElementById('cart');
let cart;
let busy = false;

function render() {
  if (cart.items.length === 0) {
    box.innerHTML = `<div class="panel">${stateHtml('empty', { icon: '🛒', title: 'Your cart is empty', text: 'Browse the shop and add something you like.', action: '<a class="btn btn-primary" href="/">Start shopping</a>' })}</div>`;
    return;
  }

  const problems = cart.items.filter((l) => !l.available);
  const toFree = cart.freeShippingFrom - cart.subtotal;

  box.innerHTML = `
    <div class="two-col">
      <section class="panel" aria-label="Cart items">
        ${problems.length ? `<div class="notice notice-warning">Some items have less stock than you selected. Lower the quantity to continue.</div>` : ''}
        <ul class="cart-lines">
          ${cart.items
            .map(
              (l) => `<li class="cart-line" data-id="${l.productId}">
                <a href="/product?id=${l.productId}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(l.imageUrl)}" alt="" width="96" height="64" loading="lazy"></a>
                <div>
                  <a class="name" href="/product?id=${l.productId}">${escapeHtml(l.name)}</a>
                  <div class="muted">${formatMoney(l.price)} each</div>
                  ${!l.available ? `<div class="line-warning">${l.stock === 0 ? 'Out of stock – please remove' : `Only ${l.stock} left in stock`}</div>` : ''}
                  <div class="controls">
                    ${qtyStepper({ id: l.productId, value: l.quantity, max: Math.max(l.stock, l.quantity), small: true, label: `Quantity of ${l.name}` })}
                    <button type="button" class="btn btn-ghost btn-sm" data-remove="${l.productId}">Remove</button>
                  </div>
                </div>
                <div class="line-total">${formatMoney(l.lineTotal)}</div>
              </li>`
            )
            .join('')}
        </ul>
      </section>

      <aside class="panel summary" aria-labelledby="summary-title">
        <h2 id="summary-title" class="panel-header">Order summary</h2>
        <div class="summary-row"><span>Items (${cart.itemCount})</span><span>${formatMoney(cart.subtotal)}</span></div>
        <div class="summary-row"><span>Shipping</span><span>${cart.shippingFee === 0 ? 'Free' : formatMoney(cart.shippingFee)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${formatMoney(cart.total)}</span></div>
        <p class="summary-note muted">${toFree > 0 ? `Add ${formatMoney(toFree)} more for free shipping.` : 'You get free shipping.'}</p>
        <button type="button" class="btn btn-primary btn-block btn-lg" id="checkout-btn"${problems.length ? ' disabled' : ''}>
          ${CartStore.isGuest() ? 'Log in to check out' : 'Proceed to checkout'}
        </button>
        ${CartStore.isGuest() ? '<p class="summary-note muted">Your cart is saved on this device and will be added to your account when you log in.</p>' : ''}
        <a href="/" class="btn btn-ghost btn-block">Continue shopping</a>
      </aside>
    </div>`;
}

async function load() {
  box.innerHTML = stateHtml('loading');
  try {
    cart = await CartStore.get();
    render();
  } catch (err) {
    box.innerHTML = stateHtml('error', { title: "Couldn't load your cart", text: err.message, action: '<button type="button" class="btn btn-ghost" onclick="location.reload()">Try again</button>' });
  }
}

async function change(fn) {
  if (busy) return;
  busy = true;
  try {
    await fn();
    cart = await CartStore.get();
    render();
  } catch (err) {
    toast(err.message, 'error');
    cart = await CartStore.get().catch(() => cart);
    render();
  } finally {
    busy = false;
  }
}

box.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const id = step.closest('[data-qty]').dataset.qty;
    const line = cart.items.find((l) => l.productId === id);
    const next = line.quantity + Number(step.dataset.step);
    if (next >= 1) change(() => CartStore.setQuantity(line, next));
  }
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    const line = cart.items.find((l) => l.productId === remove.dataset.remove);
    change(async () => { await CartStore.remove(line); toast(`${line.name} removed`); });
  }
  if (e.target.closest('#checkout-btn')) {
    if (CartStore.isGuest()) location.href = '/login?next=' + encodeURIComponent('/checkout');
    else location.href = '/checkout';
  }
});

box.addEventListener('change', (e) => {
  if (!e.target.matches('[data-qty] input')) return;
  const id = e.target.closest('[data-qty]').dataset.qty;
  const line = cart.items.find((l) => l.productId === id);
  const value = Math.round(Number(e.target.value));
  if (!Number.isFinite(value) || value < 1) { e.target.value = line.quantity; return; }
  change(() => CartStore.setQuantity(line, Math.min(value, Number(e.target.max))));
});

(async () => {
  try {
    await initShell('cart');
    load();
  } catch (err) {
    shellError(err);
  }
})();
