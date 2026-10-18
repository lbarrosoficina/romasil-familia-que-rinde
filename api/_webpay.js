// Piezas comunes del pago con Webpay Plus (API REST v1.2 de Transbank), del enlace de pago firmado y de Redis (Upstash).
// Los archivos de api/ que empiezan con "_" no son rutas: Vercel no los publica.
// Todo sale de variables de entorno de Vercel; ninguna clave va en el código (ver docs/WEBPAY.md).
// Usa solo fetch y Web Crypto (globales en Node 20 de Vercel), sin dependencias npm.

const HOSTS = { integracion: 'https://webpay3gint.transbank.cl', produccion: 'https://webpay3g.transbank.cl' };
const TBK_PATH = '/rswebpaytransaction/api/webpay/v1.2/transactions';
const TBK_TIMEOUT_MS = 10000;
const MONTO_MIN = 50;
const MONTO_MAX = 5000000;
const VIGENCIA_ENLACE_S = 48 * 3600;
// Número de pedido: el de la web (R1014-1608-ZLE) u otro corto en mayúsculas. Deja espacio para "-intento" en buy_order (máx. 26).
const PEDIDO_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;

class ConfigError extends Error {}

function config() {
  const env = process.env;
  const ambiente = env.TBK_AMBIENTE;
  if (!HOSTS[ambiente]) throw new ConfigError('TBK_AMBIENTE debe ser "integracion" o "produccion"');
  const faltan = ['TBK_CODIGO_COMERCIO', 'TBK_API_KEY', 'PAGO_FIRMA_SECRETO'].filter(k => !env[k]);
  const redisUrl = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const redisToken = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) faltan.push('KV_REST_API_URL/KV_REST_API_TOKEN');
  if (faltan.length) throw new ConfigError(`Faltan variables de entorno: ${faltan.join(', ')}`);
  return { ambiente, host: HOSTS[ambiente], codigo: env.TBK_CODIGO_COMERCIO, apiKey: env.TBK_API_KEY, secreto: env.PAGO_FIRMA_SECRETO, redisUrl, redisToken };
}

// ---------- Transbank ----------
class TbkError extends Error {
  constructor(status, detalle) { super(`Transbank respondió ${status}: ${detalle}`); this.status = status; }
}

async function tbk(cfg, method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TBK_TIMEOUT_MS);
  try {
    const response = await fetch(cfg.host + TBK_PATH + path, {
      method,
      headers: { 'Tbk-Api-Key-Id': cfg.codigo, 'Tbk-Api-Key-Secret': cfg.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const texto = await response.text();
    if (!response.ok) throw new TbkError(response.status, texto.slice(0, 300));
    return texto ? JSON.parse(texto) : {};
  } finally {
    clearTimeout(timer);
  }
}

const crearTransaccion = (cfg, { buyOrder, sessionId, amount, returnUrl }) =>
  tbk(cfg, 'POST', '', { buy_order: buyOrder, session_id: sessionId, amount, return_url: returnUrl });
const confirmarTransaccion = (cfg, token) => tbk(cfg, 'PUT', `/${encodeURIComponent(token)}`);
const estadoTransaccion = (cfg, token) => tbk(cfg, 'GET', `/${encodeURIComponent(token)}`);
const reembolsar = (cfg, token, amount) => tbk(cfg, 'POST', `/${encodeURIComponent(token)}/refunds`, { amount });

// Aprobado solo si Transbank lo autoriza y coincide con lo que se cobró (monto y orden de compra).
function aprobada(resultado, esperado) {
  return resultado?.response_code === 0 && resultado?.status === 'AUTHORIZED' &&
    Number(resultado.amount) === esperado.monto && resultado.buy_order === esperado.buyOrder;
}

// ---------- Enlace de pago firmado ----------
// d = base64url(JSON { p: pedido, m: monto, e: correo, n: nombre, x: vence (s) }), f = base64url(HMAC-SHA256(d)).
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const desdeB64url = texto => Uint8Array.from(atob(texto.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function claveHmac(secreto) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function firmarEnlace(cfg, datos, ahora = Date.now()) {
  const contenido = { ...datos, x: Math.floor(ahora / 1000) + VIGENCIA_ENLACE_S };
  const d = b64url(new TextEncoder().encode(JSON.stringify(contenido)));
  const f = b64url(await crypto.subtle.sign('HMAC', await claveHmac(cfg.secreto), new TextEncoder().encode(d)));
  return { d, f, vence: contenido.x };
}

// Devuelve { datos } o { error }. crypto.subtle.verify compara en tiempo constante.
async function verificarEnlace(cfg, d, f, ahora = Date.now()) {
  if (typeof d !== 'string' || typeof f !== 'string' || d.length > 1500 || f.length > 100) return { error: 'Enlace de pago incompleto.' };
  let valido = false;
  try { valido = await crypto.subtle.verify('HMAC', await claveHmac(cfg.secreto), desdeB64url(f), new TextEncoder().encode(d)); } catch { valido = false; }
  if (!valido) return { error: 'El enlace de pago no es válido. Pídenos uno nuevo por WhatsApp.' };
  let datos;
  try { datos = JSON.parse(new TextDecoder().decode(desdeB64url(d))); } catch { return { error: 'El enlace de pago no es válido.' }; }
  if (!datos || datos.x * 1000 < ahora) return { error: 'El enlace de pago venció. Pídenos uno nuevo por WhatsApp.' };
  return { datos };
}

// ---------- Redis (Upstash REST) ----------
async function redis(cfg, ...comando) {
  const response = await fetch(cfg.redisUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.redisToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando.map(String))
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.error) throw new Error(`Redis respondió ${response.status}: ${json?.error || ''}`);
  return json.result;
}
const redisJson = async (cfg, clave) => { const v = await redis(cfg, 'GET', clave); return v ? JSON.parse(v) : null; };
const SIETE_DIAS = 7 * 24 * 3600;
const UN_ANIO = 365 * 24 * 3600;

// Claves:
//   pago:{pedido}   pago aprobado (1 año). Se escribe con NX: un pedido no se marca pagado dos veces.
//   intento:{pedido} contador de intentos, para buy_order único por transacción.
//   tx:{token}      datos de la transacción creada, para el retorno (7 días, lo que Transbank permite consultar).
//   orden:{buy_order} token de esa orden, para el retorno por tiempo excedido, que no trae token.
//   lock:{token}    evita confirmar el mismo token dos veces a la vez (60 s).
//   res:{token}     resultado ya procesado de un token, para recargas del retorno.
//   rl:{ip}         intentos de clave en la página de ventas (15 min).

// ---------- Utilidades HTTP ----------
function ipCliente(req) {
  return String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'desconocida').split(',')[0].trim();
}
function origenPropio(req) {
  const origin = req.headers.origin;
  return !origin || origin === `https://${req.headers.host}`;
}
function leerCuerpo(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = Object.fromEntries(new URLSearchParams(body)); }
  }
  return body && typeof body === 'object' ? body : null;
}
function redirigir(res, url) {
  res.statusCode = 303;
  res.setHeader('Location', url);
  res.end();
}

module.exports = {
  HOSTS, MONTO_MIN, MONTO_MAX, PEDIDO_RE, SIETE_DIAS, UN_ANIO, ConfigError, TbkError,
  config, crearTransaccion, confirmarTransaccion, estadoTransaccion, reembolsar, aprobada,
  firmarEnlace, verificarEnlace, redis, redisJson, ipCliente, origenPropio, leerCuerpo, redirigir
};
