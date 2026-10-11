# Fix: el texto de error se lee en los dos temas

- 📅 **Fecha:** 2026-10-11
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el token `--destructive-text` del tema claro (`src/assets/css/main.css`) y 24 componentes
  de `src/` que pintaban texto o íconos de error con `text-destructive`.
- **Relacionado:** el token `--destructive-text` nació en la entrega 1b del avatar (`ErrorMessage` y
  las tarjetas de avatar), que dejó anotado que los ~30 `text-destructive` del resto de la app
  seguían ilegibles en oscuro (`docs/handoff/2026-10-09-avatar-heygen/execution-e1b/final-review.md` (interno),
  `wp-3b-review.md` (interno) M11).

## Causa

`--destructive` es un rojo pensado para **fondos** (el botón rojo con texto claro encima), no para
texto. Usarlo como color de texto o de ícono (`text-destructive`, también con `hover:` y `focus:`)
daba, medido con la fórmula de luminancia de WCAG 2.x sobre los tokens de `main.css`:

- **Tema oscuro:** `--destructive` es `hsl(0 62.8% 30.6%)` (`#7f1d1d`): 1,87:1 sobre `--background`
  y 1,74:1 sobre `--card` (AA pide 4,5:1 para texto). El error casi no se veía.
- **Tema claro:** `--destructive` es el coral `hsl(0 100% 70%)` (`#ff6666`): 2,86:1 sobre el fondo
  blanco. El token `--destructive-text` que sumó la 1b valía lo mismo en claro («es el mismo
  `destructive`; el token existe por el oscuro»), así que ni `ErrorMessage` ni los avatares pasaban
  AA en claro.

La 1b arregló el oscuro solo para sus pantallas; el resto de la app (`library`, editor, ajustes,
música, voces, personajes, claves) siguió con la clase vieja.

## Corrección

- **`src/assets/css/main.css`:** `--destructive-text` del tema claro pasa de `0 100% 70%` a
  `0 72% 45%` (`#c52020`). El del oscuro no cambia (coral `0 100% 70%`, `#ff6666`). `--destructive`
  no se toca: los botones rojos (`variant="destructive"`), `bg-destructive/N`, `border-destructive/N`
  y la variante `destructive` del toast quedan igual. El comentario del token ahora cuenta las
  medidas. **Valor superado por la ronda 3 de WP-I:** el tema claro pasó a `0 72% 43%` (`#bd1f1f`),
  el mismo valor que `--destructive` (ver la actualización bajo la tabla de contrastes).
- **24 componentes:** `text-destructive` → `text-destructive-text` en 32 usos (31 con la clase
  pelada, `hover:` o `focus:` más una `text-destructive/80`) de 29 líneas:
  `api-keys/ApiKeyCard`, `characters/CharacterCard`, `common/PromptModelCard`,
  `music/{MusicHistoryPanel,MusicPromptSuggester}`, `settings/UpdatesSection`,
  `voices/VoiceHistoryPanel` y, en `videos/`, `CatalogStyleCard`, `CharacterSection`,
  `CustomStyleCard`, `EditorImageGallery`, `EditorImageGalleryCard`, `EditorScenePanel`,
  `GenerationErrorCard`, `MusicDialog`, `NarrationSection`, `ProgressStatusPill`, `SceneCell`,
  `SceneAnimationSection`, `SceneViewerCanvas`, `StyleCharacterBlock`, `TaskErrorCard`,
  `views/LibraryEditor` y `views/LibraryPlayer`.
- **`GenerationErrorCard`:** el mensaje bajo el título era `text-destructive/80`. Con el token nuevo,
  al 80 % de opacidad da 4,13:1 en claro y 4,29:1 en oscuro sobre `card` (bajo AA), así que pierde
  la opacidad: título y mensaje usan el mismo color y la jerarquía la siguen dando el peso y el
  tamaño de la letra (`font-display text-base font-bold` contra `font-body text-sm`).
- `MusicPromptSuggester`: Prettier partió en tres líneas el `<p>` que con la clase más larga pasaba
  de 80 columnas; es el único cambio de formato.

### Contrastes (WCAG 2.x, sobre los tokens de `main.css`)

`L = 0,2126 R + 0,7152 G + 0,0722 B` con cada canal `c = v/255` pasado a lineal
(`c ≤ 0,04045 ? c/12,92 : ((c+0,055)/1,055)^2,4`) y razón `(L claro + 0,05) / (L oscuro + 0,05)`.
Las cajas tintadas (`bg-destructive/N`) se componen sobre su superficie en sRGB, como el navegador.

