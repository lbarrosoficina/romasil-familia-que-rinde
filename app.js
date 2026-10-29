// Google Analytics 4: solo se carga si la persona acepta la analítica en el aviso de cookies (ver politica-de-privacidad.html#cookies).
// track() no hace nada mientras no haya consentimiento, así que se puede llamar desde cualquier parte sin condiciones.
const GA_MEASUREMENT_ID = 'G-E6KL5QF5LN';
// Prueba A/B: mismo sitio y contenido para todos; en la versión B el pago se hace en la tienda nueva.
// Cada visitante queda en A o B al azar y lo mantiene. Para revisar: ?version=A o ?version=B.
const AB_STORAGE_KEY = 'romasil-ab';
const AB_CART_URL = 'https://romasil-stock-buddy.lovable.app/carro';
const AB_SKU = {
  'filetillo-pollo': 'CAR-POL-FIL', 'trutro-largo-pollo': 'CAR-POL-TRL', 'pechuga-pollo': 'CAR-POL-PEC', 'malaya-cerdo': 'CAR-CER-MAL',
  'camaron-ecuatoriano': 'MAR-CAM-CCA', 'camaron-sin-cascara': 'MAR-CAM-SCA', 'ostion-sin-coral': 'MAR-OST-SCO', 'ostion-media-concha': 'MAR-OST-MCO',
  'machas-media-concha': 'MAR-MAC-MCO', 'salmon-nacional': 'PES-SAL-FIL', 'atun-steak': 'PES-ATU-STK'
};
const AB_VERSION = (() => {
  const forced = new URLSearchParams(location.search).get('version')?.toUpperCase();
  let saved = null;
  try { saved = localStorage.getItem(AB_STORAGE_KEY); } catch { /* sin almacenamiento */ }
  const version = forced === 'A' || forced === 'B' ? forced : saved === 'A' || saved === 'B' ? saved : (Math.random() < 0.5 ? 'A' : 'B');
  try { localStorage.setItem(AB_STORAGE_KEY, version); } catch { /* sin almacenamiento: se sortea en cada visita */ }
  return version;
})();

const CONSENT_STORAGE_KEY = 'romasil-analytics-consent';
const INTRANET_URL = 'https://romasil-ventas.vercel.app';
let analyticsEnabled = false;

function addIntranetLinks() {
  document.querySelectorAll('.footer-links[aria-label="Información"]').forEach(nav => {
    if (nav.querySelector('[data-intranet-link]')) return;
    const link = document.createElement('a');
    link.href = INTRANET_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.dataset.intranetLink = '';
    link.textContent = 'Intranet';
    link.setAttribute('aria-label', 'Abrir intranet de Congelados Romasil');
    nav.appendChild(link);
  });
}

