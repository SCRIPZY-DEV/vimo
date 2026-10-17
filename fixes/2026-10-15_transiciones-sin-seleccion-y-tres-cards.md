# Fix: selección de transición y ancho inicial de los catálogos

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

La tarjeta de transición quedaba deshabilitada y con opacidad reducida cuando no había una escena seleccionada. El usuario no podía pulsarla para recibir una explicación. El ancho inicial compartido de 320 px tampoco dejaba tres columnas disponibles para futuros catálogos de transiciones o SFX.

## Corrección

- `EditorTransitionsPanel.tsx` mantiene la tarjeta activa y con la imagen normal cuando no hay selección. Al pulsarla muestra «Selecciona una escena o clip para agregar el efecto» mediante el aviso de Vimo y termina sin llamar a la actualización de escenas. La vista previa al pasar el cursor sigue funcionando.
- Se conservan las guardas de operaciones en curso, última escena y transiciones automáticas. Aplicar a todas mantiene su funcionamiento independiente.
- `useEditorWorkspace.ts` utiliza un ancho inicial de 450 px para Transiciones y Audio/SFX: caben tres columnas de al menos 128 px con sus espacios. Música y Animación mantienen 320 px. Una vez que el usuario ajusta el ancho, se conserva su elección compartida.
- `EditorToolCardGrid.module.css` mantiene una única tarjeta grande al ancho inicial; varios elementos se distribuyen en la grilla. El panel sigue ajustándose entre 280 y 590 px, hasta cuatro columnas, limitado por el espacio disponible para la vista previa.
- El mensaje se actualiza en español, inglés y portugués. No se añaden efectos ficticios al catálogo real.

## Límites deliberados

- Las tres y cuatro tarjetas se simulan sólo en la prueba temporal de diseño; este cambio prepara el espacio, no incorpora nuevos efectos.
- En ventanas sin ancho suficiente se conserva la adaptación al espacio disponible. No se fuerza desbordamiento para sostener tres o cuatro columnas.
- Se conserva el movimiento inmediato del panel durante el arrastre y el cierre por X o por su botón. No cambia la duración de efectos, el render, la exportación ni el almacenamiento de proyectos.
- La validación nativa se realizó en macOS. Windows y Linux requieren ejecutar sus runners respectivos; no se presentan como probados en esta sesión.

## Validación reproducible

1. Ejecutar `pnpm lint`, `pnpm build` y `pnpm check:locales`.
2. Abrir un proyecto en el editor, deseleccionar la escena con Escape y abrir Transiciones. La foto debe conservar su apariencia normal y animarse al pasar el cursor.
3. Pulsar Fundido cruzado con ratón, Enter o Espacio. Debe aparecer el aviso de selección, sin modificar las transiciones del proyecto.
4. Seleccionar una escena con sucesora válida y comprobar aplicación/eliminación; comprobar las guardas en la última escena y en una unión automática. Aplicar a todas sigue habilitado cuando corresponda.
5. Abrir Transiciones y SFX en un editor recién montado: ancho inicial de 450 px. En una fixture temporal con tres elementos, deben quedar en una fila. Ampliar hasta 590 px y comprobar cuatro elementos en una fila; reducir hasta 280 px y comprobar que se reorganizan sin desbordarse.
6. Comprobar música/animación a 320 px antes de cualquier ajuste manual. Verificar que la elección manual persiste al alternar herramientas.

## Pruebas manuales realizadas

- Formato de los archivos modificados, lint completo, compilación de producción y traducciones: aprobados.
- Chrome aislado con componentes y hooks reales: 127 comprobaciones aprobadas; incluye clic, Enter/Espacio nativos, hover, guardas, tamaños y aplicación de transición con API simulada.
- WKWebView real con los mismos componentes: 124 comprobaciones aprobadas a 1040 px y otras 124 a 1440 px. Proveedores y escritura de proyectos aislados mediante fixtures temporales.
- App macOS compilada, firma verificada y copia de entrega comprobada: arranque correcto. En el proyecto abierto se deseleccionó con Escape, se abrió Transiciones a 450 px y se pulsó la tarjeta; apareció el aviso exacto y la foto permaneció normal. El separador respondió a End (590 px) y Home (280 px). No se aplicaron efectos ni se generaron videos en este proyecto real.
- Capturas, informes y scripts de verificación permanecen fuera del repositorio en `/private/tmp/vimo-editor-selection-20261015/`. No forman parte del commit ni del PR.
