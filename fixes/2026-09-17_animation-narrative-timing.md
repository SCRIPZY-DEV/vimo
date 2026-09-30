# Fix: coherencia narrativa de animaciones con el reloj de la voz

- **Fecha:** 2026-09-17
- **Rama:** feat/animation-scenes

## Causa

En el proyecto real `video-3.3.3`, la escena 3 ocupa de 10 a 15 segundos. La voz termina la idea del saco a los 11,68 s y pasa a las toallas y el agua flotando. El redactor recibía el texto completo del intervalo, pero sin tiempos por palabra, y exigía una acción principal para toda la escena. Eligió el saco como protagonista durante los cinco segundos e inventó un ocupante moviéndose dentro, ausente del prompt estático y de la bolsa de la imagen original. El prompt anterior recibido al rehacer reforzaba esa interpretación.

La revisión de los archivos actuales **no reprodujo un desplazamiento acumulado de las escenas o la narración**. Los tres clips activos duran exactamente 5 s, tienen 125 cuadros a 25 FPS y carecen de audio. Los 15 intervalos coinciden en el editor y el render con y sin animación. Un render temporal de los primeros 25 s produce 625 cuadros; quince comparaciones de cuadros decodificados confirman la colocación de las escenas. No existe una copia anterior a la animación que permita reconstruir cada acción histórica del usuario. La lectura del ciclo de reproducción confirmó que iniciar/finalizar esta animación no escribe `currentTime` ni hace `seekTo`: en este borrador permanece el mismo audio, y el clip silenciado sigue su cursor. La aceptación nativa WebKit sigue pendiente.

## Corrección

Se acota al redactor de animaciones: usar los tiempos de `words.json` dentro del intervalo encargado, trasladados al reloj del clip generado. El guion completo y las escenas vecinas conservan su función de contexto, mientras que la narración local ordena las acciones. La imagen estática determina las personas y objetos que pueden animarse. Una cola de frase anterior no debe repetirse durante toda la escena ni autorizar actores nuevos.

`pipeline/animation/narration.ts` valida las palabras y conserva solamente las que solapan el intervalo; ajusta sus marcas a la velocidad real. La cola con palabras de duración cero se omite sin perder la alineación del resto. `generate.ts` entrega ese contexto al redactor mediante objetos nuevos, sin modificar `scenes.json` ni su transcripción.

`prompt.ts` entrega identidades por segmento, en lugar del catálogo global de personajes. Una actividad humana narrada puede ilustrarse mediante los objetos y fenómenos presentes; no requiere inventar quien los usa. Las personas incidentales se conservan y una lista de personajes vacía no autoriza a eliminarlas.

Antes de comprar video, una llamada textual separada revisa el candidato contra imagen y voz locales. Si rechaza, devuelve correcciones para un segundo candidato y otra revisión. Una revisión inválida o dos candidatos no aprobados terminan con `animation_prompt_failed`, manteniendo el recurso anterior. El límite es dos redacciones y dos revisiones, con el tier existente, sin visión ni nuevos estados del pipeline. La revisión se limita a contradicciones concretas de reparto, inventario, idea y tiempos. El inventario define qué existe, no obliga a congelarlo: se permite movimiento natural sin exigir que la imagen estática describa cada fuerza. Una variante inicial demasiado estricta rechazaba incluso ondulaciones de tela y gotas; ese criterio se reemplazó, no se dejó como regla adicional contradictoria.

El prompt anterior se conserva en el historial de datos pagados, pero su contenido **ya no se envía al redactor**. Rehacer utiliza solamente una indicación de nueva versión y reconstruye la acción desde las fuentes actuales; se mantienen los mismos intervalos y segundos solicitados.

## Límites deliberados

- No se modifican los cortes, la voz, los prompts de imágenes estáticas, la generación de guiones, las previews de estilos ni la UI del editor.
- Se conserva DeepSeek V3.2, el transporte, la cola, los recibos y la normalización existentes.
- No se reescriben ni se borran los clips pagados del proyecto. Una corrección de redacción se aplica a animaciones nuevas o al pulsar **Rehacer clip**.
- Sin visión automática: el contenido visual se basa en el prompt estático. Las personas incidentales ya presentes en la imagen se conservan; no se confunde ausencia de personajes de catálogo con ausencia de extras.
- Los tiempos del prompt son instrucciones al generador, no una garantía audiovisual por fotograma. La aceptación de un MP4 nuevo requiere verlo con la voz.

## Validación reproducible

