const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateOrder, getPublicOrigin, getWebpayConfig, isValidToken } = require('../api/_webpay');
const createPayment = require('../api/webpay-crear');
const paymentReturn = require('../api/webpay-retorno');

test('recalcula precios y despacho desde el catálogo del servidor', () => {
  const order = calculateOrder([
    { id: 'filetillo-pollo', quantity: 2, price: 1 },
    { id: 'atun-steak', quantity: 1 }
  ]);
  assert.equal(order.subtotal, 14390);
  assert.equal(order.shipping, 3500);
  assert.equal(order.total, 17890);
});

test('aplica despacho gratis y consolida líneas repetidas', () => {
  const order = calculateOrder([
    { id: 'malaya-cerdo', quantity: 2 },
    { id: 'malaya-cerdo', quantity: 2 }
  ]);
  assert.equal(order.products.length, 1);
  assert.equal(order.products[0].quantity, 4);
  assert.equal(order.total, 52000);
  assert.equal(order.shipping, 0);
});

test('descarta productos y cantidades manipuladas', () => {
  assert.equal(calculateOrder([{ id: 'inventado', quantity: 1 }]), null);
  assert.equal(calculateOrder([{ id: 'filetillo-pollo', quantity: 1.5 }]), null);
  assert.equal(calculateOrder([{ id: 'filetillo-pollo', quantity: -1 }]), null);
});

test('producción falla de forma segura sin credenciales', () => {
  assert.throws(() => getWebpayConfig({ VERCEL_ENV: 'production' }), /TRANSBANK_ENVIRONMENT/);
  assert.throws(() => getWebpayConfig({ TRANSBANK_ENVIRONMENT: 'production' }), /credenciales/);
});

test('integración usa exclusivamente el host de pruebas', () => {
  const config = getWebpayConfig({
    TRANSBANK_ENVIRONMENT: 'integration',
    TRANSBANK_COMMERCE_CODE: 'codigo-de-prueba',
    TRANSBANK_API_KEY: 'llave-de-prueba'
  });
  assert.equal(config.environment, 'integration');
  assert.equal(new URL(config.apiBase).hostname, 'webpay3gint.transbank.cl');
});

test('valida tokens y construye el retorno público', () => {
  assert.equal(isValidToken('a'.repeat(64)), true);
  assert.equal(isValidToken('javascript:alert(1)'), false);
  assert.equal(getPublicOrigin({ headers: { host: 'preview.example.cl' } }), 'https://preview.example.cl');
  assert.throws(() => getPublicOrigin({ headers: { host: 'bad.example/path' } }), /Host público/);
});

test('el endpoint crea la transacción con el monto del servidor y retorno propio', async () => {
  const originalFetch = global.fetch;
  const originalEnvironment = process.env.TRANSBANK_ENVIRONMENT;
  const originalCommerceCode = process.env.TRANSBANK_COMMERCE_CODE;
  const originalApiKey = process.env.TRANSBANK_API_KEY;
  process.env.TRANSBANK_ENVIRONMENT = 'integration';
  process.env.TRANSBANK_COMMERCE_CODE = 'codigo-de-prueba';
  process.env.TRANSBANK_API_KEY = 'llave-de-prueba';
  let sentRequest;
  global.fetch = async (url, options) => {
    sentRequest = { url, options, body: JSON.parse(options.body) };
    return { ok: true, status: 200, json: async () => ({ token: 'a'.repeat(64), url: 'https://webpay3gint.transbank.cl/webpayserver/initTransaction' }) };
  };
  const req = {
    method: 'POST',
    headers: { host: 'preview.example.cl', origin: 'https://preview.example.cl' },
    body: { items: [{ id: 'filetillo-pollo', quantity: 2 }] }
  };
  const response = { statusCode: 0, body: null, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  try {
    await createPayment(req, response);
  } finally {
    global.fetch = originalFetch;
    if (originalEnvironment === undefined) delete process.env.TRANSBANK_ENVIRONMENT;
    else process.env.TRANSBANK_ENVIRONMENT = originalEnvironment;
    if (originalCommerceCode === undefined) delete process.env.TRANSBANK_COMMERCE_CODE;
    else process.env.TRANSBANK_COMMERCE_CODE = originalCommerceCode;
    if (originalApiKey === undefined) delete process.env.TRANSBANK_API_KEY;
    else process.env.TRANSBANK_API_KEY = originalApiKey;
  }
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.match(response.body.orderNumber, /^R\d{4}-\d{4}-[A-HJ-NP-Z2-9]{3}$/);
  assert.equal(sentRequest.body.amount, 14900);
  assert.equal(sentRequest.body.return_url, 'https://preview.example.cl/api/webpay-retorno');
  assert.equal(new URL(sentRequest.url).hostname, 'webpay3gint.transbank.cl');
});

test('un retorno cancelado no borra el carrito ni intenta confirmar un token', async () => {
  const req = { method: 'POST', body: { TBK_TOKEN: 'cancelled' }, query: {} };
  const response = {
    statusCode: 0, body: '', headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; }
  };
  await paymentReturn(req, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /data-payment-result="failure"/);
  assert.match(response.body, /Pago no completado/);
});
