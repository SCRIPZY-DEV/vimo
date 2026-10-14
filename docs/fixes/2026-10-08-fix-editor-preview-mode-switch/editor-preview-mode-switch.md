# Fix: el visor del editor al cambiar entre el mp4 y la simulación

- 📅 **Fecha:** 2026-10-08
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Commits:** `cd76d012` (atajos), `d2f35fe9` (cambio de modo) y `95b10ccd` (grafo de ganancia),
  con un ajuste posterior en `f22d8696`. El mismo día, a pedido del dueño, el cambio de modo pasó a
  continuar la reproducción en vez de frenarla (ver «Continuidad al cambiar de modo») en `cde8069d`,
  con un ajuste tras la revisión en `00b83fc3`.
- **Área:** módulo `videos` (visor y atajos del editor) y `common` (`useAudioGain`).
- **Relacionado:** [ADR-0056](../../adr/ADR-0056-layout-propio-del-editor-a-pantalla-completa.md) y
  la §5.2 y la §5.4 del [diseño](../../handoff/2026-10-07-ai-editor/design.md).

## Causa

El visor del editor (`EditorPreviewPlayer`) tiene dos modos. Con un render vigente reproduce el mp4.
Si no, simula: la imagen de la escena bajo el cursor más dos `<audio>`, la narración y la música en
bucle, cuyos volúmenes imitan la mezcla con un gain de Web Audio (`useAudioGain`). Cada modo monta sus
propios medios: pasar de uno al otro desmonta el `<video>` o los `<audio>` y monta elementos nuevos,
pausados y en 0.

Hasta esta rama, el modo cambiaba solo cuando terminaba un render o el video quedaba desactualizado
con el editor abierto. Las cabeceras de pista lo vuelven cosa de un clic: con render vigente, silenciar
una pista pasa el visor a simulación, porque el mp4 trae la mezcla hecha y no se puede silenciar una
sola de sus pistas. Eso destapó dos defectos que `dev` ya tenía. Además, el asa de las cabeceras
chocaba con los atajos de teclado del editor.

1. **La reproducción quedaba «reproduciendo» y volvía a 0** (ya pasaba en `dev`). React no entrega el
   `pause` de un medio que ya desmontó, así que `playing` seguía en `true` mientras el elemento nuevo
   estaba pausado en 0. El botón mostraba pausa, no sonaba nada y el cursor quedaba congelado. El
   próximo play arrancaba el medio nuevo desde 0, y la guarda de los seeks (`lastSeekRef`) dejaba el
   cursor quieto hasta que el medio pasara el último seek.
2. **La mezcla dejaba de aplicarse tras ir y volver entre modos** (ya pasaba en `dev`). `useAudioGain`
   armaba el grafo (`AudioContext` → `createMediaElementSource(audio)` → `GainNode`) una sola vez, con
   el `<audio>` del primer play. `resume()` salía temprano si ya había grafo y el efecto de volumen
   solo tocaba ese gain. El `<audio>` nuevo nunca entraba: sonaba directo a la salida con `volume` 1.
   Una pista silenciada se oía a volumen pleno y los volúmenes del diálogo de Audio no hacían nada.
3. **Los atajos del editor chocaban con el asa de las pistas** (nuevo en esta rama). El `KeyboardSensor`
   de dnd-kit consume el espacio, Enter, Tab, Esc y las flechas con `preventDefault`, nunca con
   `stopPropagation`. `useEditorShortcuts` escucha en `window` y solo filtraba campos de texto, y el asa
   es un `<button>`. Levantar y soltar una pista con el espacio ponía play y después pausa, y Esc
   cancelaba el arrastre y además deseleccionaba la escena.

## Corrección

Las líneas citadas son las del árbol después de `f22d8696`.

### `cd76d012`: los atajos ignoran lo que otro control ya atendió

- `src/modules/videos/hooks/useEditorShortcuts.ts:37-40`: la primera guarda del handler es
  `if (event.defaultPrevented) return`, con su comentario. El docstring (`:19-23`) suma la condición.
- En el mismo commit, `src/modules/videos/views/LibraryEditor/LibraryEditor.tsx`: con una pista
  silenciada el visor recibe `videoSrc` en null y simula (la regla de la §5.2 del diseño).