addIntranetLinks();
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
  window.gtag('config', GA_MEASUREMENT_ID, { allow_google_signals: false, allow_ad_personalization_signals: false, ab_variante: AB_VERSION });
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
  banner.innerHTML = '<p>Usamos Google Analytics para mejorar la web, solo si lo aceptas. <a href="politica-de-privacidad.html#cookies">Más información</a></p><div class="consent-actions"><button type="button" class="button secondary" data-consent="denied">Rechazar</button><button type="button" class="button primary" data-consent="granted">Aceptar</button></div>';
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
  'camaron-ecuatoriano': { name: 'Camarón ecuatoriano con cáscara 36/40', price: 10350, pricedByKilo: false },
  'camaron-sin-cascara': { name: 'Camarón ecuatoriano sin cáscara 36/40', price: 11600, pricedByKilo: false },
  'ostion-sin-coral': { name: 'Ostión sin coral 20/40', price: 11900, pricedByKilo: false },
  'ostion-media-concha': { name: 'Ostión con coral en media concha', price: 6900, pricedByKilo: false },
  'machas-media-concha': { name: 'Machas en media concha congeladas', price: 7900, pricedByKilo: false },
  'salmon-nacional': { name: 'Salmón nacional filete', price: 7950, pricedByKilo: false },
  'atun-steak': { name: 'Atún steak premium', price: 2990, pricedByKilo: false },
  'producto-test': { name: 'Producto test', price: 50, pricedByKilo: false }
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
const shipProgress = document.querySelector('#shipProgress');
const shipProgressText = document.querySelector('#shipProgressText');
const shipProgressBar = document.querySelector('#shipProgressBar');
const toast = document.querySelector('#toast');
const checkoutDialog = document.querySelector('#checkoutDialog');
const openCartButton = document.querySelector('#openCart');
const closeCartButton = document.querySelector('#closeCart');
const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('#primaryNav');
const checkoutForm = document.querySelector('#checkoutForm');
const formStatus = document.querySelector('#formStatus');
const pageRegions = document.querySelectorAll('body > header, body > main, body > footer');
// Prueba A/B: en B el carro está siempre a la vista (panel fijo en pantallas anchas, barra abajo en celular).
const AB_FIXED_CART = AB_VERSION === 'B';
const abWide = window.matchMedia('(min-width: 1100px)');
const abPinned = () => AB_FIXED_CART && abWide.matches;
const abBar = document.createElement('button');
abBar.type = 'button';
abBar.className = 'ab-cart-bar';
abBar.hidden = true;
abBar.addEventListener('click', () => document.querySelector('#checkoutButton')?.click());
function abPin() {
  if (!AB_FIXED_CART) return;
  const on = abWide.matches;
  drawer.inert = !on;
  drawer.setAttribute('aria-hidden', String(!on));
  drawer.setAttribute('role', on ? 'region' : 'dialog');
  drawer.setAttribute('aria-modal', String(!on));
}
if (AB_FIXED_CART) {
  document.documentElement.classList.add('ab-b');
  document.body.append(abBar);
  abPin();
  abWide.addEventListener('change', abPin);
}
const WHATSAPP_NUMBER = '56962319733';
const SHIPPING_COST = 3500;
const FREE_SHIPPING_THRESHOLD = 50000;
// Pedidos: primero la función propia con Resend (api/pedido.js); FormSubmit queda como respaldo automático.
const ORDER_API_ENDPOINT = '/api/pedido';
const ORDER_API_TIMEOUT_MS = 12000;
const ORDER_FORM_ENDPOINT = 'https://formsubmit.co/ajax/ventas@congeladosromasil.cl';
const WEBPAY_API_ENDPOINT = '/api/webpay-crear';
const WEBPAY_API_TIMEOUT_MS = 12000;
const CARD_SURCHARGE_RATE = 0.03;
const PAYMENT_RECEIPT_EMAIL = 'ventas@congeladosromasil.cl';
const AVAILABILITY_API_ENDPOINT = '/api/disponibilidad';
const productAvailability = new Map();

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
  if (abPinned()) { drawer.focus(); return; }
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
  abPin();
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
  const testOnly = items.length > 0 && items.every(item => item.id === 'producto-test');
  const shipping = testOnly || total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  cartShipping.textContent = shipping === 0 ? 'Gratis' : money.format(shipping);
  cartGrandTotal.textContent = money.format(total + shipping);
  if (AB_FIXED_CART) {
    abBar.hidden = count === 0;
    abBar.innerHTML = `<span>Tu pedido · ${count} ${count === 1 ? 'producto' : 'productos'} · <strong>${money.format(total + shipping)}</strong></span><span class="ab-cart-go">Ir al pago →</span>`;
  }
  renderShippingProgress(total, testOnly);
  const hasKiloItems = items.some(item => item.pricedByKilo);
  cartShippingNote.hidden = !hasKiloItems;
  cartShippingNote.textContent = hasKiloItems
    ? 'Los productos por kg se estiman con 1 kg por unidad; el total y el despacho final se confirman según el peso real.'
    : '';
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

// Barra "te faltan $X para el despacho gratis" en el resumen del carrito.
function renderShippingProgress(total, testOnly = false) {
  if (!shipProgress) return;
  const reached = testOnly || total >= FREE_SHIPPING_THRESHOLD;
  const percent = testOnly ? 100 : Math.min(100, Math.round((total / FREE_SHIPPING_THRESHOLD) * 100));
  shipProgress.classList.toggle('is-free', reached);
  shipProgressText.innerHTML = reached
    ? '<strong>¡Tienes despacho gratis!</strong>'
    : `Te faltan <strong>${money.format(FREE_SHIPPING_THRESHOLD - total)}</strong> para el despacho gratis`;
  shipProgressBar.style.width = `${percent}%`;
  shipProgressBar.parentElement.setAttribute('aria-valuenow', String(percent));
}

