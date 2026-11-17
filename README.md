# BeautyHub

Next.js frontend + PHP backend, with PostgreSQL (managed through pgAdmin) and a WebSocket server for live updates.

## Requirements

- [Node.js](https://nodejs.org) 18+
- [Docker Desktop](https://www.docker.com/products/docker-desktop) (must be running)

## Quick start (Windows)

| File | What it does |
| --- | --- |
| `setup.bat` | First-time setup: creates `.env`, runs `npm install`, starts PostgreSQL + pgAdmin + PHP in Docker and creates the tables. |
| `start.bat` | Starts the Docker containers, then Next.js and the WebSocket server. Press Ctrl+C to stop. |
| `stop.bat` | Stops the Docker containers. Your data is kept. |
| `migrate.bat` | Applies `database/postgres/*.sql` to the running database. `setup.bat` and `start.bat` run it for you. |
| `seed-owner.bat` | Creates the default seller account + store (`OWNER_*` in `.env`) and the default admin account (`ADMIN_*`). `setup.bat` and `start.bat` run it for you. |
| `reset-db.bat` | **Deletes all data** and recreates empty tables (asks you to type YES first). |

Double-click `setup.bat` once, then `start.bat` every time after that.

## Accounts, stores and roles

| Page | Who | What |
| --- | --- | --- |
| `/` | everyone | The default store's page (`NEXT_PUBLIC_DEFAULT_STORE_SLUG` in `.env`). If that is empty, the general page below. |
| `/start` | everyone | General page: log in, or sign up as a **Seller** or **Customer**. Logged-in users are sent to their home. |
| `/store/{slug}` | everyone | A seller's own page. This is the link a seller shares. |
| `/signup?store={slug}` | new customers | Signing up from a store link joins that store with the store's default role. |
| `/account` | customers | The stores they belong to and their role in each. |
| `/dashboard` | sellers | Overview + their store link + live activity. |
| `/dashboard/customers` | sellers | Customers who joined, and their tier. |
| `/dashboard/settings/tiers` | sellers | Customer tiers: order (1 = best price), rename, add/delete, default tier, my-cost tier. |
| `/dashboard/settings/store` | sellers | Store name and description. |
| `/dashboard/settings/payments` | sellers | Payment methods (GCash, bank, cash…) with QR codes / attachments. |
| `/admin` | admins | Every account: search, edit, set a new password, turn off / on, delete, create sellers, customers or admins. |

- The default seller (the site owner) comes from `OWNER_NAME`, `OWNER_USERNAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`,
  `OWNER_STORE_NAME` and `OWNER_STORE_SLUG` in `.env`. It is recreated after `reset-db.bat`, and changing
  `OWNER_PASSWORD` then running `start.bat` changes the password. Leave `OWNER_EMAIL` empty to skip it.
- Every account is a `seller`, a `customer` or an `admin` (`users.account_type`).
- The default admin comes from `ADMIN_NAME`, `ADMIN_USERNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` (log in with
  the username). Like the owner, changing `ADMIN_PASSWORD` then running `start.bat` changes the password.
- An admin can **turn off** an account (`users.is_active`): it can't log in, is logged out at once, and a turned-off
  seller's store page is hidden. Nothing is deleted. **Delete** removes the account for good (a seller's store,
  products, invoices and uploads too) and asks you to type the username first.
- Each seller has one store (`stores`). The link slug comes from the store name and never changes.
- Each store has its own roles (`store_roles`): new stores start with **Retailer** (default), **Reseller** and **Wholesaler**.
  Deleting a role moves its customers to the default role.
- A customer can belong to several stores, with one role per store (`store_members`).
- Login is session based (PHP session cookie). Every seller action is checked against the seller's own store.

## Products, pricing and location (sellers)

| Page | What |
| --- | --- |
| `/dashboard/products` | Product list, **Import Excel**, **Export Excel**, **Template** download. |
| `/dashboard/products/new`, `/dashboard/products/{id}` | Product form: brand, category, unit, my cost, a price per role, promo. |
| `/dashboard/settings/brands`, `/categories`, `/units` | Brands, categories and units of measure, one page each (add / rename / delete). |
| `/dashboard/settings/location` | Store location (address + map pin). |
| `/dashboard/settings/profile`, `/account/profile` | Name, username, email, password (sellers / customers). |

- **Default seeders** (`seed_store_defaults()` in `database/postgres/003_catalog_products_pricing.sql`) run once per new
  store: roles Retailer (default), Reseller, DD, CD; 12 beauty categories; units pc, pack, box, set, bottle, tube, jar,
  sachet, ml, L, g, kg. Sellers can change all of them, and they are never re-added.
- **Tier prices:** each product has one price per customer tier. Tiers are ordered (1 = best price, e.g. DD → CD →
  Reseller → Retailer). A customer pays their tier's price; if their tier has no price they pay the next tier toward
  retail (never a better tier). Visitors see the default tier's price. Same rule everywhere (`tier_price()` in
  `database/postgres/006_role_tiers.sql`).