### `d2f35fe9`: el cambio de modo frena la reproducción y deja el maestro en el cursor

> Desde el 2026-10-08 el cambio de modo ya no frena: si se venía reproduciendo, sigue desde el cursor
> (ver «Continuidad al cambiar de modo», abajo). Lo que sigue describe el arreglo base, que se mantiene.

En `src/modules/videos/hooks/useEditorPlayback.ts`:

- `:62-63` y `:73-81`: el estado `playingMode` y un ajuste durante el render. Si cambió `videoMode`,
  `playing` vuelve a false en el mismo render, sin `setState` dentro de un efecto.
- `:69-71`: `settledModeRef` distingue el montaje de un cambio de modo.
- `:28-35`: `isMediaReady`, la guarda de los seeks, extraída sin cambios.
- `:210-226`: `alignMusicToCursor` y `settleNewMode` (`useEffectEvent`). El maestro nuevo va al cursor
  con el `seekTo` de siempre (guarda de `readyState`, nunca `load()`), y la música recién montada se
  alinea al cursor en su primer `canplay`.
- `:241-253`: el efecto sobre `[videoMode]`. En un cambio real llama a `settleNewMode`, y su limpieza
  pausa los medios que se van.

Además, `src/modules/videos/components/EditorPreviewPlayer.tsx:80` le pasa al hook el `cursorSeconds`
que ya recibía, sin props nuevas.

### `95b10ccd`: el gain sigue al `<audio>` actual

En `src/modules/common/hooks/useAudioGain.ts`:

- `:5-11`: el grafo guarda `element` y `source`.
- `:24-40`: `bindElement(graph, audio)`. Si el elemento es otro, crea su nodo en el mismo contexto y lo
  conecta al mismo gain. Recién entonces desconecta el nodo anterior y pone `audio.volume = 1`.
- `:56-74`: el efecto de volumen conecta el elemento actual antes de fijar el nivel. Sin grafo, el
  nivel va al elemento actual.
- `:86-109`: `resume()`, que corre en cada play, conecta el elemento actual o arma el grafo la primera
  vez.

### Ajuste posterior: `f22d8696`, la ola final de la revisión de la rama

- La limpieza del cambio de modo pausa la foto de medios del último commit
  (`useEditorPlayback.ts:228-239`) en vez de la lista tomada al entrar al modo, así que también pausa
  una música montada después. Leer los refs en la limpieza no sirve, porque React ya los repuntó a
  los medios del modo nuevo (medido abajo).
- Silenciar una pista sin fuente ya no cambia el modo. Cuando el silencio sí fuerza la simulación, la
  insignia dice «Simulación: hay una pista silenciada» (`LibraryEditor.tsx:252-261` y `:416-417`,
  `EditorPreviewPlayer.tsx:149-157`).

### Continuidad al cambiar de modo (2026-10-08, pedido del dueño)

Agregado el 2026-10-08 a pedido del dueño: «si en una pista se quita el audio, como en VidRush, debe
seguir reproduciendo pero sin que se sienta el sonido de esa pista». Con `d2f35fe9`, silenciar una
pista con el mp4 sonando pasaba el visor a simulación y la reproducción quedaba frenada: había que
volver a darle play. Ahora, en cualquier cambio de modo (silenciar o quitar el silencio, terminar un
render, quedar desactualizado), si estaba reproduciendo sigue reproduciendo desde el cursor, con la
pista silenciada muda; si estaba en pausa, queda en pausa en el cursor, como antes.

Las líneas son las del árbol de `cde8069d`, en `src/modules/videos/hooks/useEditorPlayback.ts`:

- `:64-67`: el estado `resumeAfterSwitch`, si se venía reproduciendo cuando cambió el modo.
- `:89-93`: el mismo ajuste durante el render que pone `playing` en false hace antes
  `setResumeAfterSwitch(playing)`. Tiene que ser estado: un ref no se escribe en el render
  (`react-hooks/refs`), y en el efecto ya es tarde, porque `playing` ya es false y, fuera de un clic,
  el navegador puede haber pausado el medio desmontado.
