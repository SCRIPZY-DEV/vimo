# Fix: el prompt de sistema de las gemas de plantilla abre con el rol del modelo

- **Fecha:** 2026-10-04
- **Rama:** feat/catalogo-estilos

## Causa

Una gema de chat empieza diciéndole al modelo quién es («Eres un Director de Arte y Prompt
Engineer…»). Al adaptarla a la ficha de Vimo, el agente saca ese rol junto con las fases y el
formato de salida (ADR-0048, reglas del agente), porque esa parte es de la plataforma. Pero el
marco (`buildTemplateSystem`) reponía el formato, el idioma, la seguridad y el orden del prompt, y
no el rol: el `system` abría directo en `# VISUAL STYLE` y el modelo deducía su tarea de las reglas
de más abajo. Una gema vieja (texto) sí viaja con el rol que le escribió su autor.

El dueño lo vio al leer el ejemplo del `system` (QA del 2026-10-03) y el 2026-10-04 decidió sumarlo
«para estar seguros», con este texto: «Eres un Director de Arte y Prompt Engineer experto en IA
visual. Eres un asistente de solo texto: tu única tarea es redactar los prompts de imagen del
video, uno por fragmento del guion, con el estilo que sigue.»

## Corrección

- `pipeline/prompts/template-frame.ts`: constante `FRAME_ROLE_LINE` con ese texto (sin la tilde de
  «unica», como el resto del marco) y `buildTemplateSystem` la pone como primer bloque, arriba de
  `# VISUAL STYLE`, en los cuatro modos de personaje. Es de la plataforma y es la misma para todas
  las gemas de plantilla: las de Mi estilo y las 38 del catálogo.
- `scripts/test/check-gem-template-frame.mjs`: el layout byte a byte abre con el rol, y dos casos
  nuevos: el rol va una sola vez y justo arriba del estilo visual, y solo el marco lo lleva.
- La ADR-0048 (capa 2 y nota del 2026-10-04), el diseño (§5.1), `docs/ARCHITECTURE.md` y el
  traspaso de la Entrega 2 describen el orden nuevo.

## Límites deliberados

- No lleva la «REGLA MAESTRA» de las gemas de chat (prohibido generar imágenes, «para que el
  usuario los copie en su propio generador»): acá el modelo se llama por API, solo devuelve texto,
  y los prompts los manda Vimo al generador.
- `composeGemText` (la gema como texto para la Fase 1, el diseño y el retrato de personajes y el
  respaldo de imágenes) no lleva el rol: esos usos no escriben prompts de escena.
- La gema vieja (`buildVerbatimSystem`) sigue byte por byte: trae su propio rol.
- No se midió con claves reales antes de entrar, a diferencia de otras reglas del marco: es una
  decisión del dueño, y sus videos de prueba son la medición. Para volver atrás alcanza con quitar
  `FRAME_ROLE_LINE` de `buildTemplateSystem`.
- Las muestras del catálogo no se regeneran: se hicieron con el marco sin rol y siguen valiendo.

## Validación reproducible

```bash
node --test scripts/test/check-gem-template-frame.mjs
node --test scripts/test/check-gem-*.mjs scripts/test/check-catalog-*.mjs \
  scripts/test/check-app-*.mjs scripts/test/check-verbatim-*.mjs
pnpm format:check
pnpm lint
pnpm build
```

El guard del marco se escribió primero y se vio fallar (no existía `FRAME_ROLE_LINE`). El cambio
vive en el sidecar: para verlo en la app hay que reiniciar `pnpm tauri dev`, que lo recompila.

## Pruebas manuales

- Sin red y sin gastar: con el escritor real del carril (`generateVerbatimPrompts`) y un cliente que
  anota los mensajes, el `system` de la gema «2D Stickman» mide 9399 caracteres (antes 9186) y
  empieza con la línea de rol, seguida de `# VISUAL STYLE`. El resto de la conversación y el armado
  del prompt final no cambian.
- Los demás guards del repo dan el mismo resultado con y sin el cambio.

Falta la prueba del dueño: generar videos con `pnpm tauri dev` y modelos reales.
