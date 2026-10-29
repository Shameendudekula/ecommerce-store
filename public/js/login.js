// Login and registration. After success: save the token, merge the guest cart, go to ?next=.

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const tabs = { login: document.getElementById('tab-login'), register: document.getElementById('tab-register') };
const notice = document.getElementById('notice');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Only allow redirects inside this site (never to another domain)
function nextUrl() {
  const next = params().get('next') || '/';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function showTab(name) {
  const isLogin = name === 'login';
  tabs.login.setAttribute('aria-selected', String(isLogin));
  tabs.register.setAttribute('aria-selected', String(!isLogin));
  loginForm.hidden = !isLogin;
  registerForm.hidden = isLogin;
  (isLogin ? loginForm : registerForm).querySelector('input').focus();
}

function setErrors(form, errors) {
  form.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = form === registerForm && el.dataset.errorFor === 'password' ? 'At least 8 characters' : '';
  });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first;
  for (const [field, message] of Object.entries(errors)) {
    const slot = form.querySelector(`[data-error-for="${field}"]`);
    if (slot) slot.textContent = message;
    const input = form.elements[field];
    if (input) { input.setAttribute('aria-invalid', 'true'); first ??= input; }
  }
  first?.focus();
}

async function afterLogin(token, user) {
  auth.setToken(token);
  appState.user = user;
  // Move the guest cart (localStorage) into the account's cart on the server
  try {
    const adjustments = await CartStore.mergeGuestCart();
    if (adjustments.length) {
      try { sessionStorage.setItem('cart-adjustments', JSON.stringify(adjustments)); } catch { /* optional */ }
    }
  } catch {
    toast("Your guest cart couldn't be added to your account", 'error');
  }
  location.replace(user.role === 'admin' && nextUrl() === '/' ? '/admin' : nextUrl());
}

async function submitWith(form, action) {
  const button = form.querySelector('[type=submit]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Please wait…';
  try {
    const { token, user } = await action();
    await afterLogin(token, user);
  } catch (err) {
    setErrors(form, err.errors || {});
    toast(err.message, 'error');
    button.disabled = false;
    button.textContent = label;
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = loginForm.elements.email.value.trim();
  const password = loginForm.elements.password.value;
  const errors = {};
  if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address';
  if (!password) errors.password = 'Password is required';
  if (Object.keys(errors).length) return setErrors(loginForm, errors);
  submitWith(loginForm, () => api.login(email, password));
});

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    name: registerForm.elements.name.value.trim(),
    email: registerForm.elements.email.value.trim(),
    password: registerForm.elements.password.value,
  };
  const errors = {};
  if (data.name.length < 2) errors.name = 'Name must be at least 2 characters';
  if (!EMAIL_RE.test(data.email)) errors.email = 'Please enter a valid email address';
  if (data.password.length < 8) errors.password = 'Password must be at least 8 characters';
  if (Object.keys(errors).length) return setErrors(registerForm, errors);
  submitWith(registerForm, () => api.register(data));
});

tabs.login.addEventListener('click', () => showTab('login'));
tabs.register.addEventListener('click', () => showTab('register'));
document.querySelectorAll('[data-demo]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const admin = btn.dataset.demo === 'admin';
    loginForm.elements.email.value = admin ? 'admin@example.com' : 'demo@example.com';
    loginForm.elements.password.value = admin ? 'admin1234' : 'demo1234';
    loginForm.querySelector('[type=submit]').focus();
  })
);

(async () => {
  try {
    await initShell('login');
    if (appState.user) return location.replace(nextUrl()); // already logged in
    const reason = params().get('reason');
    const guestCount = CartStore.readGuest().length;
    if (reason === 'expired') notice.textContent = 'Your session ended. Please log in again.';
    else if (params().get('next') === '/checkout') notice.textContent = 'Log in or create an account to check out.' + (guestCount ? ' Your cart will be kept.' : '');
    notice.hidden = !notice.textContent;
  } catch (err) {
    shellError(err);
  }
})();
