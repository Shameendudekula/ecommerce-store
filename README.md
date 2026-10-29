# Mini Store – E-Commerce Website

A full-stack online store. Customers browse products, fill a cart (as a guest or logged in), check out with a shipping address and follow their orders. Admins manage the catalogue, see store statistics and move orders through their lifecycle. Built with **Node.js, Express, MongoDB (Mongoose)**, **JWT authentication with roles** and a **plain HTML/CSS/JavaScript** frontend.

🔗 **Live demo:** https://ecommerce-store-qgr5.onrender.com (free Render instance – the first visit after a while can take ~50 seconds to wake up)
💻 **Source:** https://github.com/Shameendudekula/ecommerce-store

### Demo logins

| Role | Email | Password |
|------|-------|----------|
| Customer | `demo@example.com` | `demo1234` |
| Admin | `admin@example.com` | `admin1234` |

> Demo store: no real payments are taken. The payment method is "Cash on delivery (demo)".

---

## ✨ Features

**Shopping**
- Product listing with search (name and description), category filter, sorting (newest, price ↑↓, rating) and pagination
- Product detail page with stock status, a quantity selector and "Only N left" warnings
- Filters live in the URL, so links and the Back button work

**Cart**
- Add, remove and change quantities; the cart count badge in the navbar updates instantly
- **Guest cart in localStorage**, **account cart in MongoDB**, **merged on login**
- Free shipping from ₹2,000 (otherwise ₹99); totals are calculated on the server
- The cart can never hold more than the stock, and items whose stock dropped are flagged

**Checkout & orders**
- Shipping address form (remembered for next time) and order summary
- The server builds the order from the saved cart and **current database prices**. The client never sends prices
- **Stock is reserved atomically.** Ordering more than the stock is blocked, and two buyers can't both get the last item
- Order confirmation page with a status timeline (Placed → Shipped → Delivered)
- Profile page with order history

**Admin dashboard** (admins only)
- Stat cards: products, orders, revenue (excluding cancelled orders), customers; plus orders by status, low-stock list and recent orders
- Product management: add, edit and delete, with image preview and validation
- Order management: filter by status, move orders **Pending → Shipped → Delivered** or **Cancelled**. Cancelling **puts the stock back**

**Security**
- bcrypt-hashed passwords, JWT sessions, login rate limiting
- **Role middleware**: admin routes return 401 for guests and 403 for customers
- Nobody can register as an admin: `role` in the request body is ignored
- Customers can only see their own orders (others return 404)
- Product image URLs must be `http(s)` links, and all text is escaped before display (XSS)

**UI**
- Clean, responsive design: two-column product grid on phones, admin tables turn into cards
- Toast notifications, loading skeletons, empty and error states

---

## 🛠 Tech Stack

| Layer | Technology |
|------|------------|
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas, Mongoose 9 |
| Auth | bcryptjs, jsonwebtoken, express-rate-limit |
| Frontend | HTML5, CSS3, vanilla JavaScript (Fetch API), native `<dialog>` modals |
| Images | Placeholder photos from picsum.photos |
| Testing | Node.js test runner, Supertest, mongodb-memory-server, Puppeteer (UI) |
| Deployment | Render (one Web Service serves the API and the frontend) |

---

## 🧠 How it works

### Role middleware (`middleware/requireRole.js`)

Two middlewares run one after the other:

```js
router.post('/', requireAuth, requireRole('admin'), createProduct);
```

1. **`requireAuth`** checks the JWT in the `Authorization: Bearer <token>` header. If it's missing or invalid, it returns **401 Unauthorized** ("we don't know who you are"). Otherwise it loads the user and sets `req.user`.
2. **`requireRole('admin')`** checks `req.user.role`. If it isn't in the allowed list, it returns **403 Forbidden** ("we know who you are, but you're not allowed").

The whole `/api/admin` router uses `router.use(requireAuth, requireRole('admin'))`, so every admin route is protected in one line. The role is stored on the user in the database and read fresh on every request. Registration always creates a `customer`; admins are created by the seed script.

### Cart merging (`controllers/cartController.js` → `mergeCart`, `public/js/cart-store.js`)

- **Guests:** the cart is an array in localStorage, `[{ productId, quantity }]`. Product details and stock come from `GET /api/products?ids=…`.
- **Logged-in users:** the cart is a `Cart` document in MongoDB (one per user).
- **On login,** the frontend sends the guest cart to `POST /api/cart/merge`. The server:
  1. ignores invalid ids and non-positive quantities, and combines duplicate lines
  2. **adds** each guest quantity to what is already in the account's saved cart
  3. **caps** the result at the available stock and at the per-item maximum (10), skipping sold-out products
  4. returns the merged cart plus a list of **adjustments** (e.g. "quantity reduced to 3"), which the UI shows as a message

  The frontend then deletes the localStorage cart. Every page reads the cart through one `CartStore` object, so they don't need to know which kind of cart it is.

