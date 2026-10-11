# Fix: el relleno rojo de error se lee con texto blanco en el tema claro

- 📅 **Fecha:** 2026-10-11
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** el token `--destructive` del tema claro (`src/assets/css/main.css`) y todo lo que se
  apoya en él: el botón rojo del kit, el toast de error, el distintivo «archivado», las cajas
  tintadas, los bordes y el velo `bg-destructive/N`. Ningún componente cambia: el token lo arregla
  de una vez.
- **Relacionado:** `docs/fixes/2026-10-11-fix-error-text-contrast/error-text-contrast.md` (el texto
  de error, `--destructive-text`, que dejó el relleno sin tocar a propósito),
  `docs/fixes/2026-10-11-fix-coral-text-contrast/coral-text-contrast.md` (el coral de los avisos, de
  donde sale este arreglo: «Ronda 2», R-I4) y el pedido del dueño del 2026-10-11 («el coral de algunos
  avisos se lee poco en tema claro»).

> **Nota de la ronda 3:** `--destructive-text` pasó a `0 72% 43%` (el mismo valor del relleno) y los
> grises de ayuda sobre las cajas tintadas a `text-foreground/65`. Los números de
> `text-destructive-text` y de `text-muted-foreground` de las tablas de «Contrastes», los dos primeros
> límites y las cifras de «Pruebas manuales» describen el estado de la ronda 2; los vigentes están en
> «Ronda 3», al final, y la validación reproducible ya está al día.

## Causa

`--destructive` en el tema claro era el coral de la marca (`0 100% 70%`, `#ff6666`) con
`--destructive-foreground` blanco encima: **2,86:1**, y AA pide 4,5:1 para texto (3:1 para un ícono
suelto). Es el mismo coral que el dueño pidió que se leyera, ahora como fondo. Lo pintaban:

- el botón rojo del kit (`variant="destructive"`, 6 usos: `PromptModelIssueDialog`,
  `GenerationProgress`, `Library`, `AvatarCard`, `AvatarDetailDialog` y `CharacterCard`), también en
  el hover (`hover:bg-destructive/90`: 2,61:1);
- el toast de error (`variant: 'destructive'`, 25 llamadas): el título y la acción, 2,86:1; la
  descripción, que va al 90 % de opacidad, 2,61:1; el ícono de cierre (`text-red-300`), 1,51:1;
- el distintivo «archivado» de `CatalogStyleCard` (`bg-destructive text-white`) y el botón de
  confirmar el borrado de `StockGroupCard` (`bg-destructive text-destructive-foreground`);
- las cajas tintadas, los bordes y el velo del timeline que usan el token con opacidad
  (`bg-destructive/5` a `/15`, `border-destructive/30` a `/60`, `bg-destructive/40`).

El arreglo del texto de error (`--destructive-text`) dejó explícito que el relleno quedaba igual
(«blanco sobre coral, 2,86:1, no es parte de este fix»). La ronda 1 de WP-I encontró el mismo
problema en dos rellenos coral y el coordinador pidió cerrarlo en el origen, en el token.

## Corrección

- **`src/assets/css/main.css`:** `--destructive` del tema claro pasa de `0 100% 70%` a `0 72% 43%`
  (`#bd1f1f`): el mismo matiz rojo, más oscuro. El tema oscuro no cambia (`0 62.8% 30.6%`, blanco
  encima 9,6:1) ni `--destructive-foreground` (blanco). El comentario nuevo de `--destructive` trae las
  medidas de abajo y el de `--destructive-text` se actualiza (decía que `destructive` era el coral
  «para fondos»).
- **Ningún componente cambia.** Se arreglan solos `Button variant="destructive"` y su hover, el toast
  de error (título, descripción, acción, ícono de cierre y el anillo de foco de su acción), el
  distintivo «archivado» y el botón de confirmar el borrado de `StockGroupCard` (que es de WP-G y no
  se tocó).
- **Las cajas tintadas, los bordes y el velo se oscurecen un poco**, porque salen del mismo token: es
  el costo esperado (tabla de abajo) y ninguna pareja de texto que pasaba deja de pasar.

### Por qué `0 72% 43%`