- `:76-80`: `resumePendingRef`, la reproducción que espera a que el maestro nuevo quede en el cursor.
- `:242-247` (`settleNewMode`): si se venía reproduciendo, marca la reanudación pendiente antes del
  `seekTo(cursorSeconds)` de siempre.
- `:192-206` (`seekTo`): la aplicación del seek (la misma guarda de `readyState` y el mismo `canplay`
  de `applyWhenReady`, nunca `load()`) pone `currentTime` y recién después, si hay una reanudación
  pendiente, llama a `play()`. El maestro nunca arranca en 0 para saltar al cursor.
- `:172-190` (`play` y `pause`, ahora arriba de `seekTo`, que los usa): un play o una pausa de la
  persona reemplazan la reanudación pendiente. `play()` sigue llamando a `resume()` de los dos gains
  antes de reproducir, que conecta el `<audio>` remontado, y ahora atrapa el rechazo del play del
  maestro: sin un gesto de la persona (un render que termina) la política de autoplay puede rechazarlo,
  y entonces el medio queda en pausa en el cursor, con `playing` en false y sin una promesa rechazada
  sin manejar.

La reanudación pendiente vive en un ref, no atada a un seek, por dos casos que se miden abajo: dos
clics seguidos en silenciar antes de que cargue el maestro nuevo (el segundo cambio llega con
`playing` ya en false, y la intención pasa al modo siguiente) y un seek en esa ventana (sigue desde el
punto nuevo). Si el visor se desmonta en esa ventana, el seek pendiente se cancela y no arranca nada.
No cambian la limpieza que pausa los medios que se van, `videoMode`, `previewMix`, la insignia ni
`useAudioGain`.

Tras la revisión, `00b83fc3` (`useEditorPlayback.ts:162-175` en su árbol): si el maestro cambia de
elemento o de fuente antes de quedar listo, el seek pendiente se descarta y la reanudación también. Si
quedara armada, un seek posterior (J/L, Inicio/Fin, elegir una escena) arrancaría la reproducción sin
que nadie la pidiera.

## Límites deliberados

- **WebKit no lo midieron los agentes.** Los arneses corrieron en Chrome 154 (Blink), y la app en
  macOS usa WKWebView. Las llamadas son las mismas que el primer enlace del grafo ya hacía ahí
  (`createMediaElementSource`, `connect`), más `disconnect()` sin argumentos. Lo cubre la QA del dueño
  en macOS. WebView2 (Windows) es Chromium.
- **Fast Refresh, solo en desarrollo, sigue igual.** Con Vite, Fast Refresh vuelve a correr la
  limpieza de `useAudioGain`, que cierra el contexto, con el mismo `<audio>` montado; por el código,
  el próximo play tiraría `InvalidStateError` y el visor quedaría mudo hasta recargar. Es un
  razonamiento sobre el código, no una medición. Ya pasaba antes y no afecta al build de producción;
  `StrictMode` no lo dispara (eso sí está medido).
- **El silencio se guarda por proyecto**, como pide la spec (§5.2, «Persistencia»). Al reabrir un
  proyecto con una pista silenciada, el visor sigue simulando, con la insignia, hasta quitar el
  silencio. La alternativa, un silencio solo en memoria, queda para que la decida el dueño.
- **Un cambio de modo sin gesto de la persona** (un render que termina, el video que queda
  desactualizado) depende de la política de autoplay del webview. En la app no hay rechazo según la
  configuración de wry 0.55.1 (no medido en WKWebView ni WebView2): deja WKWebView sin gesto requerido
  (`mediaTypesRequiringUserActionForPlayback` vacío) y le pasa a WebView2
  `--autoplay-policy=no-user-gesture-required`. Si un webview lo rechazara, el visor queda en pausa
  en el cursor, sin error, y el play de la persona sigue desde ahí (medido con la política estricta de
  Chrome).
- **Entre el cambio y la reanudación no suena nada durante unos milisegundos** y el botón muestra ▶:
  el maestro nuevo tiene que cargar antes de quedar en el cursor. Medido del clic al `playing`: 9,5 a
  39 ms en la corrida final (18 reanudaciones) y 6,8 a 72,3 ms en las 43 de todas las corridas. No se
  salta contenido: sigue desde el mismo punto.
