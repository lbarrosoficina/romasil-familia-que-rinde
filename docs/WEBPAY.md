# Pago con Webpay Plus

Estado al 16 de octubre de 2026: **programado y probado con Transbank, Redis y Resend simulados. Sin publicar, sin commit.** Falta probarlo en una vista previa de Vercel contra el ambiente de integración de Transbank (§8), y eso requiere autorización para subir una rama.

Fuente técnica: [Transbank Developers – Webpay Plus](https://www.transbankdevelopers.cl/documentacion/webpay-plus), [Referencia API](https://www.transbankdevelopers.cl/referencia/webpay) (REST v1.2) y [Cómo empezar](https://www.transbankdevelopers.cl/documentacion/como_empezar).

## 1. Flujo

La web promete, en el inicio, las páginas de comuna, confianza y privacidad, que **el pago se hace con un enlace de Webpay enviado después de confirmar stock, despacho y total**. Esto mantiene esa promesa: no se cobra en el carrito.

```text
carrito → /api/pedido (igual que antes; el correo a ventas@ trae un botón "Crear enlace de pago")
→ ventas confirma con el cliente por WhatsApp
→ ventas abre admin-pago.html (prellenada desde el botón), ajusta el total si cambió, pone la clave y crea el enlace
→ ventas envía el enlace por WhatsApp (botón) o lo copia
→ el cliente abre pagar.html#d=…&f=…, ve pedido y total, y pulsa "Pagar con Webpay"
→ /api/webpay-crear crea la transacción y el navegador envía token_ws a Webpay
→ Transbank cobra y devuelve al cliente a /api/webpay-retorno
→ la función confirma con Transbank, guarda el pago en Redis, envía correos a ventas@ y al cliente
→ pago-resultado.html muestra el resultado (y registra "purchase" en Analytics si hay consentimiento)
```

## 2. Archivos

| Archivo | Qué hace |
|---|---|
| `api/_webpay.js` | Configuración desde variables de entorno, llamadas REST a Transbank (crear, confirmar, estado, reembolso), firma HMAC-SHA256 del enlace (Web Crypto), Redis por REST y utilidades HTTP. Sin dependencias npm. |
| `api/_correo.js` | Piezas comunes de correo (marco HTML, colores, `enviarCorreo` con Resend), sacadas de `pedido.js` para reutilizarlas. |
| `api/link-pago.js` | POST con la clave de ventas. Valida pedido, monto, correo y nombre; rechaza pedidos ya pagados; devuelve el enlace firmado (vence en 48 h). Si no se da número de pedido, crea uno con el mismo formato de la web. Límite: 10 intentos de clave cada 15 min por IP. |
| `api/webpay-crear.js` | `accion: "consultar"` devuelve los datos del enlace y si ya está pagado; `accion: "pagar"` crea la transacción (`buy_order` = pedido + `-intento`) y devuelve `{ url, token }`. |
| `api/webpay-retorno.js` | `return_url` (GET y POST). Distingue los casos de §4, confirma, guarda, envía correos y redirige con 303 a `pago-resultado.html`. |
| `api/pedido.js` | Sin cambios de comportamiento; ahora usa `_correo.js` y el correo a ventas@ trae el botón "Crear enlace de pago". |
| `admin-pago.html` + `admin-pago.js` | Página interna de ventas (noindex). Se prellena desde el fragmento `#pedido=…&monto=…`, que el navegador no envía al servidor. |
| `pagar.html` + `pagar.js` | Página del cliente (noindex). |
| `pago-resultado.html` + `pago-resultado.js` | Mensaje según `?estado=` (aprobado, rechazado, anulado, tiempo, pendiente, error), con "Intentar de nuevo" solo cuando no hubo cobro. |
| `styles.css` | Bloque "Pago con Webpay". |
| `vercel.json` | `form-action` permite los dos hosts de Webpay; las tres páginas llevan `X-Robots-Tag: noindex` y `no-store`. |
| `05 Scripts/web/revisar-sitio.ps1` | Las páginas con `<meta name="robots" content="noindex…">` no necesitan canonical y no pueden estar en el sitemap. |

Las tres páginas usan las plantillas comunes (encabezado, pie, carrito): `sincronizar-plantillas.ps1` las mantiene al día como al resto. Su script va en el `<head>` con `defer`, antes de `<meta name="theme-color">`, para que la plantilla no lo borre.

**Privacidad del enlace:** `d` lleva pedido, monto, correo, nombre y detalle en base64 (firmado, no cifrado). Por eso el enlace usa el fragmento `#`, que no llega a los logs de Vercel, a Google Analytics ni al Referer que recibe Transbank. La respuesta de `consultar` no devuelve el correo.

## 3. Variables de entorno en Vercel

Las ingresa el usuario en Settings → Environment Variables; nunca van en el código ni en este repo.

| Variable | Preview (pruebas) | Production |
|---|---|---|
| `TBK_AMBIENTE` | `integracion` | `produccion` |
| `TBK_CODIGO_COMERCIO` | `597055555532` (público, de Transbank) | código entregado al afiliarse |
| `TBK_API_KEY` | llave pública de integración publicada en [Cómo empezar](https://www.transbankdevelopers.cl/documentacion/como_empezar) | llave entregada tras la validación (Secret) |
| `PAGO_FIRMA_SECRETO` | valor aleatorio largo (Secret) | otro valor aleatorio largo (Secret) |
| `PAGO_ADMIN_CLAVE` | clave de ventas (Secret) | ídem |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | los crea la integración de Upstash del Marketplace de Vercel (también se aceptan `UPSTASH_REDIS_REST_URL`/`_TOKEN`) | ídem, otra base o la misma |
| `RESEND_API_KEY` | ya existe | ya existe |

Si falta alguna, las funciones responden 503 (o "error" en el retorno) y lo registran en los logs; la web sigue funcionando y los pedidos siguen llegando por `/api/pedido`.

Cambiar `PAGO_FIRMA_SECRETO` invalida todos los enlaces vigentes.

## 4. Casos de retorno de Transbank

| Llega | Caso | Resultado |
|---|---|---|
| `token_ws` | Pago terminado | Confirma (`PUT`). Aprobado solo si `response_code === 0`, `status === 'AUTHORIZED'` y monto y orden coinciden con lo creado. |
| `TBK_TOKEN` (+ orden y sesión), con o sin `token_ws` | Anulado o regreso desde un error | "anulado", sin confirmar. |
| `TBK_ORDEN_COMPRA` + `TBK_ID_SESION`, sin token | Tiempo excedido (4 min en producción) | "tiempo". |
| Confirmación falla por red | — | Se consulta el estado (`GET`); si tampoco responde, "pendiente" sin guardar nada, y una recarga vuelve a intentar. |
| Mismo token otra vez (recarga) | — | Mismo resultado guardado, sin otra confirmación ni correos. |
| Dos pagos aprobados del mismo pedido (dos pestañas) | — | El segundo envía a ventas@ un aviso "Pago DUPLICADO" para reembolsarlo. |

Claves de Redis: `pago:{pedido}` (1 año), `intento:{pedido}`, `tx:{token}`, `orden:{buy_order}`, `res:{token}` (7 días), `lock:{token}` (60 s), `rl:{ip}` (15 min).

## 5. Correos

- A ventas@: "Pago recibido del pedido …" con monto, cliente, medio de pago, últimos 4 dígitos, autorización y orden; `reply_to` es el cliente.
- Al cliente: comprobante con los mismos datos; `reply_to` es ventas@.
- En integración el asunto empieza con `[PRUEBA]`.
- `Idempotency-Key` = orden de compra + destino, así un reintento no duplica correos.

## 6. Pruebas hechas (simuladas)

Arnés en el navegador (scratchpad de la sesión: `prueba-webpay/`, servidor `prueba-webpay` en `.claude/launch.json`, puerto 8767). Copia el sitio, ejecuta las funciones reales con Transbank, Upstash y Resend falsos, y permite `unsafe-eval` solo en la CSP de la copia.

58 casos OK: validaciones del enlace (clave, monto, correo, número, origen, método), límite de intentos, enlace vencido, monto manipulado, firma falsa, creación con orden y monto correctos, aprobado (correos, escape de HTML, Redis), recarga, ya pagado (409), rechazado y reintento con orden nueva, anulado, tiempo excedido, cuatro variables, commit caído con estado aprobado, Transbank caído (pendiente y luego aprobado), monto distinto, doble pago, token desconocido, configuración faltante o inválida, y `pedido.js` con su botón de pago.

Flujo de páginas revisado en el navegador, en escritorio y a 375 px: admin prellenado → enlace → pagar.html → formulario POST a `webpay3gint` con `token_ws` → retorno → resultado aprobado y rechazado. `revisar-sitio.ps1`: OK con 40 páginas.

No probado todavía: Transbank real, Upstash real, Resend real ni el `form-action` contra Webpay de verdad.

## 7. Textos legales (pendiente, antes de producción)

`politica-de-privacidad.html` debe revisarse: la web ahora guarda el estado del pago (pedido, monto, autorización, últimos 4 dígitos, medio de pago) en Upstash, y los datos del enlace pasan por Vercel. Hay que agregar Upstash como proveedor. Mostrar el texto propuesto antes de publicarlo.

## 8. Prueba en ambiente de integración (siguiente paso, requiere autorización)

1. Usuario: en Vercel, Storage/Marketplace → Upstash Redis → crear base y conectarla al proyecto (Preview y Production).
2. Usuario: cargar las variables de §3 en **Preview** con valores de integración.
3. Con autorización: subir la rama `webpay-pruebas` (no `main`). Vercel crea una URL de vista previa; congeladosromasil.cl no cambia.
4. En la vista previa, crear enlaces en `admin-pago.html` y pagar con los datos de prueba de Transbank: VISA `4051 8856 0044 6623`, CVV `123`, cualquier vencimiento futuro; RUT `11.111.111-1`, clave `123`.
5. Repetir los casos: débito, crédito, cuotas, rechazo, anulación, tiempo excedido (más de 10 min en integración), recarga, enlace ya pagado, y un reembolso.
6. Revisar los correos `[PRUEBA]` en ventas@ y en el correo del cliente de prueba.

Esas transacciones sirven de evidencia para la validación de Transbank.

## 9. Paso a producción (después)

1. Afiliarse a Webpay Plus en [publico.transbank.cl](https://publico.transbank.cl) y firmar el contrato. El código de comercio llega por correo. Confirmar tarifas y cuotas con Transbank.
2. Completar el formulario de validación con las pruebas de §8 y el logo de la tienda en PNG o GIF de 130×59 px.
3. Transbank entrega la API Key de producción; el usuario la carga en Vercel (Production) junto con el código y `TBK_AMBIENTE=produccion`.
4. Publicar (con autorización), hacer una compra real de $50 (Transbank la exige) y reembolsarla.

## 10. Reembolsos

`_webpay.js` tiene `reembolsar(cfg, token, monto)`, pero todavía no hay pantalla para usarlo (`pago:{pedido}` guarda el token necesario). Falta confirmar con Transbank si las anulaciones también se pueden hacer desde su portal de comercios; si no, se agrega a `admin-pago.html`.
