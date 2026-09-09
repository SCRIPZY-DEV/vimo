# ADR-0024 — Dos proveedores de voces: DubVoice y ElevenLabs directo

- **Estado:** Aceptada
- **Fecha:** 2026-09-08
- **Área:** providers / pipeline / app

## Problema

Hasta ahora las voces tenían un solo vendor: **DubVoice**, un agregador que con una
clave expone tres motores (`minimax`, `elevenlabs`, `edge`). La clave propia de
ElevenLabs que el usuario ya podía guardar en Claves API solo servía como carril de
respaldo de la narración (`providers/tts/elevenlabs-direct.ts`, port de
`sintetizarElevenLabsDirecto` del origen): sin listado, sin saldo, sin pre-flight, y
con el modelo hardcodeado. Quien tiene cuenta en ElevenLabs (con sus voces clonadas y
su cuota de caracteres) no podía usarla desde Voces ni desde Crear.

Restricciones que achicaron las opciones:

- El id de motor (`VoiceProviderId`) está **persistido**: `project.json`
  (`voiceProvider`), `metadata.json` del historial, favoritos en `localStorage`,
  eventos `voice-progress` y la clave del registro `TTS_PROVIDERS`. `'elevenlabs'` ya
  nombra al motor vía DubVoice y no se puede resignificar sin migrar todo eso.
- Los cuatro sitios que llaman a un motor hardcodeaban `context.job.apiKeys.dubvoice`
  (`list-voices`, `generate-voice`, `probe-tts`, `stages/voice/narration.ts`).
- `elevenlabs.ts` importaba a `elevenlabs-direct.ts` para su fallback: un fallback
  simétrico crearía un import circular.
- `@pipeline/*` es alias solo de tipos (ADR-0010): las constantes runtime de la UI
  viven en `src/`. Y `settings` no importa de `api-keys` (regla de dependencias).

## Decisión

**ElevenLabs directo es un motor completo (`'elevenlabs-direct'`) y el usuario elige
el proveedor de voces con una preferencia global; el vendor se deriva del id de
motor, nunca al revés.**

- `pipeline/types/voices.ts`: `VoiceProviderId` gana `'elevenlabs-direct'` (aditivo:
  lo persistido con `'elevenlabs'` sigue siendo el motor vía DubVoice). Tipos nuevos
  `VoiceVendorId = 'dubvoice' | 'elevenlabs'` y `VoiceSource = 'account' | 'library'`.
- `pipeline/providers/tts/provider.ts`: `TtsProvider` declara `vendor` y
  `apiKeyOf(apiKeys)` (el **único** lugar donde se lee `apiKeys.<vendor>`), y
  `fallbackProviderIds` por id en vez de `directFallback` (el registro los resuelve:
  ningún motor importa a otro). Las constantes que comparten los dos ElevenLabs viven
  en `elevenlabs-shared.ts`.
- `pipeline/providers/tts/elevenlabs-direct.ts` implementa `TtsProvider`: catálogo de
  la cuenta (`GET /v2/voices`, completo) y biblioteca pública (`GET /v1/shared-voices`,
  paginada con `source: 'library'`), probe por listado, síntesis síncrona con
  `output_format=mp3_44100_128` y el `model` del payload, troceo de narraciones
  largas, y `addLibraryVoice()` idempotente (`POST /v1/voices/add/{owner}/{voice}`).
  Fallback: `['elevenlabs']`; y `elevenlabs.ts` declara `['elevenlabs-direct']`.
- `pipeline/providers/tts/vendors.ts`: lo que es del vendor y no del motor —clave y
  saldo—. `get-voice-credits` recibe `{ vendor }` y devuelve `VoiceCreditsResult` con
  `unit: 'credits' | 'characters'` y `quota` (usados, límite, renovación).
- Subcomando nuevo `add-library-voice` (`pipeline/commands/voices/add-library-voice.ts`).
  Una voz de biblioteca (`VoiceSummary.libraryOwnerId`) se añade a la cuenta **al
  usarla** (probador de Voces, confirmar en el picker de Crear) y lo que se persiste
  es el `voiceId` de cuenta que devuelve: nunca queda un `libraryOwnerId` en
  `project.json` ni en el historial.
- Preferencia `voiceVendor` en `settings.json` (`src/modules/settings`): `null` =
  automático. La resolución efectiva es pura en
  `src/modules/common/utilities/resolveVoiceVendor.ts` (preferencia; si no hay,
  DubVoice salvo que ElevenLabs sea la única clave de voz) y la combina
  `src/modules/voices/hooks/useVoiceVendor.ts` con las claves guardadas. **Solo
  Ajustes escribe la preferencia.** La cabecera de Voces y el picker de Crear montan
  el mismo `VoiceVendorSwitch` (`src/modules/common/components/`) sobre un estado
  local que arranca en el proveedor por defecto: cambiarlo ahí es de esa visita, no
  persiste.
