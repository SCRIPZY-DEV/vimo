# Fix: integrar demo v4 con Flow, editor y descarga de extensión

- **Fecha:** 2026-10-16, America/Bogota.
- **Rama:** `feat/flow-export-motion`.
- **Base de dev:** `9aaef8b64271dafae2fdbc5d5a423a9d755b138e`.
- **Rama antes de incorporar la demo:** `c48a3cd8404ee0286c8d62f0dbf7bb7ea3e513be`.
- **PR #107 incorporado:** `97b316b29732f7b0ceee2cadd4c2ce4eeedce647`.

## Causa

La rama de Flow/editor ya incluía el último `dev`, pero no los cambios del PR #107 abierto: demo v4, preparación reanudable, formulario de demo y correcciones de prompts y cierre del sidecar. Ambas líneas modificaban la selección de imágenes, Crear, progreso e índices de documentación.

La combinación produjo seis conflictos textuales: los dos índices de ADR, `src/modules/videos/constants.ts`, `ImageProviderSection.tsx`, `Create.tsx` y `LibraryProgress.tsx`. El automerge de `CreateForm.tsx` conservó además dos veces la misma prop `demo`, aunque Git no marcó ese archivo como conflicto.

El guard oficial de borradores de Crear tenía sólo la clave ficticia de HeyGen. Al ejercitar el formulario integrado, la comprobación real `apiReady` frenaba el submit antes del caso de saldo que el test quería observar. Era una fixture incompleta frente al contrato del formulario, no un fallo de generación ni de claves del producto en `dev`.

## Corrección

- Combina los seis archivos conservando las opciones de demo de #107 y la preparación/selección Flow de la rama. Los índices incluyen las ADR de ambas líneas y los mensajes mantienen errores de sidecar y controles del editor.
- Evita consultas de saldo/generación ajenas al modo demo. En Crear, el plan Multimagen sólo acompaña a las peticiones Flow reales; la demo y los demás proveedores no lo heredan. El progreso conserva los campos de recuperación de Flow y el indicador de demo.
- Elimina exclusivamente la prop `demo` duplicada por automerge en `CreateForm.tsx`.
- Conserva los catálogos de ambos lados: 2743 claves por idioma, sin marcadores ni claves perdidas. También preserva SFX, transiciones, descarga de extensión, contratos del pipeline y pruebas existentes.
- Completa la fixture del guard oficial `check-create-draft-ui.mjs` con las claves ficticias que exige Crear y espera `apiReady` antes de comprobar el saldo. No usa claves reales ni modifica las validaciones de producción o sus aserciones.
- Registra sólo el comportamiento final de la rama en `docs/handoff/2026-10-16-flow-editor-extension-pr.md`; la publicación del PR no vuelve a desplegar la extensión 0.2.38 ni la demo v4.

## Límites deliberados

No modifica ramas protegidas, mergea el PR #107, publica una release de escritorio ni altera el repositorio separado de Chrome. La extensión 0.2.38 y `latest.json` de R2 permanecen intactos.

La corrección integra contratos existentes. No introduce proveedores, cargos, variables de entorno, permisos Chrome ni migraciones de datos. La prueba de la fixture es aislada: los nombres de claves son datos ficticios, no credenciales.

La aceptación del usuario sobre `c48a3cd8` ocurrió antes de incorporar #107. No sustituye QA manual de esta combinación ni pruebas nativas Windows/Linux. Las pruebas históricas de descarga, generación y exportación siguen ligadas a sus artefactos respectivos.

## Validación reproducible

Con Node 22 y las dependencias del proyecto:

```sh
pnpm format:check
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm check:locales
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked
node scripts/test/check-demo.mjs
node scripts/test/check-demo-gate.mjs
node scripts/test/check-app-demo-form.mjs
node scripts/test/check-animation-resolution.mjs
node scripts/test/check-animation-prompt-quotes.mjs
node scripts/test/check-create-demo-ui.mjs
node scripts/test/check-create-draft-ui.mjs
node scripts/test/check-avatar-cancel-charged-ui.mjs
node scripts/test/check-export-header-ui.mjs
```

Para construir la app macOS local y comprobar su sidecar final, usar el entorno ad-hoc de pruebas del proyecto, sin credenciales de notarización:

```sh
pnpm build:sidecar
APPLE_SIGNING_IDENTITY=- pnpm exec tauri build --bundles app
node scripts/test/check-packaged-resume.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
node scripts/test/check-packaged-editor.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
node scripts/test/check-packaged-catalog.mjs src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline
```

| Comprobación de esta combinación             | Resultado                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Formato, lint, frontend y tipos del pipeline | Aprobados                                                                   |
| Catálogos es/en/pt                           | 2743 claves por idioma                                                      |
| Rust                                         | 134/134                                                                     |
| Demo                                         | 379/379                                                                     |
| Puerta de demo                               | 41/41                                                                       |
| Formulario de demo                           | 33/33                                                                       |
| Resolución de animación                      | 4/4                                                                         |
| Citas en prompts de animación                | 18/18                                                                       |
| Crear en demo                                | 127/127                                                                     |
| Cancelación con avatar cobrado               | 1 test con 86 comprobaciones aprobadas                                      |
| Cabecera de exportación                      | 12 casos aprobados en ambos formatos                                        |
| Guard de borradores con fixture completa     | 33/33                                                                       |
| Sidecar y app macOS                          | Compilados; firma ad-hoc verificada con `codesign --verify --deep --strict` |
| SEA incluido en la app                       | Reanudación 3/3, editor 3/3 y catálogo 4/4                                  |
| Auditoría de preservación de las dos ramas   | 463/463; inspección del árbol combinado, no QA manual                       |
| Runners nativos Windows/Linux                | No ejecutados en esta integración                                           |

Los resultados corresponden a esta combinación; no se deducen de una compilación anterior. La verificación de firma ad-hoc no acredita notarización ni una sesión manual. La evidencia y los arneses personales están fuera de Git en `/private/tmp/vimo-pr-integration-20261016/`; no forman parte del PR.

## Pruebas manuales realizadas

| Evidencia                                                             | Alcance                                                                                       |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Prueba comunicada por el owner sobre `c48a3cd8`                       | Aceptación anterior a #107; no acredita la combinación nueva                                  |
| UI automatizada de esta combinación                                   | Componentes reales con fixtures y fronteras simuladas; no sesión humana ni generaciones pagas |
| Interacción manual con la app integrada con #107                      | Pendiente; no se declara realizada                                                            |
| Generación Google, recarga de perfiles Chrome o pruebas Windows/Linux | No realizadas durante esta integración                                                        |

Para la aceptación manual nueva: entrar y salir de la demo durante la descarga, reanudarla y abrir un proyecto; revisar Crear real y demo; abrir un proyecto del editor, mover/borrar SFX, aplicar un fundido por unión, exportar y comprobar la sección Extensión. Si se evalúa la corrección de prompts con una generación real, usar un prompt nuevo: los recibos anteriores conservan su texto histórico. Estas pruebas no se consideran ejecutadas por figurar en esta lista.
