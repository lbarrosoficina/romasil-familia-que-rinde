# Operación de la web oficial

Última actualización: 13 de octubre de 2026.

## Fuente de verdad

```text
Repositorio oficial de GitHub
lbarrosoficina/romasil-familia-que-rinde · rama main
  → despliegue de producción en Vercel
    → https://congeladosromasil.cl
```

- La web que sirve Vercel es la versión oficial.
- El código oficial se mantiene en este repositorio y está directamente en su raíz.
- El dominio canónico e indexable es `https://congeladosromasil.cl`.
- El repositorio histórico `lbarrosoficina/Congelados-Romasil` no es fuente de producción.
- Las carpetas bajo `01 Web/Propuestas/Anteriores` son material histórico y no deben desplegarse.
- Netlify no es el alojamiento oficial y no debe utilizarse para decidir cuál es la versión vigente.

## Flujo de trabajo

1. Modificar esta carpeta local.
2. Revisar visualmente y probar los cambios.
3. Comprobar `git status` y resumir el lote pendiente.
4. Esperar autorización expresa para publicar.
5. Crear un único commit coherente y subirlo a `main`.
6. Verificar que Vercel publicó el mismo commit.
7. Comprobar `https://congeladosromasil.cl`, las páginas principales, imágenes, catálogo, carrito y navegación.

## Generadores (`05 Scripts/web`, fuera de este repositorio)

Un solo comando deja todo el sitio al día: `05 Scripts/web/actualizar-web.ps1`.

1. Copia las plantillas comunes de `05 Scripts/web/plantillas` a todas las páginas:
   - `recursos-head.html`: ícono, tipografías y estilos del `<head>`;
   - `encabezado.html`: logo, menú, WhatsApp y botón del carrito;
   - `pie.html`: pie de página, carrito, formulario de pedido y `app.js`.

   El menú, el pie y el formulario se cambian solo en la plantilla, nunca en las páginas. La portada conserva su encabezado flotante y cada página su enlace del menú marcado como actual.
2. Aplica la planilla de precios `precios.csv`.
3. Copia los precios a las tarjetas de la portada.
4. Regenera las categorías, las fichas de producto, la página de cobertura, el carrito (`app.js`), el feed de Merchant Center y la lista de productos para Google de `productos.html`.
5. Comprueba que cada precio coincida en todas partes.
6. Ejecuta `revisar-sitio.ps1`, que comprueba:
   - que no haya enlaces ni imágenes rotos (incluidos `srcset` y el CSS);
   - que los datos estructurados (JSON-LD) estén bien formados;
   - que cada página tenga título, descripción y canonical correcto, y que el sitemap esté completo;
   - que todas las imágenes tengan texto alternativo, que no haya id repetidos y que no haya código en línea.

   También avisa de archivos de `assets/` que no se usan.

Termina con `OK` o con la lista de problemas. `actualizar-web.ps1 -SoloVerificar` revisa sin modificar nada, y `revisar-sitio.ps1` se puede ejecutar por separado.

## Precio por kilo y productos ocultos

- Bajo el precio de cada tarjeta, `app.js` muestra el precio por kilo como dato de comparación. Las bandejas de media concha (ostiones y machas) no lo llevan. Se calcula con el precio de la tarjeta y el peso de cada formato, que está en `PACK_SIZE` de `app.js`. Si cambia el formato de un producto, actualizar ahí su peso.
- Un producto se oculta dejando su tarjeta de `productos.html` con `data-available="false" hidden` (como el chorito y la reineta). Los generadores no crean su ficha ni lo muestran en su categoría. Para volver a mostrarlo, dejarlo en `data-available="soon"` (o con precio y `"true"`), agregarlo de nuevo a su categoría en `build-categorias.ps1` y al sitemap, y quitar la redirección temporal de `vercel.json`.

## Imágenes y tipografías

