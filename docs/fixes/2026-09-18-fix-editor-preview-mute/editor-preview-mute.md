# Editor: el botón mute no silenciaba el preview de escenas

Fecha: 2026-09-18.

## Reporte

Con un video que solo tiene las escenas generadas (sin exportar), el botón
mute/sound del editor —y el atajo `M`— alternaba el ícono pero el audio seguía
sonando. Con el video ya exportado, el mismo botón sí silenciaba.

## Qué estaba mal

`EditorPreviewPlayer` tiene dos caminos de reproducción:

- **Con render vigente** (`videoMode`): un `<video muted={muted}>` plano. El
  atributo `muted` del elemento gobierna la salida → funcionaba.
- **Solo escenas**: imagen de la escena + dos `<audio muted={muted}>` (narración y
  música). `useEditorPlayback` enruta ambos por `useAudioGain` para imitar la mezcla
  (volúmenes de hasta 2x): en el primer play arma
  `createMediaElementSource(audio) → GainNode → destination`.

Una vez que el elemento alimenta un grafo de Web Audio, lo que suena lo decide el
grafo: el `muted` del elemento deja de cortar la salida (en el WKWebView de Tauri),
igual que su `volume` — el hook ya lo asumía para el volumen (`audio.volume = 1`,
«el nivel lo pone el gain»). Pero `useAudioGain` no conocía el mute: su efecto
dependía solo de `volume` y nadie ponía el gain en 0. El estado `muted` cambiaba y
no llegaba a la única pieza que controla el nivel.

El grafo se arma siempre en este camino: `voiceVolume`/`musicVolume` nunca son
`undefined` (caen en `AUDIO_MIX_DEFAULTS`).

## Corrección

El `GainNode` pasa a ser la autoridad única del nivel, mute incluido.

- `useAudioGain` recibe un objeto de opciones `{ volume, muted }`. El nivel del gain
  sale de `resolveGainLevel(volume, muted)` (0 si está muteado), tanto en el efecto
  (ahora depende de `[volume, muted, audioRef]`) como al crear el grafo en
  `resume()`, para que mutear **antes** del primer play arranque en silencio.
- `useEditorPlayback` pasa su `muted` a los dos gains (narración y música).
- Se conserva `muted={muted}` en los `<audio>`: cubre el tramo previo al grafo.
- `AudioPlayer` solo adapta la llamada a la nueva firma; sin cambio de conducta.

## Archivos tocados

- `src/modules/common/hooks/useAudioGain.ts`
- `src/modules/videos/hooks/useEditorPlayback.ts`
- `src/modules/common/components/AudioPlayer.tsx`

## QA

`pnpm format`, `pnpm lint` y `pnpm build`. No hay framework de tests de frontend;
la verificación audible es manual, en la app, con un video solo con escenas:

1. Play → mute: narración y música se silencian; unmute: vuelven al nivel de la mezcla.
2. Mute antes del primer play → play: arranca en silencio.
3. Con mute activo, mover los sliders de voz/música: sigue en silencio; al
   desmutear suena con los valores nuevos.
4. El atajo `M` se comporta igual que el botón.
5. Regresión: el video exportado sigue muteando y el `AudioPlayer` de la mezcla
   sigue aplicando volumen por encima de 1.
