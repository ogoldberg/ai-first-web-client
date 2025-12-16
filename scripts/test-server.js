#!/usr/bin/env node

/**
 * Test HTTP server with discoverable API patterns
 * This simulates a typical web application with:
 * - A main HTML page that loads data via API
 * - JSON API endpoints
 * - Console logs
 */

import http from 'http';

const PORT = 3456;

const server = http.createServer((req, res) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);

  // CORS headers for testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Main page with JavaScript that calls API
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Test E-commerce Site</title>
  <script>
    console.log('Page loading...');

    // Simulate fetching products from API
    fetch('/api/products')
      .then(r => r.json())
      .then(data => {
        console.log('Products loaded:', data.products.length);
        document.getElementById('products').innerHTML =
          data.products.map(p =>
            '<div class="product">' +
            '<h3>' + p.name + '</h3>' +
            '<p>$' + p.price + '</p>' +
            '</div>'
          ).join('');
      })
      .catch(err => console.error('Failed to load products:', err));

    // Simulate user analytics call
    fetch('/api/analytics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'page_view', page: '/' })
    });
  </script>
</head>
<body>
  <h1>Test E-commerce Store</h1>
  <div id="products">Loading products...</div>
</body>
</html>
    `);
    return;
  }

  // API endpoint: Get products
  if (req.url === '/api/products' || req.url.startsWith('/api/products?')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      products: [
        { id: 1 + (page - 1) * limit, name: 'Laptop', price: 999 },
        { id: 2 + (page - 1) * limit, name: 'Mouse', price: 29 },
        { id: 3 + (page - 1) * limit, name: 'Keyboard', price: 79 }
      ],
      pagination: {
        page,
        limit,
        total: 50
      },
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // API endpoint: Get single product
  if (req.url.match(/^\/api\/products\/\d+$/)) {
    const id = req.url.split('/').pop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: parseInt(id),
      name: 'Product ' + id,
      price: 99 + parseInt(id),
      description: 'A great product',
      inStock: true
    }));
    return;
  }

  // API endpoint: Analytics (should be detected but low confidence for bypass)
  if (req.url === '/api/analytics' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, tracked: true }));
    return;
  }

  // API endpoint: Search
  if (req.url.startsWith('/api/search?')) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const query = url.searchParams.get('q');

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      query,
      results: [
        { id: 1, name: `${query} - Product 1`, price: 99 },
        { id: 2, name: `${query} - Product 2`, price: 149 }
      ]
    }));
    return;
  }

  // Non-API request (should not be flagged as API)
  if (req.url === '/static/style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end('body { font-family: sans-serif; }');
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`\n🚀 Test server running on http://localhost:${PORT}`);
  console.log(`\n📊 Available endpoints:`);
  console.log(`   GET  / or /index.html - Main page`);
  console.log(`   GET  /api/products - List products`);
  console.log(`   GET  /api/products?page=1&limit=10 - Paginated products`);
  console.log(`   GET  /api/products/123 - Get single product`);
  console.log(`   GET  /api/search?q=laptop - Search products`);
  console.log(`   POST /api/analytics - Analytics tracking`);
  console.log(`\n✨ This server will help test:`);
  console.log(`   1. API discovery from network traffic`);
  console.log(`   2. Pattern learning and storage`);
  console.log(`   3. Confidence scoring`);
  console.log(`   4. Direct API execution\n`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Shutting down test server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