// Precio por kilo bajo el precio de cada tarjeta, como dato para comparar.
// Las bandejas de media concha (ostiones y machas) no lo llevan: se venden por unidades, no por peso.
// El precio sale siempre de la tarjeta (data-price); aquí solo va el peso de cada formato.
// Si cambia el formato de un producto (por ejemplo, de 700 g a 1 kg), actualizarlo aquí.
const PACK_SIZE = {
  'filetillo-pollo': { kg: 0.7 },
  'trutro-largo-pollo': { kg: 0.8 },
  'pechuga-pollo': { kg: 0.75 },
  'malaya-cerdo': { kg: 0.9 },
  'salmon-nacional': { kg: 0.5 },
  'camaron-ecuatoriano': { kg: 1 },
  'camaron-sin-cascara': { kg: 1 },
  'ostion-sin-coral': { kg: 1 },
  'atun-steak': { kg: 0.23 }
};
document.querySelectorAll('.product-card[data-available="true"][data-id]').forEach(card => {
  const size = PACK_SIZE[card.dataset.id];
  const price = Number(card.dataset.price);
  const priceElement = card.querySelector('.product-footer > strong');
  if (!size || !price || !priceElement) return;
  const text = `${money.format(Math.round(price / size.kg))}/kg`;
  const stack = document.createElement('div');
  stack.className = 'price-stack';
  priceElement.replaceWith(stack);
  const unitPrice = document.createElement('span');
  unitPrice.className = 'unit-price';
  unitPrice.textContent = text;
  stack.append(priceElement, unitPrice);
});

// Selector de cantidad junto a cada botón "Agregar"; se arma aquí para no repetirlo en todas las páginas generadas.
function readCardQuantity(input) {
  const value = Math.floor(Number(input.value));
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), MAX_QUANTITY) : 1;
}
document.querySelectorAll('.product-card[data-available="true"] .add-button').forEach(button => {
  const name = button.closest('.product-card').querySelector('h3, h1')?.textContent.trim() || 'producto';
  const picker = document.createElement('div');
  picker.className = 'quantity card-quantity';
  picker.innerHTML = `<button type="button" data-step="-1" aria-label="Una unidad menos de ${escapeHtml(name)}">−</button><input type="number" inputmode="numeric" min="1" max="${MAX_QUANTITY}" value="1" aria-label="Cantidad de ${escapeHtml(name)}"><button type="button" data-step="1" aria-label="Una unidad más de ${escapeHtml(name)}">+</button>`;
  const input = picker.querySelector('input');
  picker.addEventListener('click', event => {
    const step = event.target.closest('button[data-step]');
    if (step) input.value = Math.min(Math.max(readCardQuantity(input) + Number(step.dataset.step), 1), MAX_QUANTITY);
  });
  input.addEventListener('change', () => { input.value = readCardQuantity(input); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') button.click(); });
  const group = document.createElement('div');
  group.className = 'card-buy';
  button.replaceWith(group);
  group.append(picker, button);
});

document.querySelectorAll('.product-card[data-available="true"] .add-button').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.product-card');
  const id = card.dataset.id;
  if (!Object.hasOwn(CATALOG, id)) {
    console.warn(`El producto "${id}" está a la venta en la página pero no en CATALOG de app.js. Vuelve a ejecutar build-productos.ps1.`);
    showToast('Este producto no se puede agregar en este momento. Escríbenos por WhatsApp.');
    return;
  }
  const input = card.querySelector('.card-quantity input');
  const requested = input ? readCardQuantity(input) : 1;
  const existing = cart.get(id);
  const previous = existing?.quantity || 0;
  const available = productAvailability.get(id)?.available;
  const limit = Number.isFinite(available) ? Math.min(MAX_QUANTITY, Math.floor(available)) : MAX_QUANTITY;
  const line = cartLine(id, Math.min(previous + requested, limit));
  const added = line.quantity - previous;
  if (added <= 0) {
    showToast(Number.isFinite(available) ? `Solo quedan ${limit} unidades disponibles de ${line.name}` : `Ya tienes el máximo de ${MAX_QUANTITY} unidades de ${line.name}`);
    return;
  }
  cart.set(id, line);
  persistCart();
  renderCart();
  if (input) input.value = 1;
  showToast(added === 1 ? `${line.name} agregado` : `${added} × ${line.name} agregados`);
  track('add_to_cart', { currency: 'CLP', value: line.price * added, items: [{ item_id: id, item_name: line.name, price: line.price, quantity: added }] });
}));

