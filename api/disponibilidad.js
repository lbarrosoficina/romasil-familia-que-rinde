const CATALOG = require('./_catalogo.json');

async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  }
  const baseUrl = String(process.env.INTRANET_API_URL || '').replace(/\/$/, '');
  if (!baseUrl) return res.status(503).json({ ok: false, error: 'La consulta de inventario no está configurada.' });
  const bySku = new Map(Object.entries(CATALOG).map(([id, product]) => [product.inventorySku, id]));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(`${baseUrl}/api/integrations/product-availability?skus=${encodeURIComponent([...bySku.keys()].join(','))}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(result?.items)) throw new Error(result?.error || `La intranet respondió ${response.status}.`);
    const items = result.items.flatMap(item => {
      const id = bySku.get(item.sku);
      return id ? [{ id, available: Math.max(0, Number(item.available) || 0), status: item.status }] : [];
    });
    return res.status(200).json({ ok: true, items, updatedAt: result.updatedAt });
  } catch (error) {
    console.error('No se pudo consultar el inventario', error);
    return res.status(503).json({ ok: false, error: 'No pudimos actualizar la disponibilidad.' });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = handler;