- **Promos:** a promo price valid *until a date* or *while supplies last*. It is shown when it is lower than the
  customer's price. Dates use `APP_TIMEZONE` (default `Asia/Manila`).
- **Excel:** export and import use the same columns, so you can export, edit and import back. Products are matched by
  SKU, else by brand + name. Missing brands, categories and units are created. Bad rows are skipped and listed.
- **Location:** Region → Province → City → Barangay come from the [PSGC API](https://psgc.cloud/api-docs) through a
  cached proxy (`/api/psgc/...`). The postal code is pre-filled from PSGC but editable, because PSGC's values are often
  blank or wrong. The map pin uses OpenStreetMap; the map centres on the chosen barangay via Nominatim (`/api/geocode`).
  Password changes made on the profile page are kept; `OWNER_PASSWORD` in `.env` only applies when you change it.

## Invoices, orders and inventory

| Page | What |
| --- | --- |
| `/dashboard/invoices` | All invoices; **Pending approval** tab for customer orders (badge in the sidebar). |
| `/dashboard/invoices/new` | New invoice: pick a registered customer or type a walk-in name, choose the price tier, add products. |
| `/dashboard/invoices/{id}` | Pending order: edit items / prices / discount, then **Approve** or **Reject**. Confirmed: **Edit**, **Print**, **Cancel**, record **payments**, **release** items. |
| `/dashboard/inventory` | Stock per product, low-stock alerts, add / remove / set stock with a note, history per product. |
| Store page (customers) | Members tap **Add to order**, review the cart and **Place order**. |
| `/account`, `/account/orders/{id}` | A customer's orders and their status. |

- **Invoices you make** are confirmed at once and the items leave your inventory.
- **Orders from a customer's account** are *pending*. Prices come from the customer's role (they cannot set their own).
  You can change quantities, prices and discount, then approve (stock is deducted) or reject.
- **Editing** a confirmed invoice only moves the difference in stock (more of an item = taken out, less = put back).
- **Payment status** (unpaid / partly paid / paid / overpaid) is worked out from the confirmed payments against the
  total, so editing a paid invoice to add an item makes it *partly paid*. Payments can have a receipt (photo or PDF).
  Customers can send a payment with proof from their order page; it waits for you to **Confirm** or **Reject** it.
- **Release:** a confirmed invoice is *open* until you mark it *released* to someone (e.g. the customer or a courier).
- Unpaid invoices and your store page show **How to pay** (your active payment methods and their QR codes).
- **Cancelling** a confirmed invoice puts the items back in stock.
- If stock would go below zero you get a warning and can continue anyway.
- **My cost = the DD price.** The store's *cost role* (DD by default; change it in Customers & Roles with the coin
  icon) is what you pay. Profit on invoices and the dashboard is worked out against it.
- New orders appear live on the dashboard (WebSocket event `order_placed`).
- Times use `APP_TIMEZONE` (default `Asia/Manila`).