- **La música puede recibir su play unos milisegundos antes de quedar alineada** cuando la narración
  nueva carga primero: su alineación llega en el `canplay` de la música. En la corrida final pasó en
  las 8 reanudaciones con música con la política de la app, y en 11 sumando la corrida con
  `user-gesture-required` (una de ellas, rechazada), siempre con la alineación 0,2 a 2,5 ms después
  del play. El detector de tono no detectó audio desde 0 en ninguna (resuelve ráfagas de ≈5 ms o más;
  ver «Resultados»). Pasa igual con un play de la persona justo después de un cambio de modo, y no
  se cambió; en WebKit queda para la QA del dueño.
- Queda un nodo fuente viejo y desconectado por cada cambio de modo, porque un elemento admite uno solo
  en toda su vida. Es despreciable.
- El navegador también pausa un medio que sale del documento: la pausa explícita de la limpieza es un
  cinturón extra. En el clic de silenciar, que es un evento discreto, llega antes que la del navegador.

## Validación reproducible

### Comandos

En el worktree, todos en verde:

```
pnpm format
pnpm lint
pnpm build
pnpm check:locales                            # catálogos alineados: 1762 claves en es, en, pt
node scripts/test/check-timeline-layout.mjs   # tests 8, pass 8, fail 0
```

No hay tests de frontend (ver `CLAUDE.md`): la conducta se midió con arneses descartables, fuera del
repo.

### Cómo armar el arnés

1. Empaquetar con el esbuild del repo y los alias de `tsconfig.app.json` un `entry.tsx` que monte el
   código REAL (`EditorPreviewPlayer`, o `useEditorPlayback`, que usa `useAudioGain`) con los mismos
   medios que el visor: un `<video>` en modo mp4, y la narración y la música en bucle
   (`<audio crossOrigin="anonymous">`) en simulación. Los medios se generan con ffmpeg: narración de
   20 s, música con desfase de 2 s y un webm de 20 s. Las mediciones de `d2f35fe9` y `95b10ccd` usaron
   una música de 8 s; la de la continuidad, una de 30 s con tonos marca (los comandos están en
   «Continuidad al cambiar de modo», abajo).
2. Servirlo con un servidor estático del mismo origen y con soporte de `Range`. Con otro origen, CORS
   contamina los `<audio>` y el grafo da cero.
3. Abrir Chrome sin ventana con un perfil propio, manejarlo por CDP y matar ese PID al terminar. Las
   banderas: `--headless`, `--remote-debugging-port=<puerto>`, `--user-data-dir=<carpeta temporal>`,
   `--autoplay-policy=no-user-gesture-required` y `--mute-audio`.
4. Para medir el gain: antes de que el código cree contextos, reemplazar `window.AudioContext` por una
   subclase que registre cada `createMediaElementSource(elemento)` y cuelgue un `AnalyserNode` a la
   salida del primer gain de cada contexto. El RMS dice cuánto pasa por el gain. Un elemento que suena
   sin figurar en ningún grafo lo está esquivando.
5. Para medir el «antes», un plugin `onResolve` de esbuild reemplaza el archivo por su versión del
   commit anterior (`git show <commit>^:<ruta>`).

### Resultados

**Atajos (`cd76d012`).** Antes, con espacio, flecha arriba y espacio sobre el asa, el listener de
`window` recibió los dos espacios (play y pausa), y con espacio y Esc recibió el Esc (deseleccionar).
Con la guarda, un listener en `window` registró el `defaultPrevented` de cada tecla:

| Tecla        | Sobre                                      | `defaultPrevented` |
| ------------ | ------------------------------------------ | ------------------ |
| Espacio      | asa (levanta)                              | true               |
| Flecha ↑     | asa                                        | true               |
| Flecha ←     | asa, en pleno arrastre (no mueve)          | true               |
| Espacio      | asa (suelta; la música queda en 2.º lugar) | true               |
| Espacio, Esc | asa (levanta y cancela)                    | true, true         |
| Espacio      | un `<button>` cualquiera                   | false              |
| Flecha ←     | un `<button>` cualquiera                   | false              |
| Esc          | un `<button>` cualquiera                   | false              |