| Tema   | Superficie                         | Antes (`text-destructive`) | Después (`text-destructive-text`) |
| ------ | ---------------------------------- | -------------------------- | --------------------------------- |
| claro  | `--background` y `--card` (blanco) | 2,86:1 (`#ff6666`)         | 5,83:1 (`#c52020`)                |
| claro  | `--muted`                          | 2,67:1                     | 5,45:1                            |
| claro  | `--accent` (ítem de menú con foco) | 2,33:1                     | 4,75:1                            |
| claro  | `bg-destructive/10`                | 2,58:1                     | 5,27:1                            |
| claro  | `bg-destructive/15`                | 2,45:1                     | 4,99:1                            |
| oscuro | `--background`                     | 1,87:1 (`#7f1d1d`)         | 6,55:1 (`#ff6666`)                |
| oscuro | `--card`                           | 1,74:1                     | 6,09:1                            |
| oscuro | `--muted`                          | 1,55:1                     | 5,43:1                            |
| oscuro | `--accent` (ítem de menú con foco) | 1,36:1                     | 4,75:1                            |
| oscuro | `bg-destructive/10` sobre `card`   | 1,69:1                     | 5,93:1                            |
| oscuro | `bg-destructive/15` sobre `card`   | 1,67:1                     | 5,84:1                            |

> **Actualización (2026-10-11, WP-I):** el tema claro oscureció `--destructive` a `0 72% 43%` (R-I4) y,
> en la ronda 3, `--destructive-text` al mismo valor, `#bd1f1f` (antes `#c52020`). Las filas del claro de
> esta tabla ahora dan: `--background` y `--card` 6,21:1, `--muted` 5,80:1, `--accent` 5,06:1 y las
> cajas `bg-destructive/5`, `/10` y `/15` 5,74:1, 5,27:1 y 4,81:1. El oscuro no cambia. La columna
> «Después» de arriba, el «Por qué `0 72% 45%`» de abajo y las cifras de «Pruebas manuales» describen
> el valor original. Ver
> `docs/fixes/2026-10-11-fix-destructive-fill-contrast/destructive-fill-contrast.md` («Ronda 3»).

Ejemplo a mano, `#c52020` sobre blanco: R=197 da 0,5586 y G=B=32 dan 0,0144; `L = 0,2126·0,5586 +
0,7152·0,0144 + 0,0722·0,0144 = 0,1301`; `(1 + 0,05) / (0,1301 + 0,05) = 5,83`.

Por qué `0 72% 45%`: mantiene el matiz del coral de la marca y es el rojo más claro de esa
saturación que deja con margen todas las superficies reales por encima de 4,5:1. La más exigente es
el fondo de un ítem de menú con foco (`--accent`): 4,75:1 con 45 % de luminosidad, 4,56:1 con 46 %
y 4,41:1 con 47 % (ya no pasa). Sobre el blanco solo, un 50 % todavía daría 4,90:1, pero ahí el
foco de los menús ya cae a 3,99:1.

## Límites deliberados

- **`AvatarCard.tsx` (línea 242, `hover:text-destructive`) no se tocó:** es del paquete de avatares
  que se trabaja en paralelo. Es el único `text-destructive` como color de texto que queda en
  `src/`; al cambiarlo desaparece del CSS construido la clase `hover:text-destructive`.
- **`--destructive` y todo lo que lo usa de fondo o borde no cambian**, como se pidió. En claro eso
  deja el botón rojo como blanco sobre coral (2,86:1), igual que antes; no es parte de este fix.
  **Superado el 2026-10-11 (R-I4 de WP-I):** el tema claro oscureció `--destructive` a `0 72% 43%`
  y el blanco encima da 6,21:1; ver
  `docs/fixes/2026-10-11-fix-destructive-fill-contrast/destructive-fill-contrast.md`.
- **`text-coral` queda fuera:** varios errores y avisos (`Login`, `ApiKeys`, `GemPasteStep`,
  `StyleCloneSourceStep`, `CreateAnimationSection`, `Alert` tono `danger`) usan `--coral`, que vale
  `0 100% 70%` en los dos temas, o sea los mismos 2,86:1 sobre blanco en claro. Es otra clase y una
  decisión de diseño (el `Alert` eligió coral a propósito); este fix solo cubre `text-destructive`.
- **Sin guard permanente.** No había ningún guard en `scripts/test/` que afirmara estas clases
  (`grep -rn "text-destructive" scripts` da vacío; el único que nombra `destructive` es
  `check-timeline-avatar-ui.mjs`, por `bg-destructive/40`). La medida se reproduce con el bloque de
  abajo; si se quiere cerrar la puerta a una regresión, el paso siguiente es un guard con ese
  mismo cálculo y una fila en `scripts/test/README.md`.
