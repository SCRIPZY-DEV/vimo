# Fix: el bloqueo de bot de YouTube no se reconocía (apóstrofo tipográfico)

- **Fecha:** 2026-10-03
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

Cuando YouTube marca la red como bot, yt-dlp falla con este mensaje (versión 2026.08.19, medido en
la Mac del dueño el 2026-10-03):

```
ERROR: [youtube] <id>: Sign in to confirm you’re not a bot. Use --cookies-from-browser or --cookies …
```

El apóstrofo de «you’re» es el tipográfico (U+2019). `classifyYtDlpError`
(`pipeline/providers/ytdlp/download.ts`) buscaba la frase con el apóstrofo recto (`you're`), así que
nunca coincidía y el fallo salía como `ytdlp_failed` en lugar de `ytdlp_needs_login`.

Consecuencias:

- **Música y overlay desde YouTube:** el usuario veía el error genérico y no el que explica que
  YouTube pide iniciar sesión o verificar que no es un bot.
- **Creador de estilo con IA (ADR-0050):** `style-clone-prepare` repite el pedido con el cliente
  `mweb` solo ante ese código. Como nunca llegaba, la clonación se quedaba sin storyboard: analizaba
  4 imágenes en vez de 14.

El guard nuevo no lo vio al principio: su yt-dlp simulado escribía el mensaje tipeado de memoria,
con el mismo apóstrofo recto que el código. Lo destapó la primera corrida real contra YouTube.

## Corrección

- `classifyYtDlpError` lleva los apóstrofos tipográficos (U+2018 y U+2019) al recto antes de
  comparar: las frases de la lista valen con los dos.
- `scripts/test/check-style-clone-material.mjs`: el yt-dlp simulado responde con el mensaje medido,
  apóstrofo tipográfico incluido, y un test nuevo pasa ese texto por el clasificador
  (`ytdlp_needs_login` con los dos apóstrofos).

Archivos: `pipeline/providers/ytdlp/download.ts`, `scripts/test/check-style-clone-material.mjs`.

## Límites deliberados

- No se tocan los demás textos de la lista: son frases sin apóstrofos ni comillas.
- La música y el overlay desde YouTube siguen sin reintentar con `mweb`: ahora informan bien el
  motivo, pero el reintento es solo del creador de estilo. Queda como mejora aparte.
- No se leen las cookies del navegador para saltar el bloqueo.

## Validación reproducible

```bash
node --test scripts/test/check-style-clone-material.mjs
```

- «the bot block of YouTube is recognized with either apostrophe»: el mensaje medido y el de
  apóstrofo recto dan `ytdlp_needs_login`.
- «the default client is asked first and mweb only after the bot block»: dos corridas de yt-dlp, la
  segunda con `youtube:player_client=mweb`.

Con el arreglo quitado (`replace` del apóstrofo), los dos fallan.

Corrida real desde la red bloqueada (sin claves, no gasta nada):

```bash
node scripts/run-pipeline-harness.mjs style-clone-prepare --root <carpeta-temporal> \
  --payload '{"sessionId":"sc-real-1","source":{"kind":"youtube","url":"https://www.youtube.com/watch?v=tBBhUn0D0I0"}}'
```

Antes: `no storyboard for the style clone (ytdlp_failed)` y 4 imágenes. Después:
`YouTube blocked the default client: retrying with mweb` y 14 imágenes (10 mosaicos, 3 fotogramas
y la miniatura) en 33 s.

## Pruebas manuales

- La corrida real de arriba, el 2026-10-03, en la Mac del dueño (red marcada por YouTube): 14
  imágenes, 1,0 MB, título «POV: Eres el COCINERO del Cartel».
- Pendiente del dueño en la app: en Crear, elegir música o un overlay desde un link de YouTube en
  una red bloqueada y ver que el error diga que YouTube pide verificación, no el mensaje genérico.
