# Demo v4: catálogo nuevo, animación a 720p, avatar de ejemplo y pack por partes

- **Fecha:** 2026-10-14
- **Rama:** `feat/demo-actualizacion`
- **Estado:** aprobada por el dueño el 2026-10-14, con el cambio del switch de avatar (sección 2); en ejecución
- **Extiende:** [ADR-0029](../../adr/ADR-0029-modo-demo-pipeline-simulado-sobre-pack-prehecho.md) (modo demo) y [ADR-0030](../../adr/ADR-0030-pack-v3-historias-short-y-narracion-precargada.md) (pack v3). Se registra como [ADR-0061](../../adr/ADR-0061-demo-v4-catalogo-animacion-avatar-y-pack-por-partes.md).
- **Formato y comportamiento finales:** los de la [ADR-0061](../../adr/ADR-0061-demo-v4-catalogo-animacion-avatar-y-pack-por-partes.md). Esta spec es el diseño aprobado y su §3 usa nombres que no son los publicados (`estilo.json`, `muestra-N.jpg` y `short { estilos[], gemas[] }` son `style.json`, `sample-N.jpg` e `historiasGema[]`).

## Objetivo

Los closers y mentores muestran Vimo en vivo con la demo. Hoy la demo trae un pack v3 de 319 MB con cuatro historias por formato, el catálogo viejo (tres estilos), videos de 80 s y 42 s, sin animación y sin avatar. Mientras tanto, la app real pasó al catálogo nuevo (38 estilos sobre el carril de Mi estilo), anima el primer minuto con Kie y suma un avatar presentador con HeyGen.

La demo v4 tiene que mostrar lo que la app hace hoy:

- Cada estilo del catálogo con su propia historia de 1 minuto, en 16:9 y en Short.
- El switch «Animar el primer minuto» funcionando, con clips a 720p.
- Un ejemplo de video con avatar presentador.
- Crear con el mismo aspecto que la app real en el carril de Mi estilo.

Las máquinas que ya tienen la demo bajan el contenido nuevo solas, la próxima vez que entran.

## Decisiones del dueño (2026-10-14)

| Tema                    | Decisión                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Estilos                 | Los 38 del catálogo, incluidos los tres que ya tenían historia (Realista, POV Stickman y Cartoon 2D), y la gema de Mi estilo: todo se rehace |
| Formatos                | 16:9 y Short (9:16), con guion distinto en cada formato                                                                                      |
| Duración                | 1 minuto por video                                                                                                                           |
| Animación               | El primer minuto: 10 clips de 6 s a 720p. Con el switch apagado, el mismo video sin animar                                                   |
| Calidad de imagen       | Baja, como el pack actual                                                                                                                    |
| Personajes              | Los 7 estilos con personaje fijo salen con su personaje; el resto, sin personaje                                                             |
| Avatar                  | Un ejemplo: el estilo «Jardinería» (Mi estilo) con el avatar «Jardineria», solo 16:9                                                         |
| Avatar: detalle         | Motor Avatar IV, look «Jardineria» (el principal), 5 apariciones de 5 s                                                                      |
| Distribución            | Un pack grande en partes que se baja una vez                                                                                                 |
| Descarga                | Sigue en segundo plano aunque se salga de la demo; si se corta, sigue desde la parte que faltaba                                             |
| Modelo de IA en la demo | Se muestra uno solo, el predeterminado                                                                                                       |
| Avatar en la demo       | El switch funciona y lleva a Jardinería; con el switch encendido, otro estilo vuelve a Jardinería con un aviso (sección 2)                   |
| Subtítulos              | Se quita la casilla en la demo                                                                                                               |
| 720p                    | Ajuste interno del pipeline que usa solo el generador del pack; los usuarios siguen en 480p                                                  |

## Forma

```
pack v4 (≈ 3,5–4 GB en ~8 partes de ~500 MB, release demo-pack-v4)
   │ la puerta /create-demo baja parte por parte, en segundo plano
   ▼
<raíz>/_demo-pack.tmp/  ── cada parte: SHA-256 ─► extraer ─► borrar el zip ─► marca de parte
   │ todas las partes listas: validar el pack entero ─► rename atómico ─► .ok v4
   ▼
<raíz>/_demo-pack/  ─► demo-status ─► Crear en demo (catálogo nuevo + Mi estilo)
   │ create-video-project { demo: true, animationMinutes?, customStyle }
   ▼
run-demo-pipeline: voice · transcription · scene-cuts · scene-prompts · images (+ avatar) · animation? · render
   (copia del pack: audio, palabras, escenas, imágenes, clips, avatar y el video animado o sin animar)
```

