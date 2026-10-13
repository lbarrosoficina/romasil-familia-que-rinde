# Operación del correo

Última actualización: 23 de septiembre de 2026.

Este documento cubre solamente correo. Para dominio web, GitHub y alojamientos, consultar [WEB.md](WEB.md).

## Arquitectura actual

```text
Correo entrante
  → MX de Cloudflare Email Routing
     ├─ ventas@congeladosromasil.cl
     │    → Email Worker ventas-doble-reenvio
     │       ├─ lbarros.oficina@gmail.com
     │       └─ rgp1986@gmail.com
     └─ rgonzalez@congeladosromasil.cl
          → rgp1986@gmail.com

Correo transaccional futuro
  → aplicación o función segura
     → API de Resend
        → destinatario
```

Cloudflare recibe y reenvía. Gmail funciona como buzón final. El Worker `ventas-doble-reenvio` entrega cada mensaje dirigido a `ventas@congeladosromasil.cl` a ambos destinatarios verificados. Resend se usa para enviar como `ventas@congeladosromasil.cl` desde Gmail y también queda disponible para envíos programáticos; no reemplaza el reenvío entrante de Cloudflare.

## Gmail

Destinos verificados en Cloudflare:

| Dirección de destino | Recibe actualmente |
|---|---|
| `lbarros.oficina@gmail.com` | Mensajes enviados a `ventas@congeladosromasil.cl` |
| `rgp1986@gmail.com` | Mensajes enviados a `ventas@congeladosromasil.cl` y a `rgonzalez@congeladosromasil.cl` |

El reenvío no convierte automáticamente estas direcciones en buzones completos del dominio. En `lbarros.oficina@gmail.com`, la opción “Enviar como” para `ventas@congeladosromasil.cl` está configurada mediante el SMTP de Resend.

## Cloudflare Email Routing

Estado documentado:

| Dirección pública | Destino | Estado |
|---|---|---|
| `ventas@congeladosromasil.cl` | Worker `ventas-doble-reenvio` → `lbarros.oficina@gmail.com` y `rgp1986@gmail.com` | Activa |
| `rgonzalez@congeladosromasil.cl` | `rgp1986@gmail.com` | Activa |

El catch-all está desactivado. Por ello, cualquier dirección del dominio que no tenga una regla propia no se reenvía.

Registros MX observados:

| Prioridad | Servidor |
|---:|---|
| 5 | `route2.mx.cloudflare.net` |
| 9 | `route1.mx.cloudflare.net` |
| 34 | `route3.mx.cloudflare.net` |

SPF del dominio observado:

```text
v=spf1 include:_spf.mx.cloudflare.net ~all
```

No borrar ni sustituir los MX sin planificar una migración del correo entrante.

## Resend

- Dominio agregado: `congeladosromasil.cl`.
- Región elegida: São Paulo (`sa-east-1`), porque Resend no ofrecía región Chile.
- Envío habilitado.
- Recepción deshabilitada: el correo entrante continúa en Cloudflare.
- Gmail configurado para enviar como `ventas@congeladosromasil.cl` mediante `smtp.resend.com`, puerto `465`, conexión SSL y usuario `resend`.

Registros configurados en Cloudflare para Resend:

| Nombre | Tipo | Destino o contenido | Proxy |
|---|---|---|---|
| `resend._domainkey` | TXT | Clave DKIM entregada por Resend | DNS only |
| `rsend` | CNAME | `rsend-sae1.forge.rmta.net` | DNS only |
| `send` | CNAME | `send.forge.rmta.net` | DNS only |

La clave DKIM completa no se copia aquí deliberadamente. Se puede consultar en Resend o en DNS cuando sea necesario.

La contraseña SMTP es una clave API de Resend y no debe copiarse a este documento ni al repositorio. Si se revoca, también dejará de funcionar “Enviar como” en Gmail hasta reemplazarla.

## Formulario de la web

El formulario del checkout todavía no usa Resend. Actualmente:

1. El navegador envía la solicitud a `https://formsubmit.co/ajax/lbarros.oficina@gmail.com`.
2. FormSubmit reenvía la solicitud a `lbarros.oficina@gmail.com`.
3. Si el registro es exitoso, la web abre WhatsApp al `+56 9 6231 9733` con el resumen.

Para migrar el formulario a Resend se requiere una función del lado del servidor. La clave API de Resend debe guardarse como variable de entorno en Netlify o Vercel y nunca dentro de `dist/app.js` ni en GitHub.

## Pruebas recomendadas

### Reenvíos de Cloudflare

1. Enviar un correo nuevo a `ventas@congeladosromasil.cl` desde una cuenta externa.
2. Confirmar recepción tanto en `lbarros.oficina@gmail.com` como en `rgp1986@gmail.com`, y revisar spam en ambos buzones.
3. Enviar un correo nuevo a `rgonzalez@congeladosromasil.cl`.
4. Confirmar recepción en `rgp1986@gmail.com` y revisar spam.
5. Si falla, revisar primero la regla, el estado del destino y Activity log en Cloudflare.

### Formulario de pedidos

1. Probar desde Netlify.
2. Probar desde Vercel o el dominio principal.
3. Confirmar el correo recibido con todos los datos del pedido.
4. Confirmar que WhatsApp se abre con el resumen correcto.

### Resend

1. Confirmar que el dominio figure como verificado antes de integrarlo.
2. Crear una clave API solo cuando se implemente una función de envío.
3. Guardarla como secreto de la plataforma, no en el repositorio.
4. Enviar una prueba y revisar SPF, DKIM y entregabilidad.

## Cambios delicados

Pedir confirmación antes de:

- crear o revocar claves API;
- cambiar destinatarios o reglas de reenvío;
- modificar MX, SPF, DKIM o DMARC;
- activar recepción en Resend;
- sustituir FormSubmit en producción.