Mismo matiz (0) y misma saturación (72 %) que `--destructive-text` (`0 72% 45%`): una sola familia
de rojo para texto y para relleno, dos puntos más oscuro el relleno. El valor sale de un barrido de la
luminosidad con matiz 0 y saturación 72 % contra todo lo que se apoya en el token (blanco encima del
relleno y de su hover; `text-destructive-text` y `text-foreground` sobre las cajas; el borde `/60`
contra el blanco; el ícono `red-300` del toast):

| Luminosidad | Blanco / relleno | Blanco / hover `/90` | `destructive-text` / `/10` | `destructive-text` / `/15` | Borde `/60` | Cierre `red-300` |
| ----------- | ---------------- | -------------------- | -------------------------- | -------------------------- | ----------- | ---------------- |
| 41 %        | 6,70:1           | 5,71:1               | 4,91:1                     | 4,51:1                     | 3,16:1      | 3,53:1           |
| 42 %        | 6,48:1           | 5,59:1               | 4,95:1                     | 4,51:1                     | 3,11:1      | 3,41:1           |
| **43 %**    | **6,21:1**       | **5,37:1**           | **4,95:1**                 | **4,52:1**                 | **3,04:1**  | **3,27:1**       |
| 44 %        | 6,03:1           | 5,26:1               | 4,96:1                     | 4,53:1                     | 3,00:1      | 3,18:1           |
| 45 %        | 5,83:1           | 5,10:1               | 4,96:1                     | 4,56:1                     | 2,98:1      | 3,07:1           |
| 46 %        | 5,60:1           | 4,94:1               | 4,97:1                     | 4,57:1                     | 2,92:1      | 2,95:1           |
| 49 %        | 5,06:1           | 4,51:1               | 4,98:1                     | 4,59:1                     | 2,79:1      | 2,66:1           |

El hover (`bg-destructive/90` sobre el blanco) es lo que impide aclarar más de 49 %; el ícono de cierre
del toast pide 3:1 y limita a 45 %; el borde `/60` de las escenas con error pide 3:1 y limita a 43 %
con margen (44 % da 3,00:1). Del otro lado, el texto sobre las cajas casi no depende del relleno
(4,9:1 a 5,0:1 sobre la `/10` en todo el rango): oscurecer más no lo mejora de verdad.

### Contrastes (WCAG 2.x, sobre los tokens de `main.css`)

`L = 0,2126 R + 0,7152 G + 0,0722 B` con cada canal `c = v/255` pasado a lineal
(`c ≤ 0,04045 ? c/12,92 : ((c+0,055)/1,055)^2,4`) y razón `(L claro + 0,05) / (L oscuro + 0,05)`.
Las cajas tintadas y los bordes se componen sobre su superficie en sRGB, como el navegador. «Antes» es
el coral `0 100% 70%`; «después», `0 72% 43%`. Tema claro (el oscuro no cambia).

Relleno con texto o ícono blanco:

| Pareja                                                           | Antes  | Después |
| ---------------------------------------------------------------- | ------ | ------- |
| Blanco sobre `bg-destructive` (botón, toast, distintivo, borrar) | 2,86:1 | 6,21:1  |
| Blanco sobre el hover `bg-destructive/90` (sobre `background`)   | 2,61:1 | 5,37:1  |
| Blanco sobre el hover `bg-destructive/90` (sobre `muted`)        | 2,62:1 | 5,41:1  |
| Texto de la descripción del toast (blanco al 90 %)               | 2,61:1 | 5,37:1  |
| Ícono de cierre `text-red-300` del toast (pide 3:1)              | 1,51:1 | 3,27:1  |
| Anillo `ring-destructive` contra el blanco (pide 3:1)            | 2,86:1 | 6,21:1  |

Cajas tintadas con el texto que llevan encima (sobre `background`):