## 1. Contenido: 79 historias

| Formato | Historias                                   | Total  |
| ------- | ------------------------------------------- | ------ |
| 16:9    | 38 estilos del catálogo + gema + Jardinería | 40     |
| 9:16    | 38 estilos del catálogo + gema              | 39     |
|         |                                             | **79** |

Cada historia sale de un proyecto real del pipeline con estos ajustes:

- **Guion:** en español, de unos 61 s con la voz Abel (≈ 915 caracteres; Abel habla ≈ 15 caracteres por segundo, medido en el pack v3). Con 60 s o más el primer minuto da exactamente 10 clips; la cola de 1–2 s queda sin animar, como en la app.
- **Tono:** en 16:9, mini documental o relato; en Short, gancho en la primera frase. Los 7 estilos con personaje llevan historias con protagonista; el resto, guiones de tema (curiosidades, historia, ciencia, lugares) que no dependen de un protagonista que se repita.
- **Voz:** Abel, la misma voz de ElevenLabs del pack actual, generada por ai33 (`ai33`, `elevenlabs_452WrNT9o8dphaYW5YGU`): el 2026-10-14 el motor ElevenLabs de DubVoice fallaba con cualquier texto.
- **Imágenes:** EvoLink `gpt-image-2`, calidad baja (`1024x576_low`).
- **Prompts:** el modelo predeterminado (DeepSeek V4.1 Flash).
- **Carril:** el del catálogo nuevo y Mi estilo (`customStyle` con `catalogStyleId`; 3 s por escena).
- **Personaje:** modo `generic` en los 7 con personaje fijo (POV Stickman, 2D Stickman, 2D Personaje, Stickman Cinemático, 2D Básico Explicativo, 2D Mono y 2D Bola); modo `none` en los otros 31 y en Jardinería. La gema de Mi estilo va como está sembrada desde el v3 (`generic`: su prompt dibuja al narrador como protagonista); en la demo no muestra sección de personaje porque no tiene un personaje fijo por secciones.
- **Animación:** `animationMinutes: 1`, a 720p (sección 5).
- **Avatar (solo Jardinería):** avatar «Jardineria», look «Jardineria» (horizontal), motor `avatar_iv`, 5 apariciones de 5 s, empezando con el avatar (el valor por defecto de Crear).