- Las tipografías (Baloo 2 y Poppins, licencia OFL) están en `assets/fonts` y se declaran al inicio de `styles.css`, solo con el subconjunto latin, que cubre el español. No se carga nada desde Google Fonts.
- La foto principal de la portada usa `<picture>`: en pantallas de hasta 560 px se muestra `familia-hero-movil.webp`, un recorte vertical que conserva la resolución, porque en el celular la foto se recorta para llenar la pantalla.
- El mapa de cobertura tiene versiones de 768 y 1200 px (`srcset`). La de 1536 px queda solo para la vista previa al compartir (`og:image`).
- Las fotos de producto (800 px) ya tienen el tamaño justo para las tarjetas en celulares de alta densidad; no necesitan variantes.
- Si se reemplaza una imagen, se publica con otro nombre (por ejemplo `-v2`), porque `assets/` se guarda 7 días en la caché del navegador.

### Cambio de precios

1. Abrir `05 Scripts/web/precios.csv` (se abre con Excel) y cambiar la columna `precio`. Acepta `8200`, `8.200` o `$8.200`.
2. Ejecutar `actualizar-web.ps1`.
3. Publicar siguiendo el flujo de trabajo.

### Productos "próximamente"

Las fichas de atún y reineta las genera `build-productos.ps1` con los textos `pronto` de cada producto: sin precio, sin datos de Producto para Google y con la etiqueta "Pronto". En `precios.csv` aparecen con el precio vacío. Para ponerlos a la venta:

1. Si su formato dice "por confirmar", corregir la tarjeta en `productos.html` (el script se niega a ponerlo a la venta así).
2. Revisar sus textos de venta (`title`, `desc`, `faq`) en `build-productos.ps1` y el texto de su categoría en `build-categorias.ps1`.
3. Escribir el precio en `precios.csv` y ejecutar `actualizar-web.ps1`. Queda a la venta en el catálogo, la ficha, la categoría, el carrito, el feed y los datos para Google.

La lista de productos sale siempre de las tarjetas de `productos.html`; los generadores no tienen listas propias. Un producto completamente nuevo necesita su tarjeta en `productos.html` y sus textos en `$products` de `build-productos.ps1`.

## Seguridad de contenido

`vercel.json` define una política de seguridad de contenido (`Content-Security-Policy`). Solo se permiten:

- código propio (`app.js`) y Google Analytics (`*.googletagmanager.com`);
- estilos y tipografías propios;
- conexiones a FormSubmit y Google Analytics.

No se permite código en línea (`<script>` sin `src`, `onload=`, `onclick=`); `revisar-sitio.ps1` lo detecta. Los bloques `application/ld+json` no son código ejecutable y no se ven afectados.

Si se agrega un servicio externo (un mapa incrustado, un widget, otro formulario), hay que añadir su dominio a la directiva que corresponda o el navegador lo bloqueará. El servidor local `05 Scripts/web/serve.ps1` aplica las mismas cabeceras de `vercel.json`, así que los bloqueos se ven en la consola antes de publicar.

## Comprobaciones posteriores a la publicación

- La portada y el catálogo cargan sin errores.
- Las imágenes y páginas de producto responden correctamente.
- El carrito permite agregar, ajustar y quitar productos.
- El formulario conserva el flujo de correo y WhatsApp documentado.
- `robots.txt`, `sitemap.xml`, canonical, Open Graph y datos estructurados usan el dominio principal.
- La versión publicada coincide con los archivos de este repositorio.
- No se publicaron secretos ni credenciales.

## Diagnóstico rápido

| Situación | Revisar |
|---|---|
| GitHub cambió, pero la web no | Despliegue de Vercel asociado a `main` |
| La web no coincide con lo local | Último commit local, `origin/main` y despliegue de Vercel |
| El dominio no abre | Dominio asignado en Vercel, DNS en Cloudflare y certificado |
| El formulario no envía | Consola del navegador, FormSubmit y activación del destinatario |
| WhatsApp no abre | Número configurado y bloqueo de navegación del navegador |

Antes de modificar DNS o correo, revisar [CORREO.md](CORREO.md).
