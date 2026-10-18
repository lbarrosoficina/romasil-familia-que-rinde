// Función de Vercel (GET o POST /api/webpay-retorno): return_url de Webpay Plus.
// Transbank devuelve al cliente aquí con distintas variables según lo que pasó (ver docs/WEBPAY.md §4):
//   token_ws                                    pago terminado (aprobado o rechazado) -> se confirma con Transbank
//   TBK_TOKEN + TBK_ORDEN_COMPRA + TBK_ID_SESION el cliente anuló (o volvió desde un error)
//   TBK_ORDEN_COMPRA + TBK_ID_SESION, sin token  se excedió el tiempo del formulario
// Tras confirmar un pago aprobado se envían correos a ventas@ y al cliente, y se redirige a pago-resultado.html.
const W = require('./_webpay');
const { VENTAS, FROM_VENTAS, FROM_CLIENTE, WHATSAPP, money, escapeHtml, fechaChile, C, marco, enviarCorreo } = require('./_correo');

const TIPOS_PAGO = {
  VD: 'Débito', VP: 'Prepago', VN: 'Crédito', VC: 'Crédito en cuotas',
  SI: 'Crédito, 3 cuotas sin interés', S2: 'Crédito, 2 cuotas sin interés', NC: 'Crédito, cuotas sin interés'
};
const tipoPago = r => {
  const tipo = TIPOS_PAGO[r.payment_type_code] || r.payment_type_code || 'Tarjeta';
  return r.installments_number > 1 ? `${tipo} (${r.installments_number} cuotas)` : tipo;
};
const tarjeta = r => (r.card_detail?.card_number ? `**** ${String(r.card_detail.card_number).slice(-4)}` : '');
const espera = ms => new Promise(resolve => setTimeout(resolve, ms));

function urlResultado(estado, tx, extra = {}) {
  const q = new URLSearchParams({ estado });
  if (tx?.pedido) q.set('pedido', tx.pedido);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  // El enlace para reintentar va en el fragmento (#), igual que en pagar.html, para que no llegue a logs ni a Analytics.
  const reintento = estado !== 'aprobado' && tx?.d && tx?.f ? `#d=${tx.d}&f=${tx.f}` : '';
  return `/pago-resultado.html?${q}${reintento}`;
}

// ---------- Correos ----------
function dato(label, value) {
  return `<tr><td style="padding:4px 0;width:150px;font-size:14px;color:${C.muted};vertical-align:top;">${label}</td><td style="padding:4px 0;font-size:14px;color:${C.ink};">${value}</td></tr>`;
}

function correoPagoVentas(tx, r, cfg, { duplicado = false } = {}) {
  const prueba = cfg.ambiente === 'integracion' ? '[PRUEBA] ' : '';
  const titulo = duplicado ? `Pago DUPLICADO del pedido ${tx.pedido}` : `Pago recibido del pedido ${tx.pedido}`;
  const aviso = duplicado
    ? `<p style="margin:0 0 16px;padding:12px 16px;background:#FDE2E2;border-radius:12px;font-size:14px;color:${C.ink};"><strong>Este pedido ya estaba pagado.</strong> El cliente pagó dos veces: revisa y reembolsa este cobro (orden ${escapeHtml(r.buy_order)}).</p>`
    : '';
  const html = marco(`<p style="margin:0 0 4px;font-size:13px;color:${C.muted};">${prueba}Pago con Webpay en congeladosromasil.cl</p>
<h1 style="margin:0 0 20px;font-size:22px;color:${C.navy};">${titulo}</h1>
${aviso}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
${dato('Monto', `<strong>${money.format(r.amount)}</strong>`)}
${dato('Cliente', escapeHtml(tx.nombre))}
${dato('Correo', `<a href="mailto:${escapeHtml(tx.email)}" style="color:${C.navy};">${escapeHtml(tx.email)}</a>`)}
${tx.detalle ? dato('Detalle', escapeHtml(tx.detalle)) : ''}
${dato('Medio de pago', escapeHtml(tipoPago(r)))}
${tarjeta(r) ? dato('Tarjeta', escapeHtml(tarjeta(r))) : ''}
${dato('Autorización', escapeHtml(r.authorization_code || ''))}
${dato('Orden de compra', escapeHtml(r.buy_order))}
${dato('Fecha', escapeHtml(fechaChile(new Date(r.transaction_date || Date.now()))))}
</table>
<p style="margin:0;font-size:12px;color:${C.muted};">Responde este correo para escribirle al cliente. Coordina la entrega por WhatsApp.</p>`);
  const text = `${prueba}${titulo}\n\n${duplicado ? 'ESTE PEDIDO YA ESTABA PAGADO: revisar y reembolsar este cobro.\n\n' : ''}Monto: ${money.format(r.amount)}\nCliente: ${tx.nombre}\nCorreo: ${tx.email}\n${tx.detalle ? `Detalle: ${tx.detalle}\n` : ''}Medio de pago: ${tipoPago(r)}\n${tarjeta(r) ? `Tarjeta: ${tarjeta(r)}\n` : ''}Autorización: ${r.authorization_code || ''}\nOrden de compra: ${r.buy_order}\n`;
  return { from: FROM_VENTAS, to: [VENTAS], reply_to: tx.email, subject: `${prueba}${titulo} · ${tx.nombre} · ${money.format(r.amount)}`, html, text };
}

