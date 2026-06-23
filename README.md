# Product Catalog Service

A simple REST API for browsing a large product catalog with **cursor-based pagination**. Built for clarity and interview explainability — no frameworks, no abstractions, just Express route handlers and Prisma queries.

## Tech Stack

- Node.js + Express.js
- PostgreSQL (Neon)
- Prisma ORM
- Render (deployment)

## Project Structure

```
src/
├── routes/
│   └── products.js    # GET /products with cursor pagination
├── prisma/
│   └── schema.prisma  # Product model and indexes
├── seed.js            # Batch seed (200k products)
├── app.js             # Express entry point
└── db.js              # Shared Prisma client
```

## Setup

### 1. Clone and install

```bash
npm install
```

### 2. Configure environment

Copy the example env file and set your Neon connection string:

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="postgresql://user:password@host.neon.tech/dbname?sslmode=require"
PORT=3000
```

### 3. Generate Prisma client

```bash
npm run db:generate
```

### 4. Run migrations

Development (creates migration files and applies them):

```bash
npm run db:migrate
```

Production / Render (apply existing migrations only):

```bash
npm run db:migrate:deploy
```

### 5. Seed the database

Inserts 200,000 products in batches of 5,000 using `createMany()`:

```bash
npm run db:seed
```

The seed script skips if products already exist. To re-seed, truncate the `products` table first.

### 6. Start the server

```bash
npm start
```

Development with auto-reload:

```bash
npm run dev
```

## API

### `GET /products`

Returns products ordered by `updated_at DESC, id DESC`.

| Query param        | Default | Description                                      |
|--------------------|---------|--------------------------------------------------|
| `limit`            | `20`    | Page size (max 100)                              |
| `category`         | —       | Filter by category (e.g. `Electronics`)          |
| `cursorUpdatedAt`  | —       | Cursor timestamp from previous response          |
| `cursorId`         | —       | Cursor UUID from previous response               |

Both cursor params must be sent together for the next page.

### Example requests

**First page (default limit 20):**

```bash
curl "http://localhost:3000/products"
```

**First page with category filter:**

```bash
curl "http://localhost:3000/products?category=Electronics&limit=10"
```

**Next page using cursor:**

```bash
curl "http://localhost:3000/products?limit=20&cursorUpdatedAt=2024-06-01T12:00:00.000Z&cursorId=550e8400-e29b-41d4-a716-446655440000"
```

**Sample response:**

```json
{
  "products": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Product 42",
      "category": "Electronics",
      "price": "123.45",
      "created_at": "2024-06-01T12:00:00.000Z",
      "updated_at": "2024-06-01T12:00:00.000Z"
    }
  ],
  "nextCursor": {
    "updated_at": "2024-06-01T12:00:00.000Z",
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

When there are no more pages, `nextCursor` is `null`.

### Health check

```bash
curl "http://localhost:3000/health"
```

## Deployment on Render

### 1. Push to GitHub

Create a repository and push this project.

### 2. Create a Neon database

1. Sign up at [neon.tech](https://neon.tech)
2. Create a project and copy the **pooled** connection string
3. Add `?sslmode=require` if not already present

### 3. Create a Web Service on Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your GitHub repo
3. Settings:
   - **Runtime:** Node
   - **Build Command:** `npm install && npm run db:generate && npm run db:migrate:deploy`
   - **Start Command:** `npm start`
4. Environment variables:
   - `DATABASE_URL` — your Neon connection string
   - `NODE_ENV` — `production`

### 4. Seed production (one time)

After the first deploy, run the seed from your local machine pointed at the production database, or use Render Shell:

```bash
npm run db:seed
```

Alternatively, add a one-off job in Render with start command `npm run db:seed`.

### 5. Verify

```bash
curl "https://your-app.onrender.com/health"
curl "https://your-app.onrender.com/products?limit=5"
```

## Design Choices

### Why cursor pagination instead of offset?

**Offset pagination** (`LIMIT 20 OFFSET 10000`) asks the database to scan and skip 10,000 rows on every deep page. Cost grows with page number, so browsing far into a 200k-row table becomes slow.

**Cursor pagination** stores the last seen position `(updated_at, id)` and asks for the next N rows *after* that position. Each page does the same amount of work — an index range scan — regardless of depth.

### Why `(updated_at, id)` as the cursor?

Sort order is `updated_at DESC, id DESC`. Many rows can share the same `updated_at`, so `id` breaks ties and gives every row a unique, stable position. The cursor query excludes everything at or above the last seen position, so:

- **No duplicates** — rows already returned are never fetched again.
- **Stable forward progress** — new inserts appear at the top (newer timestamps) and do not shift the cursor window for pages already fetched.

### Why these indexes?

| Index | Used when |
|-------|-----------|
| `(updated_at DESC, id DESC)` | Listing all products, paginated |
| `(category, updated_at DESC, id DESC)` | Filtering by category + pagination |

PostgreSQL can satisfy `WHERE category = ? ORDER BY updated_at DESC, id DESC` from the composite index without a separate sort step.

### Why batch seeding?

Inserting 200,000 rows one at a time means 200,000 round trips to the database. Batching 5,000 rows per `createMany()` call reduces that to 40 SQL statements — much faster and easier on Neon connection limits.

### Why keep the code simple?

This is a take-home assignment meant to be explained in a live interview. Straightforward route handlers, inline Prisma queries, and comments at the decision points make it easy to walk through without hunting through layers of abstraction.
