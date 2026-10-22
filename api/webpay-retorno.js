const crypto = require('node:crypto');
const { escapeHtml, getWebpayConfig, isValidToken, webpayHeaders } = require('./_webpay');

const SITE = 'https://congeladosromasil.cl';
const VENTAS = 'ventas@congeladosromasil.cl';
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

function resultPage({ approved, title, message, transaction }) {
  const order = transaction?.buy_order || '';
  const amount = Number(transaction?.amount || 0);
  const authorization = transaction?.authorization_code || '';
  const statusClass = approved ? 'payment-approved' : 'payment-not-approved';
  const details = approved ? `<dl class="payment-details">
    <div><dt>Pedido</dt><dd>${escapeHtml(order)}</dd></div>
    <div><dt>Monto pagado</dt><dd>${escapeHtml(money.format(amount))}</dd></div>
    <div><dt>Código de autorización</dt><dd>${escapeHtml(authorization)}</dd></div>
  </dl>` : '';
  return `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(title)} | Congelados Romasil</title><link rel="icon" href="/assets/romasil-icono-96.png"><link rel="stylesheet" href="/styles.css"></head>
  <body data-payment-result="${approved ? 'success' : 'failure'}"><main class="payment-result"><section class="payment-result-card ${statusClass}"><img src="/assets/romasil-logo-horizontal.png" width="180" height="56" alt="Congelados Romasil"><div class="payment-result-icon" aria-hidden="true">${approved ? '✓' : '!'}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${details}<div class="payment-result-actions"><a class="button primary" href="/">Volver al inicio</a>${approved ? '' : '<a class="button secondary" href="/productos.html">Volver al carrito</a>'}</div><p class="form-note">¿Necesitas ayuda? Escríbenos a <a href="mailto:ventas@congeladosromasil.cl">ventas@congeladosromasil.cl</a>.</p></section></main><script src="/pago.js"></script></body></html>`;
}

async function notifySales(transaction) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const tokenHash = crypto.createHash('sha256').update(String(transaction.token || '')).digest('hex').slice(0, 24);
  const text = `Pago Webpay autorizado\n\nPedido: ${transaction.buy_order}\nMonto: ${money.format(Number(transaction.amount))}\nCódigo de autorización: ${transaction.authorization_code}\nTipo de pago: ${transaction.payment_type_code}\nÚltimos 4 dígitos: ${transaction.card_detail?.card_number || 'No informado'}\nFecha Transbank: ${transaction.transaction_date}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `webpay-${tokenHash}` },
      body: JSON.stringify({
        from: 'Pagos Romasil <ventas@congeladosromasil.cl>',
        to: [VENTAS],
        subject: `Pago Webpay autorizado · ${transaction.buy_order} · ${money.format(Number(transaction.amount))}`,
        text
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Resend respondió ${response.status}`);
  } finally {
    clearTimeout(timer);
  }
}

async function readTransaction(config, token, commit = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(`${config.apiBase}/${encodeURIComponent(token)}`, {
      method: commit ? 'PUT' : 'GET',
      headers: webpayHeaders(config),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) throw new Error(`Transbank respondió ${response.status}`);
    return { ...result, token };
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!['POST', 'GET'].includes(req.method)) return res.status(405).send(resultPage({ approved: false, title: 'Método no permitido', message: 'No pudimos revisar este pago.' }));

  const data = req.method === 'POST' ? req.body : req.query;
  const token = String(data?.token_ws || '');
  if (!isValidToken(token)) {
    return res.status(200).send(resultPage({
      approved: false,
      title: 'Pago no completado',
      message: 'El pago fue cancelado o no llegó a completarse. No se realizó ningún cobro y tu carrito sigue disponible.'
    }));
  }

  let config;
  try { config = getWebpayConfig(); } catch (error) {
    console.error('Configuración Webpay incompleta al confirmar', error);
    return res.status(503).send(resultPage({ approved: false, title: 'No pudimos confirmar el pago', message: 'Escríbenos para que revisemos el estado de tu transacción.' }));
  }

  try {
    let transaction;
    try {
      transaction = await readTransaction(config, token, true);
    } catch (commitError) {
      // Si la persona recarga la página, la confirmación ya puede estar hecha. Consultamos el estado para mostrar el resultado real.
      console.warn('No se pudo confirmar directamente; se consulta el estado', commitError);
      transaction = await readTransaction(config, token, false);
    }
    const approved = transaction.status === 'AUTHORIZED' && Number(transaction.response_code) === 0;
    if (approved) {
      try { await notifySales(transaction); } catch (emailError) { console.error('No se pudo avisar el pago por correo', emailError); }
      return res.status(200).send(resultPage({ approved: true, title: '¡Pago realizado con éxito!', message: 'Recibimos tu pago. Te contactaremos para coordinar la entrega de tu pedido.', transaction }));
    }
    return res.status(200).send(resultPage({ approved: false, title: 'Pago no autorizado', message: 'Webpay no autorizó la transacción. No se realizó ningún cobro y puedes intentarlo nuevamente.' }));
  } catch (error) {
    console.error('No se pudo obtener el resultado Webpay', error);
    return res.status(502).send(resultPage({ approved: false, title: 'No pudimos confirmar el pago', message: 'No intentes pagar otra vez todavía. Escríbenos para revisar si la transacción fue procesada.' }));
  }
}

module.exports = handler;
