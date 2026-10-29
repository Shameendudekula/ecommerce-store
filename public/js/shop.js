// Shop page: product grid with search (from the header), category chips, sorting and pagination.
// The filters live in the URL (?search=&category=&sort=&page=) so links and the Back button work.

const el = {
  title: document.getElementById('shop-title'),
  chips: document.getElementById('category-chips'),
  sort: document.getElementById('sort'),
  count: document.getElementById('result-count'),
  grid: document.getElementById('grid'),
  state: document.getElementById('state'),
  pagination: document.getElementById('pagination'),
  pageInfo: document.getElementById('page-info'),
  prev: document.getElementById('prev-page'),
  next: document.getElementById('next-page'),
};

let products = [];
let requestId = 0;

const filters = () => {
  const p = params();
  return { search: p.get('search') || '', category: p.get('category') || '', sort: p.get('sort') || 'newest', page: Math.max(1, Number(p.get('page')) || 1) };
};

function setFilters(changes) {
  const next = { ...filters(), page: 1, ...changes };
  const p = new URLSearchParams();
  if (next.search) p.set('search', next.search);
  if (next.category) p.set('category', next.category);
  if (next.sort !== 'newest') p.set('sort', next.sort);
  if (next.page > 1) p.set('page', next.page);
  history.pushState(null, '', '/' + (p.toString() ? '?' + p : ''));
  load();
}

function renderChips() {
  const { category } = filters();
  el.chips.innerHTML = ['', ...appState.meta.categories]
    .map((c) => `<button type="button" class="chip" data-category="${escapeHtml(c)}" aria-pressed="${c === category}">${c ? escapeHtml(c) : 'All'}</button>`)
    .join('');
}

async function load() {
  const id = ++requestId;
  const f = filters();
  renderChips();
  el.sort.value = f.sort;
  const headerSearch = document.getElementById('header-search');
  if (headerSearch) headerSearch.value = f.search;
  el.title.textContent = f.search ? `Results for “${f.search}”` : f.category || 'All products';
  document.title = `${f.category || 'Shop'} – Mini Store`;

  el.grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton skeleton-card" aria-hidden="true"></div>').join('');
  el.state.innerHTML = '';
  el.count.textContent = '';
  el.pagination.hidden = true;

  try {
    const res = await api.products({ search: f.search, category: f.category, sort: f.sort, page: f.page, limit: 12 });
    if (id !== requestId) return; // a newer request has started
    products = res.data;
    const { total, page, totalPages } = res.pagination;

    if (products.length === 0) {
      el.grid.innerHTML = '';
      el.state.innerHTML = stateHtml('empty', {
        icon: '🔍',
        title: 'No products found',
        text: f.search || f.category ? 'Try a different search or category.' : 'The shop is empty right now.',
        action: f.search || f.category ? '<button type="button" class="btn btn-ghost" data-action="clear">Show all products</button>' : '',
      });
      return;
    }

    el.grid.innerHTML = products.map(productCard).join('');
    const from = (page - 1) * res.pagination.limit + 1;
    el.count.textContent = `Showing ${from}–${from + products.length - 1} of ${total} product${total === 1 ? '' : 's'}`;
    el.pagination.hidden = totalPages <= 1;
    el.pageInfo.textContent = `Page ${page} of ${totalPages}`;
    el.prev.disabled = page <= 1;
    el.next.disabled = page >= totalPages;
  } catch (err) {
    if (id !== requestId) return;
    el.grid.innerHTML = '';
    el.state.innerHTML = stateHtml('error', { title: "Couldn't load products", text: err.message, action: '<button type="button" class="btn btn-ghost" data-action="retry">Try again</button>' });
  }
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-category]');
  if (chip) return setFilters({ category: chip.dataset.category });
  const add = e.target.closest('[data-add]');
  if (add) return handleAddToCart(add, products.find((p) => p._id === add.dataset.add));
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (action === 'clear') setFilters({ search: '', category: '' });
  if (action === 'retry') load();
});
el.sort.addEventListener('change', () => setFilters({ sort: el.sort.value }));
el.prev.addEventListener('click', () => { setFilters({ page: filters().page - 1 }); scrollTo({ top: 0 }); });
el.next.addEventListener('click', () => { setFilters({ page: filters().page + 1 }); scrollTo({ top: 0 }); });
window.addEventListener('popstate', load);

(async () => {
  try {
    await initShell('shop');
    // Searching from the header on this page updates the grid without a full reload
    document.querySelector('.header-search').addEventListener('submit', (e) => {
      e.preventDefault();
      setFilters({ search: document.getElementById('header-search').value.trim() });
    });
    load();
  } catch (err) {
    shellError(err);
  }
})();
