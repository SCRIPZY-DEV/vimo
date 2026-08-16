# ADR-0008 — Catálogo de costos como dataset local del cliente

- **Estado:** Aceptada
- **Fecha:** 2026-08-14
- **Área:** app

## Problema

La página de costos del origen consumía `GET /api/costos`: el servidor local
importaba `src/core/costos.ts` y devolvía el catálogo de precios por JSON. Pero
ese catálogo siempre fue **100 % constantes hardcodeadas** — no hay ninguna
fuente remota de precios; actualizar una tarifa siempre significó editar el
archivo y recompilar. Con el servidor local eliminado (ADR-0007), había que
decidir dónde vive el catálogo y cómo lo consume la UI.

## Decisión

**El catálogo es un dataset local del módulo `costs`** — `src/modules/costs/catalog.ts`
con tres exports con nombre (`IMAGE_PROVIDERS`, `VOICE_PROVIDERS`,
`MUSIC_PROVIDERS`) tipados en `types/costs.ts`. Tres reglas derivadas:

1. **Dataset en archivo propio, no en `constants.ts`.** La regla «constantes con
   nombre en `constants.ts`» apunta a escalares sueltos (rutas, límites,
   estimaciones — que sí viven ahí); un dataset de dominio de ~250 líneas lo
   ahogaría. `catalog.ts` sigue siendo constantes con nombre, en un archivo
   dedicado.
2. **Sin `api/` ni TanStack Query.** La cadena componente → hook → `api/` existe
   para hablar con el exterior; un import local síncrono no tiene fetch, ni
   caché, ni estados loading/error (el `useCostos` del origen existía solo por
   el HTTP). Las tablas importan el catálogo directo y derivan filas con
   `useMemo`.
3. **Textos divididos por naturaleza.** Etiquetas técnicas y marcas («Fal.ai»,
   «1920×1080 · High», «suno-v5-beta») quedan en el dataset: son idénticas en
   los tres idiomas (mismo criterio que `Brand.name`). Las frases user-visible
   (notas de opciones, créditos de música) van a i18n: el dataset guarda una
   clave (`notesKey` → `costs.catalogo.*`) y la vista la resuelve con `t()`.

Solo se portó lo que la UI de costos usa. Las funciones del pipeline
(`payloadFalParaOpcion`, `costoVideoCompleto`, `opcionMasBarata`) y los
`endpoint_fal` **no** se portaron: llegarán con la migración del pipeline, que
probablemente los quiera del lado Rust.

## Alternativas consideradas

- **Servirlo por un comando `invoke()`** — descartada: mover constantes a Rust
  para devolverlas por IPC agrega latencia y un comando sin ninguna lógica.
- **JSON en `public/` cargado por fetch** — descartada: pierde el tipado
  estático, agrega estados de carga/error, y `public/` viaja al bundle igual
  que el módulo — no hay ganancia.
- **Todo el texto del catálogo a i18n (incluidas etiquetas técnicas)** —
  descartada: triplicar «1920×1080 · High» en tres catálogos idénticos es
  mantenimiento sin beneficio.

## Consecuencias

- ✅ La página de costos no tiene estados de carga ni error: render inmediato.
- ✅ Actualizar un precio = editar `catalog.ts` (mismo flujo que el origen, sin
  el rebuild del server).
- ⚠️ Los precios viajan en el bundle: un cambio de tarifa requiere release de
  la app (igual que antes — el origen tampoco tenía fuente remota).
- ⚠️ Cuando se migre el editor de video (fase videos), el selector de
  modelo/calidad debe consumir ESTE catálogo — no duplicarlo.

## Nota a futuro — rediseño del modelo de costos (2026-08-14)

El diseño actual de costos **no está funcionando** como propuesta de valor: la
comparativa por proveedor existe porque el modelo es BYO-keys + suscripción, y
la dirección buscada es **un pago único tipo membresía** (con pagos recurrentes
o no — a definir). Cuando esa decisión se tome, tendrá su propia ADR y
probablemente supersede parcialmente a esta: la página de costos podría
reducirse a una referencia interna o desaparecer, y los textos de trial/precio
en `license.*` / `accessDenied.*` cambian con el modelo. Esta ADR sigue
vigente mientras tanto: fija dónde vive el catálogo, no el modelo de negocio.

## Verificación de cumplimiento

- **Build:** `pnpm format && pnpm lint && pnpm build` en verde.
- **Greps ejecutables:**
  - `grep -rn "fetch(\|useQuery" src/modules/costs` → vacío (dataset local).
  - `grep -rn "IMAGE_PROVIDERS" src/` → solo `catalog.ts` y componentes de
    `costs`.
- **Spot-check de montos contra el origen:** video de 10 min con flux-schnell +
  DubVoice ≈ 86 imgs × $0.003 + 7.800 chars × $0.0000119 ≈ $0.35.
- **Regresión típica:** un componente de costos con `fetch`, o un segundo
  catálogo apareciendo en otro módulo.

## Referencias

- ADR-0007 (la muerte del server que servía `GET /api/costos`).
- Origen: `02-vimo/cursor-video/src/core/costos.ts` (montos) y
  `app/src/caracteristicas/costos/` (UI portada).
