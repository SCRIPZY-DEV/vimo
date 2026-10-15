# Fix: extensión en Documentos y confirmación de descarga

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

La descarga dependía de un diálogo Guardar y no dejaba una ubicación común fácil de encontrar. Un recibo de la interfaz no demostraba que el ZIP siguiera presente e íntegro. Además, Buscar actualizaciones podía volver a abrir el aviso cuando la versión disponible ya estaba descargada o instalada, y la confirmación mostraba una ruta larga sin una acción directa para acceder a la carpeta.

## Corrección

La descarga guarda automáticamente el ZIP en `Documentos/Vimo/Extensiones`, sin diálogo para elegir destino. Documentos se resuelve con la API nativa de Tauri: la carpeta del usuario en macOS, la Known Folder actual en Windows y la configuración XDG en Linux. Se respeta una ubicación redirigida; no se construye una ruta alternativa a partir del nombre de usuario cuando el sistema no puede resolverla.

Antes de mostrar una descarga como completada, el backend verifica un archivo regular, su tamaño y su SHA-256. Reutiliza un ZIP que ya coincide con la versión disponible. Si el nombre está ocupado por otro archivo, lo conserva y usa un nombre numerado; la escritura temporal y la publicación sin sobrescritura evitan exponer descargas parciales. La comprobación no crea carpetas. Un archivo borrado o alterado deja de considerarse descargado.

El botón muestra `Descargar extensión <versión>` cuando corresponde descargar. Queda deshabilitado si existe el ZIP verificado o si los perfiles conectados confirman una versión instalada actual. Descargar e instalar siguen siendo estados distintos: la comprobación de un ZIP no afirma que Chrome lo haya instalado.

Al guardar se muestra la confirmación breve `Extensión guardada` y la acción `Abrir carpeta`. El comando nativo vuelve a verificar el ZIP antes de abrir su carpeta y no acepta rutas del frontend. Buscar actualizaciones revalida descriptor y archivo; si no existe un ZIP válido, consulta los perfiles actuales. Cuando la versión disponible ya está descargada o instalada, muestra `Ya tienes la última versión` sin abrir un modal de novedades. Un error de comprobación no se presenta como éxito. Las consultas nativas no quedan en espera por el estado offline del webview.

Los textos y las instrucciones se mantienen en español, inglés y portugués. La instalación manual conserva la carpeta estable `Vimo-Extension`: el ZIP se extrae para cargar esa carpeta en Chrome y, al actualizar, se reemplaza el contenido de la carpeta ya cargada sin anidar otra `Vimo-Extension` dentro de ella.

El workflow de instaladores ejecuta los tests oficiales de `extension_release` en el mismo sistema operativo y target del instalador, antes de subir el artefacto. Un workflow Linux comprueba este módulo sin construir un instalador ni descargar sidecars; la publicación por tag exige que también finalice correctamente.

## Límites deliberados

- La aplicación descarga y verifica el ZIP; no extrae, instala ni recarga automáticamente la extensión en Chrome.
- La comprobación de versión instalada utiliza únicamente perfiles conectados y metadatos válidos. No se inventa una versión para perfiles desconectados o antiguos que no la informan.
- La ausencia de un diálogo Guardar no elimina posibles permisos del sistema para acceder a Documentos ni errores por archivos bloqueados, falta de espacio o carpetas no disponibles.
- Los tests Windows preparados comparan la resolución con la Known Folder actual y comprueban bloqueo exclusivo. No hay un test Windows dedicado de enlaces ni una prueba con una cuenta real de OneDrive o sus estados de sincronización; el rechazo de enlaces se revisó en el código y se probó en macOS.
- Los tests Linux comprueban XDG en procesos aislados. No añaden un instalador Linux ni afirman compatibilidad visual con todos los escritorios.
- Los workflows Windows/Linux están preparados, pero todavía no se ejecutaron en esos sistemas durante esta validación local. No se disparó CI, se creó un tag ni se publicó la aplicación.
- Los scripts y evidencias de QA temporal quedan fuera del repositorio. No se modifica el historial del vault ni el changelog mientras este bloque siga local.

## Validación reproducible