| Caja (dónde)                                                                                      | Texto                   | Antes   | Después |
| ------------------------------------------------------------------------------------------------- | ----------------------- | ------- | ------- |
| `/5` (`GenerationErrorCard`, `StyleCharacterChip`, `UpdateInstallHelp`)                           | `text-destructive-text` | 5,53:1  | 5,38:1  |
| `/5`                                                                                              | `text-foreground`       | 16,09:1 | 15,68:1 |
| `/10` (`ErrorMessage`, `TaskErrorCard`, banners, escena con error, `ApiKeyCard`)                  | `text-destructive-text` | 5,27:1  | 4,95:1  |
| `/10`                                                                                             | `text-foreground`       | 15,34:1 | 14,41:1 |
| `/10` sobre `muted`                                                                               | `text-destructive-text` | 4,95:1  | 4,61:1  |
| `/15` (`ProgressStatusPill`, chips «no compatible»)                                               | `text-destructive-text` | 4,99:1  | 4,52:1  |
| `/15`                                                                                             | `text-foreground`       | 14,52:1 | 13,16:1 |
| `/5` (aviso, ayuda y detalle de `GenerationErrorCard`, `StyleCharacterChip`, `UpdateInstallHelp`) | `text-muted-foreground` | 4,45:1  | 4,34:1  |
| `/10` («Descartar» de `TaskErrorCard`, hover del chip)                                            | `text-muted-foreground` | 4,24:1  | 3,99:1  |

Bordes (contra el blanco de afuera):

| Borde                                                                           | Antes  | Después |
| ------------------------------------------------------------------------------- | ------ | ------- |
| `/30` (`TaskErrorCard`, banners, `ErrorMessage`, `ApiKeyCard`)                  | 1,37:1 | 1,69:1  |
| `/40` (`GenerationErrorCard`, `StyleCharacterChip`, `UpdateInstallHelp`, lenta) | 1,53:1 | 2,05:1  |
| `/60` (`SceneCell`, visor de escena)                                            | 1,91:1 | 3,04:1  |

Velo `bg-destructive/40` del timeline (`TimelineBlockCard`, `TimelineSceneItem`): no lleva texto
propio, pero cubre la etiqueta de duración (blanco sobre `bg-charcoal/80`). Esa etiqueta bajo el velo
mejora: sobre un bloque blanco de 3,80:1 a 4,25:1, sobre uno oscuro de 5,54:1 a 6,13:1 y sobre uno
medio de 4,63:1 a 5,22:1.

## Límites deliberados

- **`text-muted-foreground` sobre una caja tintada ya estaba bajo 4,5:1 y queda un poco más abajo**
  (de 4,45:1 a 4,34:1 sobre la `/5`; de 4,24:1 a 3,99:1 sobre la `/10`): el texto de ayuda de
  `GenerationErrorCard` y de `StyleCharacterChip`, el detalle de `UpdateInstallHelp` y el botón
  «Descartar» de `TaskErrorCard`. No es del token: cualquier relleno que dé 4,5:1 con blanco oscurece
  la caja, y en todo el rango válido el mejor caso es 4,34:1. Arreglarlo es cambiar esos grises (por
  ejemplo a `text-foreground/75`) o sacarlos de la caja; no se hizo aquí. **Superado por la ronda 3:**
  los cuatro grises pasaron a `text-foreground/65`.
- **`text-destructive-text` sobre la `/15` da 4,52:1 (la pareja más justa)** y sobre la `/20`, que
  ningún componente usa hoy, 4,14:1: no pasaría. Si se quiere margen, oscurecer
  `--destructive-text` a `0 72% 43%` (el mismo valor del relleno) lo sube a 4,81:1 sobre la `/15`.
  **Superado por la ronda 3:** `--destructive-text` pasó a `0 72% 43%`.
- **Los bordes `/30` y `/40` siguen bajo 3:1** (1,69:1 y 2,05:1; antes 1,37:1 y 1,53:1): enmarcan
  cajas que ya llevan relleno, texto o ícono en `destructive-text` (≥ 4,9:1), así que no son lo único
  que señala el estado. El borde `/60`, que sí es el único contorno de una escena con error, pasa a
  3,04:1.
- **El tema oscuro no cambia**, incluidos sus bordes `/60` (1,4:1, de antes, decorativos).
- **Los rojos fijos del toast** (`red-300`, `red-50`, `ring-red-400`, `ring-offset-red-600`) no se
  tocaron: con el relleno nuevo el ícono de cierre ya pasa 3:1.
