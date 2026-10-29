// Account page: profile and order history. Requires login.

function renderProfile(user) {
  document.getElementById('profile').innerHTML = `
    <ul class="simple-list">
      <li><span class="muted">Name</span><span>${escapeHtml(user.name)}</span></li>
      <li><span class="muted">Email</span><span>${escapeHtml(user.email)}</span></li>
      <li><span class="muted">Account type</span><span>${user.role === 'admin' ? 'Administrator' : 'Customer'}</span></li>
      <li><span class="muted">Member since</span><span>${formatDate(user.createdAt)}</span></li>
    </ul>
    ${user.role === 'admin' ? '<a class="btn btn-primary btn-block" href="/admin">Open admin dashboard</a>' : ''}`;
}

function renderOrders(orders) {
  const box = document.getElementById('orders');
  if (orders.length === 0) {
    box.innerHTML = stateHtml('empty', { icon: '📦', title: 'No orders yet', text: 'When you place an order it will show up here.', action: '<a class="btn btn-primary" href="/">Start shopping</a>' });
    return;
  }
  box.innerHTML =
    '<ul class="order-list">' +
    orders
      .map((o) => {
        const count = o.items.reduce((n, i) => n + i.quantity, 0);
        return `<li class="order-card">
          <div>
            <div><span class="order-id">${orderNumber(o._id)}</span> · <span class="muted">${formatDate(o.createdAt)}</span></div>
            <div class="muted">${count} item${count === 1 ? '' : 's'} · ${formatMoney(o.total)}</div>
            <div class="thumbs">${o.items.slice(0, 4).map((i) => `<img src="${escapeHtml(i.imageUrl)}" alt="${escapeHtml(i.name)}" width="48" height="32" loading="lazy">`).join('')}</div>
          </div>
          <div class="actions">${statusBadge(o.status)} <a class="btn btn-ghost btn-sm" href="/order?id=${o._id}">View</a></div>
        </li>`;
      })
      .join('') +
    '</ul>';
}

(async () => {
  try {
    const { user } = await initShell('account', { requireLogin: true });
    renderProfile(user);
    const box = document.getElementById('orders');
    box.innerHTML = stateHtml('loading');
    try {
      const { data } = await api.myOrders();
      renderOrders(data);
    } catch (err) {
      box.innerHTML = stateHtml('error', { title: "Couldn't load your orders", text: err.message });
    }
  } catch (err) {
    shellError(err);
  }
})();