- Las capturas de la prueba visual no se versionan (sin binarios en `docs/` (interno)).

## Validación reproducible

1. Ningún `text-destructive` como color de texto fuera de `AvatarCard.tsx`:

   ```sh
   grep -rnE "\btext-destructive([^-A-Za-z]|$)" src --include='*.ts' --include='*.tsx'
   ```

   Salida esperada: una sola línea, `src/modules/avatars/components/AvatarCard.tsx:242`. Si el
   paquete de avatares ya lo cambió, ninguna.

2. Contrastes de los tokens (claro y oscuro) desde la raíz del repo; sale con código 1 si algún
   `--destructive-text` baja de 4,5:1:

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
   let failures = 0
   for (const [theme, selector] of [['claro', ':root'], ['oscuro', '\\.dark']]) {
     const body = block(selector)
     const rgb = (name) => toRgb(token(body, name))
     const text = rgb('destructive-text')
     const surfaces = { background: rgb('background'), card: rgb('card'), muted: rgb('muted'), accent: rgb('accent') }
     for (const alpha of [0.05, 0.1, 0.15]) {
       surfaces['bg-destructive/' + alpha * 100 + ' sobre card'] = over(rgb('destructive'), alpha, surfaces.card)
     }
     for (const [name, bg] of Object.entries(surfaces)) {
       const value = ratio(text, bg)
       if (value < 4.5) failures++
       console.log(theme.padEnd(6), value >= 4.5 ? 'ok  ' : 'FAIL', value.toFixed(2) + ':1', 'sobre', name)
     }
   }
   process.exitCode = failures ? 1 : 0
   EOF
   ```

   Salida esperada: 14 líneas `ok` (claro de 4,75:1 a 5,83:1; oscuro de 4,75:1 a 6,55:1). Con el
   valor viejo del tema claro (`--destructive-text: 0 100% 70%`) las 7 líneas del claro dan `FAIL`
   (de 2,33:1 a 2,86:1) y el código de salida es 1. Desde WP-I (R-I4 y ronda 3, que oscurecieron
   `--destructive` y `--destructive-text` en claro) el claro va de 4,81:1 (`bg-destructive/15`) a
   6,21:1, y no de 4,75:1 a 5,83:1.

3. Formato, lint, catálogos y build: `pnpm exec prettier --check src docs/fixes`,
   `pnpm exec eslint src`, `pnpm check:locales` y `pnpm build`.

4. Que el CSS construido lleva los dos valores y las tres clases:

   ```sh
   grep -oE "\-\-destructive-text:[^;}]*" dist/assets/*.css
   grep -oE "\.(hover\\\\:|focus\\\\:)?text-destructive-text\{[^}]*\}" dist/assets/*.css
   ```

   Esperado: `0 72% 43%` (claro; era `0 72% 45%` hasta la ronda 3 de WP-I) y `0 100% 70%` (oscuro);
   `.text-destructive-text`,
   `.hover\:text-destructive-text:hover` y `.focus\:text-destructive-text:focus`.

## Pruebas manuales

Hechas el 2026-10-11 con un banco descartable (no versionado; esbuild + Chrome headless con
perfil temporal, sin red) que monta los componentes reales con el CSS que sale de `pnpm build`, en
el tema claro y en el oscuro: `ErrorMessage`, `TaskErrorCard`, `GenerationErrorCard`,
`ProgressStatusPill` en error, `PromptModelCard` con modelo lento, un botón fantasma de eliminar con
el mouse encima (hover real por CDP), un ítem «Eliminar» de menú con el foco puesto y una réplica del
estado de error de una escena. Para cada elemento con `text-destructive-text` el banco lee el color
computado y el fondo efectivo (componiendo las capas translúcidas) y calcula la razón WCAG:

- Claro: de 4,75:1 (botón con hover e ítem de menú, sobre `--accent`) a 5,54:1; antes, la misma caja
  daba 2,58:1. El botón en reposo se lee en `muted-foreground` (4,70:1), sin cambios.
- Oscuro: de 4,75:1 (los mismos dos) a 6,46:1; antes, 1,81:1. En reposo, el botón da 7,70:1.
- Se miraron las dos capturas: en claro el texto es un rojo profundo legible sobre el rosa de la
  caja; en oscuro el coral se lee y la fila «antes» (token viejo) queda casi invisible.

**No se probó dentro de la app de escritorio (Tauri):** las pantallas reales (editor, ajustes,
biblioteca) dependen del sidecar y de la sesión; se verificaron los componentes y las clases, no
cada pantalla armada.