- **Sin guard permanente.** Ningún guard de `scripts/test/` mide color: los únicos que nombran el token
  afirman clases (`bg-destructive` en `check-avatar-library-ui.mjs`, `bg-destructive/40` en
  `check-timeline-avatar-ui.mjs`). La medida se reproduce con el bloque de abajo.
- Las capturas de la prueba visual no se versionan (sin binarios en `docs/`).

## Validación reproducible

1. Las parejas que dependen del token, antes y después (sale con código 1 si alguna baja de su
   mínimo; las dos últimas filas, el gris de antes, son de referencia). «Antes» es el estado previo a
   esta serie de arreglos (relleno coral y `--destructive-text` en `0 72% 45%`); en las dos filas de
   `text-foreground/65` es la misma pareja con el coral:

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
   const rgb = (name) => toRgb(token(root, name))
   const [background, muted, white] = [rgb('background'), rgb('muted'), rgb('destructive-foreground')]
   const [foreground, grey] = [rgb('foreground'), rgb('muted-foreground')]
   const red300 = [252, 165, 165] // group-[.destructive]:text-red-300 del cierre del toast
   // El estado de antes (relleno coral y texto 0 72% 45%) y el de ahora, leído de main.css.
   const BEFORE = { fill: toRgb([0, 100, 70]), text: toRgb([0, 72, 45]) }
   const NOW = { fill: rgb('destructive'), text: rgb('destructive-text') }
   const tint = (s, alpha, base = background) => over(s.fill, alpha, base)
   // [descripción, mínimo, función del estado]; mínimo 0 = solo informativa (el gris de antes, bajo 4,5:1)
   const checks = [
     ['blanco sobre bg-destructive (botón, toast, distintivo)', 4.5, (s) => ratio(white, s.fill)],
     ['blanco sobre el hover bg-destructive/90 (sobre background)', 4.5, (s) => ratio(white, over(s.fill, 0.9, background))],
     ['blanco sobre el hover bg-destructive/90 (sobre muted)', 4.5, (s) => ratio(white, over(s.fill, 0.9, muted))],
     ['ícono de cierre red-300 del toast sobre bg-destructive', 3, (s) => ratio(red300, s.fill)],
     ['ring-destructive contra el blanco', 3, (s) => ratio(s.fill, white)],
     ['text-destructive-text sobre bg-destructive/5', 4.5, (s) => ratio(s.text, tint(s, 0.05))],
     ['text-destructive-text sobre bg-destructive/10', 4.5, (s) => ratio(s.text, tint(s, 0.1))],
     ['text-destructive-text sobre bg-destructive/10 sobre muted', 4.5, (s) => ratio(s.text, tint(s, 0.1, muted))],
     ['text-destructive-text sobre bg-destructive/15', 4.5, (s) => ratio(s.text, tint(s, 0.15))],
     ['text-foreground sobre bg-destructive/15', 4.5, (s) => ratio(foreground, tint(s, 0.15))],
     ['borde border-destructive/60 contra el blanco', 3, (s) => ratio(over(s.fill, 0.6, background), background)],
     ['ayuda en text-foreground/65 sobre bg-destructive/5', 4.5, (s) => ratio(over(foreground, 0.65, tint(s, 0.05)), tint(s, 0.05))],
     ['ayuda en text-foreground/65 sobre bg-destructive/10', 4.5, (s) => ratio(over(foreground, 0.65, tint(s, 0.1)), tint(s, 0.1))],
     ['(el gris de antes, ya sin uso ahí) text-muted-foreground sobre bg-destructive/5', 0, (s) => ratio(grey, tint(s, 0.05))],
     ['(el gris de antes, ya sin uso ahí) text-muted-foreground sobre bg-destructive/10', 0, (s) => ratio(grey, tint(s, 0.1))],
   ]
   let failures = 0
   for (const [name, minimum, measure] of checks) {
     const after = measure(NOW)
     const failed = minimum > 0 && after < minimum
     if (failed) failures++
     const status = minimum === 0 ? 'ref ' : failed ? 'FAIL' : 'ok  '
     console.log(status, after.toFixed(2) + ':1', '(antes ' + measure(BEFORE).toFixed(2) + ':1)', minimum ? 'pide ' + minimum : '', name)
   }
   process.exitCode = failures ? 1 : 0
   EOF
   ```

   Salida esperada: 13 líneas `ok` (de 3,04:1 a 13,16:1, «antes» de 1,51:1 a 14,52:1) y 2 `ref` (el
   gris de antes sobre la `/5` y la `/10`: 4,34:1 y 3,99:1, «antes» 4,45:1 y 4,24:1). Con el valor de
   antes (`--destructive: 0 100% 70%`) las seis parejas del relleno y del borde dan `FAIL` y el código
   de salida es 1.

2. Los dos valores del token en el CSS construido: `grep -oE "\-\-destructive:[^;}]*" dist/assets/*.css`
   imprime `0 72% 43%` (claro) y `0 62.8% 30.6%` (oscuro).

3. El guard que afirma el velo `bg-destructive/40` del timeline sigue verde:
   `node scripts/test/check-timeline-avatar-ui.mjs` (28 checks).

4. Formato, lint, catálogos y build: `pnpm exec prettier --check src/assets/css/main.css docs/fixes`,
   `pnpm check:locales` y `pnpm build`.

## Pruebas manuales

Hechas el 2026-10-11 con un banco descartable (no versionado; esbuild + Chrome headless con perfil
temporal, sin red) que monta con el CSS que sale de `pnpm build`, en el tema claro y en el oscuro:
reales, el `Button` `variant="destructive"` (en reposo y con hover real por CDP), un `Toast` destructivo
completo (título, descripción, acción y cierre, con hover sobre el toast, sobre la X y sobre la acción),
`ErrorMessage`, `TaskErrorCard`, `GenerationErrorCard`, `StyleCharacterChip` (fijo y editable con
hover), `ProgressStatusPill` en error y `PromptModelCard` lenta; réplicas con las clases leídas de los
archivos fuente, el distintivo «archivado» de `CatalogStyleCard`, `UpdateInstallHelp`, el banner del
editor, el error del panel de escena, la caja de validación de `ApiKeyCard`, el chip «no compatible»,
el visor de escena y `SceneCell` con error y el velo `/40` del timeline. Para cada texto el banco lee el
color computado y el fondo efectivo (componiendo capas translúcidas y opacidad) y para cada borde, su
color pintado sobre el fondo del propio elemento contra la superficie de afuera; calcula la razón WCAG:

- Claro, relleno con blanco: botón 6,21:1 y con hover 5,38:1; título y acción del toast 6,21:1,
  descripción (90 %) 5,38:1, acción con hover 6,21:1; distintivo «archivado» 6,21:1; ícono de cierre
  `red-300` 3,27:1 y con hover propio (`red-50`) 5,68:1. Antes: 2,86:1, 2,60:1, 2,86:1, 2,60:1, 2,86:1,
  2,86:1, 1,51:1 y 2,61:1.
- Claro, cajas tintadas: `text-destructive-text` 4,94:1 sobre la `/10`, 5,37:1 sobre la `/5` y 4,53:1
  sobre la `/15`; `text-foreground` 15,65:1 sobre la `/5`. Los bordes `/60`, 3,30:1 (visor de escena) y
  3,05:1 (`SceneCell`); antes 1,99:1 y 1,90:1.
- Claro, lo que sigue bajo 4,5:1 y ya lo estaba: el gris `text-muted-foreground` sobre la `/5` (4,33:1,
  antes 4,46:1) y sobre la `/10` (3,98:1, antes 4,24:1).
- Oscuro: sin cambio en ningún número (botón 9,6:1, toast 9,6:1, cajas de 5,9:1 a 7,6:1); sus bordes
  `/60` siguen en 1,4:1 de antes.
- Se miraron las capturas del tema claro: el botón, el toast y el distintivo son un rojo profundo con
  letra blanca nítida; las cajas tintadas quedan un poco más rosadas y el texto rojo de adentro se lee
  igual de bien; el velo del timeline cubre la etiqueta sin ahogarla.

**No se probó dentro de la app de escritorio (Tauri):** se verificaron los componentes y las clases, no
cada pantalla armada.

## Ronda 3

Decisiones del coordinador de la 2c (2026-10-11) sobre los concerns de la ronda 2. Commit
`fix: lift the last grays and error text over AA on red tints`. Tres arreglos chicos, con lo medido.

### 1. Los grises de ayuda sobre las cajas tintadas

**Causa.** El gris `text-muted-foreground` (`#65758b`) sobre las cajas de error ya estaba bajo 4,5:1
(4,45:1 sobre la `/5` y 4,24:1 sobre la `/10`) y, con el relleno oscurecido, bajaba a 4,34:1 y 3,99:1.
Ningún relleno lo arreglaba; había que cambiar el texto.

**Corrección.** Esos textos pasan a `text-foreground/65`:

- `GenerationErrorCard.tsx`: las tres ayudas (la del reintento, la de cambiar de modelo y la de seguir
  en el editor; las tres van dentro de la caja `/5`).
- `CharacterSection.tsx`: la ayuda del chip «falta el personaje fijo» (el `StyleCharacterChip` de tono
  destructivo no lleva texto propio: los hijos los pone quien lo usa).
- `UpdateInstallHelp.tsx`: el detalle técnico del error de instalación.
- `TaskErrorCard.tsx`: el botón «Descartar» (ghost; en hover sigue con `accent-foreground` sobre
  `accent`).

**Por qué `/65`.** Barrido de la opacidad de `text-foreground` sobre las dos cajas, en los dos temas
(el oscuro, sobre `card`, que es el caso más bajo):

| Texto                    | Claro `/5` | Claro `/10` | Oscuro `/5` | Oscuro `/10` |
| ------------------------ | ---------- | ----------- | ----------- | ------------ |
| `text-muted-foreground`  | 4,34:1     | 3,99:1      | 7,07:1      | 6,97:1       |
| `text-foreground/60`     | 4,37:1     | 4,26:1      | 6,61:1      | 6,56:1       |
| **`text-foreground/65`** | **5,13:1** | **4,97:1**  | **7,60:1**  | **7,53:1**   |
| `text-foreground/70`     | 6,07:1     | 5,81:1      | 8,60:1      | 8,52:1       |
| `text-foreground/75`     | 7,19:1     | 6,80:1      | 9,68:1      | 9,59:1       |
| `text-foreground/80`     | 8,54:1     | 8,07:1      | 10,84:1     | 10,72:1      |

`/65` es la opacidad más baja que pasa con margen (0,47 como mínimo) y la que menos cambia el aspecto:
en oscuro el gris de antes y `foreground/65` son casi iguales (7,0:1 contra 7,5:1). `/60` ya no pasa
sobre la `/10` y `/75` pasa con holgura, pero oscurece de más la ayuda en claro.

**Medida (banco, componentes reales).** Claro: las tres ayudas de `GenerationErrorCard` 5,13:1; la
ayuda del chip 5,13:1 y 4,96:1 con el hover `/10`; el detalle de `UpdateInstallHelp` 5,13:1;
«Descartar» 4,96:1 (en hover, 13,83:1). Oscuro: de 7,82:1 a 7,89:1.

### 2. `--destructive-text` en claro: `0 72% 43%`

**Corrección.** `--destructive-text` del tema claro pasa de `0 72% 45%` a `0 72% 43%` (`#bd1f1f`), el mismo
valor que `--destructive`. El oscuro (`0 100% 70%`) no cambia. El token lo usan 36 `text-destructive-text`,
5 `border-destructive-text` (campos inválidos) y 1 `ring-destructive-text/25`; los comentarios de los dos
tokens quedan al día.

**Por qué.** La pareja más justa era el texto sobre la `/15` (4,52:1, `ProgressStatusPill`) y la `/20`, que
nadie usa, no pasaba. Con 43 % todas suben; ninguna superficie real baja:

| Superficie                                 | Antes (`0 72% 45%`) | Después (`0 72% 43%`) |
| ------------------------------------------ | ------------------- | --------------------- |
| `background`, `card` y `popover`           | 5,83:1              | 6,21:1                |
| `muted`                                    | 5,45:1              | 5,80:1                |
| `accent` (ítem de menú con foco)           | 4,75:1              | 5,06:1                |
| `bg-destructive/5`                         | 5,38:1              | 5,74:1                |
| `bg-destructive/10`                        | 4,95:1              | 5,27:1                |
| `bg-destructive/10` sobre `muted`          | 4,61:1              | 4,91:1                |
| `bg-destructive/15`                        | 4,52:1              | 4,81:1                |
| `bg-destructive/20` (sin uso hoy)          | 4,14:1              | 4,42:1                |
| `border-destructive-text` contra el blanco | 5,83:1              | 6,21:1                |

**Medida (banco).** Claro: `ErrorMessage` 5,26:1, título y mensaje de `GenerationErrorCard` 5,73:1,
`ProgressStatusPill` 4,83:1, panel `muted` 5,80:1, ítem de menú con foco real 5,06:1, borde de campo
inválido 6,21:1. Oscuro: sin cambio (6,36:1, 6,46:1, 6,24:1, 5,43:1 y 4,75:1).

### 3. `cherry` («Cancelado») con blanco: 4,60:1

**Causa.** El comentario de la paleta de estados de la Biblioteca dice que todos los colores pasan 4,5:1
con texto blanco, pero `cherry` (`354 70% 54%`, `#dc3848`) daba 4,47:1.

**Corrección.** `--cherry` pasa a `354 70% 53%` (`#db3344`): el ajuste mínimo de luminosidad, mismo matiz y
misma saturación. Con 54 % no pasa; con 53 % da 4,60:1 y con 52 % daría 4,71:1. Se define solo en
`:root`, así que vale lo mismo en los dos temas y no hizo falta tocar `.dark`. Lo usa un solo lugar, el
badge «Cancelado» de `ProjectStateBadge`. El comentario de la paleta ahora trae el número de cada color.

| Color de la paleta | Estado de la Biblioteca | Blanco encima             |
| ------------------ | ----------------------- | ------------------------- |
| `mint`             | Exportado y Generando   | 4,73:1                    |
| `ocean-deep`       | Confirmar escenas       | 5,03:1                    |
| `ember`            | Interrumpido            | 4,72:1                    |
| **`cherry`**       | **Cancelado**           | **4,60:1** (antes 4,47:1) |
| `raspberry`        | Sin saldo               | 5,70:1                    |
| `wine`             | Error                   | 7,40:1                    |
| `iris`             | Desactualizado          | 5,57:1                    |
| `graphite`         | Borrador                | 4,99:1                    |

`sky` y `amethyst` aparecen en el mismo bloque de `main.css` pero no son estados de la Biblioteca: con
blanco dan 2,40:1 y 4,02:1 (el botón «Animar» y la píldora de la animación, la fase del avatar en
`StageBar`, los chips del timeline). No se tocaron; el comentario ahora lo dice.

### Límites y validación de la ronda 3

- **`/20`:** `text-destructive-text` sobre `bg-destructive/20` da 4,42:1; ningún componente lo usa. Si
  alguien lo usa con texto de error no pasa.
- **El oscuro no cambia** (ni `--destructive-text`, ni `--cherry`, que es fijo).
- **Validación reproducible:** el bloque de «Validación reproducible» de arriba ya está al día (13 `ok` y
  2 `ref`); la paleta se reproduce leyendo `--mint`, `--ocean-deep`, `--ember`, `--cherry`, `--raspberry`,
  `--wine`, `--iris` y `--graphite` de `:root` con el mismo cálculo (blanco contra cada color): todos
  ≥ 4,5:1.
- **Pruebas manuales:** un banco de Chrome headless con el CSS de `pnpm build`, en los dos temas:
  `GenerationErrorCard` real con sus tres ayudas, `TaskErrorCard` real con «Descartar» (hover real),
  `StyleCharacterChip` real con los hijos con las clases leídas de `CharacterSection` (en reposo y con
  hover), el detalle de `UpdateInstallHelp` (réplica con las clases leídas del fuente), `ErrorMessage`,
  `ProgressStatusPill`, `PromptModelCard`, un ítem de menú con foco real y los nueve badges de
  `ProjectStateBadge` reales (en los dos temas «Cancelado» da 4,60:1 y el resto no cambia). Ninguna
  pareja queda bajo su mínimo; se miraron las capturas. No se probó dentro de la app de escritorio
  (Tauri).