## Photos, videos, logos and sizes

- **Product media** (product page → *Photos & videos*): up to 12 photos (JPG/PNG/WebP, 12 MB each) and 3 videos
  (MP4/WebM/MOV, 60 MB each). The first photo is the cover; tap ☆ on another to change it. New products: save first,
  then add photos.
- **Logos**: store logo in *Settings → Store details*; brand logos in *Settings → Brands* (click the square).
- **Sizes**: units marked *Ask how many* in *Settings → Units of measure* (ml, L, g, kg by default) ask for an amount on
  each product, shown as "500 ml". Excel has a *Size* column.
- **Invoices**: *PDF* and *Image* buttons download the invoice (seller and customer). Your profit is never included.
- Files are stored by the PHP container in the Docker volume `uploads` and served at `/uploads/...`. Every upload is
  checked by its real content; photos are re-encoded to WebP (max 1600 px + a 480 px thumbnail); the uploads folder
  cannot run code. `reset-db.bat` does not delete uploads; `docker compose down -v` does.

## Big lists

Products, inventory, invoices, customers and the store page are searched, filtered and paged **on the server**
(`page`, `per_page`, `q` and filters on `list_products`, `list_inventory`, `list_invoices`, `list_members`,
`get_store`). The invoice form searches products and customers as you type (`search_products`, `invoice_customers`).

## Default products (price list seeder)

`docs/October-2026-Vanity-Connections-Price-List.xlsx` (sheet "All Products": Brand, Product, Promo, DD, CD, RS, SRP)
is turned into `database/seeds/default_products.sql`:

```bash
node scripts/build-product-seed.js docs/October-2026-Vanity-Connections-Price-List.xlsx
```

`seed-owner.bat` adds those products to the default seller's store **once** (set `OWNER_SEED_PRODUCTS=false` in `.env`
to skip). DD → DD, CD → CD, RS → Reseller, SRP → Retailer. Exact duplicate rows are merged, same-name rows with
different prices get "(2)", rows marked PROMO become "while supplies last" promos, rows with out-of-order prices are
added hidden for you to check, and categories / units are guessed from the product name. Stock starts at 0.

### Changing the database

Add a new numbered file such as `database/postgres/003_something.sql` and write it so it can run more than once
(`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`). `start.bat` applies it automatically.

## URLs

| Service | URL |
| --- | --- |
| Website | http://localhost:3000 |
| pgAdmin | http://localhost:5052 |
| PHP API | http://localhost:8088/php/main.php |
| WebSocket | ws://localhost:3001 |

All ports and passwords live in `.env` (copied from `.env.example`).

## pgAdmin

Open http://localhost:5052. The **BeautyHub (Docker)** server is already registered. Expand it and enter the
database password (`DB_PASSWORD` in `.env`, default `beautyhub`) the first time.

To connect from another tool (e.g. a desktop pgAdmin), use host `localhost`, port `5432`, database `beautyhub`,
user `beautyhub`, password `beautyhub`.

The schema lives in `database/postgres/*.sql` (see "Changing the database" above).

## WebSocket

`server/ws-server.js` runs on port 3001.

Events are per store, so a seller only ever sees their own customers' activity.

- The seller's dashboard connects to `ws://localhost:3001` and sends `{"type":"subscribe","token":"<ws_token>"}`.
  The token comes from the `me` API and is signed by PHP with `WS_BROADCAST_SECRET`, so a browser can't subscribe to
  another seller's store.
- The backend pushes events with `POST http://localhost:3001/broadcast`, header `X-Broadcast-Secret: <WS_BROADCAST_SECRET>`
  and body `{"store_id": 1, "type": "...", "payload": {...}}`. `php/main.php` sends `member_joined` and `member_logged_in`.
- The **Live Activity** card (`app/components/LiveActivity.js`) shows the events and how many of the store's dashboards are open.

## Without the .bat files

```bash
cp .env.example .env
npm install
docker compose up -d --build
npm run dev:all      # Next.js + WebSocket server
```
