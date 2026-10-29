// Product detail page: /product?id=<productId>

const box = document.getElementById('product');
let product;

function stockLine(p) {
  if (p.stock === 0) return '<p class="stock-line out">Out of stock</p>';
  if (p.stock <= 5) return `<p class="stock-line low">Only ${p.stock} left in stock – order soon</p>`;
  return `<p class="stock-line in">In stock (${p.stock} available)</p>`;
}

function render(p) {
  document.title = `${p.name} – Mini Store`;
  const crumb = document.getElementById('crumb-category');
  crumb.textContent = p.category;
  crumb.href = `/?category=${encodeURIComponent(p.category)}`;

  box.innerHTML = `
    <div class="detail">
      <div class="detail-image"><img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" width="600" height="400"></div>
      <div class="detail-info">
        <span class="product-category">${escapeHtml(p.category)}</span>
        <h1>${escapeHtml(p.name)}</h1>
        ${stars(p.rating)}
        <div class="detail-price">${formatMoney(p.price)}</div>
        ${stockLine(p)}
        <p>${escapeHtml(p.description)}</p>
        ${p.stock > 0
          ? `<div class="buy-row">
              ${qtyStepper({ id: 'detail', value: 1, max: p.stock })}
              <button type="button" class="btn btn-primary btn-lg" id="add-btn">Add to cart</button>
            </div>`
          : '<button type="button" class="btn btn-primary btn-lg" disabled>Out of stock</button>'}
        <p class="muted">Free shipping on orders from ${formatMoney(appState.meta.freeShippingFrom)} · ${escapeHtml(appState.meta.paymentMethod)}</p>
      </div>
    </div>`;
}

// − / + buttons and typing in the quantity box, clamped to 1..max
box.addEventListener('click', (e) => {
  const step = e.target.closest('[data-step]');
  if (step) {
    const input = step.parentElement.querySelector('input');
    setQty(input, Number(input.value) + Number(step.dataset.step));
  }
  if (e.target.closest('#add-btn')) {
    const qty = Number(box.querySelector('[data-qty] input').value);
    handleAddToCart(e.target.closest('#add-btn'), product, qty);
  }
});
box.addEventListener('change', (e) => { if (e.target.matches('[data-qty] input')) setQty(e.target, Number(e.target.value)); });

function setQty(input, value) {
  const max = Number(input.max);
  const v = Math.min(max, Math.max(1, Math.round(value) || 1));
  input.value = v;
  const [minus, plus] = input.parentElement.querySelectorAll('button');
  minus.disabled = v <= 1;
  plus.disabled = v >= max;
}

(async () => {
  try {
    await initShell('shop');
    const id = params().get('id');
    if (!/^[0-9a-f]{24}$/i.test(id || '')) throw Object.assign(new Error('Product not found'), { status: 404 });
    box.innerHTML = stateHtml('loading');
    ({ data: product } = await api.product(id));
    render(product);
  } catch (err) {
    box.innerHTML = err.status === 404
      ? stateHtml('empty', { icon: '🔎', title: 'Product not found', text: 'It may have been removed from the store.', action: '<a class="btn btn-primary" href="/">Back to the shop</a>' })
      : stateHtml('error', { title: "Couldn't load this product", text: err.message, action: '<button type="button" class="btn btn-ghost" onclick="location.reload()">Try again</button>' });
  }
})();
