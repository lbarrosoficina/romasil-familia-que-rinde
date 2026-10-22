const {
  calculateOrder,
  createSessionId,
  getPublicOrigin,
  getWebpayConfig,
  isValidToken,
  webpayHeaders
} = require('./_webpay');

function orderNumber(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('es-CL', {
    timeZone: 'America/Santiago', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]));
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const random = Array.from({ length: 3 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  return `R${parts.month}${parts.day}-${parts.hour}${parts.minute}-${random}`;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) {
    return res.status(403).json({ ok: false, error: 'Origen no permitido.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Solicitud no válida.' });

  const buyOrder = orderNumber();
  const order = calculateOrder(body.items);
  if (!order) return res.status(400).json({ ok: false, error: 'Tu pedido está vacío o ya no está disponible.' });

  let config;
  let publicOrigin;
  try {
    config = getWebpayConfig();
    publicOrigin = getPublicOrigin(req);
  } catch (error) {
    console.error('Configuración Webpay incompleta', error);
    return res.status(503).json({ ok: false, error: 'Webpay todavía no está configurado.' });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(config.apiBase, {
      method: 'POST',
      headers: webpayHeaders(config),
      body: JSON.stringify({
        buy_order: buyOrder,
        session_id: createSessionId(),
        amount: order.total,
        return_url: `${publicOrigin}/api/webpay-retorno`
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !isValidToken(result?.token) || !result?.url) {
      console.error('Transbank rechazó la creación', response.status, result);
      return res.status(502).json({ ok: false, error: 'No pudimos iniciar el pago con Webpay.' });
    }
    const paymentUrl = new URL(result.url);
    const allowedHost = config.environment === 'production' ? 'webpay3g.transbank.cl' : 'webpay3gint.transbank.cl';
    if (paymentUrl.protocol !== 'https:' || paymentUrl.hostname !== allowedHost) {
      console.error('Transbank devolvió una URL inesperada', result.url);
      return res.status(502).json({ ok: false, error: 'Webpay devolvió una respuesta no válida.' });
    }
    return res.status(200).json({ ok: true, token: result.token, url: result.url, amount: order.total, orderNumber: buyOrder });
  } catch (error) {
    console.error('No se pudo crear la transacción Webpay', error);
    return res.status(502).json({ ok: false, error: 'No pudimos conectar con Webpay. Intenta nuevamente.' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = handler;
