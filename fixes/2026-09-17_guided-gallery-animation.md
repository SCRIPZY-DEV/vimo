# Fix: galería compacta y revisión guiada de animaciones

> **Interacción superada el 2026-09-17:** [acciones directas en galería](2026-09-17_direct-gallery-actions.md). Se conserva vigente la corrección de progreso desde cero; la revisión guiada y las dos pasadas se retiraron por petición del usuario.

- **Fecha:** 2026-09-17
- **Rama:** feat/animation-scenes

## Causa

El cambio anterior insertaba todo el panel de animación dentro de cada tarjeta.
Esto aumentaba mucho su altura y ejecutaba desde la galería, mientras que el
usuario necesita revisar costos, duración y resultado en el editor.

Además, el porcentaje se ocultaba durante la redacción del prompt, aunque su
reloj continuaba: al entrar en generación aparecía de golpe el tiempo acumulado.

## Corrección

La galería mantiene cinco columnas y botones compactos: regenerar imagen,
animar clip, o regenerar y animar. Cierra el diálogo antes de seleccionar la
escena y enfocar su prompt o sección de Animación. La selección múltiple permite
elegir el recorrido; una tarjeta puede iniciar por esa escena y seguir la lista.
Los controles de minutos continúan solamente en el editor.

La revisión es humana: cada botón de generación del panel exige una acción
explícita. Terminar un paso lleva al siguiente sin comprar otra generación.
Saltar omite la escena o el grupo del clip; finalizar detiene la revisión, no
un job ya enviado. Navegar a otra escena o abrir un diálogo impide robar el foco.
Cambiar de proyecto o desmontar invalida continuaciones tardías.

En el modo combinado se regeneran primero todas las imágenes seleccionadas.
Después se animan sus clips con esas referencias definitivas. Las imágenes
saltadas no se agregan a esa segunda pasada. El plan existente puede incluir
una vecina como referencia de una fusión, lo que se informa en el panel antes de
confirmar. Los grupos cubiertos se cuentan por sus escenas y se omiten del resto
de la revisión para evitar rehacer dos veces la misma fusión.

Una imagen fallida no habilita el paso de animación. Si existe un recibo de
animación pendiente, se pide recuperarlo antes de cambiar la imagen; recuperarlo
no completa la regeneración ni consume el paso de animación posterior. La segunda
pasada combinada bloquea regenerar imágenes desde esa revisión para no cambiar
referencias después de animar otros clips. Se puede finalizar la revisión para
iniciar otra edición deliberada.

El store añade únicamente un observador opcional a cada solicitud local. Acumula
los IDs de `scene-animation-ready` de esa solicitud y confirma el cierre del job.
No avanza por una revisión global, un éxito ajeno, un encolado aceptado, un error,
un rechazo o un resultado parcial. Los callbacks de revisión no cambian el
payload, transporte, concurrencia, despacho, reintentos ni recibos del sidecar.

Antes de continuar se refresca el proyecto por la query existente. Si esa lectura
falla tras una generación exitosa, «Continuar revisión» reintenta solo la lectura;
no se repite una operación pagada. El panel conserva estimación, saldo y recibos,
y bloquea nuevas animaciones si falta alguna imagen del plan.

El progreso visual comienza desde cero también durante la redacción del prompt.
El botón usa un único «Animando… X %», sin «Preparando». La cola y la espera por
cuota conservan sus estados reales. Se mantiene la estimación temporal existente
cuando Kie no informa porcentaje; no se presenta como telemetría del proveedor.

## Límites deliberados

No se modifican guiones, previews, prompts de animación, proveedor, tarifas,
backend, sidecar, selección temporal normal, reproducción, cortes, transiciones
o exportación. La falta de integración de los fixes de previews documentada en
`2026-09-17_gallery-scene-animation.md` continúa pendiente.

La revisión transitoria no se persiste al cerrar la aplicación. Los jobs y
recibos mantienen su comportamiento existente. Una acción sobre un clip ya
animado muestra «Rehacer clip» y su costo antes de confirmarla; no se rehace
por el mero hecho de seleccionar una tarjeta.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

1. Seleccionar una tarjeta: solo acciones compactas, sin panel de créditos en la
   galería. Animar lleva a la escena correcta y enfoca el bloque azul sin comprar.
2. Seleccionar varias y elegir Animar: confirmar la primera en el panel, ver
   «Animando… 0 %», y comprobar avance al éxito o salto sin otra compra automática.
3. Confirmar regeneración y animación combinadas para escenas de 3 + 3 segundos:
   completar ambas imágenes antes de animar; una sola fusión resuelve ambas.
4. Probar errores, éxito parcial, falta de imagen, grupo ocupado, doble clic,
   animación paralela ajena, detener revisión y cambiar de proyecto.
5. Fallar la lectura de metadata tras un resultado exitoso: continuar reintenta
   lectura, no llama otra vez a generación. Recuperar un recibo antes de regenerar.
6. Probar el recorrido de imágenes anterior, foco de prompt, guardar una edición
   antes de regenerar, salto, cancelación y ausencia de robo de foco al navegar.

Resultados locales sobre esta implementación: formato, lint y build aprobados;
1.330 claves alineadas en es/en/pt. Aprobadas 31 comprobaciones del flujo nuevo,
29 de regeneración/revisión anterior, 12 del observador por solicitud y 150 de
regresión/progreso de animación. Servicios simulados, sin créditos consumidos.
Las capturas se inspeccionaron a 1.440 y 1.024 px. No hubo fallos de producto en
la corrida final; una espera del fixture al volver a la misma escena se corrigió
sin modificar producto.

Scripts y capturas de verificación local viven fuera del repositorio. No son
un framework oficial de pruebas ni deben subirse al PR.

## Pruebas manuales realizadas

Se verifican los componentes reales en Chrome con APIs simuladas y se inspeccionan
capturas. La aceptación nativa y los resultados visuales de proveedores reales
quedan pendientes; no se consumen créditos en esta validación local. Una app
compilada no equivale a una sesión manual de producción.