- UI: los mapas por vendor viven en `src/modules/voices/constants.ts`
  (`VOICE_PROVIDERS_BY_VENDOR`, `VOICE_TABS_BY_VENDOR`, `VOICE_PICKER_TABS_BY_VENDOR`,
  `VOICE_TAB_CATALOGS`). Con DubVoice la app queda como antes; con ElevenLabs, Voces
  y el picker muestran «Mis voces» y «Biblioteca», el saldo es la cuota de caracteres
  y la clonación apunta al Voice Lab. Las ramas `=== 'elevenlabs'` pasaron a
  `isElevenLabsEngine()` (los dos carriles comparten modelos, ajustes y filtros).

### Forma

| Componente                                            | Estado   | Ubicación                                       | Para qué                                   |
| ----------------------------------------------------- | -------- | ----------------------------------------------- | ------------------------------------------ |
| `TtsProvider.vendor / apiKeyOf / fallbackProviderIds` | cambiado | `pipeline/providers/tts/provider.ts`            | fin de los `apiKeys.dubvoice` hardcodeados |
| `elevenLabsDirectProvider`                            | nuevo    | `pipeline/providers/tts/elevenlabs-direct.ts`   | motor completo                             |
| `TTS_VENDORS`                                         | nuevo    | `pipeline/providers/tts/vendors.ts`             | saldo por vendor                           |
| `add-library-voice`                                   | nuevo    | `pipeline/commands/voices/add-library-voice.ts` | biblioteca → cuenta                        |
| `useVoiceVendorPreference`                            | nuevo    | `src/modules/settings/hooks/`                   | preferencia (null = automático)            |
| `resolveVoiceVendor`, `VoiceVendorSwitch`             | nuevos   | `src/modules/common/`                           | vendor efectivo y selector compartido      |
| `useVoiceVendor`                                      | nuevo    | `src/modules/voices/hooks/`                     | preferencia + claves → vendor              |

## Alternativas consideradas

- **Reemplazar el id por `{ vendor, engine }`** — obliga a migrar `project.json`,
  historial, favoritos y eventos, y a que Library re-narre proyectos viejos con un
  formato nuevo. Un id aditivo no rompe nada de lo guardado.
- **Dos ids para cuenta y biblioteca** — la biblioteca no es un motor: solo se
  sintetiza después de añadir la voz a la cuenta, momento en que pasa a ser una voz
  de cuenta. Dos ids dejarían en el historial un motor con voces que no se pueden
  sintetizar. Es un filtro (`source`), no una identidad.
- **Añadir la voz de biblioteca en el sidecar al sintetizar** — ocultaría un efecto
  colateral (ocupa un slot de voz de la cuenta) detrás de un «generar». Se hace al
  elegir, con texto que lo dice.
- **Que el switch de Voces y de Crear escriba la preferencia** — decisión inicial,
  revertida a pedido del dueño: cambiar de proveedor para mirar un catálogo no debe
  cambiar el default de la app. La preferencia se edita solo en Ajustes.
- **Preferencia sin estado automático** — obligaría a pasar por Ajustes a quien solo
  tiene clave de ElevenLabs. El automático cubre el caso sin inventar defaults.
- **Que `settings` importe `api-keys` para mostrar el vendor efectivo** — rompe la
  regla de dependencias por una nota. Ajustes muestra la preferencia y, cuando es
  automática, lo explica; la resolución vive en `voices`.

## Consecuencias

- ✅ Quien tiene cuenta propia de ElevenLabs usa sus voces (clonadas incluidas) en
  Voces y en Crear, con su cuota visible.
- ✅ El troceo de narraciones largas y el reuso de partes ya pagadas aplican a
  **todos** los carriles (antes el fallback directo mandaba el texto entero).
  Desde ADR-0025 cada carril trocea a su propio tope, así que el reuso vale
  entre reintentos del mismo carril, no al caer al fallback.
- ✅ Fallback simétrico: ElevenLabs directo ↔ ElevenLabs vía DubVoice con la misma
  voz, solo si el usuario tiene la otra clave.
- ⚠️ El fallback solo sirve con voces **premade** públicas: una clonada o añadida a
  una cuenta no existe en la otra. Igual que antes; ahora está escrito.
- ⚠️ Ajustes no conoce el vendor efectivo: con preferencia automática y solo clave de
  ElevenLabs, la sección resalta DubVoice y la nota lo aclara.
