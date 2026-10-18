// Página pago-resultado.html: mensaje según ?estado=… que envía /api/webpay-retorno después de pasar por Webpay.
(() => {
  const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const params = new URLSearchParams(window.location.search);
  const estado = params.get('estado') || 'error';
  const pedido = params.get('pedido') || '';
  const monto = Number(params.get('monto'));
  const enlace = new URLSearchParams(window.location.hash.slice(1));
  const d = enlace.get('d') || '';
  const f = enlace.get('f') || '';
  const delPedido = pedido ? ` del pedido ${pedido}` : '';

  const textos = {
    aprobado: ['¡Pago recibido!', `Confirmamos el pago${delPedido}${monto ? ` por ${money.format(monto)}` : ''}. Te enviamos el comprobante por correo y te escribiremos por WhatsApp para coordinar la entrega.`, 'ok'],
    rechazado: ['El pago no se completó', `Webpay no aprobó el pago${delPedido} y no se hizo ningún cobro. Puedes intentar de nuevo, por ejemplo con otra tarjeta.`, 'error'],
    anulado: ['Pago cancelado', `Cancelaste el pago${delPedido} en Webpay y no se hizo ningún cobro. Puedes intentar de nuevo cuando quieras.`, ''],
    tiempo: ['Se acabó el tiempo', `El formulario de Webpay venció antes de terminar el pago${delPedido} y no se hizo ningún cobro. Puedes intentar de nuevo.`, ''],
    pendiente: ['Estamos confirmando tu pago', `No pudimos confirmar con Transbank el resultado del pago${delPedido}. Si se aprobó, te llegará el comprobante por correo. Antes de intentar de nuevo, escríbenos por WhatsApp para revisarlo.`, ''],
    error: ['No pudimos procesar el pago', 'Algo falló al volver desde Webpay. Escríbenos por WhatsApp y lo revisamos contigo.', 'error']
  };
  const [titulo, texto, tipo] = textos[estado] || textos.error;
  document.getElementById('resultadoTitulo').textContent = titulo;
  document.title = `${titulo} | Congelados Romasil`;
  const p = document.getElementById('resultadoTexto');
  p.textContent = texto;
  p.className = `pago-aviso ${tipo}`.trim();

  // Solo se ofrece reintentar hacia la propia página de pago, y nunca si el pago está aprobado o en revisión.
  if (['rechazado', 'anulado', 'tiempo'].includes(estado) && /^[\w-]+$/.test(d) && /^[\w-]+$/.test(f)) {
    const boton = document.getElementById('resultadoReintentar');
    boton.href = `/pagar.html#d=${d}&f=${f}`;
    boton.hidden = false;
  }

  // Compra en Analytics (solo si el visitante aceptó cookies; GA4 descarta compras repetidas con el mismo transaction_id).
  if (estado === 'aprobado' && pedido && monto && typeof track === 'function') {
    track('purchase', { transaction_id: pedido, value: monto, currency: 'CLP' });
  }
})();
