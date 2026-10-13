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
