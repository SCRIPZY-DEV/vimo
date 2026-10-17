# Fix: tirador pastel con aparición individual

- **Fecha:** 2026-10-14
- **Rama:** `feat/flow-export-motion`

## Causa

Los dos tiradores de una frontera compartían el estado activo. Arrastrar el
derecho de un clip también mostraba el izquierdo del vecino, y el hover o foco
podían revelar otros controles durante el gesto.

## Corrección

`EditorTimeline.tsx` identifica cada tirador por bloque estable y lado. Durante
el arrastre sólo permanece visible el que inició el gesto; se suprimen el hover,
foco y la opacidad residual de los demás. En reposo, seleccionar el clip o pasar
por su centro no revela las asas: el cursor debe estar sobre el propio tirador.
El foco de teclado también permite descubrir y ajustar ese control.

El diseño conserva el relleno amarillo pastel con gradiente, raya central,
sombras y posición a 3 px del borde interior. El marcador de transición permanece
visible durante hover, foco y arrastre; su área compartida prioriza el tirador
para permitir recortar. Los bordes blancos y los cursores rojo y azul se conservan.

## Límites deliberados

El recorte mueve una frontera compartida, respeta los mínimos y los bloqueos de
animación, y no añade controles para el comienzo o final global del video.
No modifica la duración del fundido, el pipeline, las cuentas ni la extensión.
Los cambios de tiempos mantienen el guardado y la accesibilidad de teclado.

## Validación reproducible

1. Abrir tres escenas estáticas con fundidos. En reposo y al pasar por el centro
   de un clip, comprobar que no aparecen tiradores.
2. Pasar por cada borde interior: sólo aparece su tirador pastel, con raya y
   relleno. La transición sigue visible.
3. Arrastrar cada lado, cruzar sobre el vecino previamente enfocado y salir del
   timeline: sólo se muestra el tirador pulsado. Soltar conserva la frontera y
   el siguiente clic sobre la regla funciona.
4. Usar flechas y Shift con foco en el tirador; comprobar ajustes consecutivos,
   guardado y foco. Repetir en claro/oscuro y con ancho mínimo.
5. Comprobar por separado un clip animado y una escena de avatar: sus fronteras
   bloqueadas deben conservarse. Guardar y reabrir el proyecto.
6. Ejecutar formato, lint y build; reconstruir el bundle macOS y verificar su
   firma con `codesign --verify --deep --strict`.

## Pruebas manuales realizadas

Se revisaron capturas de Chromium y la ventana compuesta de WKWebView del
componente y CSS reales sobre escenas sintéticas. Diez grupos automatizados en
Chromium comprobaron diseño pastel, hover individual, ambos arrastres, vecino
enfocado, salida del timeline, teclado, temas y ancho mínimo. WKWebView comprobó
reposo, foco y arrastre izquierdo/derecho mediante eventos DOM sintéticos.

La evidencia está fuera de Git en
`Vimo-Flow-QA/2026-10-14/editor-pastel-borde-corregido/`. Esos resultados pertenecen
al componente previo a la integración de `dev`, cuyo bundle local pasó build,
copia y firma. No acreditan la app integrada ni una sesión manual sobre proyectos
reales. Se deben repetir las comprobaciones del candidato integrado, incluidos
clips animados y escenas de avatar, antes de atribuirle aceptación nativa.
