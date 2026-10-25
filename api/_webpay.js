const crypto = require('node:crypto');
const CATALOG = require('./_catalogo.json');

const SHIPPING_COST = 3500;
const FREE_SHIPPING_THRESHOLD = 50000;
const CARD_SURCHARGE_RATE = 0.03;
const MAX_QUANTITY = 99;
const MAX_LINES = 30;

function calculateOrder(items, { cardSurcharge = false } = {}) {
  const quantities = new Map();
  const lines = Array.isArray(items) ? items.slice(0, MAX_LINES) : [];
  for (const item of lines) {
    const id = String(item?.id ?? '');
    const quantity = Number(item?.quantity);
    if (!Object.hasOwn(CATALOG, id) || !Number.isInteger(quantity) || quantity < 1) continue;
    quantities.set(id, Math.min((quantities.get(id) || 0) + quantity, MAX_QUANTITY));
  }
  if (!quantities.size) return null;

  const products = [...quantities].map(([id, quantity]) => ({
    id,
    quantity,
    ...CATALOG[id],
    subtotal: CATALOG[id].price * quantity
  }));
  const subtotal = products.reduce((sum, product) => sum + product.subtotal, 0);
  const testOnly = products.every(product => product.id === 'producto-test');
  const shipping = testOnly || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const baseTotal = subtotal + shipping;
  const surcharge = cardSurcharge && !testOnly ? Math.round(baseTotal * CARD_SURCHARGE_RATE) : 0;
  return { products, subtotal, shipping, baseTotal, surcharge, total: baseTotal + surcharge };
}

function getWebpayConfig(env = process.env) {
  const requested = String(env.TRANSBANK_ENVIRONMENT || '').toLowerCase();
  const isProduction = requested === 'production';
  const isIntegration = requested === 'integration' || (!requested && env.VERCEL_ENV !== 'production');
  if (!isProduction && !isIntegration) {
    throw new Error('Configura TRANSBANK_ENVIRONMENT como integration o production.');
  }

  const commerceCode = env.TRANSBANK_COMMERCE_CODE;
  const apiKey = env.TRANSBANK_API_KEY;
  if (!commerceCode || !apiKey) throw new Error('Faltan las credenciales de Transbank para el ambiente configurado.');

  return {
    environment: isProduction ? 'production' : 'integration',
    commerceCode,
    apiKey,
    apiBase: isProduction
      ? 'https://webpay3g.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions'
      : 'https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2/transactions'
  };
}

function webpayHeaders(config) {
  return {
    'Tbk-Api-Key-Id': config.commerceCode,
    'Tbk-Api-Key-Secret': config.apiKey,
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function getPublicOrigin(req) {
  const configured = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') throw new Error('PUBLIC_SITE_URL debe usar HTTPS.');
    return url.origin;
  }
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(forwardedHost)) throw new Error('Host público no válido.');
  const protocol = forwardedHost.startsWith('localhost:') ? 'http' : 'https';
  return `${protocol}://${forwardedHost}`;
}

function createSessionId() {
  return `S-${crypto.randomBytes(16).toString('hex')}`;
}

function isValidToken(token) {
  return /^[a-f0-9]{64}$/i.test(String(token || ''));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

module.exports = {
  CARD_SURCHARGE_RATE,
  calculateOrder,
  createSessionId,
  escapeHtml,
  getPublicOrigin,
  getWebpayConfig,
  isValidToken,
  webpayHeaders
};
