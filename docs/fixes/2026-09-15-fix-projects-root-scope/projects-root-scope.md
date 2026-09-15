# Imágenes rotas y «Restablecer» fallido con la carpeta fuera de $HOME

Fecha: 2026-09-15. Ver ADR-0037.

## Síntomas (Windows)

- Un personaje con foto se guarda, pero su tarjeta (Personajes y picker de
  Crear) muestra el ícono de imagen rota.
- Ajustes → «Restablecer» muestra «No se puede escribir en esta carpeta».
  Carpeta del usuario afectado: `D:\USER\Documents\Vimo`.

## Causa

El asset protocol y el plugin fs solo tenían el scope estático `$HOME/**`
(ADR-0009). Con «Documentos» movida a `D:\`, la carpeta por defecto queda
fuera del perfil:

- El sidecar escribe la foto sin pasar por scopes, así que el archivo existe
  (el listado descarta personajes cuya foto falta).
- `convertFileSrc` pide `http://asset.localhost/D:\...` y Tauri responde 403.
- `ensureWritableDirectory` usa el plugin fs y es rechazado.

El plugin de dialog amplía ambos scopes al elegir un archivo o carpeta, pero
solo en memoria. Por eso la foto se veía en el formulario antes de guardar y
por eso en macOS una carpeta en `/Volumes/...` elegida con «Cambiar carpeta»
funcionaba hasta reiniciar la app.

## Corrección

- `src-tauri/src/settings/projects_root.rs`: `allow_projects_root` da permiso
  recursivo (asset protocol + fs) a la carpeta guardada y a la de por defecto;
  ignora rutas no absolutas. `resolve_projects_root` se movió acá desde
  `pipeline/job.rs`.
- `src-tauri/src/lib.rs`: se llama en `setup` y se registra el comando
  `sync_projects_root_scope` (`settings/commands.rs`, sin argumentos).
- `src/modules/settings/api/index.ts`: `chooseProjectsRoot` sincroniza tras
  guardar; `resetProjectsRoot` sincroniza **antes** de validar.

## Archivos tocados

- `src-tauri/src/settings/{mod.rs,projects_root.rs,commands.rs}` (nuevos)
- `src-tauri/src/lib.rs`, `src-tauri/src/pipeline/job.rs`
- `src/modules/settings/api/index.ts`
- `docs/adr/ADR-0037-…`, nota en `docs/adr/ADR-0009-…`, `docs/ARCHITECTURE.md`

## QA

Automático: `pnpm format`, `pnpm lint`, `pnpm build` y `cargo check`.

Manual, con la app instalada (no hay tests de UI):

1. Windows con «Documentos» en `D:\`: «Restablecer» sin error; crear un
   personaje con foto y verla en Personajes y en el picker de Crear; cerrar y
   reabrir la app y verla de nuevo. Revisar también imágenes de escenas.
2. macOS: carpeta en `/Volumes/<disco>`, crear personaje con foto, reiniciar
   la app: la foto se sigue viendo y «Abrir carpeta» funciona.
3. Regresión: carpeta por defecto dentro de `$HOME` sigue funcionando igual.

## Fuera de alcance

- `CharacterPortrait` sigue sin `onError`: si una imagen falla por otra causa
  (archivo bloqueado por antivirus), se ve el ícono roto en vez del doodle.
- El plugin de log sigue registrándose solo en debug.