**Cambio de modo (`d2f35fe9`).** El mp4 suena desde los 5 s, después pasa a simulación y vuelve, con
la música de 8 s y desfase de 2 s:

| Paso          | Antes                                                  | Después                                                                          |
| ------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| mp4 desde 5 s | `playing` true, cursor 6,41                            | `playing` true, cursor 6,40                                                      |
| → simulación  | `playing` **true**, narración 0, música 0 (debía 0,41) | `playing` false; narración 6,40 y música 0,40, en pausa; el video viejo, pausado |
| play          | narración desde 0 (0,95), cursor congelado en 6,41     | narración 7,41, música 1,40 (en fase), cursor 7,40                               |
| → mp4         | `playing` **true**, video en 0                         | `playing` false; video 7,40 en pausa; narración y música viejas, pausadas        |
| play          | video 0,95, cursor congelado en 6,41                   | video 8,36, cursor 8,34                                                          |

**Grafo de ganancia (`95b10ccd`).** El RMS a la salida del gain de la música durante 300 ms (el tono da
0,0886 con gain 1). Escenarios A a D:

| Escenario y paso                                                                       | Antes                                                     | Después                                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------- |
| A. simulación → mp4 → simulación con la música en 0; play                              | `music#2` fuera del grafo, suena a `volume` 1: **se oye** | `music#2` en el grafo, RMS 0: **calla**                    |
| A. reactivar (música en 1)                                                             | gain 1 pero RMS 0: el elemento suena por fuera            | RMS 0,0886: suena por el gain                              |
| A. silenciar otra vez en plena reproducción                                            | RMS 0 con el elemento a `volume` 1: **se oye**            | RMS 0: calla                                               |
| A. narración tras la ida y vuelta (voz en 1)                                           | `narration#2` fuera del grafo, RMS 0                      | entra en el play, RMS 0,0887                               |
| B. música en 0 desde el inicio, play; reactivar                                        | calla; RMS 0,0886                                         | igual                                                      |
| C. la QA del dueño: simulación → mp4 sonando → silenciar la música; play               | `music#2` por fuera: **se oye**                           | RMS 0: calla; la narración suena                           |
| C. reactivar (mp4), silenciar otra vez (segunda ida y vuelta); play                    | `music#3` por fuera: **se oye**                           | `music#3` en el grafo (tercer nodo, mismo contexto), RMS 0 |
| C. música otra vez en 1, en simulación                                                 | el gain no hace nada                                      | RMS 0,0886                                                 |
| D. ida y vuelta sin cambiar la mezcla (render terminado, después desactualizado); play | `music#2` por fuera, RMS 0 en el gain                     | entra en el play, RMS 0,0886                               |
| D. música en 0,5 sonando                                                               | sigue a `volume` 1: **ignora la mezcla**                  | RMS 0,0443, la mitad exacta                                |
| D. música en 0 sonando                                                                 | **se oye**                                                | RMS 0: calla                                               |

Con React de desarrollo y `<StrictMode>`, como en `pnpm tauri dev`, los cuatro escenarios dieron lo
mismo.

**La limpieza del cambio de modo (`f22d8696`).** Las llamadas a `pause()` durante el cambio, medidas
con el `EditorPreviewPlayer` real. En los dos últimos casos la música se montó después de entrar a la
simulación y sonaba:

| La limpieza pausa…                     | mp4 sonando → silenciar                                              | termina el render                | se desmonta el visor             |
| -------------------------------------- | -------------------------------------------------------------------- | -------------------------------- | -------------------------------- |
| la lista tomada al entrar (`d2f35fe9`) | el video viejo                                                       | la narración vieja, la música no | la narración vieja, la música no |
| los refs leídos al limpiar             | la narración y la música **nuevas** (ya en pausa), el video viejo no | el video **nuevo** (ya en pausa) | nada                             |
| la foto del último commit (`f22d8696`) | el video viejo                                                       | la narración y la música viejas  | la narración y la música viejas  |

En todos los casos el navegador terminó pausando por su cuenta los medios desmontados. En el clic,
que es un evento discreto, la pausa explícita llegó antes.

