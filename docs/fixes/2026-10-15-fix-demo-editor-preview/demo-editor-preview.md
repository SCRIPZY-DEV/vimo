# Fix: el editor de un proyecto demo reproduce el video final en vez de darlo por desactualizado

- 📅 **Fecha:** 2026-10-15
- 🌿 **Rama:** `feat/demo-actualizacion`
- **Área:** la simulación del modo demo, `pipeline/commands/demo/run-demo-pipeline.ts` (ADR-0029). No toca el
  editor ni el render real.
- **Relacionado:** la spec de la demo v4 ([design.md](../../handoff/2026-10-14-demo-v4/design.md) §4
  «Simulación», `project.json`), que pide este arreglo; el PR #91 (`c007e008`, 2026-09-30), que sumó la
  política de transiciones al render y al editor.

## Causa

Desde el PR #91 el editor reproduce el mp4 de un proyecto solo si su render es vigente:
`LibraryEditor.tsx` arma el estado del video con `renderedVideoState(hasVideo, outdated)`, donde `outdated` es
`metadata.videoOutdated === true || metadata.renderTransitionVersion !== TRANSITION_POLICY_VERSION`. Con un
render desactualizado el visor no carga el mp4 (`videoSrc` queda en `null`), simula la vista previa con las
imágenes y la narración, y el botón del render lo muestra atrasado.

El render real deja la marca al terminar (`pipeline/stages/render/render.ts`:
`context.metadata.renderTransitionVersion = TRANSITION_POLICY_VERSION`). La demo no pasa por él:
`run-demo-pipeline` copia el mp4 del pack y cerraba con `state = 'completed'` y `videoOutdated = false`, pero
sin `renderTransitionVersion`. Así, todo proyecto demo creado desde el 2026-09-30 abría el editor con el video
«desactualizado» y la vista previa simulada, en vez del video final del pack.

Medido antes del arreglo, con la simulación sin este cambio y el pack v4 real instalado (historia `2d-mono`,
16:9, a velocidad real): `project.json` terminó `completed`, con `videoOutdated: false` y sin
`renderTransitionVersion`.

## Corrección

La fase `render` de la simulación, después de copiar el mp4 de la variante (`video_final.mp4` o, si corrió la
animación, `video_animado.mp4`), marca `context.metadata.renderTransitionVersion = TRANSITION_POLICY_VERSION`
(hoy 1): la misma constante y el mismo momento que el render real (`pipeline/animation/transitions.ts`). El
cierre sigue dejando `state = 'completed'` y `videoOutdated = false`. El editor ve el render vigente y
reproduce el mp4 del pack.

El arreglo viaja en el mismo commit que la simulación del pack v4 (las fases de animación y de avatar, spec
§4): la marca es parte del cierre que la spec pide para `project.json`.

## Límites deliberados

- **No se toca el editor ni `renderedVideoState`.** La regla es la correcta para los proyectos reales: era la
  demo la que no la cumplía.
- **Los proyectos demo anteriores no se migran.** Siguen sin la marca; la demo crea un proyecto nuevo en cada
  corrida (es para mostrar en vivo) y un proyecto viejo se arregla volviéndolo a crear, o renderizándolo desde
  el editor (render local, sin proveedores ni claves).
- **La marca es la versión de hoy, no la del pack.** El mp4 del pack sale de un render real con la política
  vigente (versión 1). Si `TRANSITION_POLICY_VERSION` sube, la demo seguiría marcando como vigente un mp4
  armado con la anterior: subir la versión pide rearmar el pack (o que el manifest lleve la versión con la que
  se renderizó).

## Validación reproducible

1. `pnpm check:demo`. Las secciones 8, 34, 35 y 36 afirman `renderTransitionVersion === 1` y
   `videoOutdated === false` al terminar: sin animación, con la animación del primer minuto, con la animación
   pedida en una historia sin variante animada y con el avatar de Jardinería. Sin el arreglo fallan con
   «al terminar, renderTransitionVersion es 1 y videoOutdated false: el editor reproduce el mp4 (fue undefined
   y false)» y sus equivalentes de las otras secciones.
2. Con el pack v4 instalado en una raíz de proyectos: `node pipeline/main.ts create-video-project` con
   `options.demo: true` y después `node pipeline/main.ts run-video-pipeline` con el `projectId`, los dos con
   `config.demo.packParts` (los SHA del pack instalado) y `config.demo.delayScale` en 0 (o en 1 para medir el
   tiempo real). El sidecar lee el job de la primera línea de stdin y stdin tiene que quedar abierto hasta que
   el proceso termina. Al terminar, `project.json` trae `"renderTransitionVersion": 1` y
   `"videoOutdated": false`.

## Pruebas manuales realizadas

- **Sidecar contra el pack v4 real** instalado en `~/Documents/Vimo-demo-v4-instalacion` (sin la app, con el
  procedimiento del punto 2): `2d-mono` en 16:9 sin animación, `cosmos` en Short con animación y `jardineria`
  en 16:9 con y sin animación, a velocidad real y con `delayScale` 0. Los ocho proyectos terminan `completed`,
  con `renderTransitionVersion: 1` y `videoOutdated: false`, y el mp4 de cada uno es, byte a byte, el
  `video_final.mp4` o el `video_animado.mp4` de su historia.
- **En la app compilada:** pendiente. Se verifica con el checklist manual de la spec v4 §8 («El editor
  reproduce el video final y muestra los clips»), en la app de prueba de la rama.
