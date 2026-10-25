const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { signIntranetPayload } = require('../api/_intranet');
const availability = require('../api/disponibilidad');
const catalog = require('../api/_catalogo.json');

test('firma los eventos para la intranet con HMAC SHA-256', () => {
  const secret = 'secreto-compartido';
  const timestamp = '1792900000';
  const body = '{"event":"order.created"}';
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  assert.equal(signIntranetPayload(secret, timestamp, body), expected);
});

test('cada producto vendible tiene un SKU estable para el inventario', () => {
  const entries = Object.entries(catalog);
  assert.ok(entries.length > 0);
  for (const [id, product] of entries) {
    assert.match(product.inventorySku, /^[A-Z0-9-]+$/, `${id} no tiene inventorySku válido`);
  }
  assert.equal(new Set(entries.map(([, product]) => product.inventorySku)).size, entries.length);
});

test('la web traduce la disponibilidad de SKU a productos del catálogo', async () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.INTRANET_API_URL;
  process.env.INTRANET_API_URL = 'https://intranet.example';
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    items: [{ sku: 'WEB-TEST-050', available: 7, status: 'available' }], updatedAt: '2026-10-25T12:00:00.000Z'
  }) });
  const response = { statusCode: 0, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await availability({ method: 'GET' }, response);
  } finally {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.INTRANET_API_URL;
    else process.env.INTRANET_API_URL = originalUrl;
  }
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.items, [{ id: 'producto-test', available: 7, status: 'available' }]);
});
