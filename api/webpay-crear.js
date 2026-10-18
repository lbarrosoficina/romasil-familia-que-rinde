// Función de Vercel (POST /api/webpay-crear): la usa pagar.html con el enlace firmado { d, f }.
//   accion "consultar": devuelve los datos del pedido para mostrarlos y si ya está pagado.
//   accion "pagar": crea la transacción en Webpay Plus y devuelve { url, token }; el navegador envía token_ws a esa url.
// La transacción se crea recién al pulsar "Pagar", porque el token de Transbank vence a los 5 minutos.
const W = require('./_webpay');

const MAX_INTENTOS_PAGO = 99;

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  if (!W.origenPropio(req)) return res.status(403).json({ ok: false, error: 'Origen no permitido.' });

  let cfg;
  try { cfg = W.config(); } catch (error) {
    console.error(error.message);
    return res.status(503).json({ ok: false, error: 'El pago con Webpay no está disponible en este momento.' });
  }

  const body = W.leerCuerpo(req);
  if (!body) return res.status(400).json({ ok: false, error: 'Solicitud no válida.' });
  const { datos, error } = await W.verificarEnlace(cfg, body.d, body.f);
  if (error) return res.status(400).json({ ok: false, error });
  const pedido = datos.p;

  try {
    const pagado = await W.redisJson(cfg, `pago:${pedido}`);
    if (body.accion === 'consultar') {
      return res.status(200).json({ ok: true, pedido, monto: datos.m, nombre: datos.n, detalle: datos.t || '', vence: datos.x, pagado: Boolean(pagado), ambiente: cfg.ambiente });
    }
    if (body.accion !== 'pagar') return res.status(400).json({ ok: false, error: 'Acción no válida.' });
    if (pagado) return res.status(409).json({ ok: false, pagado: true, error: `El pedido ${pedido} ya está pagado.` });

    const intento = await W.redis(cfg, 'INCR', `intento:${pedido}`);
    if (intento === 1) await W.redis(cfg, 'EXPIRE', `intento:${pedido}`, W.UN_ANIO);
    if (intento > MAX_INTENTOS_PAGO) return res.status(429).json({ ok: false, error: 'Superaste los intentos de pago de este pedido. Escríbenos por WhatsApp.' });

    const buyOrder = `${pedido}-${intento}`;
    const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
    const tx = await W.crearTransaccion(cfg, { buyOrder, sessionId, amount: datos.m, returnUrl: `https://${req.headers.host}/api/webpay-retorno` });
    if (!tx.token || !tx.url) throw new Error('Transbank no devolvió token o url');

    await W.redis(cfg, 'SET', `tx:${tx.token}`, JSON.stringify({ pedido, monto: datos.m, email: datos.e, nombre: datos.n, detalle: datos.t || '', buyOrder, sessionId, d: body.d, f: body.f }), 'EX', W.SIETE_DIAS);
    // Si el formulario de Webpay vence, al retorno solo llega la orden de compra (sin token).
    await W.redis(cfg, 'SET', `orden:${buyOrder}`, tx.token, 'EX', W.SIETE_DIAS);
    return res.status(200).json({ ok: true, url: tx.url, token: tx.token });
  } catch (err) {
    console.error('No se pudo preparar el pago', pedido, err);
    return res.status(502).json({ ok: false, error: 'No pudimos conectar con Webpay. Intenta de nuevo en unos minutos.' });
  }
}

module.exports = handler;
