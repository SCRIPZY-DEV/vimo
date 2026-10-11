# Fix: el coral de los avisos se lee en el tema claro

- 📅 **Fecha:** 2026-10-11
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el token `--coral-text` (`src/assets/css/main.css`, `tailwind.config.ts`) y 38
  componentes de `src/` que pintaban texto o íconos de aviso con `text-coral`; la ronda 1 (al final)
  suma los dos rellenos `bg-coral` con texto o ícono blanco encima (`StyleCloneStatusTag` y
  `StyleCloneSourceStep`) y corrige el comentario del token; la ronda 2 deja esos dos rellenos en
  `bg-wine`, fijo en los dos temas.
- **Relacionado:** `docs/fixes/2026-10-11-fix-error-text-contrast/error-text-contrast.md` (el mismo
  problema con `text-destructive`, que dejó `text-coral` fuera a propósito) y el paquete WP-I de
  `docs/handoff/2026-10-09-avatar-heygen/plan-e2c.md` (interno) (QA del dueño del 2026-10-11, tarde: «el coral
  de los avisos se lee poco en tema claro»).

## Causa

`--coral` (`0 100% 70%`, `#ff6666`) es el color de la marca para fondos, bordes y adornos, y vale lo
mismo en los dos temas. Usado como color de **texto** o de un **ícono que acompaña un texto**
(`text-coral`, también con `hover:` y `focus:`), da en el tema claro, medido con la fórmula de
luminancia de WCAG 2.x sobre los tokens de `main.css`, entre 2,31:1 y 2,86:1 según la superficie
(2,86:1 sobre el blanco de `--background`, 2,58:1 sobre una caja `bg-coral/10`). AA pide 4,5:1 para
texto. En el tema oscuro el coral sí se lee (6,55:1 sobre `--background`, 6,09:1 sobre `--card`).

Esa clase pintaba los avisos, errores, contadores y estados de la app: el ícono del `Alert` de tono
`danger`, el saldo insuficiente, los errores de Crear (`CreateAnimationSection`, `GemPasteStep`,
`StyleCloneSourceStep`…), la pantalla de error, los avisos del avatar. El fix de `text-destructive`
los dejó fuera a propósito: el `Alert` eligió coral porque en oscuro `--destructive` se apaga, y
`--coral` sigue vivo en los dos temas. Quedaba pendiente que en claro el coral no se leía.

## Corrección

- **`--coral-text` ya estaba en el repo** (commit `fa7ec703`, dejado por el controlador de la 2c como
  contrato compartido): `5 85% 42%` en claro (`#c61f10`) y `0 100% 70%` en oscuro (el coral de
  siempre), con la clase `text-coral-text` en `tailwind.config.ts`. Se midió sobre todas las
  superficies reales (tabla de abajo): el peor caso del tema claro da 4,71:1, así que **el valor no
  se ajustó y `main.css` no se tocó** (la ronda 1, al final, corrige solo su comentario). El tono
  sigue siendo el del coral de la marca (rojo anaranjado).
- **38 componentes:** `text-coral` → `text-coral-text` en 48 usos de 46 líneas (44 con la clase
  pelada, 3 `hover:` y 1 `focus:`), repartidos así:
  - `layouts/AuthenticatedLayout`: `Sidebar` (hover de «Cerrar sesión»).
  - `api-keys`: `ApiKeys` (ícono del aviso), `MissingApiKeysDialog`.
  - `auth`: `License` (hover del botón «Salir»).
  - `avatars`: `AvatarBalanceBadge` (ícono de «saldo no disponible»), `GenerateLookDialog` (contador
    del prompt al tope).
  - `characters`: `CharacterPreviewPanel`, `CharacterProfileFields` (falta de clave).
  - `common`: `Alert` (ícono del tono `danger`; el comentario del tono explica por qué la caja lleva el
    coral pleno y el ícono no), `CreditsBadge`, `ErrorBoundary`, `InsufficientCreditsAlert` (la cifra
    que no alcanza), `PromptModelCard` (modelo bloqueado).
  - `settings`: `BlockedPromptModelsSection`.
  - `videos`: `AnimationFailureDialog`, `AvatarDroppedNote`, `AvatarSpansNote` (2),
    `ConfirmScenesDialog`, `CreateAnimationSection`, `EditorAnimationRange` (2), `GemPasteStep` (2),
    `GemSectionBox`, `GemSectionsEditor` (2), `InsufficientCreditsCard`, `OutdatedVideoBanner`,
    `PipelineAnimationPanel` (solo el texto «clip falló»), `PipelineAvatarPanel`,
    `PipelineAvatarRow`, `PromptModelIssueDialog` (2), `SceneAnimationSection`, `StageBar`,
    `StyleCloneSessionCard` (`text-` y `focus:` del ítem «Descartar»), `StyleCloneSourceStep` (3),
    `StyleCloneTestImage`, `StyleSourceTabs`, `TimelineHeaderToggle`, `TtsProviderDownDialog`.
  - `voices`: `VoiceCard` (chip «Clon» y corazón de favorito, con su `hover:`).
- **Cuatro formatos de Prettier** por el nombre más largo (`text-coral-text`): `AvatarDroppedNote` y
  `AvatarSpansNote` parten el `<UserRound …>` en una línea por atributo, y `GemSectionBox` y
  `VoiceCard` parten el ternario de `cn(...)` en tres líneas. No hay otro cambio de formato.

