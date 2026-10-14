# Fix: interacción de clips y cursores del editor

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

> **Diseño visual superado el 2026-10-13:** la descripción de asas blancas y pastilla de transición documenta la versión anterior. El diseño vigente usa [asas interiores en amarillo pastel y transición compacta](2026-10-13_asas-internas-amarillo-pastel.md). Se conservan las correcciones de interacción y cursores de este informe.

## Causa

El diseño solicitado ya estaba integrado por `7ca6af3d`: bordes blancos, asas de recorte, pastillas translúcidas de transición y cabezales triangulares rojo y azul. La revisión de interacción detectó tres problemas: la key de los bloques estáticos incluía su tiempo inicial y remontaba el asa izquierda al moverla; durante el guardado se desmontaban todas las asas; soltar un drag fuera del timeline dejaba una bandera que consumía el siguiente clic legítimo. El indicador azul también conservaba una posición anterior al cambiar el zoom mediante la rueda.

## Corrección

`EditorTimeline.tsx` identifica cada segmento por escena y clip precedente, distinguiendo los restos estáticos de una misma escena sin usar un tiempo editable como key. Las asas permanecen montadas con `aria-disabled` durante el guardado; el handler conserva el bloqueo y evita que las flechas desplacen la página. Al comenzar una nueva pulsación se limpia la supresión anterior, mientras el propio drag conserva su protección contra clics accidentales. El zoom con Ctrl/Cmd y rueda oculta el indicador azul hasta observar una nueva posición del puntero.

Se confirma la conservación de bordes blancos en selección/hover, asas blancas, transiciones claras con icono Shuffle y foco azul, línea roja de reproducción y línea azul que anticipa dónde hará seek el clic. Los proveedores compactos, selección de Vimo gratis desde la galería, regeneraciones concurrentes y exportación opcional con movimiento siguen integrados.

## Límites deliberados

Los recortes siguen moviendo fronteras compartidas y respetando los clips animados bloqueados. La transición conserva su duración calculada; no se agregan asas decorativas que prometan editar una duración sin soporte de render. El cursor azul se muestra en zonas navegables; las tarjetas seleccionan escenas y sus controles no deben iniciar reproducción. No cambia el pipeline, las cuentas ni la extensión 0.2.36.

## Validación reproducible

- Correr formato, lint y build de la app.
- Enfocar el asa izquierda de una escena intermedia y pulsar varias veces las flechas. Cada guardado debe conservar el mismo nodo y devolver la capacidad de ajustar, sin exigir volver a enfocar.
- Durante el guardado, el asa informa deshabilitado y no modifica tiempos ni provoca scroll por las flechas.
- Arrastrar un asa, soltar fuera del timeline y pulsar una vez sobre la regla: el primer clic debe hacer seek. Repetir con el cabezal rojo.
- Mover el cursor sobre la regla: el azul anticipa sin modificar reloj ni rojo. Hacer zoom con Ctrl/Cmd y rueda: no queda un azul desfasado.
- Mantener escenas con clips parciales y restos estáticos: no hay keys duplicadas ni pérdida de bloques. La duración mínima y los bloqueos de animación se conservan.

Los arneses personales y capturas viven fuera de Git en `Vimo-Flow-QA/2026-10-13/editor-vidrush/`. La reproducción anterior al fix confirmó en Chromium tanto pérdida de foco como primer clic ignorado. Pasaron 7/7 controles focales nuevos y 10/10 de regresión visual/funcional en Chromium. Se revisó la captura de líneas y cabezales, bordes, asas y transiciones. Los controles del store conservaron 13/13 casos de regeneraciones simultáneas (20 gratuitas junto a 5 pagas) y aislamiento de estados por proveedor. Formato, lint y build macOS completaron correctamente. La copia final conserva los siete archivos exactos del bundle y pasó `codesign --verify --deep --strict`.

## Pruebas manuales realizadas

Revisión visual e interacción en Chromium aislado con componentes y CSS reales, escenas sintéticas y sin API externa. No se modificaron videos ni perfiles del usuario. La aceptación en la app Tauri con su proyecto real queda diferenciada de este banco de interfaz.

## Entrega local verificada

App: `/Users/sebas/Documents/Vimo-builds/Vimo-0.10.0-editor-vidrush.app`.

Ejecutable UI SHA-256: `b03adf106a9d3662be23a983346228932b6f428dc71ae7a90a442545e8399694`.

SEA SHA-256: `8fcd272079760cd0568823166fa8fc70ba50410dcae2ca20be0f7c780ba3c0f5`, idéntico al de la entrega autónoma ya validada. Esta corrección requiere abrir la app nueva; la extensión sigue siendo 0.2.36. La app conserva la identidad habitual y no fue abierta sobre proyectos del usuario. La firma es local ad hoc; no se publicó ni notarizó una distribución.
