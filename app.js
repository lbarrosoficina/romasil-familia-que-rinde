// Google Analytics 4: solo se carga si la persona acepta la analítica en el aviso de cookies (ver politica-de-privacidad.html#cookies).
// track() no hace nada mientras no haya consentimiento, así que se puede llamar desde cualquier parte sin condiciones.
const GA_MEASUREMENT_ID = 'G-E6KL5QF5LN';
const CONSENT_STORAGE_KEY = 'romasil-analytics-consent';
let analyticsEnabled = false;
function readConsent() {
  try { return localStorage.getItem(CONSENT_STORAGE_KEY); } catch { return null; }
}
function saveConsent(value) {
  try { localStorage.setItem(CONSENT_STORAGE_KEY, value); } catch { /* sin almacenamiento: se volverá a preguntar */ }
}
function enableAnalytics() {
  if (analyticsEnabled) return;
  analyticsEnabled = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  // Solo medición: sin señales de Google ni personalización de anuncios (la política de privacidad no cubre fines publicitarios).
  window.gtag('config', GA_MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);
}
function track(eventName, params = {}) {
  if (analyticsEnabled && typeof window.gtag === 'function') window.gtag('event', eventName, params);
}
function showConsentBanner() {
  if (document.querySelector('#consentBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'consentBanner';
  banner.className = 'consent-banner';
  banner.setAttribute('role', 'region');
  banner.setAttribute('aria-label', 'Preferencias de cookies');
  banner.innerHTML = '<p>Usamos Google Analytics para saber cómo se usa la web y mejorarla. Solo se activa si lo aceptas. <a href="politica-de-privacidad.html#cookies">Ver política de cookies</a></p><div class="consent-actions"><button type="button" class="button secondary" data-consent="denied">Rechazar</button><button type="button" class="button primary" data-consent="granted">Aceptar</button></div>';
  banner.addEventListener('click', event => {
    const choice = event.target.closest('[data-consent]')?.dataset.consent;
    if (!choice) return;
    saveConsent(choice);
    banner.remove();
    if (choice === 'granted') enableAnalytics();
    else if (analyticsEnabled) {
      // Retiro del consentimiento: borrar las cookies de Analytics (_ga, _ga_*) y recargar sin la etiqueta.
      document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(name => name.startsWith('_ga')).forEach(name => {
        document.cookie = `${name}=; Max-Age=0; path=/; domain=.${location.hostname.replace(/^www\./, '')}`;
        document.cookie = `${name}=; Max-Age=0; path=/`;
      });
      window.location.reload();
    }
  });
  document.body.appendChild(banner);
}
const storedConsent = readConsent();
if (storedConsent === 'granted') enableAnalytics();
else if (storedConsent !== 'denied') showConsentBanner();
document.querySelectorAll('[data-cookie-settings]').forEach(button => button.addEventListener('click', showConsentBanner));
// Clics en enlaces de WhatsApp (encabezado, contacto, fichas): evento "contact".
document.addEventListener('click', event => {
  const link = event.target.closest('a[href*="wa.me/"]');
  if (link) track('contact', { method: 'WhatsApp', link_location: link.closest('header, main, footer')?.tagName.toLowerCase() || 'page' });
});

const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const CART_STORAGE_KEY = 'romasil-session-cart';
// Nombre y precio de cada producto a la venta. El carrito toma estos datos de aquí y no del navegador,
// así un carrito guardado no conserva precios antiguos ni valores modificados a mano.
// <catalogo> Generado por 05 Scripts/web/build-productos.ps1 desde las tarjetas data-available="true" de productos.html. No editar a mano.
const CATALOG = {
  'filetillo-pollo': { name: 'Filetito de pollo congelado', price: 5700, pricedByKilo: false },
  'trutro-largo-pollo': { name: 'Trutro largo de pollo congelado', price: 3300, pricedByKilo: false },
  'pechuga-pollo': { name: 'Pechuga deshuesada de pollo', price: 5290, pricedByKilo: false },
  'malaya-cerdo': { name: 'Malaya de cerdo', price: 13000, pricedByKilo: false },
  'salmon-nacional': { name: 'Salmón nacional filete', price: 7950, pricedByKilo: false },
  'camaron-ecuatoriano': { name: 'Camarón ecuatoriano con cáscara 36/40', price: 10350, pricedByKilo: false },
  'camaron-sin-cascara': { name: 'Camarón ecuatoriano sin cáscara 36/40', price: 11600, pricedByKilo: false },
  'ostion-media-concha': { name: 'Ostión con coral en media concha', price: 6900, pricedByKilo: false },
  'ostion-sin-coral': { name: 'Ostión sin coral 20/40', price: 11900, pricedByKilo: false },
  'machas-media-concha': { name: 'Machas en media concha congeladas', price: 7900, pricedByKilo: false },
  'atun-steak': { name: 'Atún steak premium', price: 2990, pricedByKilo: false }
};
// </catalogo>
const MAX_QUANTITY = 99;
function cartLine(id, quantity) {
  return { id, ...CATALOG[id], quantity };
}
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
// El navegador solo guarda id y cantidad; los productos que ya no están a la venta se descartan.
let storedCart = [];
try {
  const parsedCart = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) || '[]');
  if (Array.isArray(parsedCart)) {
    storedCart = parsedCart
      .filter(item => Object.hasOwn(CATALOG, item?.id) && Number.isInteger(item.quantity) && item.quantity > 0)
      .map(item => cartLine(item.id, Math.min(item.quantity, MAX_QUANTITY)));
  }
} catch {
  storedCart = [];
}
const cart = new Map(storedCart.map(item => [item.id, item]));
const drawer = document.querySelector('#cartDrawer');
const backdrop = document.querySelector('#drawerBackdrop');
const cartItems = document.querySelector('#cartItems');
const cartSummary = document.querySelector('#cartSummary');
const cartCount = document.querySelector('#cartCount');
const cartTotal = document.querySelector('#cartTotal');
const cartShipping = document.querySelector('#cartShipping');
const cartGrandTotal = document.querySelector('#cartGrandTotal');
const cartShippingNote = document.querySelector('#cartShippingNote');
const toast = document.querySelector('#toast');
const checkoutDialog = document.querySelector('#checkoutDialog');
const openCartButton = document.querySelector('#openCart');
const closeCartButton = document.querySelector('#closeCart');
const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('#primaryNav');
const checkoutForm = document.querySelector('#checkoutForm');
const formStatus = document.querySelector('#formStatus');
const pageRegions = document.querySelectorAll('body > header, body > main, body > footer');
const WHATSAPP_NUMBER = '56962319733';
const SHIPPING_COST = 3500;
const FREE_SHIPPING_THRESHOLD = 50000;
// Pedidos: primero la función propia con Resend (api/pedido.js); FormSubmit queda como respaldo automático.
const ORDER_API_ENDPOINT = '/api/pedido';
const ORDER_API_TIMEOUT_MS = 12000;
const ORDER_FORM_ENDPOINT = 'https://formsubmit.co/ajax/ventas@congeladosromasil.cl';

