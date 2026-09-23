# Selección de escenas y fundidos del editor

Auditoría iniciada el 2026-09-14. Corrección: 2026-09-15. Alcance solicitado por el dueño: selección exacta, transiciones opcionales entre imágenes y transiciones automáticas junto a animaciones.

## Regresión reproducida

Seleccionar la escena 4 mostraba principalmente la imagen 3; seleccionar la 5, la 4. El índice de selección y los cortes eran correctos. El compositor introducido en `2c88738` aplicaba el fundido incluso con la reproducción pausada. El selector existente inspecciona a inicio + 0,05 s; dentro de un fundido de 8 cuadros a 25 FPS (0,32 s), la escena entrante tenía solo 15,625 % de opacidad. Por eso dominaba la anterior.

Se reprodujo antes de corregirlo: las 77 comprobaciones anteriores de la página pasaban, pero una nueva comprobación de la escena 4 pausada falló. Comprobar únicamente el efecto nuevo y que la aplicación compila no detectaba esta regresión.

La composición pausada muestra opaca la escena bajo el cursor. Con un MP4 vigente, únicamente dentro de un intervalo de fundido se superpone el recurso de la escena inspeccionada; el video sigue montado y conserva su reloj. Fuera de ese intervalo se conserva el fotograma renderizado, incluidos sus subtítulos y efectos. Sin recurso editable se mantiene el MP4 como respaldo.

## Comportamiento de las transiciones

| Límite entre bloques contiguos | Checkbox desactivado | Checkbox activado |
| ------------------------------ | -------------------- | ----------------- |
| Imagen → imagen                | Corte directo        | Fundido           |
| Imagen → clip animado          | Fundido              | Fundido           |
| Clip animado → imagen          | Fundido              | Fundido           |
| Clip animado → clip animado    | Fundido              | Fundido           |

El checkbox **Añadir fundidos entre imágenes** comienza desactivado si el proyecto no tiene preferencias guardadas. Activarlo muestra **Reproduce el video para ver las transiciones**. Las marcas moradas en V1 identifican los límites con fundido; no interceptan clics ni arrastres. Desactivar elimina las marcas opcionales y conserva las automáticas junto a clips listos. Un candidato pendiente no reemplaza visualmente una animación ya lista.

Ken Burns es el movimiento de cámara sobre una imagen; el fundido es la mezcla entre bloques. Esta corrección conserva las fórmulas y constantes de Ken Burns. Los fundidos ocupan los primeros 8 cuadros del bloque entrante, o menos si el fragmento es más corto. No quitan tiempo a la escena anterior, no añaden tiempo y no atraviesan huecos.

La preferencia `staticTransitionIn` se guarda con el comando existente `update-scenes`, sin añadir subcomandos ni modificar el transporte nativo. Preview, marcadores, MP4 y exportación de clips aplican la misma política. Cambiarla invalida un render existente; guardar el mismo valor no lo invalida. Los MP4 sin la versión actual de esta política se presentan como desactualizados en el editor y se conservan en disco. La versión se publica tras completar el render; la caché de chunks también cambia de versión para evitar reutilizar efectos antiguos.

## Alcance por archivo

| Archivos                                                                                      | Motivo necesario                                                                            |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `pipeline/animation/transitions.ts`                                                           | Regla pura compartida de cuándo hay fundido.                                                |
| `pipeline/types/scenes.ts`, `pipeline/types/video-project.ts`                                 | Preferencia opcional por escena y versión del render.                                       |
| `pipeline/project/scenes-file.ts`, `pipeline/commands/videos/update-scenes.ts`                | Guardar y devolver la preferencia; validar booleanos; mantener bloqueos de tiempos pagados. |
| `pipeline/stages/render/animated-scenes.ts`, `chunk-renderer.ts`, `constants.ts`, `render.ts` | Aplicar cortes/fundidos en el MP4 y clips, conservar cuadros e invalidar caché antigua.     |
| `EditorVisualComposition.tsx`, `EditorPreviewPlayer.tsx`                                      | Corregir la imagen inspeccionada sin cambiar el reloj ni la selección.                      |
| `timelineTransitionFrames.ts`, `useSceneTransitions.ts`, `EditorTransitionToggle.tsx`         | Adaptar la política a la UI y guardar la opción por el API existente.                       |
| `EditorTimeline.tsx`                                                                          | Dibujar indicadores que no bloquean selección o arrastre.                                   |
| `LibraryEditor.tsx`                                                                           | Montar el checkbox y reconocer renders anteriores a la política.                            |
| `public/locales/{es,en,pt}.json`                                                              | Textos del checkbox, aviso y accesibilidad en los tres idiomas.                             |
| `scripts/check-editor-transitions.mjs`                                                        | Comprobar píxeles, frames, audio, caché y persistencia con FFmpeg real.                     |
| `scripts/check-animation-{frontend,timing,packaged}.mjs`                                      | Regresión de selección y controles, duraciones y contrato del SEA entregado.                |
| Esta auditoría, ADR-0042 y regla de alcance en `CLAUDE.md`                                    | Registrar causa, decisión y prevención solicitadas.                                         |

