# Congelados Romasil — web oficial

Este repositorio contiene la versión oficial de la web de Congelados Romasil.

- Producción: <https://congeladosromasil.cl/>
- Alojamiento oficial: Vercel
- Repositorio oficial: <https://github.com/lbarrosoficina/romasil-familia-que-rinde>
- Rama de producción: `main`
- Código publicado: archivos ubicados directamente en la raíz del repositorio

## Regla principal

La versión oficial se modifica aquí y se publica mediante Vercel desde la rama `main`. No usar el repositorio histórico `lbarrosoficina/Congelados-Romasil` ni las carpetas de propuestas anteriores para preparar o desplegar cambios.

Antes de publicar, revisar los cambios localmente, agruparlos en un solo lote y esperar autorización expresa del usuario para crear el commit y subirlo a GitHub.

## Documentación

- [Operación de la web](docs/WEB.md)
- [Operación del correo](docs/CORREO.md)
- [Cómo iniciar otra conversación](docs/INICIAR-CONVERSACION.md)
- [Instrucciones para agentes](AGENTS.md)

## Seguridad

No guardar contraseñas, códigos de verificación, claves API, tokens ni credenciales en el repositorio.

## Pago con Transbank Webpay Plus

El checkout recalcula el total en el servidor, crea la transacción y confirma el resultado directamente con Transbank. Para probarlo en un despliegue Preview de Vercel, configurar:

- `TRANSBANK_ENVIRONMENT=integration`
- `TRANSBANK_COMMERCE_CODE` y `TRANSBANK_API_KEY` con las credenciales oficiales de integración, almacenadas fuera del repositorio
- `PUBLIC_SITE_URL` con la URL HTTPS del despliegue que recibe el retorno

En producción se deben configurar explícitamente `TRANSBANK_ENVIRONMENT=production`, `TRANSBANK_COMMERCE_CODE=597053106182` y `TRANSBANK_API_KEY` con las credenciales entregadas por Transbank. Si falta alguna, el botón falla de forma segura sin iniciar un cobro. Ver `.env.example`.