function setPageRegionsInert(isInert) {
  pageRegions.forEach(region => { region.inert = isInert; });
}

function persistCart() {
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...cart.values()].map(({ id, quantity }) => ({ id, quantity }))));
  } catch {
    // El carrito sigue funcionando en memoria si el navegador bloquea el almacenamiento.
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function openCart() {
  closeNavigation();
  drawer.classList.add('open');
  drawer.inert = false;
  drawer.setAttribute('aria-hidden', 'false');
  openCartButton.setAttribute('aria-expanded', 'true');
  backdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  setPageRegionsInert(true);
  closeCartButton.focus();
}

function closeCart({ restoreFocus = true } = {}) {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  openCartButton.setAttribute('aria-expanded', 'false');
  drawer.inert = true;
  backdrop.hidden = true;
  document.body.style.overflow = '';
  setPageRegionsInert(false);
  if (restoreFocus) openCartButton.focus();
}

function closeNavigation({ restoreFocus = false } = {}) {
  if (!primaryNav || !navToggle) return;
  primaryNav.classList.remove('is-open');
  navToggle.setAttribute('aria-expanded', 'false');
  if (restoreFocus) navToggle.focus();
}

function trapDrawerFocus(event) {
  if (event.key !== 'Tab' || !drawer.classList.contains('open')) return;
  const focusable = [...drawer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.disabled && element.getClientRects().length > 0);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function renderCart() {
  const items = [...cart.values()];
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  cartCount.textContent = count;
  openCartButton.setAttribute('aria-label', `Abrir carrito, ${count} productos`);
  cartSummary.hidden = items.length === 0;
  cartTotal.textContent = money.format(total);
  const shipping = total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  cartShipping.textContent = shipping === 0 ? 'Gratis' : money.format(shipping);
  cartGrandTotal.textContent = money.format(total + shipping);
  const shippingNote = shipping === 0
    ? 'Despacho gratis desde $50.000 en productos.'
    : `Despacho gratis desde $50.000 en productos. Te faltan ${money.format(FREE_SHIPPING_THRESHOLD - total)}.`;
  cartShippingNote.textContent = items.some(item => item.pricedByKilo)
    ? `${shippingNote} Los productos por kg se estiman con 1 kg por unidad; el total y el despacho final se confirman según el peso real.`
    : shippingNote;
  if (!items.length) {
    cartItems.innerHTML = '<div class="empty-cart"><svg  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5"/></svg><h3>Tu pedido está vacío</h3><p>Agrega productos del catálogo para comenzar.</p></div>';
    return;
  }
  cartItems.innerHTML = items.map(item => {
    const id = escapeHtml(item.id);
    const name = escapeHtml(item.name);
    return `
    <div class="cart-line">
      <div><h3>${name}</h3><p>${money.format(item.price)} ${item.pricedByKilo ? '/kg · estimado por 1 kg' : 'c/u'}</p><div class="quantity"><button type="button" data-action="decrease" data-id="${id}" aria-label="Quitar una unidad de ${name}">−</button><strong>${item.quantity}</strong><button type="button" data-action="increase" data-id="${id}" aria-label="Agregar una unidad de ${name}">+</button></div><button class="remove" type="button" data-action="remove" data-id="${id}" aria-label="Eliminar ${name} del pedido">Eliminar</button></div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </div>`;
  }).join('');
}

document.querySelectorAll('.product-card[data-available="true"] .add-button').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.product-card');
  const id = card.dataset.id;
  if (!Object.hasOwn(CATALOG, id)) {
    console.warn(`El producto "${id}" está a la venta en la página pero no en CATALOG de app.js. Vuelve a ejecutar build-productos.ps1.`);
    showToast('Este producto no se puede agregar en este momento. Escríbenos por WhatsApp.');
    return;
  }
  const existing = cart.get(id);
  const line = cartLine(id, Math.min((existing?.quantity || 0) + 1, MAX_QUANTITY));
  cart.set(id, line);
  persistCart();
  renderCart();
  showToast(`${line.name} agregado`);
  track('add_to_cart', { currency: 'CLP', value: line.price, items: [{ item_id: id, item_name: line.name, price: line.price, quantity: 1 }] });
}));
// Aviso para quien mantiene la web: un precio de la página distinto al de CATALOG indica que falta volver a generar.
document.querySelectorAll('.product-card[data-available="true"]').forEach(card => {
  const product = CATALOG[card.dataset.id];
  if (product && Number(card.dataset.price) !== product.price) {
    console.warn(`Precio distinto para "${card.dataset.id}": la página dice ${card.dataset.price} y CATALOG ${product.price}. Vuelve a ejecutar build-productos.ps1.`);
  }
});