function applyInventoryAvailability(items) {
  productAvailability.clear();
  items.forEach(item => productAvailability.set(item.id, item));
  document.querySelectorAll('.product-card[data-available="true"]').forEach(card => {
    const item = productAvailability.get(card.dataset.id);
    if (!item) return;
    const available = Math.max(0, Math.floor(item.available));
    card.dataset.stockAvailable = String(available);
    let label = card.querySelector('.stock-status');
    if (!label) {
      label = document.createElement('p');
      label.className = 'stock-status';
      card.querySelector('.product-info')?.insertBefore(label, card.querySelector('.product-footer'));
    }
    label.className = `stock-status is-${item.status}`;
    label.textContent = item.status === 'out' ? 'Agotado' : item.status === 'low' ? `Pocas unidades (${available})` : 'Disponible';
    const addButton = card.querySelector('.add-button');
    if (addButton) {
      addButton.disabled = available <= 0;
      addButton.textContent = available <= 0 ? 'Agotado' : addButton.closest('.product-detail') ? 'Agregar al pedido' : 'Agregar';
    }
    const quantityInput = card.querySelector('.card-quantity input');
    if (quantityInput) {
      quantityInput.max = String(Math.max(1, Math.min(MAX_QUANTITY, available)));
      quantityInput.disabled = available <= 0;
    }
    card.querySelectorAll('.card-quantity button').forEach(button => { button.disabled = available <= 0; });
  });
  let changed = false;
  for (const [id, line] of cart) {
    const item = productAvailability.get(id);
    if (!item) continue;
    const available = Math.max(0, Math.floor(item.available));
    if (available <= 0) { cart.delete(id); changed = true; }
    else if (line.quantity > available) { line.quantity = available; changed = true; }
  }
  if (changed) { persistCart(); renderCart(); showToast('Actualizamos tu carrito según el stock disponible'); }
}

async function loadInventoryAvailability() {
  try {
    const response = await fetch(AVAILABILITY_API_ENDPOINT, { headers: { Accept: 'application/json' } });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok && Array.isArray(result.items)) applyInventoryAvailability(result.items);
  } catch (error) {
    console.warn('No se pudo actualizar la disponibilidad del inventario', error);
  }
}

