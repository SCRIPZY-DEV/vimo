> **Interacción vigente (2026-09-17):** [regenerar y animar directamente en la galería](../../fixes/2026-09-17_direct-gallery-actions.md). Inputs opcionales por tarjeta, confirmación por lote y progreso compartido con el editor; sin revisión guiada.

> **Histórico:** la [revisión guiada](../../fixes/2026-09-17_guided-gallery-animation.md) y los recorridos descritos debajo fueron sustituidos. Se conserva su contexto técnico.

# Galería de imágenes del editor

Fecha: 2026-09-16.

> **Antecedentes (interacción superada por las acciones directas indicadas arriba):**
> cinco columnas, selección múltiple y el primer panel de animación en tarjetas.
> Detalle histórico y aceptación:
> [revisión de varias escenas](../../fixes/2026-09-16_gallery-multiple-scene-review.md) y
> [animación desde la galería y auditoría de previews](../../fixes/2026-09-17_gallery-scene-animation.md).

## Resultado y alcance

La casilla **Vista ampliada de imágenes**, arriba a la derecha del editor, abre
una galería de todas las escenas del proyecto. Las tarjetas muestran la imagen
completa sin recortarla, número de escena, intervalo y fragmento de narración.
También aparecen las escenas sin imagen, los errores de generación y el estado
transitorio «Generando imagen…». Usa las URLs de assets con la versión del store
o el mtime del disco; no consulta proveedores ni vuelve a generar miniaturas.

Por ajuste solicitado durante la revisión, la galería horizontal usa cinco columnas
a partir de 1024 px, con ancho máximo de 1280 px. La vertical también usa cinco
columnas en escritorio. En ventanas menores reduce las
columnas para conservar legibilidad. Conserva fuentes, amarillo saffron, bordes y
temas existentes. Las imágenes cargan bajo demanda con `loading="lazy"`.

Seleccionar una tarjeta revela **Ir a regenerar imagen**. El modo **Seleccionar**
permite marcar varias y revisarlas una a una; al completar la generación actual
se enfoca la siguiente sin generarla automáticamente. Ese botón cierra el
modal, selecciona la escena por su ID, usa el seek existente de inicio + 0,05 s,
reencuadra visualmente el timeline y enfoca la descripción del panel. La ayuda
explica cómo editarla o reutilizar el prompt guardado. Solo el botón de regeneración
existente inicia una solicitud. Se mantienen bloqueos por trabajo activo, saldo
y proyecto demo. Seleccionar otra escena termina la ayuda contextual.

El modal usa Radix, el sistema ya instalado: trampa de foco, Escape, X y clic
exterior. El salto se entrega en `onCloseAutoFocus` para que el modal no robe el
foco al campo. Los atajos del editor no reciben el teclado de la galería.

## Cambios justificados

- `EditorImageGallery` y `EditorImageGalleryCard`: UI y selección de tarjeta.
- `useSceneImageReview` y `SceneImageReviewRequest`: foco y solicitud local repetible.
- `LibraryEditor`: montaje y conexión con la selección ya existente.
- `EditorScenePanel`: ref del campo y ayuda contextual; conserva controles y costos.
- `EditorTimeline`: solo reencuadre visual a petición explícita de la galería,
  incluso cuando el usuario acaba de desplazar manualmente la pista. Sin cambios
  en límites, arrastre, reloj, selección normal ni cálculo de transiciones.
- `useLibraryEditor`: corrección puntual de la intención de reescribir un prompt,
  necesaria para cumplir el recorrido «editar descripción → regenerar».
- Tres catálogos i18n, comprobación de navegador y esta documentación.

No cambian sidecar, Rust, fases, contratos persistidos, proveedores, generación de
animaciones, tarifas, escenas fusionadas, duración ni velocidad de clips. Tampoco
se modifica `useEditorPlayback`, `sceneAt`, `timelineBlocks` o `ClipPreviewVideo`.

## Error detectado durante la comprobación

**Antes:** `userPromptDirty` comparaba borrador y detalle guardado. El blur del campo
iniciaba un guardado. Si respondía antes del click en «Regenerar con tu descripción»,
ambos textos eran iguales y la solicitud llevaba `rewritePrompt: false`; la nueva
descripción quedaba guardada pero no se usaba para reescribir el prompt de imagen.

**Ahora:** el evento de edición registra intención por proyecto/escena. El guardado
por blur persiste el texto pero no consume esa intención. Regenerar guarda lo
necesario y encola `rewritePrompt: true`; solo entonces limpia la intención enviada.
Un fallo de guardado no encola, y una nueva edición durante el guardado no se borra.
Sin cambios de texto se conserva `rewritePrompt: false`, reutilizando el prompt.
No se altera la lógica de animación. La causa ya figura en el registro global
`autosave-blur-vs-decision-click`, actualizado con esta reproducción.

## Verificación y cómo probar

Validación histórica anterior a la selección múltiple: 21 recorridos de galería y 143 regresiones de animación
con Chrome, formato, lint, build y 1295 claves alineadas en es/en/pt. La galería
con cuatro columnas se revisó visualmente en 1440 y 1920 px, tema claro/oscuro y
ventana estrecha. No se consumieron créditos.

Después de `pnpm format`, `pnpm lint` y `pnpm build`:

```sh
pnpm check:locales
node scripts/check-animation-frontend.mjs
```

La comprobación local de galería monta componentes, hook de editor y store reales;
solo sustituye servicios externos por respuestas locales. Chrome envía clicks y
teclas reales. Cubre selección lejana y de escena 5, foco repetido, teclado aislado,
prompt intacto, blur + click con prompt editado, escenas faltantes, versiones de
imagen, estados activos, cierre exterior/X/Escape, bloqueo demo y tamaños distintos.
Las imágenes de comprobación vienen de `public/style-references`, no de proyectos
privados. No consume créditos ni certifica la calidad de una generación remota.

Prueba manual recomendada: abre un proyecto de varias escenas; activa la casilla,
selecciona una imagen lejana y pulsa «Ir a regenerar imagen». Comprueba escena,
cursor, foco y ayuda. Regenera una vez sin editar y otra con una descripción nueva.
En un proyecto con imágenes faltantes, repite el recorrido desde una tarjeta vacía.

Compilar la app local desde esta rama:

```sh
PATH="/Users/sebas/node-v22.23.2-darwin-arm64/bin:$PATH" pnpm tauri build --bundles app
```

Cerrar la instancia anterior y abrir el paquete recién generado en
`src-tauri/target/release/bundle/macos/Vimo.app` de este worktree. Compilar el
checkout raíz `dev` no incorpora estos cambios.
