# Fix: integrar dev conservando el editor y la extensión

- **Fecha:** 2026-10-15 (America/Bogota).
- **Rama:** `feat/flow-export-motion`.
- **Base integrada:** `origin/dev` en `9aaef8b64271dafae2fdbc5d5a423a9d755b138e`.
- **Rama antes de integrar:** `f97168da0f9bf3243b896dd8b0722b5f1c1c8470`.

## Causa

Los PR #105 y #106 añadieron a `dev` clonación y eliminación de voces ai33, ajustes del avatar, resolución de acceso y descarte de tareas. La rama del editor y la integración Flow todavía no los contenía. El orden de las claves en los tres catálogos de idioma provocaba conflictos textuales; no había valores incompatibles para una misma clave.

Los cuatro guards existentes de avatar y cabecera empaquetaban el editor sin una ruta de salida para sus imports de CSS. El editor actual también importa CSS Modules: el arnés debía generar y cargar su hoja de estilos junto al JavaScript.

## Corrección

- Integra los cambios de `dev` en la rama de trabajo, conservando editor, SFX, transiciones, Flow y descarga de la extensión.
- Resuelve `public/locales/{es,en,pt}.json` por clave: incorpora las 17 claves de `dev` y conserva los 515 cambios de la rama. Los tres idiomas contienen 2726 claves, sin conflictos semánticos.
- Conserva el nuevo descarte después de navegar, el catálogo y la clonación/eliminación de voces, y la retirada del botón obsoleto de cancelar regeneraciones de avatar. Mantiene los estados de preparación Flow y los campos SFX.
- Actualiza los cuatro guards existentes para que esbuild escriba `app.js` y `app.css` y el HTML de prueba cargue esa hoja. La fixture de cabecera incluye las colas y la selección vacías del contrato actual; se conservan todas las aserciones. No agrega scripts temporales al repositorio.
- Normaliza únicamente el formato de la tabla del informe de limpieza de ZIPs que bloqueaba `format:check`; no cambia su contenido.

## Límites deliberados

La integración es local: no hace push, abre PR, modifica ramas protegidas ni publica otra app. El ZIP 0.2.38 ya publicado permanece intacto. Las fuentes de Chrome viven en `Extension-vimo-RPC`; desde el último port del puente no hay cambios adicionales que incorporar al vendor de Vimo. No se copia el ZIP ni la extensión de referencia al repositorio.

Las pruebas se ejecutaron en macOS con servicios simulados cuando correspondía. No sustituyen una ejecución nativa de Windows/Linux, la aceptación con perfiles reales ni una generación pagada. Los workflows multiplataforma existentes se ejecutan manualmente o por tag, no automáticamente al abrir un PR.

## Validación reproducible

Desde la raíz, con Node 22 y las dependencias instaladas. Para el build local de macOS, usar un entorno sin credenciales Apple de certificado/notarización y con identidad ad-hoc `-`:

```sh
pnpm format:check
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm check:locales
pnpm test:tauri
pnpm build:sidecar
APPLE_SIGNING_IDENTITY=- pnpm exec tauri build --bundles app
node scripts/test/check-ai33-voice.mjs
node scripts/test/check-packaged-resume.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
node scripts/test/check-packaged-editor.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
node scripts/test/check-packaged-catalog.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
node scripts/test/check-editor-avatar-gallery-ui.mjs
node scripts/test/check-editor-avatar-regenerate-ui.mjs
node scripts/test/check-avatar-progress-ui.mjs
node scripts/test/check-export-header-ui.mjs
```

Formato, lint, frontend, tipos del pipeline, catálogos, sidecar, compilación nativa y firma ad-hoc local: aprobados. Rust: **128/128**. Guard ai33: **16/16**. Controles sobre el SEA: reanudación **3/3**, editor **3/3**, catálogo **4/4**. Guard aislado de tarjetas adaptables: **127/127**. Auditoría independiente de la combinación anterior al ajuste de los guards: **407/407**, incluidas las claves de idioma y la preservación de ambas líneas de trabajo.

Guard de galería de avatar: **198/198**; regeneración: **398/398**; progreso: **252/252**; cabecera de exportación: **12/12** casos en ambos formatos.

Evidencia local fuera de Git: `/private/tmp/vimo-dev-integration-20261015/` y `/private/tmp/vimo-dev-review-20261015/final-review.json`. No se añaden capturas, perfiles de navegador ni arneses temporales al PR.

## Pruebas manuales

No se realizó una nueva prueba interactiva de la app con los perfiles del usuario durante esta integración. Las verificaciones de UI fueron automatizadas y aisladas en Chrome; las del empaquetado ejercitaron el SEA real. La compilación de la app y la comprobación de firma no se presentan como una prueba manual de funcionamiento completo.