cartItems.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const item = cart.get(button.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'increase') item.quantity = Math.min(item.quantity + 1, MAX_QUANTITY);
  if (button.dataset.action === 'decrease') item.quantity -= 1;
  if (button.dataset.action === 'remove' || item.quantity <= 0) cart.delete(item.id);
  persistCart();
  renderCart();
});

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.filter').forEach(item => { item.classList.remove('active'); item.setAttribute('aria-pressed', 'false'); });
  button.classList.add('active');
  button.setAttribute('aria-pressed', 'true');
  const filter = button.dataset.filter;
  let visibleProducts = 0;
  document.querySelectorAll('#productGrid .product-card').forEach(card => {
    const isListed = card.dataset.available === 'true' || card.dataset.available === 'soon';
    card.hidden = !isListed || (filter !== 'todos' && card.dataset.category !== filter);
    if (!card.hidden) visibleProducts += 1;
  });
  const emptyState = document.querySelector('#filterEmpty');
  if (emptyState) emptyState.hidden = visibleProducts > 0;
}));

navToggle?.addEventListener('click', () => {
  const willOpen = navToggle.getAttribute('aria-expanded') !== 'true';
  navToggle.setAttribute('aria-expanded', String(willOpen));
  primaryNav.classList.toggle('is-open', willOpen);
});
primaryNav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeNavigation()));
openCartButton.addEventListener('click', openCart);
closeCartButton.addEventListener('click', () => closeCart());
backdrop.addEventListener('click', closeCart);
document.addEventListener('keydown', event => {
  trapDrawerFocus(event);
  if (event.key !== 'Escape') return;
  if (drawer.classList.contains('open')) closeCart();
  else if (primaryNav?.classList.contains('is-open')) closeNavigation({ restoreFocus: true });
});
document.querySelector('#checkoutButton').addEventListener('click', () => {
  closeCart({ restoreFocus: false });
  track('begin_checkout', cartEventParams());
  checkoutDialog.showModal();
  checkoutForm.elements.name.focus();
});
document.querySelector('#closeDialog').addEventListener('click', () => checkoutDialog.close());
checkoutDialog.addEventListener('close', () => openCartButton.focus());
// Parámetros de comercio electrónico de GA4 con el contenido actual del carrito (valor = productos, sin despacho).
function cartEventParams(extra = {}) {
  const items = [...cart.values()];
  return {
    currency: 'CLP',
    value: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    items: items.map(item => ({ item_id: item.id, item_name: item.name, price: item.price, quantity: item.quantity })),
    ...extra
  };
}
function buildOrderSummary(data, orderNumber = '') {
  const cartItemsList = [...cart.values()];
  const items = cartItemsList.map(item => `${item.quantity} × ${item.name}${item.pricedByKilo ? ' (precio por kg; peso por confirmar)' : ''}`).join('\n');
  const total = cartItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const shippingLabel = shipping === 0 ? 'Gratis' : money.format(shipping);
  const addressLine2 = String(data.get('addressLine2') || '').trim();
  const addressDetails = addressLine2 ? `\nDepartamento/casa: ${addressLine2}` : '';
  const weightNote = cartItemsList.some(item => item.pricedByKilo) ? '\nLos productos por kg se estiman con 1 kg por unidad. El total y el despacho final dependen del peso real.' : '';
  const orderLine = orderNumber ? `\nN° de solicitud: ${orderNumber}` : '';
  return `Hola, quiero solicitar este pedido en Congelados Romasil.${orderLine}\n\nNombre: ${data.get('name')}\nTeléfono: ${data.get('phone')}\nCorreo electrónico: ${data.get('email')}\nDirección: ${data.get('addressLine1')}${addressDetails}\nComuna: ${data.get('commune')}\n\nProductos:\n${items}\n\nSubtotal referencial: ${money.format(total)}\nDespacho: ${shippingLabel}\nTotal referencial: ${money.format(total + shipping)}${weightNote}`;
}