Los títulos están en el [anexo A](#anexo-a-los-79-títulos). Los guiones completos se escriben en la primera tarea del plan y el dueño los aprueba antes de gastar.

El video sin animar sale del mismo proyecto: copia sin los clips y render local (ffmpeg, sin costo). Las imágenes y los cortes son los mismos, porque con 3 s por escena el corte del primer minuto coincide con el corte sin animar.

## 2. Crear en la demo

Lo que cambia cuando Crear abre con un manifest de demo:

- **Pestaña Catálogo:** siempre el catálogo nuevo (carril `catalog-gem`), aunque la cuenta no tenga el flag `newCatalog`. La galería muestra solo los estilos con historia en el formato elegido, en el orden del catálogo. La lista sale de `catalog-styles-list`, la misma de Crear: sincronizada o, sin red, las 38 empaquetadas.
- **Pestaña Mi estilo:** solo las gemas del pack (la de siempre y Jardinería), filtradas por formato: en Short no aparece Jardinería. Los estilos propios de la persona no se muestran en la demo.
- **Formato:** queda en «Próximamente» el formato en que la historia elegida no existe (con Jardinería y con el switch de avatar encendido, Short).
- **Cantidad de escenas y Confirmar escenas:** no se muestran (salen del carril, como en la app real).
- **Modelo de IA:** solo la tarjeta del modelo predeterminado, sin enlace a Ajustes. El bloqueo de modelos (ADR-0028) no aplica en la demo: nunca deshabilita Mi estilo.
- **Animación:** el switch funciona. Encendido, el payload lleva `animationMinutes: 1`. No muestra el aviso de clave de Kie ni la estimación de créditos.
- **Avatar** (pedido del dueño del 2026-10-14):
  - El switch funciona en cualquier estilo. Al encenderlo, la demo pasa a Mi estilo, elige Jardinería y queda en 16:9 (la única historia con avatar).
  - Con el switch encendido, elegir otro estilo (en Catálogo o en Mi estilo) no cambia la elección. Vuelve a Jardinería en Mi estilo y muestra el aviso «Usa este estilo para avatar o desactiva el switch para usar otro».
  - Con el switch encendido, Short queda en «Próximamente».
  - Al apagarlo, se puede elegir cualquier estilo.
  - Elegir Jardinería con el switch apagado lo enciende: su historia trae el avatar y no hay versión sin él.
  - La tarjeta muestra los datos del pack (nombre, vista del look, 5 × 5 s, Avatar IV), fijos. No lee la biblioteca de avatares de la persona, ni muestra costo, saldo, aviso de clave o enlace a Claves API.
- **Personajes:**
  - En los 7 estilos con personaje fijo: el chip «Personaje del estilo», sin poder cambiar el modo. En «Ver» no se ofrecen «Mi personaje» ni «Sin personaje».
  - En el resto: la sección de personajes no aparece (ni «Agregar personaje»).
- **Subtítulos:** la casilla «Agregar subtítulos al video» no se muestra.
- **Saldo:** la demo nunca consulta ni bloquea por saldo. Hoy, con animación encendida, una cuenta con poco saldo en Kie podría bloquear la demo.
- **Texto de la pestaña Catálogo:** «Los {{count}} estilos con demo lista.», con la cantidad del formato elegido.
- **Sin cambios:** nombre, guion y audio siguen a la historia; voz Abel; exportar automáticamente; sin música; el audio de «Subir mi audio» bloqueado (ADR-0030).

## 3. Pack v4 y descarga en segundo plano

### Formato

```
manifest.json                version "v4" · voz · estilos[] · gemas[] · short { estilos[], gemas[] }
gemas/<id>/                  estilo.json + muestra-N.jpg (+ avatar.jpg si la gema trae avatar)
<id>/                        historias 16:9: los 38 del catálogo, storytelling y jardineria
short/<id>/                  historias 9:16: los 38 del catálogo y storytelling
```

Cada carpeta de historia:

```
guion.txt · audio.mp3 · palabras.json · escenas.json
imagenes/imagen_<id>.jpg
animaciones/<clip>.mp4       clips del primer minuto (720p)
avatar/…                     solo en historias con avatar
video_final.mp4              sin animar
video_animado.mp4            animado
```

- **Manifest por historia:** `id`, `nombreSugerido`, `numEscenas`, `duracionAudioSeg`, `personaje` (`generic` o `none`), `animada` y, si corresponde, `avatar` (nombre, motor, apariciones, segundos por aparición y ruta de la vista). Las gemas llevan además su `styleId` de siembra (`demo-storytelling`, `demo-jardineria`).
- **`escenas.json`:** conserva los campos del v3 y suma, con su forma nativa, lo que el editor y la simulación necesitan: `animationRequestedSeconds`, `staticTransitionIn`, los bloques de `animations` y los datos de `avatar` de cada escena. Se quitan recibos, ids de tareas y URLs del proveedor (`task`, `attempts`, `videoUrl`).
- **Validación:** la manda el manifest. `validatePack` exige que cada historia listada esté completa: archivos, una imagen por escena, cada clip que nombra `escenas.json` y los dos videos. Desaparece la lista fija `DEMO_CATALOG_STYLES`.
- **ADR-0030:** la raíz deja de ser el formato v2 congelado. Se conserva la estructura por historia y el árbol hermano `short/`.
- **Siembra:** cada gema se siembra en `_styles/<styleId>/` solo si no existe, como hoy.

### Tamaño y partes

- **Recompresión:** el armador recomprime para el pack. Las imágenes van en JPEG de calidad 82 (una imagen de 2 MB queda en ≈ 0,4 MB). Clips y videos se recodifican con un CRF que no se note en la pantalla de la demo.
- **Peso:** ≈ 45 MB por historia, ≈ 3,5–4 GB en total. La cifra exacta sale al armar las primeras historias.
- **Partes:** zips sin compresión de ~500 MB, cada uno con historias enteras (nunca un archivo partido entre dos zips). La primera trae el manifest y las gemas. Ninguna parte pasa de 2 GB (límite de GitHub) ni de 4 GB (ZIP64).
- **Configuración:** `DEFAULT_PIPELINE_CONFIG.demo` pasa de `packUrl` y `packSha256` a `packParts: [{ url, sha256, bytes }]`, con `packVersion: 'v4'`. Versión y partes se cambian juntas.

### Descarga

- **Confirmación:** la puerta muestra el tamaño total y un botón «Descargar la demo» antes de empezar. Son varios GB y hoy la descarga arranca sola.
- **Orden de cada parte:** espacio libre, descarga por streaming con SHA-256, verificación, extracción a `_demo-pack.tmp/`, borrado del zip y una marca de parte con su SHA.
- **Al final:** se valida el pack entero, se reemplaza `_demo-pack/` con un rename atómico y se escribe `.ok` con la versión y los SHA de las partes.
- **Continuar donde quedó:** `_demo-pack.tmp/` guarda la versión y las marcas de parte. Se conserva entre intentos y entre sesiones de la app si la versión es la misma; si no, se borra. Si la app se cierra o se corta la red, al volver a entrar a la demo sigue con la primera parte sin marca. Lo que se pierde como mucho es la parte en curso.
- **Segundo plano:** el job vive en un store del módulo `videos` (como el de la tarea de creación). Salir de la puerta no lo cancela; volver muestra el avance. Mientras baja, el resto de la app se usa normal.
- **Avance:** un porcentaje total por bytes (partes terminadas más la parte en curso) y «parte X de N».
- **Espacio:** antes de cada parte se exige lo que falta extraer, más la parte más grande, más 500 MB de margen. Si no alcanza, error nuevo `demo_disk_full` con los GB necesarios.
- **Actualización:** una máquina con el v3 ve la demo como «no lista» por versión y la puerta ofrece bajar el v4. Mientras baja, la demo no se puede usar (ver Riesgos).

## 4. Simulación

`run-demo-pipeline` sigue sin tocar proveedores ni claves, y cada archivo se copia antes del evento que lo nombra.

- **Historia:** se elige por formato y por `customStyle.catalogStyleId` (catálogo) o por la gema de Mi estilo. Sin historia, falla con `demo_style_not_included` como hoy.
- **Fases:** las de la corrida real, en orden:
  - `voice`, `transcription`, `scene-cuts`, `scene-prompts` e `images`, como hoy.
  - `avatar` corre junto con `images` (como en la entrega 2h) solo si la historia trae avatar. Emite los eventos del avatar y copia sus archivos.
  - `animation` corre solo si el proyecto tiene `animationMinutes > 0` y la historia está animada. Primero emite `scenes-planned` con `animationEndSeconds`. Después, por clip y en tandas de 10: `scene-animation-started`, `scene-animation-progress` con porcentaje y `scene-animation-ready` con su vista, tras copiar el clip a `animations/`.
  - Una fase que no aplica emite `stage-skipped`, como el corredor real.
  - `render` copia `video_animado.mp4` o `video_final.mp4` según el switch.
- **Duración:** ≈ 40 s sin animación (como hoy) y ≈ 55 s con animación.
- **`project.json`:**
  - `completedStages` como en una corrida real.
  - `renderTransitionVersion: 1` y `videoOutdated: false`, así el editor reproduce el video final. Hoy el editor de un proyecto demo lo da por desactualizado y simula la vista previa; es un arreglo con su informe en `docs/fixes/`.
  - Con Jardinería, los datos del avatar que el editor necesita para mostrar las apariciones.
- **Editor:** muestra las escenas animadas y las apariciones del avatar. Regenerar, animar y las acciones del avatar siguen bloqueadas en la demo.
- **Payload de la demo:** `create-video-project` acepta `animationMinutes` junto con `demo: true`. `options.avatar` sigue rechazado: el avatar de Jardinería lo pone la simulación desde el pack (en la demo, switch de avatar encendido equivale a Jardinería).

## 5. Animación a 720p (ajuste interno)

- **Ajuste nuevo:** `animation.resolution` en `PipelineConfig`, con `'480p'` por defecto. Solo lo cambia el harness por el `config` del job, igual que `demo.delayScale`; Rust nunca lo manda.
- **Dónde actúa:** en el pedido a Kie, en el hash y el recibo del pedido, y en el cuadro de normalización (854×480 → 1280×720; vertical, al revés).
- **Lo que no cambia:** las estimaciones de la app siguen en 480p porque los usuarios no cambian de resolución, y PoYo y el resto del pipeline quedan intactos.
- **Tarifas:** las del tarifario público de Kie consultado el 2026-10-14. Grok 1.5 cuesta 4,5 créditos/s a 720p (27 por clip de 6 s) y Seedance 1.5 Pro sin audio, 3,5 créditos/s.

## 6. Producción, con compuertas

1. **Catálogo:** se lee el catálogo en vivo (solo lectura) y se fija la lista de 38. Si cambió desde el 2026-10-08, se ajusta el anexo A con el dueño.
2. **Guiones:** se escriben los 79 y el dueño los aprueba.
3. **Saldos:** se leen los de Kie, EvoLink, DubVoice y HeyGen (macOS pide permiso para leer el llavero) y se comparan con la sección 7. El dueño recarga.
4. **Muestras de Jardinería:** se verifica que las de la gema las haya generado Vimo; si no, se regeneran en calidad baja.
5. **Generación:**
   - Un runner local fuera del repo (scratchpad) arma los proyectos con el sidecar real, en una raíz aparte, `~/Documents/Vimo-demo-v4/`, para no mezclarlos con la biblioteca del dueño.
   - Corren 3–4 proyectos a la vez, con 720p por el `config` del job.
   - Las claves se leen del llavero en memoria; nunca se escriben en archivos.
   - Lanza el sidecar con `spawn` y stdin abierto (entrada `spawnsync-con-input-cierra-stdin…` de errores conocidos).
6. **Revisión:** una hoja de contactos por video. Se rehacen las imágenes o los clips que salgan mal, dentro del margen del presupuesto.
7. **Variante sin animar:** copia de cada proyecto sin clips y render local.
8. **Pack:** `pnpm build:demo-pack` arma las partes e imprime los SHA y los tamaños.
9. **Prueba local:** instalación desde un servidor local en una raíz limpia y en otra con el v3 instalado, con un corte a mitad para comprobar que sigue.
10. **Release:** se publica `demo-pack-v4` en `otd20071-cloud/vimo-releases`, con el sí del dueño en el momento.
11. **Configuración:** se actualiza `packParts` y se repite la instalación contra la URL publicada.
12. **PR:** push y PR abierto contra `dev`, con el sí del dueño en el momento.

## 7. Presupuesto

79 videos. Los totales están inflados ~30–50 % por si hay que regenerar.

| Proveedor                | Por video                    | Consumo estimado      | Recarga sugerida  |
| ------------------------ | ---------------------------- | --------------------- | ----------------- |
| Kie.ai (animación 720p)  | 270 cr (Jardinería ≈ 160 cr) | ≈ 21.200 cr ≈ USD 106 | 28.000 cr         |
| EvoLink (imágenes)       | ≈ 7,6 cr                     | ≈ 600 cr ≈ USD 9      | 1.000 cr ≈ USD 15 |
| DubVoice (voz)           | ≈ 950 créditos               | ≈ 75.000 créditos     | 110.000 créditos  |
| DeepInfra (prompts)      | ≈ USD 0,07                   | ≈ USD 5,50            | USD 10            |
| HeyGen (avatar)          | 25 s con Avatar IV (foto)    | ≈ USD 0,96            | USD 5             |
| Deepgram (transcripción) | 1 min                        | ≈ USD 0,35            | USD 2             |

- Kie solo cobra las tareas exitosas (1 crédito = USD 0,005).
- El crédito de EvoLink vale ≈ USD 0,0148 (medido el 2026-09-08). Se usan 0,38 cr por imagen, la medición con prompts largos, en vez de los 0,24 de la tabla del código.
- El render es local y no cuesta.

## 8. Verificación

- **`pnpm check:demo`** se amplía con secciones nuevas sobre un pack mínimo v4 de dos partes:
  1. Instalación por partes: SHA por parte, marcas, `.ok` con todas las partes y rename atómico.
  2. Continuar tras cortar a mitad de una parte (no vuelve a bajar las terminadas) y tras cambiar de versión (se borra lo viejo).
  3. `demo_disk_full` con un espacio libre simulado.
  4. Una historia del catálogo nuevo elegida por `catalogStyleId`.
  5. Con `animationMinutes: 1`: la fase `animation`, cada clip copiado antes de su `scene-animation-ready` y el video animado.
  6. Sin animación: `stage-skipped` de `animation` y el video sin animar.
  7. Jardinería: la fase `avatar` junto a `images`, sus archivos y sus eventos.
  8. `renderTransitionVersion: 1`.
  9. El armador produce partes que `demo-prepare` instala.
- **Guards de UI de Crear en demo:** siguiendo los existentes en `scripts/test/`, con la regla de ver fallar cada caso sin el cambio:
  1. Catálogo nuevo filtrado.
  2. Mi estilo con solo las gemas del pack.
  3. Un solo modelo de IA.
  4. El switch de avatar lleva a Jardinería y, encendido, devuelve ahí con el aviso al elegir otro estilo.
  5. Personajes según la historia.
  6. Sin subtítulos.
  7. Sin bloqueo por saldo.
  8. La animación en el payload.
- **Animación a 720p:** un guard con un proveedor simulado comprueba el pedido y el cuadro de normalización con `animation.resolution: '720p'`, y que sin el ajuste todo siga en 480p.
- **De siempre:** `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm check:locales` y `pnpm build:sidecar`. Rust no se toca.
- **Checklist manual con la app compilada:**
  1. La puerta ofrece el v4 con su tamaño.
  2. Salir y volver muestra el avance.
  3. Cerrar la app a mitad y volver sigue desde la parte que faltaba.
  4. Crear muestra los 38 estilos y las dos gemas.
  5. Con la animación, la fase de animación y el video animado.
  6. El switch de avatar: lleva a Jardinería, devuelve ahí con el aviso y el video sale con el avatar.
  7. El editor reproduce el video final y muestra los clips.

## 9. Documentación y entrega

- **ADR-0061:** pack v4, descarga por partes en segundo plano, Crear en demo sobre el catálogo nuevo, animación y avatar en la simulación, y 720p interno. Enmienda la regla 1 de ADR-0030 y el «fuera de alcance» de ADR-0029 sobre la descarga en segundo plano.
- **Documentos que cambian:** la sección de la demo en `docs/ARCHITECTURE.md`, y los catálogos `es`, `en` y `pt` con las mismas claves.
- **Informe:** `docs/fixes/` lleva el del editor de la demo (`renderTransitionVersion`).
- **Commits:** locales y agrupados por cambio coherente, con el repo verde en cada uno. Push, release y PR, solo con el sí del dueño en el momento.

## 10. Fuera de alcance

- **Seedance:** Kie anuncia el fin de Seedance 1.5 Pro el 2026-11-11, y es el modelo de respaldo de la animación en la app. Se ve aparte.
- **720p para usuarios:** ofrecer el 720p como opción de la app.
- **Descarga por estilo bajo demanda:** se descartó en favor del pack en partes.
- **Seguir usando el v3 mientras baja el v4.**
- **Otros huecos conocidos de la demo:** el menú de las gemas del pack (editarlas y generar sus muestras) y la música del editor siguen alcanzables; «Crear estilo» y «Crear estilo con IA» quedan ocultos en Crear (ADR-0061).

## 11. Riesgos

- **Descarga pesada:** 3,5–4 GB por máquina. A 50 Mbps son unos 10 minutos y a 10 Mbps, cerca de una hora; la pantalla lo avisa antes de empezar.
- **Demo sin uso durante la actualización:** con el v3 instalado, la demo no se puede usar hasta que termina el v4. Se acepta para no mantener dos formatos.
- **Moderación de Kie:** puede rechazar clips en los estilos de terror. Los guiones evitan lo gráfico; si Grok falla, la app pasa a Seedance (disponible hasta el 2026-11-11, la generación es antes).
- **Catálogo vivo:** si un admin borra un estilo después de generar, desaparece de la demo; si lo edita, la demo muestra la tarjeta nueva con la historia generada antes.
- **Pack público:** el release es público e incluye el video con el avatar «Jardineria» del dueño, que pidió usarlo.

## Anexo A: los 79 títulos

Los 7 estilos con personaje fijo van marcados con ★.

| Estilo                  | 16:9                                                | Short                                                    |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| Realista                | El viaje de una gota de agua                        | ¿Por qué el mar es salado?                               |
| POV Stickman ★          | Un día en la antigua Roma                           | Tu primer día como pirata                                |
| Cartoon 2D              | Cinco animales con superpoderes reales              | ¿Por qué los gatos ronronean?                            |
| Fantasía mágica         | La leyenda de la isla perdida de Atlántida          | Tres criaturas mágicas de las leyendas del mundo         |
| Terror                  | El pueblo que desapareció en una sola noche         | Lo que nunca debes hacer si oyes tu nombre en el bosque  |
| Infográfico Amarillo    | Cómo funciona el interés compuesto                  | La regla 50-30-20 para ordenar tu dinero                 |
| 2D Stickman ★           | El día que intenté despertarme a las 5 de la mañana | Una semana sin celular                                   |
| 2D Personaje ★          | Qué le pasa a tu cuerpo si no duermes               | Por qué dejamos todo para mañana                         |
| Stickman Cinemático ★   | La expedición al pico más alto del mundo            | Perdido en el desierto: cómo sobrevivir tres días        |
| 3D Relatos              | El pueblo donde nunca dejaba de nevar               | El reloj que daba la hora equivocada                     |
| 2D Básico Explicativo ★ | Cómo funciona internet                              | ¿Por qué bostezamos?                                     |
| 2D Mono ★               | El mono que quiso hacerse rico en una semana        | Tres cosas que todos hacemos mal los lunes               |
| 2D Storytime            | Cómo nació la pizza                                 | El microondas: un invento que nació por accidente        |
| 2D Cavernícola          | Cómo vivían los primeros humanos                    | ¿Quién descubrió el fuego?                               |
| 2D Crayón               | Pequeños hábitos que cambian tu día                 | ¿Por qué el cielo es azul?                               |
| 2D Bola ★               | Qué pasa en tu cerebro cuando aprendes algo nuevo   | El truco de los dos minutos contra la pereza             |
| 2D Personaje Pro        | Cinco oficios que ya no existen                     | El despertador humano: el oficio más raro de la historia |
| Abstracto Rojo          | Qué es la ansiedad y cómo afecta tu mente           | Lo que el miedo le hace a tu cuerpo                      |
| Realista Personaje      | Los oficios que despiertan a una ciudad             | Del grano a la taza: el viaje del café                   |
| Realista Documental     | La ruta del cacao: de la selva al chocolate         | Un mercado que flota sobre el agua                       |
| 2D Asiático             | La leyenda del hilo rojo del destino                | La ceremonia del té en un minuto                         |
| 2D Cómic Vintage        | El robo perfecto que falló por un detalle           | La huella que resolvió el caso                           |
| Místico                 | Los alquimistas y la piedra filosofal               | El significado oculto de los cuatro elementos            |
| Anime Storytime         | El festival de las mil linternas                    | Cinco costumbres de Japón que te sorprenderán            |
| Pixel Retro             | La historia de los videojuegos en un minuto         | El primer videojuego de la historia                      |
| Noir Detective          | El caso del collar desaparecido                     | Tres pistas que delatan a un mentiroso                   |
| Claymation              | Cómo se hace el pan, del trigo al horno             | Cómo construyen su casa los castores                     |
| Papercraft              | La vuelta al mundo en siete maravillas              | Cómo se forma un arcoíris                                |
| Cyberpunk Neón          | Cómo serán las ciudades en 2080                     | Cinco inventos de ciencia ficción que ya existen         |
| Caricatura Editorial    | Breve historia de la burocracia                     | Las excusas más usadas para llegar tarde                 |
| Documental Oscuro       | El misterio del barco que navegaba sin tripulación  | La isla a la que nadie puede ir                          |
| Cosmos                  | El viaje de la luz del Sol hasta la Tierra          | ¿Qué pasaría si cayeras en un agujero negro?             |
| Infografía Azul         | Cómo se mueve el dinero en el mundo                 | Tres datos del agua que no conocías                      |
| Blueprint Técnico       | Cómo se construye un rascacielos                    | Cómo funciona un motor de avión                          |
| Collage Retro           | Los inventos de los años 50 que cambiaron el hogar  | La historia del primer anuncio de televisión             |
| Terror Analógico        | La cinta encontrada en el sótano                    | La emisora que solo transmitía a las 3 de la mañana      |
| Naturaleza Épica        | La gran migración del Serengueti                    | El ave más rápida del planeta                            |
| Mapa Histórico          | La Ruta de la Seda: el camino que unió dos mundos   | La primera vuelta al mundo en un minuto                  |
| Gema (Mi estilo)        | La carta que tardó cincuenta años en llegar         | La llave que nadie sabía abrir                           |
| Jardinería (Mi estilo)  | Cómo empezar tu huerta en casa (con avatar)         | —                                                        |
