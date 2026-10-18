// Página interna admin-pago.html: ventas crea el enlace de pago de un pedido confirmado con /api/link-pago.
// Se puede abrir con los datos prellenados en el fragmento (#pedido=…&nombre=…&email=…&telefono=…&monto=…&detalle=…),
// como hace el botón "Crear enlace de pago" del correo de pedido. El fragmento no llega al servidor ni a Analytics.
(() => {
  const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
  const $ = id => document.getElementById(id);
  const form = $('adminForm');
  const estado = $('adminEstado');
  const boton = form.querySelector('button[type="submit"]');
  let mensaje = '';

  const prellenado = new URLSearchParams(window.location.hash.slice(1));
  for (const campo of ['pedido', 'nombre', 'email', 'telefono', 'monto', 'detalle']) {
    if (prellenado.get(campo)) form.elements[campo].value = prellenado.get(campo);
  }
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const monto = Number(String(data.get('monto')).replace(/[^\d]/g, ''));
    boton.disabled = true;
    estado.textContent = 'Creando enlace…';
    $('adminResultado').hidden = true;
    let result = null;
    try {
      const response = await fetch('/api/link-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ clave: data.get('clave'), pedido: data.get('pedido'), nombre: data.get('nombre'), email: data.get('email'), monto, detalle: data.get('detalle') })
      });
      result = await response.json().catch(() => null);
    } catch { result = null; }
    boton.disabled = false;
    if (!result?.ok) {
      estado.textContent = result?.error || 'No se pudo crear el enlace. Revisa la conexión e intenta de nuevo.';
      return;
    }
    estado.textContent = '';
    const nombre = String(data.get('nombre')).trim().split(' ')[0];
    const vence = new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(result.vence * 1000));
    mensaje = `Hola ${nombre}, aquí está el enlace para pagar tu pedido ${result.pedido} por ${money.format(result.monto)} con Webpay (débito, crédito o prepago): ${result.url}\nEl enlace es válido hasta el ${vence}`;
    $('adminResumen').textContent = `Enlace creado para el pedido ${result.pedido} por ${money.format(result.monto)}${result.ambiente === 'integracion' ? ' (ambiente de pruebas de Transbank)' : ''}.`;
    $('adminEnlace').value = mensaje;
    const telefono = String(data.get('telefono') || '').replace(/\D/g, '');
    const destino = telefono.length === 9 ? `56${telefono}` : telefono;
    $('adminWhatsapp').href = `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
    $('adminResultado').hidden = false;
    form.elements.clave.value = '';
  });

  $('adminCopiar').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(mensaje);
      $('adminCopiar').textContent = 'Mensaje copiado';
    } catch {
      $('adminEnlace').select();
      $('adminCopiar').textContent = 'Selecciona y copia el texto';
    }
    setTimeout(() => { $('adminCopiar').textContent = 'Copiar mensaje'; }, 2500);
  });
})();
