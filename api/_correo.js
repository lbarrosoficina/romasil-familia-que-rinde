// Piezas comunes de los correos que envían las funciones (pedido.js y webpay-retorno.js) con Resend.
// Los archivos de api/ que empiezan con "_" no son rutas: Vercel no los publica.
const VENTAS = 'ventas@congeladosromasil.cl';
const FROM_VENTAS = 'Pedidos web Romasil <ventas@congeladosromasil.cl>';
const FROM_CLIENTE = 'Congelados Romasil <ventas@congeladosromasil.cl>';
const WHATSAPP = '56962319733';
const SITE = 'https://congeladosromasil.cl';

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function fechaChile(fecha = new Date()) {
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', dateStyle: 'long', timeStyle: 'short' }).format(fecha);
}

const C = { navy: '#1E3A8A', ink: '#2A1F14', muted: '#5E5446', line: '#EFE3C8', cream: '#FFF4D6', yellow: '#FBBF24' };

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

module.exports = { VENTAS, FROM_VENTAS, FROM_CLIENTE, WHATSAPP, SITE, money, escapeHtml, fechaChile, C, marco, enviarCorreo };
