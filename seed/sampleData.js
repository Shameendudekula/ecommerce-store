// Demo accounts and the sample catalogue used by `npm run seed` and `npm run demo`

const ADMIN = { name: 'Store Admin', email: 'admin@example.com', password: 'admin1234', role: 'admin' };
const CUSTOMER = { name: 'Demo Customer', email: 'demo@example.com', password: 'demo1234', role: 'customer' };

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const image = (name) => `https://picsum.photos/seed/${slug(name)}/600/400`;

// [name, category, price (INR), stock, rating, description]
const ROWS = [
  ['Wireless Earbuds', 'Electronics', 2499, 25, 4.4, 'Bluetooth 5.3 earbuds with 30 hours of battery life including the case, touch controls and a low-latency mode for videos and games.'],
  ['Portable Bluetooth Speaker', 'Electronics', 1899, 18, 4.2, 'Compact water-resistant speaker with rich bass, 12-hour playtime and a built-in microphone for calls.'],
  ['Smart Fitness Watch', 'Electronics', 4999, 3, 4.5, 'Tracks steps, heart rate, sleep and workouts. AMOLED display, 7-day battery and smartphone notifications.'],
  ['USB-C Power Bank 20000mAh', 'Electronics', 1299, 40, 4.3, 'High-capacity power bank with 22.5W fast charging, two USB-A ports and one USB-C port.'],
  ['Cotton Crew T-Shirt', 'Clothing', 499, 60, 4.1, 'Soft 100% cotton t-shirt with a classic crew neck. Pre-shrunk and available in a relaxed fit.'],
  ['Denim Jacket', 'Clothing', 2199, 12, 4.6, 'Timeless mid-wash denim jacket with button front, chest pockets and a comfortable regular fit.'],
  ['Hooded Sweatshirt', 'Clothing', 1499, 20, 4.4, 'Warm fleece-lined hoodie with kangaroo pocket and adjustable drawstring hood.'],
  ['Linen Kurta', 'Clothing', 999, 15, 4.2, 'Breathable linen-blend kurta with a mandarin collar, ideal for warm days and festive occasions.'],
  ['Ceramic Coffee Mug Set', 'Home & Kitchen', 699, 30, 4.5, 'Set of four 350 ml glazed ceramic mugs. Microwave and dishwasher safe.'],
  ['Non-stick Frying Pan', 'Home & Kitchen', 1199, 14, 4.3, '26 cm non-stick pan with an induction-ready base and a heat-resistant handle.'],
  ['Scented Candle Trio', 'Home & Kitchen', 549, 2, 4.0, 'Three soy-wax candles in lavender, vanilla and sandalwood. About 25 hours of burn time each.'],
  ['Bamboo Cutting Board', 'Home & Kitchen', 449, 35, 4.6, 'Durable, knife-friendly bamboo board with a juice groove and easy-grip handle.'],
  ['JavaScript for Beginners', 'Books', 599, 22, 4.7, 'A friendly, project-based introduction to modern JavaScript: variables to async/await, with exercises in every chapter.'],
  ['The Silent Harbour (Mystery Novel)', 'Books', 349, 28, 4.3, 'A gripping coastal mystery about a missing lighthouse keeper and the secrets of a small fishing town.'],
  ['Everyday Indian Cookbook', 'Books', 799, 10, 4.8, '120 simple, tested recipes for weeknight dals, curries, breads and snacks, with step-by-step photos.'],
  ['Short Stories Collection', 'Books', 399, 16, 4.1, 'Twenty short stories from new voices, about family, cities, travel and growing up.'],
  ['Yoga Mat 6mm', 'Sports', 899, 26, 4.4, 'Non-slip 6 mm yoga mat with alignment lines and a carry strap. Lightweight and easy to clean.'],
  ['Running Shoes', 'Sports', 2999, 9, 4.5, 'Lightweight running shoes with breathable mesh upper and cushioned sole for daily training.'],
  ['Adjustable Dumbbell Pair', 'Sports', 3499, 5, 4.6, 'Pair of adjustable dumbbells, 2–10 kg each, with secure spin-lock collars.'],
  ['English Willow Cricket Bat', 'Sports', 1799, 0, 4.2, 'Full-size English willow bat with a thick edge, rounded toe and cushioned grip.'],
];

const PRODUCTS = ROWS.map(([name, category, price, stock, rating, description]) => ({ name, category, price, stock, rating, description, imageUrl: image(name) }));

// Sample orders for the demo customer: [days ago, status, [[product name, quantity], ...]]
const ORDERS = [
  [12, 'Delivered', [['Cotton Crew T-Shirt', 2], ['JavaScript for Beginners', 1]]],
  [4, 'Shipped', [['Wireless Earbuds', 1]]],
  [1, 'Pending', [['Yoga Mat 6mm', 1], ['Ceramic Coffee Mug Set', 1]]],
];

const DEMO_ADDRESS = { fullName: 'Demo Customer', phone: '+91 9876543210', line1: '12 MG Road', line2: 'Near City Library', city: 'Anantapur', postalCode: '515001', country: 'India' };

module.exports = { ADMIN, CUSTOMER, PRODUCTS, ORDERS, DEMO_ADDRESS };