Auditoría local, sin llamadas a Kie ni escritura en el proyecto original:

```sh
node /private/tmp/check-vimo-real-project-timing.mjs
node /private/tmp/check-vimo-real-boundary-frames.mjs
```

Estas comprobaciones temporales leen el proyecto real y ejecutan las funciones de producción del planificador, timeline y render. No se incorporan como tests oficiales. Evidencia de tiempos: `/private/tmp/vimo-real-project-timing/verification.json`.

Comprobaciones específicas locales (fuera del repositorio): 41 de tiempos/reparto, 26 de revisión, 39 del proveedor, 22 del servicio, 9 independientes del protocolo y 2 de rechazo antes de Kie. HTTP simulado y FFmpeg real; las dos últimas comprueban que el clip pagado, sus bytes y los límites de escenas permanecen intactos al rechazar. Los fixtures antiguos que presuponían una única llamada LLM o el catálogo global se adaptaron en copias temporales, no en scripts oficiales.

Formato, lint, build, TypeScript del pipeline y paridad de 1.347 claves ES/EN/PT aprobados. La comprobación del sidecar empaquetado ejercita 30 casos, incluidos recibos, exclusión concurrente y normalización muda. No equivale a aceptación visual en WebKit.

La revisión semántica también se probó con DeepSeek real y el guion, imagen descrita y palabras del proyecto. Se conservaron todos los intentos, incluidos los fallidos: instrucciones iniciales y filtro de fichas no bastaban para impedir manos u ocupantes inventados. Algunas revisiones aprobaron afirmaciones de plano vacío no respaldadas por la fuente, y una variante demasiado estricta rechazó movimiento ambiental válido. Se corrigieron ambos criterios; no se contabilizan esas aprobaciones anteriores como calidad satisfactoria.

La comprobación final ejecutó los caminos de nueva animación y remake completos, dos llamadas cada uno. Ambos textos ordenan saco/toallas/agua con sus tiempos, conservan anclajes y extras y no añaden ocupantes ni declaran vacía la escena. El remake aún propone detalles secundarios como condensación y partículas que no están descritos literalmente en la referencia: no se presenta como fidelidad visual certificada. Las cuatro llamadas reportaron USD 0,00262064 en esa tanda; no incluye intentos anteriores ni video. Son dos muestras, no una medición de tasa de éxito ni una garantía de calidad general.

Una prueba anterior de fusión terminó sin respuesta registrada en dos llamadas con plazo de 55 s; no se cuenta como validación semántica satisfactoria. El sondeo final usa 120 s y no cambia el timeout del producto. La alineación de fusiones/velocidad se comprueba localmente; falta aceptación audiovisual de una fusión nueva.

Evidencia persistente fuera del repositorio: vault VIMO-TAURI, `Reportes/2026-09-17-animation-narrative-coherence/`, con resultados de timing, transcripciones de las llamadas reales (sin credenciales), intentos descartados y verificación del artefacto. SHA-256 del sidecar empaquetado: `85dd4b11cfd3867b19d6a20dad684e33431bad6e3c3c6bf2e2eac2083af59cd5`. El ejecutable nativo y el asset del editor mantienen su hash anterior; solo cambió el sidecar de animaciones.

## Pruebas manuales

Se inspeccionaron la imagen original de la escena 3 y los cuadros del clip a 0, 2 y 4 segundos: la bolsa inicial contiene toallas, y el video introduce después una persona con casco. También se compararon el prompt guardado y la transcripción con marcas temporales. Aún no se ha comprado ni revisado un nuevo video generado con la corrección, ni se ha certificado reproducción nativa en WebKit o Windows.

## Compilación y aceptación local

```sh
cd /Users/sebas/Documents/VIMO-TAURI/.claude/worktrees/feat+vimo-character-modal-improvements
PATH="/Users/sebas/node-v22.23.2-darwin-arm64/bin:$PATH" pnpm tauri build --bundles app
open src-tauri/target/release/bundle/macos/Vimo.app
```

Usar esta rama, no el checkout raíz en `dev`. Cerrar antes otra instancia de Vimo para abrir el binario recién compilado. En `video-3.3.3`, seleccionar escena 3 y **Rehacer clip**; revisar de 10 a 15 s con voz. El saco no debe protagonizar toda la secuencia ni aparecer una persona nueva dentro; al hablar del agua, las esferas deben ser el foco. Revisar también los cortes 5, 10, 15 y 20 s. La comprobación no compra videos automáticamente ni altera el proyecto original.