1. Ejecutar `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales` sobre el árbol final.
2. Con los assets y binarios locales preparados, ejecutar `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`. Para aislar el cambio, añadir `extension_release::` al comando.
3. Compilar la app con `pnpm tauri build` y abrir ese artefacto. Entrar en Extensión con la versión disponible aún sin descargar: comprobar la etiqueta con su versión y descargar. Debe guardarse bajo la carpeta Documentos nativa, sin diálogo Guardar, y habilitarse `Abrir carpeta` junto a la confirmación breve.
4. Abrir la carpeta y comprobar que contiene el ZIP esperado. Comparar tamaño y SHA-256 con el descriptor público `https://releases.vimo.click/extensions/latest.json`; comprobar que la app no lo extrajo ni instaló.
5. Volver a entrar en Extensión y pulsar Buscar actualizaciones. Con el ZIP válido ya presente, el botón de descarga debe permanecer deshabilitado y la comprobación debe informar `Ya tienes la última versión` sin modal. Repetir con perfiles conectados que ya tengan la versión actual, sin confundir ese estado con una simple descarga.
6. Con fixtures aislados, eliminar o alterar una descarga, ocupar el nombre con otro archivo, provocar un fallo de integridad y denegar el guardado. Verificar que no se da un falso éxito ni se reemplaza un archivo ajeno y que el reintento queda disponible cuando corresponde.
7. En GitHub Actions, una vez que el cambio esté publicado con autorización, abrir **Build desktop installers**, elegir **Run workflow**, seleccionar la rama de trabajo que contiene el cambio —sin elegir un tag— y `platform: all`. Esa ejecución sobre la rama construye los instaladores Windows/macOS y ejecuta los tests, incluido el job Linux, sin publicar una release ni subir instaladores a R2. Sí deja los artefactos de la ejecución en GitHub. La semántica de publicación existente se conserva: esta comprobación debe lanzarse sobre la rama `feat/flow-export-motion`, no sobre un tag.
8. Para comprobar únicamente Linux, ejecutar manualmente **Test extension delivery on Linux** sobre esa misma referencia. No necesita secretos de firma ni genera un instalador. Revisar el resultado real de los tests XDG; un YAML válido no equivale a una ejecución aprobada.

### Resultados locales

- Formato, lint, build de frontend y catálogos es/en/pt aprobados con `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
- Suite Rust en macOS: **124 tests aprobados**, sin fallos ni tests ignorados.
- UI en Chrome: **190 comprobaciones aprobadas**.
- UI en WKWebView real aislado: **190 comprobaciones aprobadas**. Estas pruebas usan los componentes, hooks, API y traducciones de producción; simulan los comandos nativos, el almacén y los resultados del filesystem. No sustituyen la prueba de descarga real.
- Harness Rust del transporte y almacenamiento de producción (ejecutado antes del ajuste final de apertura de carpeta y de consultas offline): consulta HTTPS pública, descarga, tamaño/hash, escritura, reutilización, colisiones, integridad y enlaces aprobados en macOS. El resolver nativo devolvió Documentos real; los archivos de esa prueba se guardaron en fixtures temporales.
- App macOS final: `Vimo-0.11.0-extension-lista-20261015.app`, compilada con el código final y firma ad hoc verificada. El ZIP real de la extensión **0.2.37** quedó guardado en Documentos con hash correcto.
- Workflows: JSON Schema y comprobaciones de orden, permisos y dependencias aprobados. **No se ejecutó CI remoto ni las pruebas Windows/Linux**.

Los scripts y reportes de QA temporal se conservaron fuera del repositorio; los tests Rust de `extension_release/tests/` sí forman parte de la suite oficial.

## Pruebas manuales

En la app macOS final se observaron `Extensión guardada`, el botón deshabilitado `Extensión descargada` y, al pulsar Buscar actualizaciones, `Ya tienes la última versión` sin que se abriera el modal. Se comprobó el ZIP real 0.2.37 en Documentos y su hash. No se instaló ni recargó la extensión en Chrome.

Al pulsar `Abrir carpeta` en la app final, Finder abrió `Documentos/Vimo/Extensiones` y mostró `vimo-automate-0.2.37.zip`. No se extrajo el ZIP ni se instaló la extensión en Chrome. Los errores de apertura están cubiertos por la QA automatizada y la selección de un directorio con ZIP válido por los tests Rust. La automatización en Chrome/WKWebView no se presenta como una aceptación manual en los perfiles del usuario.
