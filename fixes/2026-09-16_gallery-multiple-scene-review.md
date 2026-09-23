# Fix: galería de cinco columnas y revisión de varias escenas

- **Fecha:** 2026-09-16
- **Rama:** feat/animation-scenes

## Causa

La galería solo permitía revisar una escena por vez. Para corregir varias imágenes,
el usuario tenía que volver a abrirla y localizar cada tarjeta. Cuatro columnas
mostraban menos escenas de las solicitadas. Un avance basado solo en «imagen lista»
tampoco sería suficiente: el job puede fallar al cerrar o informar escenas fallidas.

## Corrección

- Cinco columnas desde 1024 px en ambos formatos, reducidas en ventanas pequeñas.
  Los botones largos admiten varias líneas para no desbordar una tarjeta.
- **Seleccionar** permite marcar y desmarcar escenas, con contador y pie fijo.
  **Revisar selección** empieza por orden del video. **Ir a regenerar imagen** en
  una tarjeta marcada empieza por esa escena; las restantes siguen el orden del video.
- Se cierra la galería antes de seleccionar, reencuadrar la línea de tiempo y
  enfocar la descripción. Se conserva el prompt. La guía y el campo quedan visibles.
- Cada imagen requiere confirmar el botón de regeneración existente. La selección
  no dispara compras en lote ni decide cambios de prompt por el usuario.
- El hook de regeneración devuelve si pudo encolar. Un observador de solo lectura
  del store espera cierre de job, versión nueva y ausencia de error de la escena.
  Entonces avanza a la siguiente, sin regenerarla automáticamente.
- Un fallo de guardado o generación mantiene la escena y permite reintentar. El
  bloqueo sincrónico evita envíos duplicados mientras se confirma la misma escena.
- La guía indica progreso y permite saltar o finalizar. Finalizar no cancela una
  generación en curso; su respuesta tardía no navega. Cambiar de proyecto descarta
  la revisión local, conservando el trabajo del store existente.
- Si el usuario navega a otra escena o abre un modal, el resultado actualiza el
  progreso sin robar el foco. **Ir a escena N** permite continuar cuando lo decida.

## Límites deliberados

La revisión es temporal y no se persiste al cerrar el editor. Cada generación debe
confirmarse individualmente; no se añade una compra masiva. Los costos, proveedores,
sidecar y contratos permanecen a cargo de los mecanismos existentes.

No cambian duración, cortes, reproducción, transiciones, exportación ni lógica de
animación. El manejador de selección existente conserva exactamente el seek de
inicio + 0,05 s; solo se conecta a la revisión. La suscripción añadida al store no
modifica su despacho, cola de trabajos o manejo de eventos.

## Validación reproducible

Desde esta rama, con Node compatible y pnpm:

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

Recorrido de aceptación:

1. Abrir un proyecto de al menos diez escenas. Activar **Vista ampliada de imágenes**.
   A 1024 px o más comprobar cinco columnas; reducir la ventana y verificar adaptación.
2. Pulsar **Seleccionar**. Marcar 2, 5 y 9; desmarcar y volver a marcar una. Comprobar
   contador. Abrir la revisión desde la tarjeta 5: debe enfocar 5, luego 2 y luego 9.
3. Confirmar una regeneración con el prompt actual. Al terminar, debe seleccionar la
   próxima escena y enfocar su descripción sin generar otra imagen por sí sola.
4. Editar una descripción y pulsar regenerar tras el blur: la intención editada debe
   enviarse. Ante fallo, permanecer en la escena; reintentar o usar **Saltar escena**.
5. Finalizar una revisión mientras una imagen está generándose: la solicitud sigue,
   pero al terminar no cambia la escena. Repetir navegando a otra escena o abriendo
   la galería: no debe quitar el foco y debe ofrecer reanudar la revisión.
6. Verificar X, Escape, clic exterior y que el teclado dentro de la galería no
   reproduzca ni deseleccione la escena del editor.

Los pasos que confirman generaciones reales consumen los créditos habituales.
La verificación de desarrollo usó servicios simulados: 29 comprobaciones de Chrome
con componentes, hooks y store reales. Cubre también guardado fallido, doble clic,
respuesta tardía y cambio de proyecto. El script local y las capturas se conservaron
fuera del repositorio; no se agregan como tests oficiales ni como archivos del PR.
El verificador histórico de galería anterior conserva sus expectativas de cuatro
columnas y no certifica esta revisión; no se modificó para subir un script local.

## Pruebas manuales realizadas

Se inspeccionaron visualmente las capturas renderizadas de la galería con cinco
columnas y selección múltiple, y del editor tras avanzar con la descripción enfocada.
Las interacciones de Chrome se ejecutaron mediante automatización; no se presentan
como una sesión manual nativa de Tauri. No se hicieron generaciones remotas pagas
para este cambio ni se certifica aquí la calidad visual de un proveedor.
