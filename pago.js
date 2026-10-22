// El carrito se elimina únicamente cuando el servidor confirmó que Transbank autorizó el pago.
if (document.body.dataset.paymentResult === 'success') {
  try { sessionStorage.removeItem('romasil-session-cart'); } catch { /* El pago igualmente quedó confirmado. */ }
}