**Continuidad al cambiar de modo (2026-10-08).** Otro arnés con el mismo armado, que monta el
`EditorPreviewPlayer` real cableado como `LibraryEditor` (silenciar cambia en el mismo render la mezcla
y el `videoSrc`). Lo que agrega:

- Los clics de play y de silenciar son clics de verdad por CDP (`Input.dispatchMouseEvent`), así que
  llevan gesto. El render que termina y el video que queda desactualizado llegan por script, sin gesto.
- `HTMLMediaElement.prototype.play` se instrumenta sin colgarle handlers a la promesa, para que un
  rechazo sin `catch` siga llegando a `unhandledrejection`.
- El primer segundo de la narración suena a 1,7 kHz y el de la música a 1,5 kHz (el resto, a 440 y
  660 Hz). Un analizador antes del gain de cada elemento busca esa marca: si se oye, el elemento
  reprodujo desde 0. Control positivo: una ráfaga de 5 ms de la marca da −49 dB y una de 20 ms, −40 dB.
  La narración dura 20 s y la música 30 s, para que no dé la vuelta durante la medición:

  ```
  ffmpeg -f lavfi -i "sine=frequency=1700:sample_rate=48000:duration=1" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=19" \
    -filter_complex "[0][1]concat=n=2:v=0:a=1,volume=0.5[a]" -map "[a]" -ac 1 -c:a pcm_s16le narration.wav
  ffmpeg -f lavfi -i "sine=frequency=1500:sample_rate=48000:duration=1" \
    -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=29" \
    -filter_complex "[0][1]concat=n=2:v=0:a=1,volume=0.5[a]" -map "[a]" -ac 1 -c:a pcm_s16le music.wav
  ```

- Dos políticas de Chrome: `--autoplay-policy=no-user-gesture-required`, la de la app, y
  `user-gesture-required`, para forzar el rechazo de un play sin gesto.
- `--disable-features=HardwareMediaKeyHandling`. Sin esa bandera, Chrome sin ventana en macOS pausó a
  veces todos los medios de la página a la vez, también con el hook de HEAD: venían de afuera del
  código de la página (ningún `pause()` propio); no se aisló el origen. Con la bandera no volvió a
  pasar en 40 corridas, aunque un A/B sin ella (3 × 60 s) tampoco las tuvo.

Antes es HEAD (`9c70b55c`) y después, este cambio. React de producción, política de la app salvo
donde se indica. «Retoma» es el tiempo del clic (o del script) al evento `playing` del maestro nuevo.
El RMS es a la salida del gain y, entre paréntesis, antes del gain; un tono a volumen 1 da 0,044:

| Escenario                                                                        | Antes                                       | Después                                                                                                                                      |
| -------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| A. mp4 sonando desde 5 s → silenciar la música                                   | ▶; narración 5,92 y música 7,92 en pausa    | retoma en 34 ms desde 5,81 (el cursor del clic); a 1,17 s, narración 6,94 y música 8,96 (esperada 8,96); voz 0,044, música 0 (0,044)         |
| B. reactivar la música                                                           | ▶; video 5,92 en pausa                      | sigue en el mp4: retoma en 28 ms desde 7,57 (el cursor); 8,54 a 1,19 s                                                                       |
| C. en pausa en 5 s → silenciar y reactivar                                       | ▶; narración 5,00 y música 7,00; video 5,00 | igual que antes, sin ningún `play()`                                                                                                         |
| D. simulación sonando → termina un render (sin gesto)                            | ▶; video 5,37 en pausa                      | sigue en el mp4: retoma en 12 ms desde 5,96                                                                                                  |
| D2. mp4 sonando → queda desactualizado (sin gesto)                               | ▶; narración 5,57 y música 7,57 en pausa    | sigue en simulación: retoma en 16 ms desde 5,80; música 9,00 (esperada 9,01); voz y música 0,044                                             |
| D con `user-gesture-required`                                                    | ▶; ningún `play()`                          | un `play()` del video, rechazado (el control da `NotAllowedError`): ▶, video en pausa en 11,00, cero rechazos sin manejar; el play sigue ahí |
| D2 con `user-gesture-required`                                                   | ▶                                           | `play()` de narración y música rechazados: ▶, 10,80 y 12,80 en pausa, cero rechazos sin manejar; el play sigue con voz y música a 0,044      |
| E1. dos clics seguidos en silenciar (16 ms; la narración nueva todavía no cargó) | ▶ en el mp4, en 5,76                        | sigue en el mp4 desde 5,81                                                                                                                   |
| E2. silenciar y enseguida un seek a 10 s                                         | ▶ en 10,00                                  | sigue desde 10,00; música 13,19 (esperada 13,19)                                                                                             |
| U. silenciar y desmontar el visor enseguida                                      | nada suena                                  | nada suena, ningún `play()`                                                                                                                  |
| N. silenciar la narración con el mp4 sonando                                     | ▶ en 5,81                                   | sigue desde 5,81: voz 0 (0,044), música 0,044 en su desfase (8,97, esperada 8,97)                                                            |

