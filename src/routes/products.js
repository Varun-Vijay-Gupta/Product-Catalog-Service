const express = require('express');
const prisma = require('../db');

const router = express.Router();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/*
 * OFFSET PAGINATION (e.g. LIMIT 20 OFFSET 10000) is slow on large datasets because
 * PostgreSQL must still read and discard the first 10,000 rows before returning the
 * next page. Cost grows linearly with page depth — page 5000 is much slower than page 1.
 *
 * CURSOR (KEYSET) PAGINATION is better because each request starts from a known
 * position (the cursor) and fetches only the next N rows. Work per page stays constant
 * regardless of how far the user has scrolled.
 *
 * We use the tuple (updated_at, id) as the cursor because ORDER BY is
 * updated_at DESC, id DESC. The id breaks ties when two rows share the same
 * updated_at, giving every row a unique position. The cursor means:
 *   "give me rows that come AFTER this position in the sort order"
 * which translates to:
 *   updated_at < cursorUpdatedAt
 *   OR (updated_at = cursorUpdatedAt AND id < cursorId)
 *
 * This prevents duplicates: once a row is passed, the next query excludes it
 * and every row with a greater (updated_at, id) in sort order. New inserts land
 * at the top (newer updated_at) and do not appear again on later pages. Rows
 * that existed when browsing started remain reachable via the cursor chain.
 *
 * INDEXES: Without a category filter, PostgreSQL uses products_updated_at_id_idx.
 * With category, it uses products_category_updated_at_id_idx for the filter + sort.
 */

router.get('/', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const category = req.query.category?.trim() || undefined;
    const cursorUpdatedAt = req.query.cursorUpdatedAt;
    const cursorId = req.query.cursorId;

    if (cursorUpdatedAt && !cursorId) {
      return res.status(400).json({ error: 'cursorId is required when cursorUpdatedAt is provided' });
    }
    if (cursorId && !cursorUpdatedAt) {
      return res.status(400).json({ error: 'cursorUpdatedAt is required when cursorId is provided' });
    }

    let where;
    try {
      where = buildWhereClause(category, cursorUpdatedAt, cursorId);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    // Fetch one extra row to detect whether another page exists.
    const products = await prisma.product.findMany({
      where,
      orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = products.length > limit;
    const page = hasMore ? products.slice(0, limit) : products;

    const response = {
      products: page.map(formatProduct),
      nextCursor: null,
    };

    if (hasMore && page.length > 0) {
      const last = page[page.length - 1];
      response.nextCursor = {
        updated_at: last.updated_at.toISOString(),
        id: last.id,
      };
    }

    res.json(response);
  } catch (error) {
    console.error('GET /products failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function parseLimit(rawLimit) {
  if (rawLimit === undefined || rawLimit === '') {
    return DEFAULT_LIMIT;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (Number.isNaN(limit) || limit < 1) {
    return DEFAULT_LIMIT;
  }

  return Math.min(limit, MAX_LIMIT);
}

function buildWhereClause(category, cursorUpdatedAt, cursorId) {
  const conditions = [];

  if (category) {
    conditions.push({ category });
  }

  if (cursorUpdatedAt && cursorId) {
    const cursorDate = new Date(cursorUpdatedAt);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new Error('Invalid cursorUpdatedAt');
    }

    // Rows strictly after the cursor in (updated_at DESC, id DESC) order.
    conditions.push({
      OR: [
        { updated_at: { lt: cursorDate } },
        {
          updated_at: cursorDate,
          id: { lt: cursorId },
        },
      ],
    });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { AND: conditions };
}

function formatProduct(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price.toString(),
    created_at: product.created_at.toISOString(),
    updated_at: product.updated_at.toISOString(),
  };
}

module.exports = router;