// Botón "Enviar pedido por WhatsApp": valida los datos y abre WhatsApp con el cliente y el pedido completos.
const whatsappOrderButton = checkoutForm.querySelector('.whatsapp-button');
whatsappOrderButton?.addEventListener('click', () => {
  if (!cart.size) {
    formStatus.textContent = 'Tu pedido está vacío. Agrega al menos un producto antes de enviarlo.';
    return;
  }
  if (!checkoutForm.reportValidity()) {
    formStatus.textContent = 'Completa tus datos para enviar el pedido por WhatsApp.';
    return;
  }
  const summary = buildOrderSummary(new FormData(checkoutForm));
  track('generate_lead', cartEventParams({ lead_source: 'whatsapp_pedido' }));
  const waWindow = window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`, '_blank');
  if (waWindow) waWindow.opener = null;
  else window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`);
  formStatus.textContent = 'Abrimos WhatsApp con tu pedido. Solo falta presionar Enviar en WhatsApp.';
});

// Cerrar el formulario al hacer clic en la zona oscura alrededor.
checkoutDialog.addEventListener('click', event => {
  if (event.target === checkoutDialog) checkoutDialog.close();
});
checkoutForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!cart.size) {
    formStatus.textContent = 'Tu pedido está vacío. Agrega al menos un producto antes de enviarlo.';
    return;
  }

  const submitButton = checkoutForm.querySelector('button[type="submit"]');
  const data = new FormData(checkoutForm);
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando…';
  formStatus.textContent = 'Registrando tu solicitud de forma segura…';
  const resetButton = () => {
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar solicitud';
  };

  // 1. Envío principal: función propia con Resend (aviso a ventas@ y confirmación al cliente).
  // 2. Respaldo: si la función no responde o falla, FormSubmit, como antes.
  let orderNumber = '';
  let channel = '';
  try {
    const result = await sendOrderByResend(data);
    if (result.status === 'ok') {
      orderNumber = result.orderNumber;
      channel = 'resend';
    } else if (result.status === 'invalid') {
      formStatus.textContent = result.message;
      resetButton();
      return;
    }
  } catch (error) {
    console.warn('Falló el envío principal del pedido; se usa el respaldo', error);
  }
  if (!channel) {
    try {
      await sendOrderByFormSubmit(data, buildOrderSummary(data));
      channel = 'formsubmit';
    } catch (error) {
      console.error('No fue posible registrar la solicitud', error);
      formStatus.textContent = 'No pudimos registrar la solicitud por correo. Puedes reintentar o continuar directamente por WhatsApp con el botón disponible en este formulario.';
      resetButton();
      return;
    }
  }

  const summary = buildOrderSummary(data, orderNumber);
  track('generate_lead', cartEventParams({ lead_source: 'formulario_pedido', order_channel: channel }));
  cart.clear();
  persistCart();
  renderCart();
  checkoutDialog.close();
  // Breve espera para que Analytics alcance a enviar generate_lead antes de salir hacia WhatsApp.
  window.setTimeout(() => window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`), analyticsEnabled ? 300 : 0);
});

// Envío principal. Devuelve { status: 'ok', orderNumber }, { status: 'invalid', message } si los datos no pasan
// la validación del servidor, o lanza un error si la función falla (y entonces se usa el respaldo).
async function sendOrderByResend(data) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ORDER_API_TIMEOUT_MS);
  try {
    const response = await fetch(ORDER_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _honey: data.get('_honey') || '',
        name: data.get('name'),
        phone: data.get('phone'),
        email: data.get('email'),
        addressLine1: data.get('addressLine1'),
        addressLine2: String(data.get('addressLine2') || '').trim(),
        commune: data.get('commune'),
        privacyConsent: data.get('privacyConsent') === 'Aceptado',
        items: [...cart.values()].map(({ id, quantity }) => ({ id, quantity }))
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok) return { status: 'ok', orderNumber: result.pedido || '' };
    if (response.status === 400 && result?.error) return { status: 'invalid', message: result.error };
    throw new Error(result?.error || `La función de pedidos respondió con estado ${response.status}`);
  } finally {
    window.clearTimeout(timer);
  }
}

// Respaldo: FormSubmit (dirección activada para congeladosromasil.cl; ver docs/CORREO.md).
async function sendOrderByFormSubmit(data, summary) {
  const response = await fetch(ORDER_FORM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      _subject: 'Nueva solicitud de pedido — Congelados Romasil (respaldo)',
      _template: 'table',
      _captcha: 'false',
      _honey: data.get('_honey') || '',
      nombre: data.get('name'),
      telefono: data.get('phone'),
      email: data.get('email'),
      direccion: data.get('addressLine1'),
      complementoDireccion: String(data.get('addressLine2') || '').trim(),
      comuna: data.get('commune'),
      pedido: summary
    })
  });
  const result = await response.json().catch(() => null);
  const submissionSucceeded = result?.success === true || String(result?.success).toLowerCase() === 'true';
  if (!response.ok || !submissionSucceeded) {
    throw new Error(result?.message || `El servicio de formularios respondió con estado ${response.status}`);
  }
}
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
renderCart();
