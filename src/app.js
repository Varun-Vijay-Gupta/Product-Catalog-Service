require('dotenv').config();

const express = require('express');
const productsRouter = require('./routes/products');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.json({
    message: 'Product Catalog Service',
    endpoints: {
      health: '/health',
      products: '/products?limit=20',
      productsByCategory: '/products?category=Electronics&limit=20',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/products', productsRouter);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
