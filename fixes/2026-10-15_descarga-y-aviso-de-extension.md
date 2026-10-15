# Fix: descarga versionada y aviso de extensión

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

La sección Extensión permitía preparar y vincular cuentas, pero no ofrecía el paquete ni comprobaba novedades. El coordinador tampoco conocía la versión del paquete instalado. Inferirla a partir de capacidades, adaptador o un archivo descargado habría generado avisos incorrectos.

## Corrección

Se añade una sección de descarga que consulta el descriptor público al entrar y mediante Buscar actualizaciones, muestra las novedades en el idioma activo y abre un aviso si corresponde. Compara versiones numéricas de los perfiles conectados; un recibo local sólo significa que el ZIP se guardó. La caché anterior no anuncia actualizaciones durante una consulta ni después de un fallo.

Los comandos nativos verifican el esquema, el dominio/ruta HTTPS exactos, límites, tamaño y SHA-256. Guardar usa un diálogo nativo y un temporal único junto al destino; una descarga inválida no pisa archivos existentes. Cancelar devuelve un resultado distinto del éxito. Una descarga se puede terminar después de cerrar el aviso sin reabrirlo. Si falla guardar el recibo local, se conserva y comunica el ZIP descargado.

El puente vendorizado recibe el metadato `extensionVersion` desde la extensión 0.2.37 y lo limpia al reconectar/reiniciar. No cambia autenticación, cuotas, generaciones ni la identidad de Chrome. El esquema y publicación quedan documentados en `docs/adr/ADR-0060-distribucion-versionada-de-extension.md`.

## Límites deliberados

- La extensión se instala o recarga manualmente en Chrome. Descargar el ZIP no instala código automáticamente.
- La publicación del descriptor y ZIP en R2 necesita aprobación y una sesión de Cloudflare válida. Hasta publicarlos, el endpoint puede estar ausente y la UI indica que la descarga aún no está disponible.
- No se cambian los instaladores ni el actualizador de Vimo. No se ejecutaron generaciones ni se actualizaron los perfiles reales del usuario.
- La comprobación de descarga remota desde el endpoint de producción queda pendiente de esa publicación.

## Validación reproducible

1. Ejecutar `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm check:locales` y `pnpm exec tsc -p tsconfig.pipeline.json --noEmit`.
2. Ejecutar `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`. Los tests de `extension_release/tests/` verifican manifiestos inválidos, versiones, límites, redirects, fallos de body después de headers, integridad, exclusión de descargas simultáneas y escritura sin residuos.
3. Tras publicar un descriptor válido, entrar en Extensión con un perfil de versión anterior. Debe aparecer el aviso con novedades y descarga; con todos los perfiles conectados actualizados, no debe aparecer automáticamente.
4. Descargar, cancelar Guardar, simular fallo de red y cerrar el aviso durante una descarga: sólo un guardado completado muestra ruta y recibo, y cerrar no se revierte al terminar.
5. Con un manifiesto viejo en caché, demorar o rechazar la consulta nueva. No debe mostrarse ni abrirse un aviso usando el dato viejo. Buscar actualizaciones permite reintentar.
6. Comparar versiones como `1.9.0`, `1.10.0` y cuatro componentes; comprobar perfiles antiguos sin metadato, desconectados y revocados sin afirmar una versión instalada desconocida.

Las comprobaciones automatizadas temporales usan componentes, hook y API reales con transporte/almacenamiento aislados, y quedan fuera del repositorio. Los tests Rust sí forman parte de la suite oficial del proyecto.

Resultados locales: formato, lint, build, tipos del pipeline y locales correctos; 114 tests Rust aprobados (17 nuevos). La UI superó 106 comprobaciones tanto en Chrome como en WKWebView. El ZIP y ambos puentes superaron 30 comprobaciones; el servicio SEA dentro de la app compilada superó 15, con datos temporales y sin trabajos reales. Se reconstruyeron el sidecar y la app macOS. La descarga pública completa sigue pendiente de publicar los objetos.

## Pruebas manuales

Se inspeccionaron las capturas del aviso de novedades en claro y oscuro; se revisaron el ZIP y su descriptor. Las interacciones se automatizaron en navegadores aislados y no se presentan como una aceptación manual en los perfiles de Chrome del usuario. No se publicó ni se instaló la extensión durante la validación local.