function correoPagoCliente(tx, r, cfg) {
  const prueba = cfg.ambiente === 'integracion' ? '[PRUEBA] ' : '';
  const nombre = tx.nombre.split(' ')[0];
  const html = marco(`<h1 style="margin:0 0 12px;font-size:22px;color:${C.navy};">¡Pago recibido, ${escapeHtml(nombre)}!</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:${C.ink};">Confirmamos el pago de tu pedido <strong>${escapeHtml(tx.pedido)}</strong>. Te escribiremos por WhatsApp para coordinar la entrega.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
${dato('Monto pagado', `<strong>${money.format(r.amount)}</strong>`)}
${tx.detalle ? dato('Detalle', escapeHtml(tx.detalle)) : ''}
${dato('Medio de pago', escapeHtml(tipoPago(r)))}
${tarjeta(r) ? dato('Tarjeta', escapeHtml(tarjeta(r))) : ''}
${dato('Código de autorización', escapeHtml(r.authorization_code || ''))}
${dato('Orden de compra', escapeHtml(r.buy_order))}
${dato('Fecha', escapeHtml(fechaChile(new Date(r.transaction_date || Date.now()))))}
</table>
<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${C.ink};">¿Dudas? Responde este correo o escríbenos por WhatsApp. Atendemos de lunes a domingo, de 08:00 a 20:00.</p>
<p style="margin:0 0 20px;"><a href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hola, pagué mi pedido ' + tx.pedido)}" style="display:inline-block;background:#15803D;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:12px 20px;border-radius:999px;">Escribir por WhatsApp</a></p>
<p style="margin:0;font-size:14px;color:${C.ink};">Un abrazo,<br><strong>Equipo Congelados Romasil</strong></p>`);
  const text = `¡Pago recibido, ${nombre}!\n\nConfirmamos el pago de tu pedido ${tx.pedido}. Te escribiremos por WhatsApp para coordinar la entrega.\n\nMonto pagado: ${money.format(r.amount)}\n${tx.detalle ? `Detalle: ${tx.detalle}\n` : ''}Medio de pago: ${tipoPago(r)}\n${tarjeta(r) ? `Tarjeta: ${tarjeta(r)}\n` : ''}Código de autorización: ${r.authorization_code || ''}\nOrden de compra: ${r.buy_order}\n\n¿Dudas? Responde este correo o escríbenos por WhatsApp al +56 9 6231 9733.\n\nEquipo Congelados Romasil`;
  return { from: FROM_CLIENTE, to: [tx.email], reply_to: VENTAS, subject: `${prueba}Pago recibido del pedido ${tx.pedido} – Congelados Romasil`, html, text };
}

async function avisar(correos) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return console.error('Falta RESEND_API_KEY: no se enviaron los correos del pago');
  for (const [correo, idempotencia] of correos) {
    try { await enviarCorreo(apiKey, correo, idempotencia); } catch (error) { console.error('No se pudo enviar un correo del pago', idempotencia, error); }
  }
}

