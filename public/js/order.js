// Order detail / confirmation page: /order?id=<orderId>[&placed=1]

const box = document.getElementById('order');

function timeline(order) {
  if (order.status === 'Cancelled') {
    const at = order.statusHistory.find((h) => h.status === 'Cancelled')?.at;
    return `<div class="notice notice-warning">This order was cancelled${at ? ` on ${formatDateTime(at)}` : ''}.</div>`;
  }
  const steps = ['Pending', 'Shipped', 'Delivered'];
  const reached = steps.indexOf(order.status);
  return `<ol class="timeline" aria-label="Order progress">
    ${steps
      .map((s, i) => {
        const at = order.statusHistory.find((h) => h.status === s)?.at;
        return `<li class="${i <= reached ? 'done' : ''}">${s === 'Pending' ? 'Placed' : s}${at ? `<br><span class="muted">${formatDate(at)}</span>` : ''}</li>`;
      })
      .join('')}
  </ol>`;
}

function render(o) {
  document.title = `Order ${orderNumber(o._id)} – Mini Store`;
  const a = o.shippingAddress;
  const placed = params().get('placed') === '1';

  box.innerHTML = `
    ${placed ? `<div class="notice notice-success"><strong>Thank you! Your order has been placed.</strong> You'll pay ${formatMoney(o.total)} on delivery.</div>` : ''}
    <div class="page-header">
      <h1>Order <span class="order-id">${orderNumber(o._id)}</span></h1>
      ${statusBadge(o.status)}
    </div>
    <div class="two-col">
      <div>
        <section class="panel" aria-labelledby="status-title">
          <h2 id="status-title" class="panel-header">Status</h2>
          ${timeline(o)}
        </section>
        <section class="panel" aria-labelledby="items-title">
          <h2 id="items-title" class="panel-header">Items</h2>
          <ul class="cart-lines">
            ${o.items
              .map(
                (i) => `<li class="cart-line">
                  <img src="${escapeHtml(i.imageUrl)}" alt="" width="96" height="64" loading="lazy">
                  <div><a class="name" href="/product?id=${i.product}">${escapeHtml(i.name)}</a><div class="muted">${formatMoney(i.price)} × ${i.quantity}</div></div>
                  <div class="line-total">${formatMoney(i.price * i.quantity)}</div>
                </li>`
              )
              .join('')}
          </ul>
        </section>
      </div>
      <aside class="panel summary" aria-labelledby="sum-title">
        <h2 id="sum-title" class="panel-header">Summary</h2>
        <div class="summary-row"><span>Placed</span><span>${formatDateTime(o.createdAt)}</span></div>
        <div class="summary-row"><span>Subtotal</span><span>${formatMoney(o.subtotal)}</span></div>
        <div class="summary-row"><span>Shipping</span><span>${o.shippingFee === 0 ? 'Free' : formatMoney(o.shippingFee)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${formatMoney(o.total)}</span></div>
        <p class="summary-note muted">${escapeHtml(o.paymentMethod)}</p>
        <h3 class="panel-header">Shipping to</h3>
        <address class="address">
          ${escapeHtml(a.fullName)}<br>${escapeHtml(a.line1)}${a.line2 ? `<br>${escapeHtml(a.line2)}` : ''}<br>
          ${escapeHtml(a.city)} ${escapeHtml(a.postalCode)}<br>${escapeHtml(a.country)}<br>${escapeHtml(a.phone)}
        </address>
      </aside>
    </div>`;
}

(async () => {
  try {
    const { user } = await initShell('account', { requireLogin: true });
    if (user.role === 'admin') {
      const back = document.getElementById('crumb-back');
      back.textContent = 'Admin orders';
      back.href = '/admin#orders';
    }
    const id = params().get('id');
    box.innerHTML = stateHtml('loading');
    if (!/^[0-9a-f]{24}$/i.test(id || '')) throw Object.assign(new Error('Order not found'), { status: 404 });
    const { data } = await api.order(id);
    render(data);
  } catch (err) {
    box.innerHTML = err.status === 404
      ? stateHtml('empty', { icon: '📦', title: 'Order not found', action: '<a class="btn btn-primary" href="/account">My orders</a>' })
      : stateHtml('error', { title: "Couldn't load this order", text: err.message });
  }
})();
