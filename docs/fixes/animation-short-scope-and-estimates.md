# Animación completa de shorts y presupuesto de clips

Fecha: 2026-09-15. Revisión solicitada por el dueño a partir del panel de la escena y del alcance de animación.

## Cambios comprobables

- La captura mostraba el panel de la escena, no el diálogo de confirmación. La estimación estaba solo dentro del diálogo. La revisión de esta nota mostró ambos. **Interacción sustituida por [acción directa y movimiento](animation-direct-action-and-motion.md):** se elimina la ventana individual y toda la información queda en el panel, con créditos a 18 px, duración a generar y duración final si difiere. La ventana de animar el inicio se conserva.
- El recibo histórico sigue fuera: escena o escenas, segundos y créditos realmente cobrados. Seleccionar una escena absorbida recupera el recibo de su grupo. Sin importe remoto se muestra costo no disponible, sin inventarlo. Una animación existente ofrece **Rehacer clip**.
- **Animar todo el video** está disponible para 9:16 en formulario y editor, también en shorts superiores al minuto. El prefijo por minutos sigue disponible; si el audio es menor, el alcance termina en el audio.
- En shorts existentes, cada escena se anima por separado. Una de 3 s encarga 4 s y el MP4 se normaliza a 3 s (4/3). Fragmentos menores de 3 s conservan la regla existente: inicio a velocidad normal y recorte, evitando aceleraciones extremas. No se modifican los tiempos de las escenas vecinas.
- Crear mantiene la decisión previa: escenas animadas nuevas de 6 s y último intervalo ajustado al audio real. La intención de animar todo se persiste hasta medirlo. Para audio propio aún desconocido, el precio total queda pendiente.
- Ampliar primer minuto → todo conserva los MP4 y recibos listos **en ambos formatos**, incluso cuando el minuto partió una escena. Se presupuesta y genera únicamente lo faltante. Recuperar una tarea pagada no encarga una nueva generación.

## Alcance por archivo

| Grupo                                                                                                 | Cambio necesario                                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `SceneAnimationSection`, `animationPlanPreview`, tipos `library`                                      | Información visible, recibos asociados y presupuesto completo al rehacer un grupo.             |
| `AnimationMinutesField`, `CreateAnimationSection`, `EditorAnimationRange`                             | Opción completa solo en shorts, manteniendo ventanas, colores y progreso.                      |
| `LibraryEditor`                                                                                       | Pasar formato y duración únicamente a la planificación de animación.                           |
| `animation/scope`, `animation/planner`, `animation/generate`, `animationRangePlan`                    | Misma política de escenas individuales y fin del audio; ids de recuperaciones pendientes.      |
| Tipos `create`, `video-project`, `constants`, `formPayload`, `create-video-project`                   | Persistencia y validación del booleano opcional, sin nuevos subcomandos.                       |
| `scene-cuts`, `preview-scene-cuts`, `images-with-animation`, `LibraryProgress`, `SecondsPerSceneStep` | Resolver todo el audio con cortador y confirmación existentes; conservar derivados anteriores. |
| `estimateAnimationSeconds`, `estimateCreateCost`, `estimateResumeCost`, `NoCreditsResumePanel`        | Presupuesto y recuperación coherentes con el alcance completo.                                 |
| Catálogos es/en/pt, scripts de comprobación y ADR-0042                                                | Textos, evidencia reproducible y reglas vigentes.                                              |

## Superficies protegidas

No se cambian la selección del timeline, `useLibraryEditor`, el reloj de reproducción, `sceneAt`, `timelineBlocks`, `ClipPreviewVideo`, normalización/FFmpeg, política de fundidos, render/exportación, fórmulas Ken Burns, proveedores o tarifas, prompts, fases, Rust, rutas ni dependencias. El cambio del presupuesto no autoriza reescribir cortes o activos pagados. El alcance se comprueba con `git diff` y con regresiones de selección 4/5, fundidos, bloqueo de tiempos y ventanas flotantes.

No se modifica ningún proyecto real ni se ejecutan generaciones pagadas durante la comprobación. Se revisaron duraciones de proyectos locales en lectura: existen cortes históricos de aproximadamente 2,98/2,99 s; no se presupone que todo corte nominal de 3 s sea entero.

## Comprobaciones reproducibles

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc --noEmit -p tsconfig.pipeline.json
node scripts/check-animation-frontend.mjs
node scripts/check-animation-service.mjs
node scripts/check-animation-timing.mjs
```

El recorrido UI ejercita componentes y store reales con servicios simulados. El servicio ejecuta el orquestador real, intercepta solo los servicios remotos y decodifica los MP4 con FFmpeg. Verifica 75 cuadros por escena de 3 s, cero pistas de audio, cola exacta, guion por escena y conservación byte por byte del primer minuto en 16:9 y 9:16.

Tras compilar, `check-animation-packaged.mjs` debe apuntar al SEA y FFmpeg dentro de `Vimo.app/Contents/MacOS`. Validar solo el TypeScript no demuestra que la aplicación entregada contiene el cambio. La calidad semántica de videos remotos y la aceptación en Windows requieren comprobación adicional; estos recorridos locales no las certifican.

## Errores a evitar

1. Presupuestar minutos teóricos en lugar del intervalo real del audio.
2. Convertir «todo» en una cantidad arbitraria de minutos antes de conocer el audio.
3. Usar `force` al ampliar el alcance y volver a pagar clips ya listos.
4. Presupuestar solo la primera escena de un grupo que el backend debe reemplazar entero.
5. Ocultar toda la información del clip detrás de un botón o confundir costo histórico con el próximo gasto.
6. Enviar una selección vacía al recuperar un reemplazo todavía cubierto por un clip anterior.
7. Corregir un problema de alcance tocando selección, transiciones o tiempos que no lo causan.