void loadInventoryAvailability();
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
  if (button.dataset.action === 'increase') {
    const available = productAvailability.get(item.id)?.available;
    const limit = Number.isFinite(available) ? Math.min(MAX_QUANTITY, Math.floor(available)) : MAX_QUANTITY;
    item.quantity = Math.min(item.quantity + 1, limit);
  }
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
openCartButton.addEventListener('click', () => { openCart(); void loadInventoryAvailability(); });
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
  // Versión B: el carro pasa a la tienda nueva con los mismos productos y cantidades (por SKU).
  const abItems = [...cart.values()].filter(item => AB_SKU[item.id]).map(item => `${AB_SKU[item.id]}:${item.quantity}`);
  if (AB_VERSION === 'B' && abItems.length) {
    location.href = `${AB_CART_URL}?items=${encodeURIComponent(abItems.join(','))}`;
    return;
  }
  updatePaymentChoice();
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
function cartTotals(paymentMethod = '') {
  const items = [...cart.values()];
  const products = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const testOnly = items.length > 0 && items.every(item => item.id === 'producto-test');
  const shipping = testOnly || products >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const baseTotal = products + shipping;
  const surcharge = paymentMethod === 'card' && !testOnly ? Math.round(baseTotal * CARD_SURCHARGE_RATE) : 0;
  return { products, shipping, baseTotal, surcharge, total: baseTotal + surcharge };
}
function updatePaymentChoice() {
  const paymentMethod = checkoutForm.elements.paymentMethod?.value || '';
  const totals = cartTotals(paymentMethod);
  const transferPanel = document.querySelector('#transferPanel');
  const cardPanel = document.querySelector('#cardPanel');
  const totalPanel = document.querySelector('#checkoutTotal');
  const surchargeRow = document.querySelector('#cardSurchargeRow');
  const submitButton = checkoutForm.querySelector('button[type="submit"]');
  transferPanel.hidden = paymentMethod !== 'transfer';
  cardPanel.hidden = paymentMethod !== 'card';
  totalPanel.hidden = !paymentMethod;
  surchargeRow.hidden = paymentMethod !== 'card';
  document.querySelector('#checkoutBaseTotal').textContent = money.format(totals.baseTotal);
  document.querySelector('#cardSurcharge').textContent = money.format(totals.surcharge);
  document.querySelector('#checkoutGrandTotal').textContent = money.format(totals.total);
  submitButton.classList.toggle('is-webpay', paymentMethod === 'card');
  submitButton.textContent = paymentMethod === 'transfer' ? 'Registrar pedido por transferencia' : paymentMethod === 'card' ? 'Pagar con Webpay' : 'Continuar';
  document.querySelector('#paymentNote').textContent = paymentMethod === 'transfer'
    ? `Después de transferir, envía el comprobante a ${PAYMENT_RECEIPT_EMAIL} o por WhatsApp.`
    : paymentMethod === 'card'
      ? 'Serás dirigido al sitio seguro de Transbank.'
      : 'Selecciona un medio de pago para continuar.';
}
checkoutForm.addEventListener('change', event => {
  if (event.target.name === 'paymentMethod') updatePaymentChoice();
});
function buildOrderSummary(data, orderNumber = '') {
  const cartItemsList = [...cart.values()];
  const items = cartItemsList.map(item => `${item.quantity} × ${item.name}${item.pricedByKilo ? ' (precio por kg; peso por confirmar)' : ''}`).join('\n');
  const paymentMethod = String(data.get('paymentMethod') || '');
  const totals = cartTotals(paymentMethod);
  const shippingLabel = totals.shipping === 0 ? 'Gratis' : money.format(totals.shipping);
  const paymentLabel = paymentMethod === 'card' ? 'Tarjeta mediante Webpay' : 'Transferencia bancaria';
  const surchargeLine = totals.surcharge ? `\nRecargo tarjeta (3%): ${money.format(totals.surcharge)}` : '';
  const addressLine2 = String(data.get('addressLine2') || '').trim();
  const addressDetails = addressLine2 ? `\nDepartamento/casa: ${addressLine2}` : '';
  const weightNote = cartItemsList.some(item => item.pricedByKilo) ? '\nLos productos por kg se estiman con 1 kg por unidad. El total y el despacho final dependen del peso real.' : '';
  const orderLine = orderNumber ? `\nN° de solicitud: ${orderNumber}` : '';
  return `Hola, quiero registrar este pedido en Congelados Romasil.${orderLine}\n\nNombre: ${data.get('name')}\nTeléfono: ${data.get('phone')}\nCorreo electrónico: ${data.get('email')}\nDirección: ${data.get('addressLine1')}${addressDetails}\nComuna: ${data.get('commune')}\nMedio de pago: ${paymentLabel}\n\nProductos:\n${items}\n\nSubtotal: ${money.format(totals.products)}\nDespacho: ${shippingLabel}${surchargeLine}\nTotal a pagar: ${money.format(totals.total)}${weightNote}`;
}

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
  const paymentMethod = String(data.get('paymentMethod') || '');
  submitButton.disabled = true;
  submitButton.textContent = paymentMethod === 'card' ? 'Conectando con Webpay…' : 'Registrando pedido…';
  formStatus.textContent = paymentMethod === 'card' ? 'Preparando tu pago de forma segura…' : 'Registrando tus datos para la transferencia…';
  const resetButton = () => {
    submitButton.disabled = false;
    updatePaymentChoice();
  };

  let payment = null;
  if (paymentMethod === 'card') {
    try {
      payment = await createWebpayTransaction();
    } catch (error) {
      console.error('No fue posible iniciar Webpay', error);
      formStatus.textContent = error.message || 'No pudimos conectar con Webpay. Intenta nuevamente.';
      resetButton();
      return;
    }
  }

  // Para tarjeta se relaciona el pedido con la orden de Webpay; para transferencia el servidor genera el número.
  let orderNumber = payment?.orderNumber || '';
  let channel = '';
  try {
    const result = await sendOrderByResend(data, orderNumber);
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
      await sendOrderByFormSubmit(data, buildOrderSummary(data, orderNumber));
      channel = 'formsubmit';
    } catch (error) {
      console.error('No fue posible registrar la solicitud', error);
      // Si fallan los dos envíos por correo, se ofrece enviar el mismo pedido por WhatsApp.
      const waUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(buildOrderSummary(data))}`;
      formStatus.innerHTML = `No pudimos registrar el pedido por correo. Reintenta o <a href="${waUrl}" target="_blank" rel="noopener">envíalo por WhatsApp</a>.`;
      resetButton();
      return;
    }
  }

  track('generate_lead', cartEventParams({ lead_source: 'formulario_pedido', order_channel: channel }));
  track('add_payment_info', cartEventParams({ payment_type: paymentMethod === 'card' ? 'Webpay' : 'Transferencia' }));
  if (paymentMethod === 'transfer') {
    const orderReference = orderNumber ? ` de mi pedido ${orderNumber}` : ' de mi pedido';
    const registeredMessage = orderNumber ? `Pedido <strong>${escapeHtml(orderNumber)}</strong> registrado.` : 'Pedido registrado.';
    const whatsappText = encodeURIComponent(`Hola, adjunto el comprobante de transferencia${orderReference} en Congelados Romasil.`);
    formStatus.innerHTML = `${registeredMessage} Realiza la transferencia con los datos indicados y envía el comprobante a <a href="mailto:${PAYMENT_RECEIPT_EMAIL}">${PAYMENT_RECEIPT_EMAIL}</a> o por <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}" target="_blank" rel="noopener">WhatsApp</a>.`;
    submitButton.textContent = 'Pedido registrado';
    return;
  }
  formStatus.textContent = 'Abriendo Webpay…';
  postToWebpay(payment);
});