- ⚠️ La idempotencia de `addLibraryVoice` compara `voice_id` y
  `sharing.original_voice_id`; si ElevenLabs cambiara ese campo, una voz podría
  añadirse dos veces (gasta un slot, no dinero).
- 🔒 Ningún command ni stage lee `apiKeys.<vendor>`: siempre `provider.apiKeyOf()` o
  `vendor.apiKeyOf()`.
- 🔒 Un motor no importa a otro motor: los fallbacks se declaran por id.
- 🔒 `libraryOwnerId` no se persiste en `project.json` ni en el historial.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests en el repo (ver CLAUDE.md).
- **Guards:** `pnpm build` (`tsc -b`) exige una entrada por motor en cada
  `Record<VoiceProviderId, …>` de `src/modules/voices/constants.ts`: un motor nuevo sin
  límites, modelos o etiqueta no compila. `pnpm check:locales` exige las mismas claves
  en `es/en/pt`. `grep -rn "apiKeys\.dubvoice\|apiKeys\.elevenlabs" pipeline/` debe
  devolver solo `providers/tts/`.
- **Manual (app nativa):** (1) solo clave DubVoice, sin preferencia → todo como antes;
  (2) solo clave ElevenLabs, sin preferencia → vendor automático ElevenLabs, tabs
  «Mis voces»/«Biblioteca», saldo en caracteres; (3) ambas claves → Voces y Crear arrancan en
  el proveedor de Ajustes; cambiarlo en Voces no cambia Ajustes ni el picker; (4) voz de biblioteca en el
  probador → «Añadiendo la voz…», aparece en «Mis voces», repetir no la duplica;
  (5) narración > 25 000 chars vía DubVoice, o > 9 500 con Multilingual v2 directo →
  log «split into N parts» (ADR-0025);
  (6) clave ElevenLabs inválida + voz premade + clave DubVoice → log warn y carril
  «ElevenLabs via DubVoice»; (7) proyecto viejo con `voiceProvider: 'elevenlabs'` →
  Library re-sintetiza vía DubVoice.
- **Cómo se vería una regresión:** «Falta la clave de DubVoice» con el vendor
  ElevenLabs elegido; una voz de biblioteca en el historial con un `voiceId` que
  ElevenLabs rechaza; un `import` de `elevenlabs.ts` en `elevenlabs-direct.ts` (o al
  revés).

## Fuera de alcance

- Clonar voces desde la app: cada vendor lo ofrece en su panel web.
- Ajustes discretos de `eleven_v3` (`stability` solo acepta 0 / 0.5 / 1 por API): los
  sliders continuos pueden dar 400 con ese modelo. Deuda conocida.
- Previews precomputados o generados con créditos: se reproduce la `preview_url` del
  proveedor.

## Addendum 2026-09-08 — Vbee y Fish Audio

DubVoice sumó dos motores a su API v1 y Vimo los incorpora como `'vbee'` y
`'fishaudio'`, bajo el mismo vendor `dubvoice` (misma clave, mismo saldo). La decisión
de esta ADR se sostiene sin cambios: el id de motor sigue siendo lo persistido, el
vendor se deriva del id, y `apiKeyOf` sigue siendo el único sitio que lee la clave.

- Los tres motores que DubVoice sirve por `GET /api/v1/voices?provider=…` (catálogo
  paginado) y `POST /api/v1/tts` (tarea asíncrona con polling) comparten transporte en
  `providers/tts/dubvoice-catalog.ts`; `elevenlabs.ts`, `vbee.ts` y `fishaudio.ts`
  solo arman su body. Ningún motor importa a otro.
- Vbee y Fish Audio honran únicamente `speed` (0.5–1.5) y no eligen modelo. En la UI
  el predicado `isDubvoiceCatalogEngine` gobierna el slider único y el paginado
  server-side; `isElevenLabsEngine` no se amplió (modelos, acento y categoría siguen
  siendo de ElevenLabs).
- Vbee etiqueta el idioma por nombre completo («Spanish»); el sidecar traduce el código
  del filtro de la UI (`VBEE_LANGUAGE_NAMES`). Fish Audio usa código ISO como ElevenLabs.
- Sin carriles de respaldo: ningún otro motor tiene esas voces.

## Referencias

- ADR-0010 (pipeline por stages), ADR-0011 y ADR-0023 (claves en el keychain),
  ADR-0013 (cascada de narración), ADR-0022 (patrón de preferencia).
- Origen: `src/features/voice_synthesis/generator.ts` (`sintetizarElevenLabsDirecto`) y
  `app/servidor-local/ajustes/validadores.ts` (`validarElevenLabs`) en
  `02-vimo/cursor-video`.
