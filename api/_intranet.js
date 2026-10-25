const crypto = require('node:crypto');

const DEFAULT_TIMEOUT_MS = 5000;

function signIntranetPayload(secret, timestamp, body) {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

async function sendIntranetEvent(event, options = {}) {
  const baseUrl = String(process.env.INTRANET_API_URL || '').replace(/\/$/, '');
  const secret = process.env.INTRANET_WEBHOOK_SECRET;
  if (!baseUrl || !secret) throw new Error('La integración con la intranet no está configurada.');

  const body = JSON.stringify(event);
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/api/integrations/web-orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Romasil-Timestamp': timestamp,
          'X-Romasil-Signature': signIntranetPayload(secret, timestamp, body)
        },
        body,
        signal: controller.signal
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.ok) return result;
      const error = new Error(result?.error || `La intranet respondió con estado ${response.status}.`);
      error.status = response.status;
      if (response.status >= 400 && response.status < 500 && response.status !== 409) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error?.status >= 400 && error.status < 500 && error.status !== 409) throw error;
    } finally {
      clearTimeout(timer);
    }
    if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError || new Error('No fue posible registrar el pedido en la intranet.');
}

module.exports = { sendIntranetEvent, signIntranetPayload };
