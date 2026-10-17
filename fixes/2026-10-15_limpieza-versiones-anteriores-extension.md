# Fix: limpieza de ZIPs anteriores de la extensión

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

Cada versión de la extensión se guardaba con un nombre propio dentro de `Documentos/Vimo/Extensiones`, pero las descargas anteriores permanecían en esa carpeta. Al actualizar se acumulaban ZIPs que ya no eran necesarios y resultaba menos claro cuál cargar en Chrome.

## Corrección

Después de guardar o reutilizar el ZIP actual y comprobar su integridad, el comando de descarga elimina únicamente archivos regulares de versiones numéricamente anteriores con nombres generados por Vimo: `vimo-automate-<VERSION>.zip` y sus variantes ` (1)` a ` (19)`. La búsqueda se limita a `Documentos/Vimo/Extensiones` y no recorre subdirectorios. Compara los componentes numéricos con ceros a la derecha; una versión equivalente o superior se conserva.

Se preservan el ZIP actual, las versiones futuras, archivos con otros nombres, enlaces simbólicos y directorios. La carpeta `Vimo-Extension` cargada en Chrome y su contenido permanecen intactos. Las operaciones de comprobar descarga, buscar actualizaciones y abrir carpeta no realizan esta limpieza.

El comando devuelve `{ path, cleanupIncomplete }`. Si un archivo anterior está bloqueado o no se puede eliminar, la descarga nueva sigue siendo válida y la interfaz muestra un aviso breve de limpieza incompleta. Se conservan la confirmación de guardado, el botón de descarga deshabilitado y la acción Abrir carpeta; un fallo de limpieza no se comunica como fallo de descarga.

## Límites deliberados

- La limpieza sólo se ejecuta como parte de una descarga o reutilización exitosa. No se ejecuta al entrar en la sección ni como tarea de fondo.
- El nombre y la versión identifican los ZIPs anteriores administrados por Vimo. Un archivo renombrado manualmente al patrón exacto de una versión anterior también se considera administrado dentro de esta carpeta dedicada. No se borran otros nombres, sufijos fuera de los generados por la app, versiones iguales o superiores, enlaces ni carpetas.
- No se extrae, instala, desinstala ni recarga la extensión en Chrome.
- Un ZIP antiguo bloqueado puede permanecer en la carpeta. El aviso informa esa situación sin deshacer el guardado actual.
- Los fixtures, scripts y reportes de QA temporal quedan fuera del repositorio. Las pruebas Windows/Linux preparadas para CI sólo se consideran ejecutadas cuando existe un resultado de sus runners.

## Validación reproducible

1. Ejecutar `pnpm format`, `pnpm lint`, `pnpm build` y `pnpm check:locales`.
2. Ejecutar `cargo test --manifest-path src-tauri/Cargo.toml --lib --locked`; para aislar este cambio, añadir `extension_release::`.
3. En una carpeta temporal usada como Documentos, preparar ZIPs con nombres `vimo-automate-0.2.36.zip` y `vimo-automate-0.2.36 (1).zip`, otro de una versión superior, un archivo con nombre ajeno y una carpeta `Vimo-Extension` con contenido. Guardar la versión actual verificada y ejecutar la limpieza: sólo deben desaparecer los ZIPs anteriores reconocidos.
4. Repetir con el ZIP actual ya presente y verificado. Se debe reutilizar sin modificar sus bytes y limpiar las versiones anteriores. Ejecutar sólo la consulta de descarga antes de ese paso y comprobar que no elimina archivos.
5. Probar una descarga inválida o sin ZIP actual verificado: no debe comenzar el borrado. Probar versiones numéricamente equivalentes, enlaces y directorios con nombres parecidos y comprobar que se conservan.
6. En Windows, bloquear un ZIP anterior con un handle que impida borrarlo. La operación debe conservar el ZIP nuevo válido, devolver `cleanupIncomplete: true` y dejar el archivo bloqueado. Confirmar en la UI que el aviso no elimina el estado de descarga completada.
7. Reconstruir la app y comprobar el flujo de descarga con fixtures aislados, el aviso de limpieza incompleta y Abrir carpeta. No usar proyectos ni la carpeta instalada de Chrome para simular fallos.

### Resultados

| Comprobación                            | Resultado                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------- |
| Formato, lint, build y locales          | Aprobados sobre el árbol final                                                        |
| Tests Rust                              | 128 aprobados en macOS; sin fallos ni ignorados                                       |
| UI Chrome                               | 221 comprobaciones aprobadas con producción y comandos nativos simulados              |
| UI WKWebView                            | 221 comprobaciones aprobadas en WKWebView real aislado, comandos nativos simulados    |
| ZIP público real y limpieza en fixtures | Aprobado con transporte, verificación y helpers Rust reales; sólo archivos temporales |
| CI Windows/Linux                        | Preparado; no ejecutado en esta sesión local                                          |

## Pruebas manuales

En `Vimo-0.11.0-extension-limpieza-20261015.app`, compilada con el cambio y firma ad hoc verificada, se comprobó el estado «Extensión descargada», la confirmación «Extensión guardada» y Buscar actualizaciones → «Ya tienes la última versión» sin modal. Abrir carpeta abrió Finder en Documentos/Vimo/Extensiones con el ZIP actual y la carpeta Vimo-Extension presentes. La eliminación se probó con los helpers de producción y el ZIP público real en carpetas temporales; no se añadieron archivos antiguos ficticios ni se borraron descargas reales del usuario. No se instaló ni recargó Chrome. Windows/Linux nativos siguen pendientes de Actions.