## Superficies protegidas

- El manejador `selectSceneFromTimeline` conserva inicio + 0,05 s y su comportamiento de reproducción; no se compensa una opacidad incorrecta desplazando el cursor.
- `useEditorPlayback.ts`, `useLibraryEditor.ts`, `sceneAt.ts`, `timelineBlocks.ts` y `ClipPreviewVideo.tsx` no se modifican.
- No se cambian los handlers de arrastre, los límites de escenas, los recibos ni el bloqueo de tiempos con animación pagada.
- No cambian proveedores, tarifas, prompts, normalización, fórmulas de cámara, fases del pipeline, Rust, rutas ni dependencias.
- No se cambia el formulario ni los diálogos de animación; las comprobaciones anteriores de color, créditos y ventanas siguen ejecutándose.
- No se modifica el checkout protegido `dev` ni se publica la rama.

## Comprobación reproducible

Desde la rama de trabajo, después de `pnpm format`, `pnpm lint` y `pnpm build`:

```sh
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
node scripts/check-animation-frontend.mjs
node scripts/check-editor-transitions.mjs
node scripts/check-animation-timing.mjs
```

Después de compilar localmente, ejecutar el smoke contra los binarios dentro del paquete, no contra `pipeline/main.ts`:

```sh
node scripts/check-animation-packaged.mjs \
  --sidecar src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/vimo-pipeline \
  --ffmpeg src-tauri/target/release/bundle/macos/Vimo.app/Contents/MacOS/ffmpeg
```

La matriz de FFmpeg comprueba ambos estados del checkbox para las cuatro combinaciones de imagen/clip, límites entre chunks, clips exportados y una secuencia alternada de 450 cuadros. Verifica píxeles reales durante el fundido y después, además de ausencia de audio en los clips. El smoke preserva la narración del MP4 final y prueba persistencia mediante NDJSON.

Los recorridos UI usan componentes y hooks reales con servicios simulados y un MP4 local. Incluyen selección 4/5 con y sin render, pausa fuera del fundido, marcadores, preferencia, bloqueos de tiempos y los diálogos existentes. No consumen créditos ni permiten afirmar calidad de generaciones remotas. La aceptación sobre el proyecto específico del usuario queda diferenciada de estos escenarios reproducibles.

## Errores que no deben repetirse

1. Cambiar una función vecina durante una corrección sin necesidad demostrada ni autorización.
2. Usar un efecto de reproducción como estado de inspección y dejar dominante el recurso anterior.
3. Alterar cortes, velocidad o cursor para ocultar un problema de composición.
4. Cambiar la UI sin aplicar la misma preferencia al render y a los clips exportados.
5. Reutilizar renders o chunks cuya política visual ya no corresponde al proyecto.
6. Validar únicamente el código fuente o un build de desarrollo cuando se entrega una aplicación con sidecar empaquetado.
7. Añadir indicadores encima del timeline que capturen selección o arrastre.
8. Declarar la corrección terminada por compilar, sin reproducir primero el fallo y comprobar las funciones protegidas.

La causa general de composición pausada también se registra en `~/.claude/ERRORES-CONOCIDOS.md`, entrada `fundido-de-reproduccion-contamina-inspeccion-pausada`, compartida entre sesiones. La regla de alcance queda en `CLAUDE.md` y en este documento versionado.
