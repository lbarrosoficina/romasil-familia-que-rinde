const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const CART_STORAGE_KEY = 'romasil-session-cart';
// Mantener esta lista alineada con los productos data-available="true" del catálogo.
// Así, los productos ocultos permanecen en el HTML para una futura reactivación, pero no se pueden pedir por un carrito antiguo.
const AVAILABLE_PRODUCT_IDS = new Set(['filetillo-pollo', 'pechuga-pollo', 'trutro-largo-pollo', 'malaya-cerdo', 'salmon-nacional', 'camaron-ecuatoriano', 'camaron-sin-cascara', 'ostion-media-concha', 'ostion-sin-coral', 'machas-media-concha']);
let storedCart = [];
try {
  const parsedCart = JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) || '[]');
  if (Array.isArray(parsedCart)) storedCart = parsedCart.filter(item => AVAILABLE_PRODUCT_IDS.has(item.id));
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
const ORDER_FORM_ENDPOINT = 'https://formsubmit.co/ajax/lbarros.oficina@gmail.com';

function setPageRegionsInert(isInert) {
  pageRegions.forEach(region => { region.inert = isInert; });
}

function persistCart() {
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify([...cart.values()]));
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
  cartItems.innerHTML = items.map(item => `
    <div class="cart-line">
      <div><h3>${item.name}</h3><p>${money.format(item.price)} ${item.pricedByKilo ? '/kg · estimado por 1 kg' : 'c/u'}</p><div class="quantity"><button type="button" data-action="decrease" data-id="${item.id}" aria-label="Quitar una unidad de ${item.name}">−</button><strong>${item.quantity}</strong><button type="button" data-action="increase" data-id="${item.id}" aria-label="Agregar una unidad de ${item.name}">+</button></div><button class="remove" type="button" data-action="remove" data-id="${item.id}" aria-label="Eliminar ${item.name} del pedido">Eliminar</button></div>
      <strong>${money.format(item.price * item.quantity)}</strong>
    </div>`).join('');
}

document.querySelectorAll('.product-card[data-available="true"] .add-button').forEach(button => button.addEventListener('click', () => {
  const card = button.closest('.product-card');
  const id = card.dataset.id;
  const existing = cart.get(id);
  const pricedByKilo = card.querySelector('.product-footer strong')?.textContent.includes('/kg') || false;
  cart.set(id, { id, name: card.dataset.name, price: Number(card.dataset.price), pricedByKilo, quantity: existing ? existing.quantity + 1 : 1 });
  persistCart();
  renderCart();
  showToast(`${card.dataset.name} agregado`);
}));

cartItems.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const item = cart.get(button.dataset.id);
  if (!item) return;
  if (button.dataset.action === 'increase') item.quantity += 1;
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
    const isAvailable = card.dataset.available === 'true';
    card.hidden = !isAvailable || (filter !== 'todos' && card.dataset.category !== filter);
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
  checkoutDialog.showModal();
  checkoutForm.elements.name.focus();
});
document.querySelector('#closeDialog').addEventListener('click', () => checkoutDialog.close());
checkoutDialog.addEventListener('close', () => openCartButton.focus());
function buildOrderSummary(data) {
  const cartItemsList = [...cart.values()];
  const items = cartItemsList.map(item => `${item.quantity} × ${item.name}${item.pricedByKilo ? ' (precio por kg; peso por confirmar)' : ''}`).join('\n');
  const total = cartItemsList.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const shippingLabel = shipping === 0 ? 'Gratis' : money.format(shipping);
  const addressLine2 = String(data.get('addressLine2') || '').trim();
  const addressDetails = addressLine2 ? `\nDepartamento/casa: ${addressLine2}` : '';
  return `Hola, quiero solicitar este pedido en Congelados Romasil.\n\nNombre: ${data.get('name')}\nTeléfono: ${data.get('phone')}\nCorreo electrónico: ${data.get('email')}\nDirección: ${data.get('addressLine1')}${addressDetails}\nComuna: ${data.get('commune')}\n\nProductos:\n${items}\n\nSubtotal referencial: ${money.format(total)}\nDespacho: ${shippingLabel}\nTotal referencial: ${money.format(total + shipping)}`;
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
  const cartItemsList = [...cart.values()];
  const items = cartItemsList.map(item => `${item.quantity} × ${item.name}${item.pricedByKilo ? ' (precio por kg; peso por confirmar)' : ''}`).join('\n');
  const total = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shipping = total >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const shippingLabel = shipping === 0 ? 'Gratis' : money.format(shipping);
  const addressLine2 = String(data.get('addressLine2') || '').trim();
  const addressDetails = addressLine2 ? `\nDepartamento/casa: ${addressLine2}` : '';
  const weightNote = cartItemsList.some(item => item.pricedByKilo) ? '\nLos productos por kg se estiman con 1 kg por unidad. El total y el despacho final dependen del peso real.' : '';
  const summary = buildOrderSummary(data);
  submitButton.disabled = true;
  submitButton.textContent = 'Enviando…';
  formStatus.textContent = 'Registrando tu solicitud de forma segura…';

  try {
    const response = await fetch(ORDER_FORM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        _subject: 'Nueva solicitud de pedido — Congelados Romasil',
        _template: 'table',
        _captcha: 'false',
        _honey: data.get('_honey') || '',
        nombre: data.get('name'),
        telefono: data.get('phone'),
        email: data.get('email'),
        direccion: data.get('addressLine1'),
        complementoDireccion: addressLine2,
        comuna: data.get('commune'),
        pedido: summary
      })
    });
    const result = await response.json().catch(() => null);
    const submissionSucceeded = result?.success === true || String(result?.success).toLowerCase() === 'true';
    if (!response.ok || !submissionSucceeded) {
      throw new Error(result?.message || `El servicio de formularios respondió con estado ${response.status}`);
    }

    cart.clear();
    persistCart();
    renderCart();
    checkoutDialog.close();
    window.location.assign(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(summary)}`);
  } catch (error) {
    console.error('No fue posible registrar la solicitud', error);
    formStatus.textContent = 'No pudimos registrar la solicitud por correo. Puedes reintentar o continuar directamente por WhatsApp con el botón disponible en este formulario.';
    submitButton.disabled = false;
    submitButton.textContent = 'Enviar solicitud';
  }
});
const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
renderCart();
