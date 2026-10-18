// Página pagar.html: muestra el pedido del enlace firmado (#d=…&f=…) y lleva al cliente a Webpay.
// El enlace va en el fragmento (#) para que el correo y el nombre firmados no lleguen a logs, Analytics ni al Referer.
// La transacción se crea en /api/webpay-crear al pulsar el botón; luego se envía token_ws a Webpay con un formulario POST.
(() => {
  const WEBPAY_HOSTS = ['https://webpay3g.transbank.cl/', 'https://webpay3gint.transbank.cl/'];
  const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const $ = id => document.getElementById(id);
  const estado = $('pagoEstado');
  const boton = $('pagoBoton');
  const params = new URLSearchParams(window.location.hash.slice(1));
  const enlace = { d: params.get('d') || '', f: params.get('f') || '' };

  const aviso = (texto, tipo = '') => {
    estado.textContent = texto;
    estado.className = `pago-aviso ${tipo}`.trim();
  };

  async function llamar(accion) {
    const response = await fetch('/api/webpay-crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...enlace, accion })
    });
    const result = await response.json().catch(() => null);
    return { status: response.status, result: result || { ok: false, error: 'No pudimos conectar con el servidor. Intenta de nuevo.' } };
  }

  async function cargar() {
    if (!enlace.d || !enlace.f) return aviso('Este enlace de pago está incompleto. Pídenos uno nuevo por WhatsApp.', 'error');
    let respuesta;
    try { respuesta = await llamar('consultar'); } catch { return aviso('No pudimos cargar tu pedido. Revisa tu conexión e intenta de nuevo.', 'error'); }
    const { result } = respuesta;
    if (!result.ok) return aviso(result.error, 'error');
    $('pagoPedido').textContent = result.pedido;
    $('pagoNombre').textContent = result.nombre;
    $('pagoMonto').textContent = money.format(result.monto);
    if (result.detalle) {
      $('pagoDetalle').textContent = result.detalle;
      $('pagoDetalleFila').hidden = false;
    }
    $('pagoResumen').hidden = false;
    if (result.pagado) return aviso('Este pedido ya está pagado. Si tienes dudas, escríbenos por WhatsApp.', 'ok');
    const vence = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(result.vence * 1000));
    aviso(result.ambiente === 'integracion'
      ? `Ambiente de pruebas de Transbank: no se cobra dinero real. Enlace válido hasta el ${vence}`
      : `Revisa el total y pulsa el botón para pagar. Enlace válido hasta el ${vence}`);
    boton.hidden = false;
  }

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    boton.textContent = 'Conectando con Webpay…';
    let respuesta;
    try { respuesta = await llamar('pagar'); } catch { respuesta = { result: { ok: false, error: 'No pudimos conectar con Webpay. Intenta de nuevo.' } }; }
    const { result } = respuesta;
    if (!result.ok || !WEBPAY_HOSTS.some(host => String(result.url).startsWith(host))) {
      aviso(result.error || 'No pudimos conectar con Webpay. Intenta de nuevo.', result.pagado ? 'ok' : 'error');
      if (result.pagado) { boton.hidden = true; return; }
      boton.disabled = false;
      boton.textContent = 'Pagar con Webpay';
      return;
    }
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = result.url;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'token_ws';
    input.value = result.token;
    form.append(input);
    document.body.append(form);
    form.submit();
  });

  cargar();
})();
