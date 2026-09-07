# ADR-0018 — Estilos visuales propios («Mi estilo», fase básica)

- **Estado:** Aceptada
- **Fecha:** 2026-09-02
- **Área:** pipeline / app
- **Parte de:** [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)
  (rama 9 del roadmap); **actualiza a**
  [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md) (la raíz gana
  `_styles/`).

## Problema

El origen (vimo_dev) permite crear estilos visuales propios: un system prompt
escrito por la persona que reemplaza a los 5 estilos del catálogo, con
muestras generadas para compararlo. El portable solo tenía el catálogo
cerrado (`CharacterStyleId`, ADR-0013/0015). Restricciones:

- Esta fase se integra a las **stages actuales** (biblia visual y director
  siguen corriendo); el carril verbatim del origen llega en ramas
  posteriores del roadmap.
- Un proyecto creado con un estilo propio debe regenerarse desde Library
  aunque el estilo se edite o se borre de la galería.
- `isCharacterStyleId` y los proyectos previos no pueden romperse.

## Decisión

**Un estilo propio es `{ name, systemPrompt, shots }` persistido en
`<projectsRoot>/_styles/<id>/` y viaja al proyecto como SNAPSHOT inline
(`options.customStyle`), nunca por referencia.**

- **Storage** (`pipeline/commands/styles/style-store.ts`): `style.json` +
  `sample-N.jpg`, espejo de `_history/` (el `_` lo excluye del listado y
  `_styles` entra a `RESERVED_ROOT_DIRECTORIES`). Guard anti path-traversal
  con el `STYLE_ID_PATTERN` del origen; límites portados (30 000 chars, 20
  planos, 8 muestras de 4 MB) + tope de nombre de 80 (desviación documentada).
  Lectura tolerante: una carpeta corrupta no rompe el listado.
- **Subcomandos**: `styles-list` · `style-save` (update conserva `createdAt`
  y no toca muestras) · `style-delete` (idempotente) ·
  `generate-style-samples` (los 4 momentos fijos verbatim del origen →
  prompts vía el LLM del job + `extractImagePrompt` → imágenes en calidad
  de preview → swap: las muestras viejas se borran recién cuando hay nuevas;
  claves exigidas ANTES de gastar; progreso por eventos del Channel, no
  polling).
- **Snapshot inline** (`ProjectCustomStyle`): `options.styleId` sigue siendo
  un id de catálogo válido (`'normal'` cuando hay custom) — la validación y
  los proyectos viejos quedan intactos.
- **Un resolver, cuatro sitios** (`pipeline/stages/shared/project-style.ts`):
  `resolveProjectStyle(options)` reemplaza los 4 lookups de `VISUAL_STYLES`
  (scene-prompts, images, visual-bible, render). Sin custom devuelve **el
  mismo objeto** del catálogo (identidad); con custom, `id: 'custom'` (no
  fotorrealista, sin vetos), `systemPrompt` compuesto (usuario + ALLOWED
  SHOTS + GLOBAL_RULES — el contrato JSON que espera la extracción) y
  `filterFinal: ''`. Exigió ensanchar `VisualStyle.id` a `string`.
- **UI** (módulo videos): tabs Catálogo/Mi estilo, galería propia (arranca
  VACÍA — v1.35.0: el estilo de la casa no se porta — y el submit se bloquea
  sin tarjeta elegida), tarjeta con portada de muestra y acciones, modal
  único (guarda ANTES de generar muestras; planos recomendados verbatim;
  barras por muestra desde los eventos). Crear un estilo lo deja «en uso».

> **Adenda 2026-09-05.** La UI del tab se alineó con la extracción exacta de
> la web (`vimo-ui-mi-estilo`): la tarjeta es 4:3 con carrusel al hover y un
> menú de tres puntos (Usar · Ver y editar · Generar 4 muestras · Eliminar)
> sobre `@radix-ui/react-dropdown-menu`, vendorizado como
> `common/ui/dropdown-menu.tsx`; «Crear estilo» tiene la misma silueta; el
> modal mide 768px y va en el orden personaje → muestras (carrusel 16:9
> arrastrable) → proveedor (pastillas, sin preselección) → generar → nombre →
> estilo → planos → Listo, y **cerrar guarda** el borrador (no hay
> «Cancelar»; sin nombre se guarda como «Estilo sin nombre» porque el sidecar
> exige uno). El personaje predeterminado se elige con el selector de
> personajes mientras el modal se esconde (nunca dos Radix abiertos). Sin
> cambios de contrato ni de sidecar. Fuera de alcance: «Crear estilo con IA»
> (clonar el estilo de un video) — no existe subcomando que lo respalde.

## Alternativas consideradas

- **Referencia por id en vez de snapshot** — descartada: borrar la gema
  rompería la regeneración desde Library; el origen también viaja inline.
- **Extender el union `CharacterStyleId` con ids dinámicos** — descartada:
  el union cerrado protege validación, personajes y catálogo; el snapshot no
  necesita tocarlo.
- **Saltear biblia visual y director con estilo custom (como el origen)** —
  diferida a la rama del carril verbatim: ahí es donde el origen lo hace, y
  esta fase promete integración con las stages actuales.
- **Muestras como data URLs round-trip (como el origen)** — descartada: ese
  viaje existía por la separación SPA/servidor; acá el sidecar escribe
  directo y la UI lee con `convertFileSrc` + mtime.

## Consecuencias

- ✅ Estilos propios usables de punta a punta con el pipeline actual; los
  proyectos que los usan son autocontenidos.
- ✅ Base lista para el carril verbatim (ramas 10-11): el snapshot y el
  resolver son el punto de enganche.
- ⚠️ En esta fase el estilo custom convive con biblia y director: el
  resultado es «estilo custom sobre la maquinaria del catálogo», no el motor
  verbatim del origen.
- 🔒 Ningún consumidor vuelve a hacer `VISUAL_STYLES[styleId]` con datos del
  proyecto: todo estilo de proyecto pasa por `resolveProjectStyle`.

## Verificación de cumplimiento

- **Harness:** CRUD completo (save/list/update-conserva-createdAt/delete
  idempotente); `../evil` → `invalid_payload`; `_styles` invisible para
  `list-video-projects`; `generate-style-samples` sin clave →
  `missing_api_key` sin gastar; proyecto con `customStyle` persistido con
  `styleId: 'normal'`; proyecto viejo (`terror`) intacto.
- **Aserciones** (script sobre los módulos): resolver identidad estricta sin
  custom; con custom, prompt compuesto y `filterFinal` vacío.
- **Grep guard:** `grep -rn "VISUAL_STYLES\[" pipeline/` → solo el resolver
  y el preview de personajes (catálogo puro).
- **Regresión típica:** un lookup directo nuevo a `VISUAL_STYLES` con
  `options.styleId`, o un consumo del estilo por id de galería.

## Referencias

- ADR-0016 (roadmap; ramas 10-11 traen verbatim y selector de modelo),
  ADR-0013 (stages), ADR-0009 (carpeta raíz), ADR-0015 (un solo modelo).
- Origen: `estiloVisual.ts`, `util/estilosPropios.ts`, `rutas/estilos.ts`,
  `fragmentos-muestra.ts` de vimo_dev.
