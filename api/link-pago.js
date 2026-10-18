// Función de Vercel (POST /api/link-pago): la usa ventas desde admin-pago.html para crear el enlace de pago
// de un pedido ya confirmado con el cliente. Pide la clave de ventas (PAGO_ADMIN_CLAVE) y devuelve un enlace
// firmado a pagar.html con pedido, monto, correo y nombre; nadie puede cambiar el monto sin invalidar la firma.
const W = require('./_webpay');
const { numeroPedido } = require('./pedido');

const MAX_INTENTOS_CLAVE = 10;
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function claveCorrecta(recibida, esperada) {
  // Se comparan los resúmenes SHA-256 para que el tiempo no dependa de cuántos caracteres coinciden.
  const resumen = async t => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(t))));
  const [a, b] = await Promise.all([resumen(recibida), resumen(esperada)]);
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a[i] ^ b[i];
  return diferencia === 0;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  if (!W.origenPropio(req)) return res.status(403).json({ ok: false, error: 'Origen no permitido.' });

  let cfg;
  const claveAdmin = process.env.PAGO_ADMIN_CLAVE;
  try {
    cfg = W.config();
    if (!claveAdmin) throw new W.ConfigError('Falta PAGO_ADMIN_CLAVE');
  } catch (error) {
    console.error(error.message);
    return res.status(503).json({ ok: false, error: 'El pago con Webpay no está configurado.' });
  }

  const body = W.leerCuerpo(req);
  if (!body) return res.status(400).json({ ok: false, error: 'Solicitud no válida.' });

  // Límite de intentos de clave por IP: 10 cada 15 minutos.
  const rl = `rl:${W.ipCliente(req)}`;
  const intentos = await W.redis(cfg, 'INCR', rl);
  if (intentos === 1) await W.redis(cfg, 'EXPIRE', rl, 900);
  if (intentos > MAX_INTENTOS_CLAVE) return res.status(429).json({ ok: false, error: 'Demasiados intentos. Espera 15 minutos.' });
  if (!(await claveCorrecta(body.clave ?? '', claveAdmin))) return res.status(401).json({ ok: false, error: 'Clave de ventas incorrecta.' });
  await W.redis(cfg, 'DEL', rl);

  const pedido = clean(body.pedido, 20).toUpperCase() || numeroPedido();
  const monto = Number(body.monto);
  const email = clean(body.email, 120).toLowerCase();
  const nombre = clean(body.nombre, 100);
  const detalle = clean(body.detalle, 200);
  const errores = [];
  if (!W.PEDIDO_RE.test(pedido)) errores.push('El número de pedido solo puede tener letras, números y guiones (3 a 20).');
  if (!Number.isInteger(monto) || monto < W.MONTO_MIN || monto > W.MONTO_MAX) errores.push(`El monto debe ser un número entero entre ${W.MONTO_MIN} y ${W.MONTO_MAX} pesos.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errores.push('Ingresa el correo del cliente.');
  if (nombre.length < 2) errores.push('Ingresa el nombre del cliente.');
  if (errores.length) return res.status(400).json({ ok: false, error: errores[0], errores });

  if (await W.redis(cfg, 'EXISTS', `pago:${pedido}`)) return res.status(409).json({ ok: false, error: `El pedido ${pedido} ya está pagado.` });

  const { d, f, vence } = await W.firmarEnlace(cfg, { p: pedido, m: monto, e: email, n: nombre, t: detalle });
  // Los datos van en el fragmento (#): no llegan a logs, a Analytics ni al Referer.
  const url = `https://${req.headers.host}/pagar.html#d=${d}&f=${f}`;
  return res.status(200).json({ ok: true, pedido, monto, url, vence, ambiente: cfg.ambiente });
}

module.exports = handler;