// ---------- Confirmación ----------
async function confirmar(cfg, token) {
  const yaProcesado = await W.redis(cfg, 'GET', `res:${token}`);
  if (yaProcesado) return yaProcesado;
  const tx = await W.redisJson(cfg, `tx:${token}`);
  if (!tx) {
    console.error('Retorno con un token desconocido', token.slice(0, 12));
    return urlResultado('error');
  }

  // Si otra petición ya está confirmando este token (doble clic, recarga), se espera su resultado.
  if (!(await W.redis(cfg, 'SET', `lock:${token}`, '1', 'NX', 'EX', 60))) {
    for (let i = 0; i < 4; i++) {
      await espera(1500);
      const listo = await W.redis(cfg, 'GET', `res:${token}`);
      if (listo) return listo;
    }
    return urlResultado('pendiente', tx);
  }

  let r = null;
  try {
    r = await W.confirmarTransaccion(cfg, token);
  } catch (error) {
    // El commit pudo fallar por red aunque Transbank lo haya procesado: se consulta el estado antes de responder.
    console.error('Falló la confirmación con Transbank; se consulta el estado', tx.buyOrder, error);
    try { r = await W.estadoTransaccion(cfg, token); } catch (error2) { console.error('Tampoco se pudo consultar el estado', tx.buyOrder, error2); }
  }

  let url;
  if (r && W.aprobada(r, { monto: tx.monto, buyOrder: tx.buyOrder })) {
    const registro = { buyOrder: r.buy_order, monto: r.amount, autorizacion: r.authorization_code, tarjeta: tarjeta(r), tipo: tipoPago(r), fecha: r.transaction_date, token };
    const primero = await W.redis(cfg, 'SET', `pago:${tx.pedido}`, JSON.stringify(registro), 'NX', 'EX', W.UN_ANIO);
    if (primero) {
      await avisar([[correoPagoVentas(tx, r, cfg), `${r.buy_order}-pago-ventas`], [correoPagoCliente(tx, r, cfg), `${r.buy_order}-pago-cliente`]]);
    } else {
      console.error('Pago duplicado: el pedido ya estaba pagado', tx.pedido, r.buy_order);
      await avisar([[correoPagoVentas(tx, r, cfg, { duplicado: true }), `${r.buy_order}-pago-duplicado`]]);
    }
    url = urlResultado('aprobado', tx, { monto: String(r.amount) });
  } else if (r && r.status && r.status !== 'INITIALIZED') {
    if (r.response_code === 0) console.error('Pago autorizado que no coincide con lo cobrado', tx.buyOrder, r.buy_order, r.amount, tx.monto);
    url = urlResultado('rechazado', tx);
  } else {
    // Sin respuesta clara de Transbank: no se guarda, para que una recarga vuelva a intentar.
    await W.redis(cfg, 'DEL', `lock:${token}`);
    return urlResultado('pendiente', tx);
  }
  await W.redis(cfg, 'SET', `res:${token}`, url, 'EX', W.SIETE_DIAS);
  return url;
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  let cfg;
  try { cfg = W.config(); } catch (error) {
    console.error(error.message);
    return W.redirigir(res, urlResultado('error'));
  }

  const p = { ...(req.query || {}), ...(req.method === 'POST' ? W.leerCuerpo(req) || {} : {}) };
  const tokenWs = typeof p.token_ws === 'string' ? p.token_ws : '';
  const tbkToken = typeof p.TBK_TOKEN === 'string' ? p.TBK_TOKEN : '';
  const orden = typeof p.TBK_ORDEN_COMPRA === 'string' ? p.TBK_ORDEN_COMPRA : '';

  try {
    if (tokenWs && !tbkToken) return W.redirigir(res, await confirmar(cfg, tokenWs));
    if (tbkToken) {
      // Anulado por el cliente o regreso desde la pantalla de error de Webpay: no hubo cobro.
      return W.redirigir(res, urlResultado('anulado', await W.redisJson(cfg, `tx:${tbkToken}`)));
    }
    if (orden) {
      const token = await W.redis(cfg, 'GET', `orden:${orden}`);
      return W.redirigir(res, urlResultado('tiempo', token ? await W.redisJson(cfg, `tx:${token}`) : null));
    }
    return W.redirigir(res, urlResultado('error'));
  } catch (error) {
    console.error('Error en el retorno de Webpay', error);
    return W.redirigir(res, urlResultado('pendiente'));
  }
}

module.exports = handler;
module.exports.correoPagoVentas = correoPagoVentas;
module.exports.correoPagoCliente = correoPagoCliente;
