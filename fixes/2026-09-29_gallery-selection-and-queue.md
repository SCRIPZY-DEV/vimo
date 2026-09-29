# Fix: selección compacta y cola de trabajos en la galería

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

- El grid usaba filas de altura uniforme y estiraba todas las tarjetas. Abrir botones o inputs en una tarjeta propagaba su altura al resto, creando grandes superficies blancas vacías.
- El clic simple asignaba siempre el mismo ID; solamente el modo múltiple tenía alternancia para deseleccionar.
- Las imágenes conservaban el comportamiento de arrastre nativo del navegador, mostrando una copia flotante al arrastrarlas.
- Los motivos de acciones ocultas o de deshacer aparecían como avisos generales de generación. Además, la regeneración de la galería exigía guardar sus descripciones antes de encolar, por lo que un job activo bloqueaba nuevos lotes.

## Corrección

- Tarjetas con altura natural, alineadas arriba; se conservan las cinco columnas y sus variantes responsivas, las proporciones y la descripción de dos líneas.
- Un segundo clic deselecciona también en modo simple. Cerrar el input no descarta el borrador escrito.
- Arrastre nativo deshabilitado y contenido de imagen contenido en su tarjeta.
- Un único mensaje de deshacer en galería, con singular/plural: «Para cambiar las imágenes, deshacé primero la animación. Después podrás regenerarlas. Este clip cubre X escenas.» Los motivos de botones ocultos no se muestran como bloqueo general; el motivo de deshacer deshabilitado permanece en su tooltip.
- Los lotes de imágenes se aceptan en la cola del editor con su descripción y proveedor. Se guardan al despacharlos, manteniendo exclusión de escritura y rechazando solapamientos de escenas con trabajo ya solicitado. Las animaciones disjuntas conservan sus carriles y cuotas existentes.

## Límites deliberados

No se modifica Rust, el sidecar, cuotas del proveedor, planificador de clips, generación de prompts, cortes, audio, reproducción ni exportación. Deshacer una animación todavía requiere que no haya escritura en curso. La cola es del store existente y sobrevive al cierre de la galería o navegación dentro de la app; no se convierte en una cola persistente tras cerrar la aplicación.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
pnpm check:locales
```

Las verificaciones locales de interacción, layout y cola se mantienen fuera del repositorio. No se agregan capturas ni scripts temporales al commit.

## Pruebas manuales

Verificación local automatizada sobre los componentes reales en WebKit 26:
24 comprobaciones de selección, inputs, alturas, arrastre, responsive, teclado,
texto y cierre del modal; sin errores JavaScript. Se verificaron Outfit y DM Sans
cargadas. Proveedores simulados: no se generaron imágenes ni se gastaron créditos.

La cola se ejercitó con API simulada: 24 comprobaciones del store, 14 del hook y
cinco grupos de auditoría independiente. Cubren orden justo, diez carriles de
animación, fuentes fusionadas, proveedores por lote, cancelación durante guardado,
fallos que conservan borradores y respuestas tardías. Los scripts son temporales,
no una nueva suite oficial del repositorio.

Comprobaciones generales correctas: format, lint, build, tipos del pipeline y
paridad de los tres catálogos. Compilación local macOS terminada con
`pnpm tauri build --bundles app --ci`, usando Node 22 y firma ad hoc; verificación
`codesign --verify --deep --strict` correcta. No se publicó release ni PR.

No se realizó generación pagada ni prueba manual de extremo a extremo dentro de
la app empaquetada. Esa aceptación sobre proyectos reales corresponde al checklist
siguiente; la verificación visual anterior usa los componentes reales en WebKit
con API simulada.

## Checklist de aceptación

- Abrir una tarjeta animada: comprobar texto corto y que las demás no se estiren.
- Hacer clic otra vez en la misma imagen: debe quitarse la selección.
- Repetir con selección múltiple, incluyendo agregar y quitar imágenes.
- Escribir una descripción, deseleccionar y volver a abrir: conservar el borrador.
- Intentar arrastrar una imagen: no debe aparecer una imagen flotante fuera de la tarjeta.
- Lanzar varias animaciones en escenas distintas y enviar otro lote sin esperar a que terminen.
- Enviar regeneraciones adicionales con descripciones diferentes mientras hay trabajo: comprobar la cola, el resultado y que cerrar la galería no cancele los jobs.
- Evitar duplicar trabajo sobre la misma escena o sobre la otra fuente de una pareja en curso.