- Con React de desarrollo y `<StrictMode>`, como en `pnpm tauri dev`, todos dieron lo mismo; con
  `user-gesture-required`, A y B (con clic) también siguen.
- No se detectó audio desde 0 en ninguna reanudación (el detector resuelve ráfagas de ≈5 ms o más):
  en las 48 mediciones con señal, la marca no pasó de −74,1 dB (el tono principal da −38 a −40 dB) y
  ningún `timeupdate` del maestro quedó por debajo del cursor.
- Ningún error de página ni rechazo sin manejar en ninguna corrida.
- Tras la revisión (`00b83fc3`), con la fuente de la narración nueva cambiada antes de su `canplay`:
  un seek posterior a 8 s reproducía sin que nadie lo pidiera con `cde8069d`, y ahora queda en pausa
  en 8,00 (también con `<StrictMode>`). A (silenciar sonando) y C (en pausa) dieron lo mismo que antes.

## Pruebas manuales

Pendientes de la QA del dueño en la app (`pnpm tauri dev`, macOS). Los agentes no pueden manejar la
app de escritorio, así que estas pruebas todavía no se hicieron. Los puntos 1 a 3 cambiaron el
2026-10-08, a pedido del dueño: el cambio de modo ya no frena la reproducción. El 8 se agregó tras la
revisión de `cde8069d`.

1. Con render vigente, darle play al mp4 y silenciar la música desde su cabecera: la reproducción
   sigue sola, sin volver a darle play, desde el mismo punto, y el visor muestra la insignia
   «Simulación: hay una pista silenciada»; la música calla y la narración suena en sincronía. Silenciar
   la narración en vez de la música: sigue sonando, calla la narración y la música suena en su desfase,
   no desde 0.
2. Reactivar la pista con el visor sonando: vuelve el mp4 y sigue sonando desde el cursor. Con el visor
   en pausa, silenciar y reactivar: queda en pausa en el cursor en los dos modos, y el play sigue desde
   ahí.
3. Con la simulación sonando, dejar que termine un render: sigue sonando en el mp4 desde el cursor,
   sin darle play. Editar algo con el mp4 sonando, para que quede desactualizado: lo mismo, en
   simulación. Un doble clic rápido en silenciar con el mp4 sonando: sigue sonando.
4. Los volúmenes después de un render: darle play en simulación, renderizar, editar algo para volver a
   la simulación, darle play y mover la voz y la música en el diálogo de Audio. Se aplican en vivo, y
   silenciar una pista la calla.
5. Dos veces seguidas: repetir los puntos 1 y 2 dos veces. En la segunda ida y vuelta la pista
   silenciada sigue callada y la mezcla se aplica.
6. El teclado sobre el asa de una pista: espacio, flechas y espacio reordenan sin play ni pausa, y Esc
   cancela sin deseleccionar la escena. El espacio fuera del asa sigue siendo play y pausa.
7. Un proyecto sin música: silenciar la música no cambia el visor (sigue el mp4, sin insignia).
8. Al reanudar en simulación con la música audible (silenciar la narración con el mp4 sonando, o
   editar algo para que el video quede desactualizado mientras suena), escuchar si la intro de la
   música da un golpe. Si se oye, aplicar la compuerta de alineación de la música que propuso la
   revisión de `cde8069d`: que la música arranque recién cuando quedó alineada (unas 8 líneas en
   `useEditorPlayback`).
