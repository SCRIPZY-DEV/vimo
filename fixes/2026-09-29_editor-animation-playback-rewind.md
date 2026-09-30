# Fix: evitar repetición de segundos en los clips del editor

- **Fecha:** 2026-09-29
- **Rama:** `feat/animation-scenes-dev-20260922`

## Causa

El preview comparaba el tiempo del clip con una muestra del cursor recibida por React. Si esa muestra se atrasaba o la narración esperaba datos mientras el clip avanzaba, la corrección de deriva asignaba un `currentTime` anterior. Esto repetía parte de la acción: en reproducción real de un MP4 de prueba se reprodujo un salto de 2,40 s a 1,21 s.

Además, `useEditorPlayback` retenía varios saltos pendientes de `canplay`. Un salto antiguo a 1 s podía ejecutarse después de otro a 2 s. La reproducción controlada confirmó escrituras `[2, 1]`; con el arreglo, únicamente `[2]`.

## Corrección

- El clip consulta directamente el reloj del medio principal durante reproducción. El cursor controlado conserva su función de inspección en pausa.
- Si la narración espera datos o busca una posición, el clip espera. Si se adelanta por deriva, espera al reloj sin rebobinar. Si queda atrasado, puede corregirse hacia adelante.
- Los saltos voluntarios hacia atrás siguen permitidos. Se conserva la normalización de velocidad existente, incluido 4/3 para ocupar 3 s con un archivo de 4 s.
- Un clip terminado mantiene su último cuadro: no se llama de nuevo a `play()` para reiniciarlo accidentalmente. No se relanza un seek correctivo mientras el anterior sigue decodificándose.
- Las promesas de reproducción comprueban que su efecto siga vigente. Un callback viejo no puede pausar la reproducción nueva del mismo elemento.
- Solo el último salto pendiente sigue autorizado. Se cancelan los anteriores y se comprueba elemento/fuente antes de aplicarlos; se limpian al cambiar de modo o desmontar.

## Límites deliberados

El cambio queda en cinco archivos del reproductor del editor. No modifica prompts, fragmentación, narración, duración de escenas, generación de animaciones, exportación, sidecar ni Rust. No requiere regenerar clips.

No puede impedir una espera real de disco o del decodificador; elimina los retrocesos producidos por estas rutas de sincronización. Tampoco corrige una repetición ya grabada dentro de un archivo de video por el proveedor.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
```

Los tres comandos pasaron. Se compiló la aplicación nativa con Node 22, `pnpm tauri build --bundles app --ci` y firma local ad-hoc. `codesign --verify --deep --strict` validó la app completa. No hubo publicación.

Comprobadores locales preservados fuera del repositorio en el vault, carpeta `Reportes/2026-09-29-editor-playback`:

- `node verify-pending-seeks.mjs`: 10 casos sobre el hook transpilado; antes pasaban 2, ahora pasan 10. Incluye evento encolado ya cancelado, nueva fuente, nuevo elemento, desmontaje, cambio de modo y seek voluntario.
- `node verify-clip-effects.mjs`: 10 casos sobre el componente transpilado con eventos/promesas controlados. Pausa, scrub, reanudación, final, rate 4/3, entrada a otro bloque, buffering, deriva, muestra React atrasada y resolución tardía de `play()`.

Son comprobaciones locales, no un framework oficial de tests. Requieren este worktree y sus dependencias; scripts y resultados no se incluyen en el commit.

## Pruebas manuales

Se ejecutaron mediante controles del navegador dos fixtures con los componentes reales:

1. Comparación del componente previo con el corregido usando un MP4 sintético de 6 s y un reloj controlado: espera de datos, muestra React atrasada y reloj lento. En los tres, la versión anterior retrocedió; la corregida tuvo cero retrocesos involuntarios y llegó al cuadro final de 5,96 s. El seek voluntario continúa permitido.
2. `EditorPreviewPlayer` completo, con audio WAV real de 14 s, dos clips reales de 6 s y una imagen estática final de 2 s. El audio terminó en 14 s; ambos clips llegaron a 5,96 s con cero cuadros hacia atrás. Los fundidos conservaron el último cuadro saliente.

Se midieron cuadros decodificados con `requestVideoFrameCallback`, además de asignaciones de `currentTime`. El servidor de prueba soporta respuestas 206 y rangos HTTP: un servidor estático sin rangos produjo artefactos de seek y fue descartado como evidencia de producto.

No se generaron videos pagados ni se modificaron proyectos del usuario. Falta la aceptación visual en la app nativa con el proyecto donde el usuario observó el síntoma.

## Comprobación de aceptación en Vimo

1. Cerrar la instancia anterior y abrir la app recién compilada.
2. Reproducir desde el inicio y desde mitad de un clip animado; verificar que no vuelva al segundo anterior.
3. Pausar, mover el cursor hacia atrás y reanudar varias veces. El salto debe ocurrir solo cuando se solicita.
4. Pasar de imagen a clip, de clip a clip y de clip a imagen, con los fundidos existentes.
5. Reproducir un clip agrupado de 6 s y uno individual corto; revisar que la narración y el final del proyecto conserven sus posiciones.