### Stock handling (`utils/stock.js`, `controllers/orderController.js`, `controllers/adminController.js`)

- **Atomic reservation.** Stock is reduced with a single conditional update:
  ```js
  Product.updateOne({ _id: id, stock: { $gte: quantity } }, { $inc: { stock: -quantity } })
  ```
  The check (`stock >= quantity`) and the decrement happen in one database operation. If two customers order the last item at the same moment, the second update finds `stock < quantity`, matches nothing (`modifiedCount: 0`) and that order gets **409 Conflict**. Stock can never go negative; a test fires two orders in parallel to prove it.
- **Rollback.** An order can contain several products. If the 3rd product can't be reserved, the quantities already taken for products 1 and 2 are put back, so a failed checkout never leaves stock reduced.
- **Order of steps at checkout:**
  1. Load the cart and current prices.
  2. Validate the address (before touching any stock).
  3. Reserve stock for each product.
  4. Save the order.
  5. Empty the cart.
- **Price snapshot.** Each order stores the name, image and price at the time of purchase, so later price changes or deleted products don't change past orders.
- **Cancel restores stock.** Allowed status changes are defined in `ORDER_TRANSITIONS` (Delivered and Cancelled are final). The status update itself is conditional, `findOneAndUpdate({ _id, status: currentStatus }, …)`. If two admins cancel at the same time, only one update succeeds, so the stock is restored exactly once.

---

## 📁 Project Structure

```
ecommerce-store/
├── server.js                  # Entry point: checks JWT_SECRET, connects to MongoDB, starts the server
├── app.js                     # Express app: routes under /api/*, static frontend, error handler
├── config/
│   ├── db.js                  # MongoDB connection
│   └── constants.js           # Categories, roles, order transitions, shipping rules
├── models/                    # User (roles), Product, Cart, Order (with price snapshot)
├── controllers/               # auth, product, cart (incl. merge), order (checkout), admin
├── routes/                    # authRoutes, productRoutes, cartRoutes, orderRoutes, adminRoutes
├── middleware/
│   ├── auth.js                # JWT check -> req.user (401)
│   ├── requireRole.js         # role check (403)
│   ├── validateObjectId.js
│   └── errorHandler.js
├── utils/
│   ├── stock.js               # atomic reserve / release
│   ├── pricing.js             # subtotal, shipping, total (shared by cart and checkout)
│   ├── money.js, token.js
├── public/                    # Frontend served by Express
│   ├── index.html (shop), product.html, cart.html, checkout.html,
│   │   login.html, account.html, order.html, admin.html
│   ├── css/styles.css
│   └── js/
│       ├── api.js             # fetch wrapper with the JWT
│       ├── common.js          # header, formatting, toasts, product card, confirm dialog
│       ├── cart-store.js      # one cart API for guests (localStorage) and users (server)
│       └── shop.js, product.js, cart.js, checkout.js, login.js, account.js, order.js, admin.js
├── seed/                      # sampleData.js, seed.js (npm run seed), demo.js (npm run demo)
└── tests/                     # 25 API tests
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20 or newer
- A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster

### Setup

```bash
git clone https://github.com/Shameendudekula/ecommerce-store.git
cd ecommerce-store
npm install
cp .env.example .env     # fill in MONGO_URI and JWT_SECRET
npm run seed             # admin, demo customer, 20 products, sample orders
npm run dev              # http://localhost:5050
```

Generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### Try it without MongoDB Atlas

```bash
npm run demo
```

Runs the whole store on http://localhost:5050 with a temporary in-memory database and the sample data.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm start` | Start the server (production) |
| `npm run dev` | Start with nodemon |
| `npm run seed` | Reset products, demo accounts and the demo customer's orders (other users are kept) |
| `npm run demo` | Run with an in-memory database and sample data |
| `npm test` | Run the API tests (in-memory database) |

---

## 🔐 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGO_URI` | ✅ | MongoDB Atlas connection string with the database name `ecommerce-store`. URL-encode special characters in the password (`@` → `%40`) |
| `JWT_SECRET` | ✅ | Random string of at least 32 characters |
| `JWT_EXPIRES_IN` | – | Token lifetime, default `7d` |
| `PORT` | – | Default `5050`; Render sets this automatically |
| `NODE_ENV` | – | `production` hides internal error details |
| `CLIENT_URL` | – | Allowed CORS origin(s), only if the frontend is hosted elsewhere |

---

## 📡 API Endpoints

🔒 = logged in (`Authorization: Bearer <token>`) · 👑 = admin only