### Lo que queda en coral pleno, caso por caso

| Uso                                                                        | Por qué se queda                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Login.tsx:68` (error de inicio de sesión)                                 | `GuestLayout` pinta un degradado oscuro fijo (`charcoal → ink → 216 72% 22%`) en los dos temas. El coral pleno da de 4,55:1 a 5,94:1; `coral-text` del claro daría de 2,23:1 a 2,91:1. Cambiarlo lo vuelve ilegible.                     |
| `AccessDenied.tsx:27` (candado de «acceso denegado»)                       | La misma superficie oscura fija, con el círculo `bg-coral/15`: coral pleno de 3,90:1 a 4,84:1 contra 1,91:1 a 2,37:1 de `coral-text`.                                                                                                    |
| `PipelineAnimationPanel.tsx:143` (ícono de clip fallido)                   | Va sobre el velo `bg-black/30` encima de la miniatura de la escena: la superficie es una imagen, no un token. Según la imagen gana uno u otro (coral pleno de 1,36:1 a 7,34:1; `coral-text` de 1,18:1 a 3,60:1). Es adorno sobre imagen. |
| `StockGroupCard.tsx:156` (corazón de favoritos sobre la foto)              | Adorno sobre una foto, la excepción que pidió el plan. Además es de `avatars/**` (WP-G), que no es de este paquete.                                                                                                                      |
| `CreateAvatarPicker.tsx:299` y `CreateAvatarSection.tsx:93`                | Los cambia WP-J (Crear). Cuando los cierre, `grep` debe quedar sin esas dos líneas.                                                                                                                                                      |
| `bg-coral` del playhead, `border-coral`, `ring-coral`, `to-coral`, doodles | Rellenos, bordes y adornos sin texto: el coral pleno es su color. (Los dos `bg-coral` con texto blanco encima se cambiaron en la ronda 1.)                                                                                               |

El corazón de favoritos de `VoiceCard` **sí** cambió: a diferencia del de `StockGroupCard`, no va
sobre una foto sino sobre la superficie de la tarjeta, y el relleno rojo es la única señal visual del
estado.

### Contrastes (WCAG 2.x, sobre los tokens de `main.css`)

`L = 0,2126 R + 0,7152 G + 0,0722 B` con cada canal `c = v/255` pasado a lineal
(`c ≤ 0,04045 ? c/12,92 : ((c+0,055)/1,055)^2,4`) y razón `(L claro + 0,05) / (L oscuro + 0,05)`.
Las cajas tintadas (`bg-coral/N`, `bg-saffron/N`…) se componen sobre su superficie en sRGB, como el
navegador. «Antes» es `text-coral` (el coral pleno `#ff6666`); «después» es `text-coral-text`
(`#c61f10` en claro). En oscuro los dos son `#ff6666`, así que no hay cambio.

| Superficie (dónde aparece)                                          | Claro, antes | Claro, después | Oscuro (igual que antes) |
| ------------------------------------------------------------------- | ------------ | -------------- | ------------------------ |
| `--background`                                                      | 2,86:1       | 5,83:1         | 6,55:1                   |
| `--card` y `--popover` (diálogos, menús)                            | 2,86:1       | 5,83:1         | 6,09:1                   |
| `--muted`                                                           | 2,67:1       | 5,44:1         | 5,43:1                   |
| `--accent` (ítem de menú con foco)                                  | 2,33:1       | 4,74:1         | 4,75:1                   |
| `--sidebar-background`                                              | 2,74:1       | 5,58:1         | 6,80:1                   |
| sidebar con `hover:bg-coral/10` («Cerrar sesión»)                   | 2,48:1       | 5,04:1         | 6,09:1                   |
| `bg-coral/5` (tarjeta de saldo, modelos bloqueados)                 | 2,71:1       | 5,52:1         | 5,72:1                   |
| `bg-coral/10` (`Alert` danger, avisos, `CreditsBadge`)              | 2,58:1       | 5,26:1         | 5,31:1                   |
| `bg-coral/10` sobre `--muted`                                       | 2,43:1       | 4,94:1         | 4,71:1                   |
| `bg-coral/15` (íconos de los diálogos, chip «Clon»)                 | 2,45:1       | 4,98:1         | 4,95:1                   |
| `bg-coral/20` (ícono de `ErrorBoundary`)                            | 2,31:1       | 4,71:1         | 4,52:1                   |
| `bg-saffron/10` (`Alert` warning)                                   | 2,70:1       | 5,50:1         | 5,45:1                   |
| `bg-coral/10` dentro de `bg-coral/5` (`Alert` en la tarjeta)        | 2,46:1       | 5,02:1         | 5,42:1                   |
| `bg-ocean/5` (fila de fase de `StageBar`)                           | 2,77:1       | 5,65:1         | 6,10:1                   |
| `bg-amethyst/10` (línea de `AvatarSpansNote`)                       | 2,53:1       | 5,16:1         | 5,96:1                   |
| chip «Clon» (`bg-coral/15`) sobre una voz elegida (`bg-saffron/10`) | 2,33:1       | 4,74:1         | 3,99:1 (ver límites)     |

Ejemplo a mano, `#c61f10` sobre blanco: R=198 da 0,5647, G=31 da 0,0137 y B=16 da 0,0052;
`L = 0,2126·0,5647 + 0,7152·0,0137 + 0,0722·0,0052 = 0,1302`; `(1 + 0,05) / (0,1302 + 0,05) = 5,83`.

Por qué el valor no cambió: la peor superficie del tema claro que de verdad aparece junto a un texto
es `bg-coral/20` sobre `--card` (4,71:1, el ícono de `ErrorBoundary`); le siguen el foco de un menú y
el chip «Clon» de una voz elegida, con 4,74:1. Todas pasan 4,5:1 con margen, así que no hace falta
oscurecer el rojo (que se alejaría del tono del coral de la marca).

Superficies fijas donde el coral pleno gana (medidas con las mismas fórmulas):

| Superficie fija                                                     | Coral pleno        | `coral-text` del tema claro |
| ------------------------------------------------------------------- | ------------------ | --------------------------- |
| degradado de `GuestLayout`: `charcoal` / `ink` / azul `216 72% 22%` | 5,94 / 5,63 / 4,55 | 2,91 / 2,76 / 2,23          |
| círculo `bg-coral/15` del candado sobre esos tres puntos            | 4,84 / 4,60 / 3,90 | 2,37 / 2,26 / 1,91          |
| `bg-black/30` sobre una imagen negra / gris 128 / blanca            | 7,34 / 2,41 / 1,36 | 3,60 / 1,18 / 2,78          |

## Límites deliberados

- **Controles deshabilitados con `opacity-60`.** El badge «No disponible · vuelve en N min» de
  `PromptModelCard` y la ayuda de la pestaña bloqueada de `StyleSourceTabs` están dentro de un botón
  con `opacity-60` (estado bloqueado). El texto sube de 1,91:1 a 2,99:1 en el tema claro, pero el 60 %
  de opacidad del control lo mantiene por debajo de 4,5:1. No se tocó la opacidad: es el diseño del
  estado bloqueado (WCAG exime a los controles inactivos) y cambiarlo es una decisión de diseño aparte.
- **El tema oscuro no cambia.** `--coral-text` es el coral de siempre, así que ningún texto oscuro
  se mueve. Una combinación del oscuro ya estaba por debajo de 4,5:1 y sigue igual: el chip «Clon»
  de `VoiceCard` sobre una voz elegida mide 3,99:1 con la tarjeta como base y 4,37:1 sobre el fondo
  de la página. Arreglarlo exige cambiar el chip, no el token.
- **Texto blanco sobre un relleno coral** (`StyleCloneStatusTag`: `bg-coral text-white`, y el
  `hover:bg-coral hover:text-white` del botón de quitar imagen de `StyleCloneSourceStep`) da 2,86:1 y
  no se tocó en la primera entrega: el plan deja `bg-coral` en coral pleno y es otro problema (el
  color del fondo, no el del texto). **Superado por la ronda 1** (al final): el fondo de los dos
  pasó a `bg-coral-text`.
- **`--destructive` y `text-destructive-text` no se tocan.** Son el otro rojo de la app (el fix de
  `error-text-contrast`); los avisos en coral y los errores en rojo siguen siendo dos familias.
- **Sin guard permanente.** Ningún guard de `scripts/test/` afirma `text-coral` (`grep -rn
"coral" scripts pipeline` da vacío). La medida se reproduce con el bloque de abajo; si se quiere
  cerrar la puerta a una regresión, el paso siguiente es un guard con ese mismo cálculo y una fila
  en `scripts/test/README.md`.
- Las capturas de la prueba visual no se versionan (sin binarios en `docs/` (interno)).

## Validación reproducible

1. Los únicos `text-coral` que quedan como color de texto o de ícono (con la sintaxis del plan):

   ```sh
   grep -rnE "text-coral([^-A-Za-z]|$)" src --include='*.ts' --include='*.tsx'
   ```

   Salida esperada: 6 líneas, las de la tabla «Lo que queda en coral pleno»: `Login.tsx:68`,
   `AccessDenied.tsx:27`, `PipelineAnimationPanel.tsx:143`, `StockGroupCard.tsx:156`,
   `CreateAvatarPicker.tsx:299` y `CreateAvatarSection.tsx:93`. Cuando WP-J cierre los dos de Crear,
   quedan 4.

2. Contrastes de los tokens (claro y oscuro) desde la raíz del repo; sale con código 1 si algún
   `--coral-text` del tema claro baja de 4,5:1 (las filas del oscuro son informativas):

   ```sh
   node --input-type=module - <<'EOF'
   import { readFileSync } from 'node:fs'
   const css = readFileSync('src/assets/css/main.css', 'utf8')
   const block = (selector) => css.match(new RegExp(selector + ' \\{([\\s\\S]*?)\\n  \\}'))[1]
   const token = (body, name) =>
     body.match(new RegExp('--' + name + ': ([^;]+);'))[1].replaceAll('%', '').split(' ').map(Number)
   function toRgb([h, s, l]) {
     const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100)
     const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
     const m = l / 100 - c / 2
     const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
     return [r, g, b].map((v) => Math.round((v + m) * 255))
   }
   const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
   const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
   const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
   const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)))
   const root = block(':root')
   let failures = 0
   for (const [theme, selector] of [['claro', ':root'], ['oscuro', '\\.dark']]) {
     const body = block(selector)
     const rgb = (name) => toRgb(token(body.includes('--' + name + ':') ? body : root, name))
     const coral = rgb('coral')
     const text = rgb('coral-text')
     const [background, card, muted, sidebar] = ['background', 'card', 'muted', 'sidebar-background'].map(rgb)
     const surfaces = {
       background,
       'card y popover': card,
       muted,
       'accent (ítem de menú con foco)': rgb('accent'),
       sidebar,
       'sidebar con hover bg-coral/10': over(coral, 0.1, sidebar),
     }
     for (const alpha of [0.05, 0.1, 0.15, 0.2]) {
       surfaces['bg-coral/' + alpha * 100 + ' sobre card'] = over(coral, alpha, card)
     }
     surfaces['bg-coral/10 sobre muted'] = over(coral, 0.1, muted)
     surfaces['bg-saffron/10 (Alert warning)'] = over(rgb('saffron'), 0.1, background)
     surfaces['bg-coral/10 sobre bg-coral/5 (Alert en la tarjeta de saldo)'] = over(coral, 0.1, over(coral, 0.05, background))
     surfaces['bg-ocean/5 (fila de fase)'] = over(rgb('ocean'), 0.05, background)
     surfaces['bg-amethyst/10 (nota del avatar)'] = over(rgb('amethyst'), 0.1, background)
     surfaces['chip bg-coral/15 sobre voz elegida'] = over(coral, 0.15, over(rgb('saffron'), 0.1, card))
     for (const [name, bg] of Object.entries(surfaces)) {
       const value = ratio(text, bg)
       const failed = value < 4.5
       // Solo el valor del tema claro es de este fix: el oscuro es el coral de siempre.
       if (failed && theme === 'claro') failures++
       const status = !failed ? 'ok  ' : theme === 'claro' ? 'FAIL' : 'ref '
       console.log(theme.padEnd(6), status, value.toFixed(2) + ':1', '(antes ' + ratio(coral, bg).toFixed(2) + ':1) sobre', name)
     }
   }
   process.exitCode = failures ? 1 : 0
   EOF
   ```

   Salida esperada: 16 líneas `ok` en claro (de 4,71:1 a 5,83:1, «antes» de 2,31:1 a 2,86:1) y 16 en
   oscuro, 15 `ok` (de 4,52:1 a 6,80:1) y una `ref` (el chip «Clon» sobre una voz elegida, 3,99:1,
   igual que antes). Con el valor de antes del tema claro (`--coral-text: 0 100% 70%`) las 16 líneas
   del claro dan `FAIL` y el código de salida es 1.

3. Formato, lint, catálogos y build: `pnpm exec prettier --check src docs/fixes`, `pnpm exec eslint
src`, `pnpm check:locales` y `pnpm build`.

4. Que el CSS construido lleva los dos valores y las tres clases:

   ```sh
   grep -oE "\-\-coral-text:[^;}]*" dist/assets/*.css
   grep -oE "\.(hover\\\\:|focus\\\\:)?text-coral-text(:hover|:focus)?\{[^}]*\}" dist/assets/*.css
   ```

   Esperado: `5 85% 42%` (claro) y `0 100% 70%` (oscuro); `.text-coral-text`,
   `.hover\:text-coral-text:hover` y `.focus\:text-coral-text:focus`.

5. El guard que monta `StageBar`, el panel y la fila del avatar y sus dos notas con los componentes
   reales sigue verde: `node scripts/test/check-avatar-progress-ui.mjs` (90 checks).

## Pruebas manuales

Hechas el 2026-10-11 con un banco descartable (no versionado; esbuild + Chrome headless con perfil
temporal, sin red) que monta los componentes con el CSS que sale de `pnpm build`, en el tema claro y
en el oscuro. Reales: `Alert` danger y warning, `InsufficientCreditsAlert` (suelto y dentro de la
tarjeta `bg-coral/5`), `CreditsBadge` con error, `PromptModelCard` bloqueada, `AvatarBalanceBadge`
(con el hook del saldo simulado), `ErrorBoundary` con un hijo que falla, `VoiceCard` (chip «Clon»
sin elegir y elegido, corazón de favorito), `AvatarDroppedNote`, `AvatarSpansNote` (caja coral y caja
amethyst), `StageBar` con el modelo trabado, `OutdatedVideoBanner`, `TimelineHeaderToggle`,
`GemSectionBox` al tope y `AnimationFailureDialog` abierto. Réplicas rotuladas con las mismas
clases: el hover de «Cerrar sesión» del `Sidebar` y del botón «Salir» de `License`, el ítem
«Descartar» del menú de `StyleCloneSessionCard` y los textos de error de Crear, más la miniatura
rechazada de `StyleCloneSourceStep`. Para cada elemento con `text-coral-text` el banco lee el color
computado y el fondo efectivo (componiendo las capas translúcidas y la opacidad de los ancestros) y
calcula la razón WCAG; el hover es real por CDP y el foco, con `focus()`:

- Claro: de 4,73:1 (ícono de `ErrorBoundary`, sobre `bg-coral/20`) a 5,83:1; el menú con foco y el
  chip «Clon» de una voz elegida, 4,74:1; el hover de «Cerrar sesión», 5,05:1; el de «Salir», 5,25:1.
  Las mismas cajas con el coral pleno daban de 2,31:1 a 2,86:1.
- Oscuro: sin cambio, de 4,52:1 a 6,55:1, salvo el chip «Clon» de una voz elegida, 4,37:1 (ya estaba
  así; ver límites).
- Con `opacity-60` (modelo bloqueado) el texto da 2,99:1 en claro y 2,93:1 en oscuro; ver límites.
- Se miraron las capturas de los dos temas: en claro los íconos y textos son un rojo anaranjado
  profundo legible sobre el rosa de las cajas; en oscuro es el coral de siempre. En la réplica del
  degradado de `GuestLayout` el `coral-text` del tema claro queda casi invisible y el coral pleno se
  lee: por eso `Login` y `AccessDenied` se quedan como estaban.

**No se probó dentro de la app de escritorio (Tauri):** las pantallas reales (Crear, editor, ajustes,
claves, biblioteca) dependen del sidecar y de la sesión; se verificaron los componentes y las clases,
no cada pantalla armada. Los componentes que arrastran hooks de la app (`BlockedPromptModelsSection`,
`InsufficientCreditsCard`, `PromptModelIssueDialog`, `StyleCloneSourceStep`, `GemPasteStep`,
`PipelineAvatarRow`) se midieron por sus clases en réplicas, no montados.

## Ronda 1

Decisión del coordinador de la 2c (2026-10-11): el texto o ícono blanco sobre un relleno `bg-coral`
es el mismo problema de legibilidad que pidió corregir el dueño, así que esos rellenos pasan al coral
oscuro del token; y el comentario de `--coral-text` se corrige con lo medido. Commit
`fix: give white text on coral a readable background`.

> **Nota de la ronda 2:** de esta ronda sigue vigente la causa, el comentario corregido de
> `--coral-text` y el inventario de «Lo que no cambió» (salvo su última viñeta). Lo que pasó a otra
> cosa es el relleno de los dos usos: de `bg-coral-text` a `bg-wine` (ver «Ronda 2»). Las secciones
> de abajo que hablan de `bg-coral-text` como fondo describen el estado de la ronda 1.

### Causa

El contraste es simétrico: blanco sobre el coral pleno (`#ff6666`) da los mismos 2,86:1 que el coral
sobre blanco. Dos lugares lo tenían: la etiqueta de error de las tarjetas de Mi estilo
(`StyleCloneStatusTag`, `bg-coral text-white`) y el botón redondo de quitar una imagen al pasarle el
mouse (`StyleCloneSourceStep`, `hover:bg-coral hover:text-white`, con el ícono `X` blanco).

### Corrección

- **`StyleCloneStatusTag.tsx`:** el tono `error` pasa de `bg-coral text-white` a
  `bg-coral-text text-white`. El comentario de los tonos decía «colores fijos y no los del tema»;
  ahora aclara que el fondo del error es la excepción (usa el token, que en oscuro vuelve a ser el
  coral de siempre). Los otros dos tonos no cambian. **Superado por la ronda 2:** ahora `bg-wine`.
- **`StyleCloneSourceStep.tsx`:** el botón de quitar imagen pasa de `hover:bg-coral` a
  `hover:bg-coral-text` (el texto sigue en `hover:text-white`). **Superado por la ronda 2:** ahora
  `hover:bg-wine`.
- **`main.css`, solo el comentario de `--coral-text`** (en `:root` y en `.dark`). Decía «no baja de
  ~5:1 sobre `muted` ni sobre las cajas `bg-coral/10` a `/15`», y lo medido es otra cosa: 5,83:1
  sobre `background`, `card` y `popover`; 5,44:1 sobre `muted`; 4,74:1 sobre `accent`; de 5,52:1 a
  4,71:1 sobre las cajas `bg-coral/5` a `/20` (sobre `background` o `card`); y sobre `muted`, de
  5,18:1 a 4,68:1 hasta la `/15` y 4,46:1 con la `/20`. Ahora el comentario trae esas cifras, dice
  que en claro el token sirve también de fondo con texto blanco (5,83:1) y que en oscuro no (2,86:1).
  Los valores de los tokens no cambian.

### Medida

Blanco sobre el relleno (misma fórmula de WCAG 2.x). El texto de la etiqueta (14 px, negrita) pide
4,5:1; el ícono `X` (12 px), 3:1.

| Relleno                   | Claro  | Oscuro                          |
| ------------------------- | ------ | ------------------------------- |
| `bg-coral` (antes)        | 2,86:1 | 2,86:1                          |
| `bg-coral-text` (después) | 5,83:1 | 2,86:1 (es el coral de siempre) |

(Estado de la ronda 1; la ronda 2 deja los dos usos en `bg-wine`, 7,40:1 en los dos temas.)

### Lo que no cambió

Se buscó todo relleno coral sin opacidad (`grep -rnE "bg-coral([^/A-Za-z0-9-]|$)" src`, también con
`hover:` y otros prefijos), las paradas de degradé `from|via|to-coral` y cualquier coral escrito a
mano (`#ff6666`, `hsl(0 100% 70%)`, `var(--coral)` fuera de `main.css` y de los doodles):

- **Playhead del timeline** (`EditorTimeline.tsx`, 2 `bg-coral`): una línea y un rombo, sin texto.
- **Tiles degradé** `from-saffron via-saffron/70 to-coral` de `MusicHistoryPanel` y
  `VoiceHistoryPanel` (marcador sin portada): llevan un ícono `text-white/90`, pero el coral es solo
  la parada final de la esquina; el ícono, al centro, cae sobre el saffron (alrededor de 1,6:1, de
  antes) y no sobre un `bg-coral`. No se tocaron.
- **`bg-coral/N`** (cajas tintadas): su texto es `text-foreground` o `text-coral-text`. **`border-coral`,
  `ring-coral/N`** y los doodles: sin texto encima.
- **El botón rojo del kit** (`variant="destructive"`) y los demás `bg-destructive` con blanco (la
  variante destructive del toast, el distintivo «archivado» de `CatalogStyleCard`, y el botón de
  confirmar de `StockGroupCard`, de WP-G): `--destructive` en claro es el mismo `#ff6666`, así que dan
  2,86:1 igual. No son `bg-coral` y el botón del kit se excluyó a propósito.
  **Superado por la ronda 2 (R-I4):** `--destructive` en claro pasó a `0 72% 43%` y esos rellenos dan
  6,21:1 con blanco; ver `docs/fixes/2026-10-11-fix-destructive-fill-contrast/destructive-fill-contrast.md`.

### Límite deliberado: el tema oscuro

`--coral-text` en oscuro es el coral de siempre (`#ff6666`), porque como texto sobre fondo oscuro ya
se lee (6,55:1). Como **fondo** con texto blanco, en cambio, no: la etiqueta de error y el botón de
quitar imagen siguen en 2,86:1 en oscuro, igual que antes (no mejoran ni empeoran). Arreglarlo exige
un relleno que sea el rojo oscuro en los dos temas (un token de relleno aparte, o el `bg-wine` que ya
existe para «Error» en la Biblioteca, 7,40:1 con blanco) y es una decisión de diseño pendiente. El
comentario de `--coral-text` en `.dark` ya lo avisa. **Superado por la ronda 2:** el coordinador eligió
`bg-wine` y los dos usos quedaron fijos y legibles en los dos temas.

### Validación reproducible (ronda 1)

1. Rellenos coral sin opacidad que quedan (ya sin texto encima):

   ```sh
   grep -rnE "bg-coral([^/A-Za-z0-9-]|$)" src --include='*.ts' --include='*.tsx'
   ```

   Salida esperada: dos líneas, `EditorTimeline.tsx:827` y `:828` (el playhead).

2. Blanco sobre los dos rellenos, en los dos temas (sale con código 1 si `bg-coral-text` en claro baja
   de 4,5:1; el resto son filas de referencia):

   ```sh
   node --input-type=module - <<'EOF'
   import { readFileSync } from 'node:fs'
   const css = readFileSync('src/assets/css/main.css', 'utf8')
   const block = (selector) => css.match(new RegExp(selector + ' \\{([\\s\\S]*?)\\n  \\}'))[1]
   const token = (body, name) =>
     body.match(new RegExp('--' + name + ': ([^;]+);'))[1].replaceAll('%', '').split(' ').map(Number)
   function toRgb([h, s, l]) {
     const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100)
     const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
     const m = l / 100 - c / 2
     const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
     return [r, g, b].map((v) => Math.round((v + m) * 255))
   }
   const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
   const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
   const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
   let failures = 0
   for (const [theme, selector] of [['claro', ':root'], ['oscuro', '\\.dark']]) {
     for (const name of ['coral', 'coral-text']) {
       const fill = toRgb(token(name === 'coral' ? block(':root') : block(selector), name))
       const value = ratio([255, 255, 255], fill)
       const failed = value < 4.5
       if (failed && name === 'coral-text' && theme === 'claro') failures++
       const status = !failed ? 'ok  ' : name === 'coral-text' && theme === 'claro' ? 'FAIL' : 'ref '
       console.log(theme.padEnd(6), status, value.toFixed(2) + ':1', 'blanco sobre bg-' + name)
     }
   }
   process.exitCode = failures ? 1 : 0
   EOF
   ```

   Salida esperada: `claro ref 2,86:1 bg-coral`, `claro ok 5,83:1 bg-coral-text`, y las dos de
   oscuro `ref 2,86:1` (el límite de arriba). Con `--coral-text` del claro en `0 100% 70%` la segunda
   da `FAIL` y el código de salida es 1.

3. Que el CSS construido lleva las dos clases del fondo y ya no `hover:bg-coral`:

   ```sh
   grep -oE "\.bg-coral-text\{[^}]*\}|\.hover\\\\:bg-coral-text:hover\{[^}]*\}" dist/assets/*.css
   grep -c "hover\\\\:bg-coral:hover" dist/assets/*.css
   ```

   Esperado: `.bg-coral-text{background-color:hsl(var(--coral-text))}` y
   `.hover\:bg-coral-text:hover{…}`; el segundo comando imprime `0`.

4. Formato, lint, catálogos y build de lo tocado: `pnpm exec prettier --check src/assets/css/main.css
src/modules/videos/components/StyleCloneStatusTag.tsx
src/modules/videos/components/StyleCloneSourceStep.tsx docs/fixes`, `pnpm exec eslint` de los dos
   componentes, `pnpm check:locales` y `pnpm build`.

### Pruebas manuales (ronda 1)

Con el mismo tipo de banco descartable (esbuild + Chrome headless con perfil temporal, sin red, con
el CSS que sale de `pnpm build`), en los dos temas: el `StyleCloneStatusTag` **real** en los cuatro
estados (`failed`, `noCredits`, `awaiting`, `analyzing`) sobre el velo `bg-black/45` de la tarjeta, la
etiqueta de error sobre tres imágenes de muestra (oscura, media y clara) y el botón de quitar imagen
con la cadena de clases **leída del archivo fuente** (réplica del mosaico: `StyleCloneSourceStep`
arrastra hooks de la app), con hover real por CDP. El banco lee el color computado y el fondo
efectivo y calcula la razón WCAG:

- Claro: etiqueta de error 5,83:1 con sus dos textos («Error · Reintentar» y «Sin saldo · Recargá y
  continuá»), botón de quitar con hover 5,83:1; el tono «espera» (carbón sobre saffron) 9,93:1 y
  «trabajando» (carbón sobre blanco) 16,98:1, sin cambio. En reposo el botón es carbón sobre
  `bg-background/90` (16,87:1).
- Oscuro: etiqueta de error y botón con hover, 2,86:1: igual que antes (la fila «antes» del banco,
  con `bg-coral`, da lo mismo).
- Se miraron las capturas: en claro la etiqueta roja oscura con letra blanca se lee con claridad sobre
  el velo, también sobre la imagen clara, y se distingue de la de «espera»; la de antes (coral pleno)
  se ve lavada. En oscuro la etiqueta sigue siendo el coral pleno.

**No se probó dentro de la app de escritorio (Tauri):** se verificó el componente y las clases.

## Ronda 2

Decisiones del coordinador de la 2c (2026-10-11) sobre los concerns de la ronda 1. Esta sección cubre
R-I3, la etiqueta de error y el botón de quitar imagen; R-I4, el relleno del rojo de error del tema
claro, es otro arreglo con su propio informe.

### R-I3: los dos rellenos vuelven a uno fijo que se lee en los dos temas

**Causa.** El `bg-coral-text` de la ronda 1 arregló el tema claro, pero en oscuro ese token es el
coral de siempre (`#ff6666`): blanco encima da 2,86:1, así que la etiqueta de error y el botón de
quitar imagen seguían ilegibles en oscuro. Además la etiqueta declara «colores fijos y no los del
tema» (va siempre sobre el velo oscuro de la tarjeta) y su error pasaba a depender del tema.

**Corrección.** El relleno pasa a `wine`, el color que la paleta de estados de la Biblioteca ya usa
para «Error» (`ProjectStateBadge`: `error: bg-wine`). Se define solo en `:root` (`354 62% 39%`), así
que vale lo mismo en los dos temas:

- **`StyleCloneStatusTag.tsx`:** el tono `error` pasa de `bg-coral-text text-white` a
  `bg-wine text-white`. El comentario vuelve a «colores fijos y no los del tema», ya sin excepción,
  y dice por qué `wine` (7,40:1 con blanco, igual en claro y en oscuro).
- **`StyleCloneSourceStep.tsx`:** el botón de quitar imagen pasa de `hover:bg-coral-text` a
  `hover:bg-wine` (el texto sigue en `hover:text-white`).
- **`main.css`, solo los comentarios de `--coral-text`** (`:root` y `.dark`): ya no ofrecen
  `bg-coral-text text-white` como relleno; dicen que el token es para texto y que un relleno con blanco
  va en `bg-wine`.

**Por qué `wine` y no otro de la paleta.** El tono `error` de la etiqueta cubre tres textos («Error ·
Reintentar», «Se interrumpió · Reanudar», «Sin saldo · Recargá y continuá») y la Biblioteca llama
«Error» a `wine`. Blanco sobre cada color de la paleta de estados, para comparar:

| Color de la paleta          | Estado de la Biblioteca | Blanco encima |
| --------------------------- | ----------------------- | ------------- |
| `wine` (`354 62% 39%`)      | Error                   | 7,40:1        |
| `raspberry` (`339 68% 45%`) | Sin saldo               | 5,70:1        |
| `ember` (`18 82% 43%`)      | Interrumpido            | 4,72:1        |
| `cherry` (`354 70% 54%`)    | Cancelado               | 4,47:1        |

(`cherry` queda por debajo de 4,5:1, aunque el comentario de la paleta dice que todos pasan; no se usa
acá y no se tocó. **Superado por la ronda 3 de WP-I:** `cherry` pasó a `354 70% 53%`, 4,60:1 con blanco;
ver `docs/fixes/2026-10-11-fix-destructive-fill-contrast/destructive-fill-contrast.md`.)

**Medida.** Blanco sobre el relleno (misma fórmula de WCAG 2.x; el texto de la etiqueta pide 4,5:1 y
el ícono `X`, 3:1):

| Relleno                   | Claro  | Oscuro |
| ------------------------- | ------ | ------ |
| `bg-coral` (antes)        | 2,86:1 | 2,86:1 |
| `bg-coral-text` (ronda 1) | 5,83:1 | 2,86:1 |
| `bg-wine` (ahora)         | 7,40:1 | 7,40:1 |

**Lo que no cambió.** `text-coral-text` como color de TEXTO (los 48 usos de la primera entrega) y el
token `--coral-text`; los otros dos tonos de la etiqueta (trabajando y espera).

**Validación reproducible (R-I3).**

1. Ya no queda ningún `bg-coral-text` y el relleno de la etiqueta y del botón es `wine`:

   ```sh
   grep -rnE "bg-coral-text" src --include='*.ts' --include='*.tsx'
   grep -rnE "(^|[^-A-Za-z])(hover:)?bg-wine" src --include='*.ts' --include='*.tsx'
   ```

   Esperado: el primero no imprime nada; el segundo, tres líneas: `StyleCloneStatusTag.tsx` (tono `error`),
   `StyleCloneSourceStep.tsx` (`hover:bg-wine`) y `ProjectStateBadge.tsx` (el badge de «Error»).

2. Blanco sobre los tres rellenos en los dos temas (sale con código 1 si `bg-wine` baja de 4,5:1 en
   alguno; el resto son filas de referencia):

   ```sh
   node --input-type=module - <<'EOF'
   import { readFileSync } from 'node:fs'
   const css = readFileSync('src/assets/css/main.css', 'utf8')
   const block = (selector) => css.match(new RegExp(selector + ' \\{([\\s\\S]*?)\\n  \\}'))[1]
   const token = (body, name) =>
     body.match(new RegExp('--' + name + ': ([^;]+);'))[1].replaceAll('%', '').split(' ').map(Number)
   function toRgb([h, s, l]) {
     const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100)
     const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
     const m = l / 100 - c / 2
     const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(h / 60) % 6]
     return [r, g, b].map((v) => Math.round((v + m) * 255))
   }
   const lin = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
   const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
   const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
   const root = block(':root')
   let failures = 0
   for (const [theme, selector] of [['claro', ':root'], ['oscuro', '\\.dark']]) {
     const body = block(selector)
     for (const name of ['coral', 'coral-text', 'wine']) {
       // Las variables que .dark no redefine (coral, wine) valen lo de :root.
       const fill = toRgb(token(body.includes('--' + name + ':') ? body : root, name))
       const value = ratio([255, 255, 255], fill)
       const failed = value < 4.5
       if (failed && name === 'wine') failures++
       const status = !failed ? 'ok  ' : name === 'wine' ? 'FAIL' : 'ref '
       console.log(theme.padEnd(6), status, value.toFixed(2) + ':1', 'blanco sobre bg-' + name)
     }
   }
   process.exitCode = failures ? 1 : 0
   EOF
   ```

   Salida esperada: `bg-coral` 2,86:1 `ref` en los dos temas, `bg-coral-text` 5,83:1 `ok` en claro y 2,86:1
   `ref` en oscuro, y `bg-wine` 7,40:1 `ok` en los dos.

3. Que el CSS construido lleva el hover nuevo: `grep -oE "\.hover\\\\:bg-wine:hover\{[^}]*\}" dist/assets/*.css`
   imprime `.hover\:bg-wine:hover{background-color:hsl(var(--wine))}`.

4. Formato, lint, catálogos y build: `pnpm exec prettier --check` de los archivos tocados, `pnpm exec
eslint` de los dos componentes, `pnpm check:locales` y `pnpm build`.

**Pruebas manuales (R-I3).** El mismo banco descartable de la ronda 1 (esbuild + Chrome headless, el CSS
de `pnpm build`, los dos temas), con la cadena de clases del botón leída del archivo fuente y hover
real por CDP: la etiqueta de error real en `failed` y `noCredits` sobre el velo `bg-black/45` y sobre
tres imágenes de muestra, y el botón de quitar con hover. En claro y en oscuro: etiqueta de error
7,40:1 con sus dos textos y botón con hover 7,40:1; los tonos «espera» (9,93:1) y «trabajando»
(16,98:1) sin cambio; la fila «antes» (`bg-coral`) 2,86:1. Se miraron las capturas: la etiqueta vino
(carmesí oscuro con letra blanca) se lee con claridad sobre el velo, sobre las tres imágenes y en los dos
temas, idéntica en claro y en oscuro (es un color fijo). No se probó dentro de la app de escritorio
(Tauri).

### R-I4: el relleno rojo de error (`--destructive`) en claro

El toast de error, el distintivo «archivado», el botón rojo del kit y los demás `bg-destructive` con
blanco encima eran blanco sobre `#ff6666` (2,86:1): exactamente lo que pidió el dueño («el coral de
algunos avisos se lee poco en tema claro»). Se arregla en el token, no uso por uso: `--destructive` del
tema claro pasa de `0 100% 70%` a `0 72% 43%` (mismo tono rojo, más oscuro; blanco encima 6,21:1, 5,37:1
en el hover `/90`), el oscuro no cambia, y se midió antes lo que se apoya en el token con opacidad
(cajas `bg-destructive/5` a `/15`, bordes `/30` a `/60`, velo `/40`) con su texto. Es otro arreglo con
su propio informe: `docs/fixes/2026-10-11-fix-destructive-fill-contrast/destructive-fill-contrast.md`
(commit `fix: darken the light destructive fill so white text on it reads`).
