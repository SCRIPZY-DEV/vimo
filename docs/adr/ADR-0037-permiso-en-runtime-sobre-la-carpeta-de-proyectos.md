# ADR-0037 — Permiso en runtime sobre la carpeta de proyectos

- **Estado:** Aceptada
- **Fecha:** 2026-09-15
- **Área:** app / seguridad

## Problema

Usuarios de Windows reportaron que los personajes con foto se guardaban pero
su tarjeta mostraba una imagen rota, y que «Restablecer» en Ajustes fallaba con
«No se puede escribir en esta carpeta». En el equipo afectado, «Documentos»
estaba movida a otro disco: la carpeta por defecto era
`D:\USER\Documents\Vimo`, fuera del perfil `C:\Users\<usuario>`.

La ADR-0009 (punto 3) fijó un scope estático `$HOME/**` para el plugin fs, y
el asset protocol (`convertFileSrc`) usa el mismo. Consecuencias:

- El sidecar (Node) escribe en la carpeta sin pasar por scopes: la foto existe.
- El webview no puede leerla por `http://asset.localhost/...` (403) ni validar
  la carpeta con el plugin fs.
- Elegir la carpeta con el dialog «funciona», porque el plugin de dialog amplía
  ambos scopes en memoria; al reiniciar la app el permiso se pierde. En macOS
  pasa lo mismo con `/Volumes/...`.

Restricciones:

- La carpeta puede estar en cualquier disco, USB o unidad de red.
- No abrir la lectura de todo el filesystem al webview (la CSP está en `null`).

## Decisión

**Rust da permiso al webview, en memoria y en cada arranque, exactamente sobre
la carpeta de proyectos guardada y sobre la de por defecto.** `$HOME/**` se
mantiene para las fotos y audios que se eligen desde Descargas o el Escritorio.

| Pieza                            | Ubicación                                 | Para qué                                                                                                                   |
| -------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `allow_projects_root`            | `src-tauri/src/settings/projects_root.rs` | `asset_protocol_scope()` y `fs_scope()` → `allow_directory(root, true)` para la guardada y el default; ignora no absolutas |
| `resolve_projects_root` (movida) | `src-tauri/src/settings/projects_root.rs` | Fuente única de la carpeta para el job del pipeline y para el permiso                                                      |
| `sync_projects_root_scope`       | `src-tauri/src/settings/commands.rs`      | Comando sin argumentos: repite el permiso leyendo el store                                                                 |
| llamada en `setup`               | `src-tauri/src/lib.rs`                    | Permiso desde el arranque                                                                                                  |
| `syncProjectsRootScope`          | `src/modules/settings/api/index.ts`       | Tras «Cambiar carpeta»; en «Restablecer», **antes** de `ensureWritableDirectory`                                           |

El comando no recibe la ruta: si la aceptara del webview, cualquier código en
la ventana podría pedir permiso sobre cualquier carpeta.

## Alternativas consideradas

- **Scope `**` (todo el filesystem)** — descartada: una línea de config, pero
  cualquier HTML inyectado podría leer (y, con fs, escribir o borrar) archivos
  ajenos a Vimo.
- **Agregar `$DOCUMENT/**` al scope estático** — descartada: cubre «Documentos»
  movida, pero no una carpeta elegida en otro disco.
- **`tauri-plugin-persisted-scope`** — descartada: persiste lo que otorgó el
  dialog, pero no cubre el default fuera de `$HOME` (nunca pasó por el dialog)
  y suma un plugin para algo que se resuelve con dos llamadas en `setup`.

## Consecuencias

- ✅ Imágenes, audio y validación funcionan con la carpeta en cualquier disco,
  también después de reiniciar.
- ✅ Una sola función Rust resuelve la carpeta para el pipeline y para el permiso.
- ⚠️ El store es escribible desde el webview (`store:default`): quien pueda
  ejecutar código en la ventana puede guardar otra carpeta y pedir el sync. Es
  el mismo alcance que ya tenía el sidecar, que escribe donde diga el store.
- ⚠️ La carpeta anterior no se revoca al cambiarla; el permiso vive en memoria
  y desaparece al cerrar la app.
- 🔒 La ruta a habilitar nunca llega como argumento desde el webview.

## Verificación de cumplimiento

- **Build:** `pnpm format && pnpm lint && pnpm build` + `cargo check` en verde.
- **Manual (Windows con «Documentos» en `D:\`):** con la app instalada,
  «Restablecer» no muestra error; un personaje con foto se ve en Personajes y
  en el picker de Crear; cerrar y reabrir la app los sigue mostrando.
- **Manual (macOS):** carpeta en `/Volumes/<disco>`; reiniciar la app; las
  fotos y previews guardados siguen viéndose y «Abrir carpeta» funciona.
- **Grep:** `grep -rn "sync_projects_root_scope" src src-tauri/src` → el
  comando registrado en `lib.rs`, su definición y solo `settings/api`.
- **Cómo se vería una regresión:** imagen rota en tarjetas de personajes o
  escenas solo para carpetas fuera de `$HOME`, o solo tras reiniciar.

## Referencias

- Reemplaza el punto 3 de ADR-0009 (scope estático como único permiso).
- Informe: `docs/fixes/2026-09-15-fix-projects-root-scope/projects-root-scope.md`.
- Tauri 2.11.5 `src/scope/fs.rs` (`allow_directory`, `is_allowed`) y
  `tauri-plugin-dialog` 2.7.2 `src/commands.rs` (amplía scopes al elegir).