| Method | Endpoint | Description | Success | Errors |
|--------|----------|-------------|---------|--------|
| GET | `/api/health` | Server and database status | 200 | – |
| GET | `/api/meta` | Categories, order statuses, shipping rules | 200 | – |
| POST | `/api/auth/register` | Create a customer account → `{ token, user }` | 201 | 400, 409, 429 |
| POST | `/api/auth/login` | Log in → `{ token, user }` | 200 | 400, 401, 429 |
| GET | `/api/auth/me` 🔒 | Current user (with role) | 200 | 401 |
| GET | `/api/products` | List: `search`, `category`, `sort`, `page`, `limit`, `ids` | 200 | 400 |
| GET | `/api/products/:id` | Product detail | 200 | 400, 404 |
| POST | `/api/products` 👑 | Create a product | 201 | 400, 401, 403 |
| PUT | `/api/products/:id` 👑 | Update a product | 200 | 400, 401, 403, 404 |
| DELETE | `/api/products/:id` 👑 | Delete a product (also removed from carts) | 200 | 401, 403, 404 |
| GET | `/api/cart` 🔒 | Cart with current prices, stock and totals | 200 | 401 |
| POST | `/api/cart/items` 🔒 | Add `{ productId, quantity }` | 201 | 400, 404, 409 |
| PATCH | `/api/cart/items/:productId` 🔒 | Set quantity (0 removes) | 200 | 400, 404, 409 |
| DELETE | `/api/cart/items/:productId` 🔒 | Remove an item | 200 | 404 |
| DELETE | `/api/cart` 🔒 | Empty the cart | 200 | 401 |
| POST | `/api/cart/merge` 🔒 | Merge the guest cart `{ items: [...] }` | 200 | 400 |
| POST | `/api/orders` 🔒 | Place an order `{ shippingAddress }` | 201 | 400, 409 |
| GET | `/api/orders` 🔒 | My orders | 200 | 401 |
| GET | `/api/orders/:id` 🔒 | One order (own, or any for admins) | 200 | 404 |
| GET | `/api/admin/stats` 👑 | Dashboard numbers | 200 | 401, 403 |
| GET | `/api/admin/orders` 👑 | All orders, `?status=` filter, pagination | 200 | 400, 401, 403 |
| PATCH | `/api/admin/orders/:id/status` 👑 | Change status `{ status }` | 200 | 400, 404, 409 |

---

## 🧪 Testing

```bash
npm test
```

25 API tests cover:
- **Auth:** registration, roles, and that `role` can't be set at sign-up
- **Products:** search, filters, sorting, pagination, admin-only CRUD (401/403), validation
- **Cart:** stock limits, deleted products, and merging (adding, capping, skipping bad items)
- **Checkout:** stock reduction, price snapshots, ignoring client-sent prices, address validation, **rollback when one item is short**, **two customers racing for the last item**
- **Admin:** stats, allowed status transitions only, **cancelling restores stock exactly once**, order filters

The full flow was also tested end-to-end in Chrome at 1280px and 375px:
1. Browse, filter, sort and search
2. Build a guest cart and log in, which merges it
3. Check out and see the order in the account
4. As admin, ship and cancel the order, with the stock restored
5. Add, edit and delete a product, and check the customer/guest access rules

---

## ☁️ Deployment (Render)

1. In MongoDB Atlas → **Network Access**, make sure `0.0.0.0/0` is allowed.
2. Render → **New → Web Service** → this repo. **Region** Frankfurt, **Build** `npm install`, **Start** `npm start`, **Instance** Free, **Health Check Path** `/api/health`.
3. Environment variables: `MONGO_URI`, `JWT_SECRET` (a new random value), `NODE_ENV=production`.
4. Deploy, then run `npm run seed` locally against the same `MONGO_URI` to load the catalogue.

> The free Render instance sleeps after inactivity, so the first request can take ~50 seconds.

---

## 📸 Screenshots

> _Screenshots coming soon._

| View | Screenshot |
|------|-----------|
| Shop | `![Shop](screenshots/shop.png)` |
| Product detail | `![Product](screenshots/product.png)` |
| Cart | `![Cart](screenshots/cart.png)` |
| Checkout | `![Checkout](screenshots/checkout.png)` |
| Order confirmation | `![Order](screenshots/order.png)` |
| Admin dashboard | `![Admin](screenshots/admin.png)` |
| Mobile | `![Mobile](screenshots/mobile.png)` |

---

## 👩‍💻 Author

**Shameen Dudekula** · [Portfolio](https://portfolio-shameen.vercel.app) · [GitHub](https://github.com/Shameendudekula) · [LinkedIn](https://linkedin.com/in/shameen-d)
