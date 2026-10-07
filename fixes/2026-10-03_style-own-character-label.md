# Fix: Mi estilo dice «Personaje del estilo» cuando la gema trae su personaje

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

En el carril, una gema de plantilla con la sección `character` escrita usa ESE personaje en el modo
«genérico»: `sectionCharacterOf` (`pipeline/stages/scene-prompts/verbatim/verbatim-lane.ts`) lo teje
en cada escena y la Fase 1 no diseña otro. «Ver» del catálogo ya lo decía («Personaje del estilo — El
personaje que trae este estilo»), pero el modal de Mi estilo y el chip de personaje de Crear seguían
diciendo «Personaje genérico (narrativo) — Vimo lo inventa coherente con tu guion», que para esas
gemas no es cierto.

En la Entrega 2 se había dejado así a propósito («Mi estilo conserva sus textos»). El dueño lo
corrigió en la QA del 2026-10-03: si la gema tiene un personaje definido, tiene que decirlo; si no,
sigue el genérico.

## Corrección

- `src/modules/videos/utilities/gemTemplate.ts`: `gemBringsCharacter(sections)`, verdadero cuando la
  sección `character` tiene texto (los espacios solos no cuentan, como en el sidecar).
- `CustomStyleModal.tsx`: le pasa `fixedCharacter` al bloque de interruptores, calculado sobre el
  borrador de secciones del modal. El nombre de la opción cambia mientras se escribe o se vacía la
  sección, sin esperar al guardado.
- `CharacterSection.tsx`: el chip de Crear lo dice para cualquier gema que trae su personaje, sea
  del catálogo o de Mi estilo.
- `CatalogStyleModal.tsx` usa la misma función.
- Textos (`public/locales/{es,en,pt}.json`): `create.catalog.fixedCharacterTitle` y
  `fixedCharacterHint` pasan a `create.styleCharacter.fromStyle.title` y `subtitle`, porque ya no
  son solo del catálogo. La ayuda de la sección «Personaje del estilo» explica que, con ella
  escrita, «Personaje genérico» pasa a llamarse «Personaje del estilo».

## Límites deliberados

- Una gema vieja (texto, sin secciones) sigue diciendo «Personaje genérico»: hasta que se adapta no
  hay forma de saber si su texto define un personaje.
- No cambia el carril ni lo que viaja al sidecar: solo los textos de la pantalla.
- `PromptModelSection` conserva su propia comprobación de la sección (la usa para estimar el costo
  de la fase del personaje).

## Validación reproducible

```bash
node --test scripts/test/check-app-gem-sections.mjs
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

El guard suma el caso «la gema trae su personaje solo si su sección `character` tiene texto» (con
texto, sin sección, vacía, con solo espacios y una gema sin secciones).

## Pruebas manuales

- Con el formulario real de Crear montado en Chrome sin interfaz (dentro de `StrictMode`, API
  simulada):
  - la copia de POV Stickman en Mi estilo (trae personaje) muestra «Personaje del estilo» en su
    modal y en el chip de Crear;
  - una gema sin la sección muestra «Personaje genérico (narrativo)»;
  - al agregar la sección «Personaje del estilo» y escribirla, la opción cambia de nombre en el
    momento.
- Falta el recorrido del dueño en `pnpm tauri dev`.