// Envío principal. Devuelve { status: 'ok', orderNumber }, { status: 'invalid', message } si los datos no pasan
// la validación del servidor, o lanza un error si la función falla (y entonces se usa el respaldo).
async function sendOrderByResend(data, orderNumber) {
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
        paymentMethod: data.get('paymentMethod'),
        privacyConsent: data.get('privacyConsent') === 'Aceptado',
        orderNumber,
        items: [...cart.values()].map(({ id, quantity }) => ({ id, quantity }))
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.ok) return { status: 'ok', orderNumber: result.pedido || '' };
    if ((response.status === 400 || result?.code === 'INTRANET_UNAVAILABLE') && result?.error) return { status: 'invalid', message: result.error };
    throw new Error(result?.error || `La función de pedidos respondió con estado ${response.status}`);
  } finally {
    window.clearTimeout(timer);
  }
}

async function createWebpayTransaction() {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), WEBPAY_API_TIMEOUT_MS);
  try {
    const response = await fetch(WEBPAY_API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ paymentMethod: 'card', items: [...cart.values()].map(({ id, quantity }) => ({ id, quantity })) }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.ok || !result?.token || !result?.url || !result?.orderNumber) {
      throw new Error(result?.error || 'No pudimos iniciar el pago con Webpay.');
    }
    return result;
  } finally {
    window.clearTimeout(timer);
  }
}

function postToWebpay(payment) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = payment.url;
  const token = document.createElement('input');
  token.type = 'hidden';
  token.name = 'token_ws';
  token.value = payment.token;
  form.appendChild(token);
  document.body.appendChild(form);
  form.submit();
}

// Respaldo: FormSubmit (dirección activada para www.congeladosromasil.cl; ver docs/CORREO.md).
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
