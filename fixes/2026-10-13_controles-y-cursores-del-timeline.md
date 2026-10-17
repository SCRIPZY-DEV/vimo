# Fix: controles y cursores del timeline

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

> **Diseño visual superado el 2026-10-13:** la descripción de asas blancas y pastilla de transición documenta la versión anterior. El diseño vigente usa [asas interiores en amarillo pastel y transición compacta](2026-10-13_asas-internas-amarillo-pastel.md). Se conservan las correcciones de interacción y cursores de este informe.

## Causa

Los clips usaban bordes amarillos/celestes y un área invisible para ajustar la frontera. Los fundidos eran marcadores morados pequeños. El cabezal de reproducción tenía forma de rombo y faltaba una previsualización del lugar al que llevaría el clic. Además, la preparación de una imagen necesitaba distinguirse de una solicitud realmente en cola.

## Corrección

- `EditorTimeline.tsx`: asas blancas rectangulares a ambos lados de cada frontera editable; aparecen al seleccionar, pasar el cursor o enfocar. El arrastre conserva el recorte compartido y el mínimo de cada escena. Las flechas del teclado ajustan 0,1 segundos; con Shift, 1 segundo. Los atributos ARIA exponen el tiempo y sus límites.
- Los fundidos se muestran en una pastilla clara translúcida con icono Shuffle, hover y foco azules. La pastilla selecciona la escena siguiente sin reproducirla.
- Cabezal rojo con triángulo hacia abajo y línea fina. El indicador azul anticipa únicamente zonas que realmente realizan un salto, con el mismo ajuste al final que usa el clic. Mover el mouse no llama a reproducción ni seek. Se oculta durante arrastres, sobre controles y al desplazar el carril.
- `TimelineSceneItem.tsx` y `TimelineClipItem.tsx`: borde blanco de selección/hover, manteniendo iconos y estados de animación. El nuevo estado `preparing` muestra «Preparando imagen…» y no «En cola».
- Se corrigió durante la validación la superposición del marcador de fundido sobre las asas; el recorte tiene prioridad de interacción.

## Límites deliberados

- Los fundidos conservan su duración actual. No se añaden asas azules que aparenten modificar un efecto cuando en realidad recortarían clips.
- Se mantienen los bloqueos de tiempo de los clips animados y sus recibos. No se añaden controles para editar el inicio/final global del video.
- Las tarjetas seleccionan escenas; el indicador azul aparece sobre la regla y las zonas navegables, de modo que no prometa un salto donde el clic cumple otra función.
- No cambia el motor de render ni el almacenamiento de tiempos.

## Validación reproducible

1. Ejecutar `pnpm --config.verify-deps-before-run=false exec eslint src/modules/videos/components/EditorTimeline.tsx src/modules/videos/components/TimelineSceneItem.tsx src/modules/videos/components/TimelineClipItem.tsx`.
2. Abrir un video con al menos tres escenas estáticas y fundidos: pasar el cursor por la regla. La línea azul debe seguir el punto; el reloj y la línea roja permanecen inmóviles hasta hacer clic.
3. Seleccionar un clip, arrastrar un asa 30 píxeles a 60 px/s y comprobar que solo se ajusta 0,5 s la frontera compartida. Al soltar no debe empezar la reproducción. Con foco en el asa, comprobar flechas y Shift.
4. Arrastrar el cabezal rojo: debe mover la previsualización sin comenzar a reproducir. Enfocar una transición y pulsar Enter: debe seleccionar su escena sin modificar tiempos.
5. Comprobar que un clip animado conserva su bloqueo y no ofrece asas de recorte. Una regeneración en preparación debe mostrarse como «Preparando imagen…».

El harness temporal personal empaquetó estos mismos componentes y CSS, con seis escenas sintéticas y APIs locales simuladas, y ejecutó diez controles en Chrome real: hover sin reproducción, clic exacto, ausencia de hover engañoso sobre tarjetas, teclado de frontera, drag/commit sin seek, scrub sin autoplay, activación de transición por teclado, preparación distinta de cola, bloqueo de animación y ausencia de excepciones de navegador. Los diez pasaron. No se agrega ese script ni capturas al repositorio.

## Pruebas manuales

Se revisó visualmente la captura del harness aislado: cabezales rojo/azul, líneas, borde blanco, asas y fundidos. No se usaron proyectos, cuentas ni perfiles vivos. La revisión de la app Tauri final y la aceptación con un proyecto real corresponden a la validación integrada de la entrega; esta prueba aislada no afirma haberlas realizado.

## Enmienda de interacción del 2026-10-13

La corrección visual se conserva. El supuesto de que una única flecha probaba todo el ajuste por teclado queda superado por la [revisión de foco, guardado y gestos](2026-10-13_interaccion-editor-vidrush.md): ahora se comprueban el asa izquierda, teclas consecutivas, guardado intermedio y mouseup fuera del carril.
