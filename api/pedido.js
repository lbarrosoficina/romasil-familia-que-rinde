// Función de Vercel (POST /api/pedido): recibe la solicitud de pedido del formulario de la web,
// la valida, recalcula los totales con el catálogo y la envía por correo con Resend:
// un aviso a ventas@ y una confirmación al cliente.
// Si esta función falla, app.js envía el pedido por FormSubmit como respaldo.
// Necesita la variable de entorno RESEND_API_KEY en Vercel; la clave nunca va en el código.
const CATALOG = require('./_catalogo.json');

const VENTAS = 'ventas@congeladosromasil.cl';
const FROM_VENTAS = 'Pedidos web Romasil <ventas@congeladosromasil.cl>';
const FROM_CLIENTE = 'Congelados Romasil <ventas@congeladosromasil.cl>';
const WHATSAPP = '56962319733';
const SITE = 'https://congeladosromasil.cl';
const SHIPPING_COST = 3500;
const FREE_SHIPPING_THRESHOLD = 50000;
const MAX_QUANTITY = 99;
const MAX_LINES = 30;
const COMMUNES = ['Providencia', 'Ñuñoa', 'Las Condes'];
const ORDER_PATTERN = /^R\d{4}-\d{4}-[A-HJ-NP-Z2-9]{3}$/;

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const clean = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Devuelve { errores: [...] } o { pedido } con los totales calculados en el servidor.
function validarPedido(body) {
  const errores = [];
  const cliente = {
    name: clean(body.name, 100),
    phone: clean(body.phone, 30),
    email: clean(body.email, 120).toLowerCase(),
    addressLine1: clean(body.addressLine1, 150),
    addressLine2: clean(body.addressLine2, 100),
    commune: clean(body.commune, 40)
  };
  if (cliente.name.length < 2) errores.push('Ingresa tu nombre.');
  const phoneDigits = cliente.phone.replace(/\D/g, '');
  if (phoneDigits.length < 8 || phoneDigits.length > 15) errores.push('Ingresa un teléfono válido.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cliente.email)) errores.push('Ingresa un correo electrónico válido.');
  if (cliente.addressLine1.length < 3) errores.push('Ingresa tu calle y número.');
  if (!COMMUNES.includes(cliente.commune)) errores.push('Selecciona una comuna con despacho.');
  if (body.privacyConsent !== true) errores.push('Debes aceptar la política de privacidad.');

  const cantidades = new Map();
  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_LINES) : [];
  for (const item of items) {
    const id = String(item?.id ?? '');
    const quantity = Number(item?.quantity);
    if (!Object.hasOwn(CATALOG, id) || !Number.isInteger(quantity) || quantity < 1) continue;
    cantidades.set(id, Math.min((cantidades.get(id) || 0) + quantity, MAX_QUANTITY));
  }
  if (!cantidades.size) errores.push('Tu pedido está vacío o tiene productos que ya no están disponibles.');
  if (errores.length) return { errores };

  const lineas = [...cantidades].map(([id, quantity]) => ({ id, quantity, ...CATALOG[id], subtotal: CATALOG[id].price * quantity }));
  const subtotal = lineas.reduce((sum, line) => sum + line.subtotal, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  return { pedido: { cliente, phoneDigits, lineas, subtotal, shipping, total: subtotal + shipping, porKilo: lineas.some(line => line.pricedByKilo) } };
}

// Número de pedido legible: R + fecha y hora de Santiago + 3 letras al azar (ej. R1014-1542-K7Q).
function numeroPedido(fecha = new Date()) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(fecha).map(p => [p.type, p.value]));
  const azar = Array.from({ length: 3 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  return `R${partes.month}${partes.day}-${partes.hour}${partes.minute}-${azar}`;
}

function fechaChile(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' }).format(fecha);
}

// ---------- Correos ----------
const C = { navy: '#1E3A8A', ink: '#2A1F14', muted: '#5E5446', line: '#EFE3C8', cream: '#FFF4D6', yellow: '#FBBF24' };

function tablaProductos(p) {
  const th = 'padding:10px 8px;font-size:13px;color:#ffffff;font-weight:bold;';
  const td = `padding:10px 8px;font-size:14px;color:${C.ink};border-bottom:1px solid ${C.line};`;
  const filas = p.lineas.map(l => `<tr>
<td style="${td}">${escapeHtml(l.name)}${l.pricedByKilo ? '<br><span style="font-size:12px;color:' + C.muted + ';">precio por kg, peso por confirmar</span>' : ''}</td>
<td style="${td}text-align:center;">${l.quantity}</td>
<td style="${td}text-align:right;white-space:nowrap;">${money.format(l.price)}${l.pricedByKilo ? '/kg' : ''}</td>
<td style="${td}text-align:right;white-space:nowrap;">${money.format(l.subtotal)}</td></tr>`).join('');
  const total = (label, value, strong) => `<tr><td colspan="3" style="padding:6px 8px;text-align:right;font-size:14px;color:${strong ? C.ink : C.muted};${strong ? 'font-weight:bold;' : ''}">${label}</td><td style="padding:6px 8px;text-align:right;font-size:14px;color:${C.ink};white-space:nowrap;${strong ? 'font-weight:bold;' : ''}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
<tr style="background:${C.navy};"><td style="${th}text-align:left;">Producto</td><td style="${th}text-align:center;">Unidades</td><td style="${th}text-align:right;">Precio</td><td style="${th}text-align:right;">Subtotal</td></tr>
${filas}
${total('Subtotal de productos', money.format(p.subtotal))}
${total('Despacho', p.shipping === 0 ? 'Gratis' : money.format(p.shipping))}
${total('Total a pagar', money.format(p.total), true)}
</table>${p.porKilo ? `<p style="margin:8px 0 0;font-size:12px;color:${C.muted};">Los productos por kg se estiman con 1 kg por unidad. El total y el despacho final dependen del peso real.</p>` : ''}`;
}

function marco(contenido) {
  return `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.cream};font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.cream};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td style="padding:20px 24px;border-bottom:4px solid ${C.yellow};"><img src="${SITE}/assets/romasil-logo-horizontal.png" width="160" height="50" alt="Congelados Romasil" style="display:block;border:0;"></td></tr>
<tr><td style="padding:24px;">${contenido}</td></tr>
<tr><td style="padding:16px 24px;background:${C.cream};font-size:12px;line-height:1.5;color:${C.muted};">Congelados Romasil · González &amp; González Comercializadora de Alimentos SpA · Antonio Bellet 193, oficina 1210, Providencia · <a href="${SITE}/politica-de-privacidad.html" style="color:${C.navy};">Política de privacidad</a></td></tr>
</table></td></tr></table></body></html>`;
}

function correoVentas(p, numero, fecha) {
  const c = p.cliente;
  const dato = (label, value) => `<tr><td style="padding:4px 0;width:130px;font-size:14px;color:${C.muted};vertical-align:top;">${label}</td><td style="padding:4px 0;font-size:14px;color:${C.ink};">${value}</td></tr>`;
  const waCliente = `https://wa.me/${p.phoneDigits.length === 9 ? '56' + p.phoneDigits : p.phoneDigits}`;
  const html = marco(`<p style="margin:0 0 4px;font-size:13px;color:${C.muted};">Nuevo pedido desde congeladosromasil.cl</p>
<h1 style="margin:0 0 20px;font-size:22px;color:${C.navy};">Pedido ${numero}</h1>
<h2 style="margin:0 0 8px;font-size:15px;color:${C.ink};">Datos del cliente</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
${dato('Nombre', escapeHtml(c.name))}
${dato('Teléfono', `<a href="tel:+${escapeHtml(p.phoneDigits)}" style="color:${C.navy};">${escapeHtml(c.phone)}</a>`)}
${dato('Correo', `<a href="mailto:${escapeHtml(c.email)}" style="color:${C.navy};">${escapeHtml(c.email)}</a>`)}
${dato('Dirección', escapeHtml(c.addressLine1) + (c.addressLine2 ? ', ' + escapeHtml(c.addressLine2) : ''))}
${dato('Comuna', escapeHtml(c.commune))}
</table>
<h2 style="margin:0 0 8px;font-size:15px;color:${C.ink};">Productos</h2>
${tablaProductos(p)}
<p style="margin:24px 0 0;"><a href="${waCliente}" style="display:inline-block;background:${C.navy};color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:999px;">Escribir al cliente por WhatsApp</a></p>
<p style="margin:20px 0 0;font-size:12px;color:${C.muted};">Solicitud recibida el ${escapeHtml(fecha)}. El cliente aceptó la política de privacidad. Responde este correo para escribirle directamente.</p>`);
  const text = `Nuevo pedido ${numero} (${fecha})\n\nCliente: ${c.name}\nTeléfono: ${c.phone}\nCorreo: ${c.email}\nDirección: ${c.addressLine1}${c.addressLine2 ? ', ' + c.addressLine2 : ''}\nComuna: ${c.commune}\n\n` + textoProductos(p);
  return { from: FROM_VENTAS, to: [VENTAS], reply_to: c.email, subject: `Nuevo pedido ${numero} · ${c.name} · ${money.format(p.total)}`, html, text };
}

function correoCliente(p, numero) {
  const c = p.cliente;
  const nombre = c.name.split(' ')[0];
  const paso = (n, titulo, texto) => `<tr><td style="padding:6px 12px 6px 0;vertical-align:top;"><div style="width:28px;height:28px;line-height:28px;border-radius:50%;background:${C.yellow};color:${C.ink};font-weight:bold;text-align:center;font-size:14px;">${n}</div></td><td style="padding:6px 0;font-size:14px;line-height:1.5;color:${C.ink};"><strong>${titulo}</strong><br>${texto}</td></tr>`;
  const html = marco(`<h1 style="margin:0 0 12px;font-size:22px;color:${C.navy};">¡Gracias por tu pedido, ${escapeHtml(nombre)}!</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${C.ink};">Recibimos tu solicitud <strong>${numero}</strong> y ya la estamos revisando.</p>
${tablaProductos(p)}
<p style="margin:16px 0 24px;font-size:14px;color:${C.ink};"><strong>Despacho a:</strong> ${escapeHtml(c.addressLine1)}${c.addressLine2 ? ', ' + escapeHtml(c.addressLine2) : ''}, ${escapeHtml(c.commune)}</p>
<h2 style="margin:0 0 8px;font-size:16px;color:${C.navy};">¿Qué sigue?</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
${paso(1, 'Pagas con Webpay', 'Al enviar tus datos te dirigimos al sitio seguro de Transbank.')}
${paso(2, 'Coordinamos la entrega', 'Cuando el pago sea autorizado, te contactaremos para confirmar la fecha y franja de despacho.')}
${paso(3, 'Recibes en frío', 'Tu pedido llega congelado en 24 a 48 horas.')}
</table>
<p style="margin:0 0 20px;padding:12px 16px;background:${C.cream};border-radius:12px;font-size:13px;line-height:1.5;color:${C.ink};">Este correo confirma que registramos el pedido, pero no confirma el pago. Webpay mostrará el resultado de la transacción y te avisaremos cuando el pago quede autorizado.</p>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${C.ink};">¿Dudas o quieres cambiar algo? Responde este correo o escríbenos por WhatsApp. Atendemos de lunes a domingo, de 08:00 a 20:00.</p>
<p style="margin:0 0 20px;"><a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, tengo una consulta sobre mi pedido ' + numero)}" style="display:inline-block;background:#15803D;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:999px;">Escribir por WhatsApp</a></p>
<p style="margin:0;font-size:14px;color:${C.ink};">Un abrazo,<br><strong>Equipo Congelados Romasil</strong></p>`);
  const text = `¡Gracias por tu pedido, ${nombre}!\n\nRecibimos tu solicitud ${numero} y ya la estamos revisando.\n\n` + textoProductos(p) +
    `\nDespacho a: ${c.addressLine1}${c.addressLine2 ? ', ' + c.addressLine2 : ''}, ${c.commune}\n\n¿Qué sigue?\n1. Pagas con Webpay en el sitio seguro de Transbank.\n2. Cuando el pago sea autorizado, coordinamos la entrega contigo.\n3. Recibes en frío: tu pedido llega congelado en 24 a 48 horas.\n\nEste correo confirma el registro del pedido, no el resultado del pago.\n\n¿Dudas? Responde este correo o escríbenos por WhatsApp al +56 9 6231 9733 (lunes a domingo, 08:00 a 20:00).\n\nEquipo Congelados Romasil`;
  return { from: FROM_CLIENTE, to: [c.email], reply_to: VENTAS, subject: `Registramos tu pedido ${numero} – Congelados Romasil`, html, text };
}

function textoProductos(p) {
  return p.lineas.map(l => `${l.quantity} × ${l.name} — ${money.format(l.subtotal)}${l.pricedByKilo ? ' (precio por kg; peso por confirmar)' : ''}`).join('\n') +
    `\n\nSubtotal: ${money.format(p.subtotal)}\nDespacho: ${p.shipping === 0 ? 'Gratis' : money.format(p.shipping)}\nTotal a pagar: ${money.format(p.total)}\n`;
}

async function enviarCorreo(apiKey, correo, idempotencia) {
  const controller = new AbortController();
  // 5 s por correo: los dos envíos caben en los 12 s que espera la web antes de pasar al respaldo.
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencia },
      body: JSON.stringify(correo),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Resend respondió ${response.status}: ${(await response.text()).slice(0, 300)}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  // Solo se aceptan envíos desde la propia web (mismo dominio que atiende la función).
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}`) return res.status(403).json({ ok: false, error: 'Origen no permitido.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Solicitud no válida.' });

  // Campo trampa: los robots lo llenan. Se responde como si todo saliera bien, sin enviar nada.
  if (String(body._honey || '').trim()) return res.status(200).json({ ok: true, pedido: null });

  const { errores, pedido } = validarPedido(body);
  if (errores) return res.status(400).json({ ok: false, error: errores[0], errores });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error('Falta la variable de entorno RESEND_API_KEY');
    return res.status(503).json({ ok: false, error: 'El envío de correos no está configurado.' });
  }

  const ahora = new Date();
  const numeroSolicitado = String(body.orderNumber || '').toUpperCase();
  const numero = ORDER_PATTERN.test(numeroSolicitado) ? numeroSolicitado : numeroPedido(ahora);
  try {
    await enviarCorreo(apiKey, correoVentas(pedido, numero, fechaChile(ahora)), `${numero}-ventas`);
  } catch (error) {
    console.error('No se pudo enviar el pedido a ventas', numero, error);
    return res.status(502).json({ ok: false, error: 'No pudimos registrar la solicitud por correo.' });
  }
  // La confirmación al cliente no bloquea el pedido: ventas ya lo recibió.
  let confirmacion = true;
  try {
    await enviarCorreo(apiKey, correoCliente(pedido, numero), `${numero}-cliente`);
  } catch (error) {
    confirmacion = false;
    console.error('No se pudo enviar la confirmación al cliente', numero, error);
  }
  return res.status(200).json({ ok: true, pedido: numero, confirmacion });
}

module.exports = handler;
// Para pruebas locales (no son rutas: Vercel solo publica la función por defecto).
module.exports.validarPedido = validarPedido;
module.exports.correoVentas = correoVentas;
module.exports.correoCliente = correoCliente;
module.exports.numeroPedido = numeroPedido;
