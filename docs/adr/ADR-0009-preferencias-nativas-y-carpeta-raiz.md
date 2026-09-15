# ADR-0009 — Preferencias nativas con plugins oficiales y carpeta raíz única de proyectos

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Área:** app / distribución

## Problema

En el origen, la ubicación de los archivos del usuario eran DOS carpetas
persistidas por el servidor local en `.vimo-preferencias.json`: la carpeta de
proyectos (`VIMO_HOME`, default `~/Desktop/Vimo`) y la carpeta de salida de
exports. El selector nativo se spawneaba con `osascript`/PowerShell/`zenity`, y
el layout por proyecto era plano (todos los artefactos sueltos + `imagenes/`,
`chunks/`). Sin servidor (ADR-0007) había que decidir: cuántas carpetas, qué
layout, con qué APIs nativas y dónde persiste la preferencia.

## Decisión

**1. Una sola carpeta raíz de proyectos** (default `~/Documents/Vimo`), sin
carpeta de salida separada. Dentro, el pipeline crea una carpeta por proyecto
— y ese es el **contrato de layout** que esta ADR fija:

```
<root>/
├── characters/               ← biblioteca de personajes (nombre RESERVADO)
├── _history/                 ← historiales de voz y música (nombre RESERVADO)
└── <slug-proyecto>/          ← nombre del video slugificado
    ├── project.json          ← metadata y opciones del proyecto
    ├── script.txt            ← guion (escrito o derivado de la transcripción)
    ├── narration.mp3         ← narración maestra
    ├── music.mp3             ← música de fondo
    ├── overlay.mp4           ← textura superpuesta
    ├── words.json            ← transcripción con timestamps
    ├── scenes.json           ← escenas con prompts y dirección
    ├── scenes-confirmed.json ← cantidad de escenas confirmada
    ├── visual-context.txt    ← biblia visual del video
    ├── scenes/scene_<id>.jpg ← imágenes generadas
    ├── characters/           ← referencias visuales de este proyecto
    ├── cache/chunks/         ← tramos intermedios del render
    ├── clips/                ← export "para editar" (regenerable)
    ├── prompts.md            ← export legible de los prompts
    └── <slug>.mp4            ← video final, junto a las carpetas
```

> **Actualizado por [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)**
> al implementarlo con el módulo Create: `music/` (carpeta) pasó a ser
> `music.mp3` (archivo) y se sumaron los artefactos intermedios que las stages
> necesitan para poder retomar. Los nombres están en inglés, como el resto del
> código; `characters` y `_history` son reservados a nivel raíz.
>
> **Actualizado por [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md)**
> con el módulo Library: se suma `clips/` (un mp4 mudo por escena + narración y
> música), un artefacto regenerable que el export limpia y reescribe entero.

**2. Plugins oficiales de Tauri, no comandos Rust propios:**

- `tauri-plugin-dialog` — selector nativo de carpeta (reemplaza a
  osascript/PowerShell/zenity: 60 líneas de spawns multiplataforma → 1 llamada).
- `tauri-plugin-fs` — validación por **escritura real** (crear si falta +
  escribir y borrar un archivo de prueba; herencia del origen: en Windows los
  permisos aparentes mienten con OneDrive/antivirus).
- `tauri-plugin-store` — persistencia en `settings.json` dentro de
  `appDataDir` (reemplaza al `.vimo-preferencias.json` del server).
- `tauri-plugin-opener` (ya instalado) — «Abrir carpeta» con `openPath`.

Todo envuelto en `settingsApi` (`modules/settings/api/`), la única capa del
módulo que toca plugins — mismo patrón que `authApi` (ADR-0006).

**3. Scope de fs estático `$HOME/**`.** El scope que el dialog agrega en
runtime no sobrevive al reinicio sin un cuarto plugin (`persisted-scope`); un
scope estático es determinista. Limitación aceptada: carpetas fuera de `$HOME`
(p. ej. `/Volumes/...`) fallan la validación con error claro; se ampliará si
hace falta. El archivo de prueba va **sin punto inicial**
(`vimo-write-probe.tmp`): los glob del plugin no matchean dotfiles por defecto.

> **Actualizado por [ADR-0037](ADR-0037-permiso-en-runtime-sobre-la-carpeta-de-proyectos.md)**:
> la limitación dejó de ser aceptable (en Windows «Documentos» puede estar en
> otro disco y el default mismo queda fuera de `$HOME`). Rust da permiso en
> runtime, en cada arranque, sobre la carpeta guardada y la de por defecto;
> `$HOME/**` se mantiene para los archivos elegidos fuera de esa carpeta.

**4. En web la sección se muestra deshabilitada** («solo disponible en la app
de escritorio»), detectado con `isNative()` de `modules/common/utilities` —
compartido para que `settings` no importe el `api/` de `auth`.

## Alternativas consideradas

- **Comandos Rust propios (`invoke`)** — descartada para esto: los plugins ya
  resuelven dialog/fs/store con capabilities auditables; el patrón invoke
  llegará con el pipeline, donde sí hay lógica propia.
- **Dos carpetas como el origen** — descartada: la carpeta de salida separada
  existía porque el export "copiaba" desde una estructura interna enredada; con
  el layout por proyecto, el video final ya queda en un lugar presentable.
- **`tauri-plugin-persisted-scope` + scope dinámico** — descartada por ahora:
  cuarto plugin para evitar una limitación (`$HOME/**`) que en la práctica
  cubre a casi todos los usuarios.
- **Persistir en localStorage** — descartada: es storage del webview (se
  limpia con la sesión web) y la carpeta es una preferencia de la máquina.

## Consecuencias

- ✅ Cero código nativo propio: capabilities declarativas y auditable en
  `capabilities/default.json`.
- ✅ El export deja de ser "una copia a otra carpeta": el resultado vive con su
  proyecto.
- ⚠️ El contrato de layout obliga al pipeline futuro: si al implementarlo hace
  falta otra estructura (p. ej. subcarpeta `audio/`), se actualiza ESTA ADR.
- ⚠️ Carpetas fuera de `$HOME` no funcionan hoy (scope); el error es claro
  pero la limitación existe.
- 🔒 En web no hay filesystem: la sección queda deshabilitada, no oculta (el
  usuario entiende que la feature existe).

## Verificación de cumplimiento

- **Build:** `pnpm format && pnpm lint && pnpm build` + `cargo check` en verde.
- **Manual (`pnpm tauri dev`):** default `~/Documents/Vimo`; Cambiar abre el
  dialog nativo (cancelar no cambia nada); Abrir crea la carpeta si falta y la
  abre en Finder/Explorer; Restablecer vuelve al default; cerrar y reabrir la
  app conserva la preferencia (`settings.json` en appDataDir).
- **Greps ejecutables:**
  - `grep -rn "plugin-dialog\|plugin-fs\|plugin-store" src/ --include="*.ts*"`
    → solo `modules/settings/api/index.ts`.
  - `grep -rn "localStorage" src/modules/settings` → vacío.
- **Regresión típica:** una vista/hook importando un plugin directo, o una
  segunda fuente de verdad para la carpeta (env, localStorage).

## Referencias

- ADR-0006 (patrón `api/` por módulo), ADR-0007 (muerte del server y de
  `.vimo-preferencias.json`).
- Origen: `app/servidor-local/util/preferencias.ts`,
  `rutas/ajustes.ts` (selector nativo por spawn) y
  `proyectos/manejadorProyectos.ts` (layout plano reemplazado).
