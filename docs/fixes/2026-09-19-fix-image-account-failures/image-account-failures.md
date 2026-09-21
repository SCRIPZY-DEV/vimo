# Sin saldo en el proveedor de imágenes, el aviso de recargar aparece

Fecha: 2026-09-19. Reporte: un usuario generó un video con Evolink, con una clave
válida pero sin saldo. En palabras del equipo: «en teoría debió de haber mostrado lo
de recargar el proveedor […] y no mostró ningún mensaje». Las imágenes quedaron en
rojo y no apareció ninguna alerta.

## Causa

La tarjeta de recarga (`InsufficientCreditsCard`) solo aparece cuando el job termina
con un código `*_insufficient_credits` ([ADR-0031](../../adr/ADR-0031-saldo-por-proveedor-precheck-y-pausa-retomable.md)).
Ese código dependía del TEXTO del rechazo: un 402, o un cuerpo que matcheara
`INSUFFICIENT_CREDITS_BODY_PATTERN`. Cuatro fallas encadenadas:

1. **El saldo agotado dicho de otra forma se leía como clave inválida.** Un 403 sin
   una frase reconocida caía en `image_invalid_api_key`; un 400, en
   `image_provider_error`. Además Evolink descartaba evidencia: en el poll un 401/403
   no leía el cuerpo, un 2xx sin id de tarea no miraba el saldo, la subida de la
   referencia tiraba status y cuerpo, y el cuerpo se recortaba a 300 caracteres antes
   de clasificar.
2. **El carril se lo tragaba escena por escena.** `evolink-lane` y `fal-lane` marcaban
   `image_invalid_api_key` en la escena y seguían, y el carril de referencia de Fal
   gastaba sus intentos y después «rescataba» la escena al carril normal, donde el
   rechazo se repetía. Un fallo de la CUENTA se trataba como si fuera de una escena.
3. **Las pasadas de recuperación lo tapaban.** Hasta 4 pasadas repetían el mismo
   rechazo y la fase moría con `images_incomplete`, cuyo mensaje es «Quedaron escenas
   sin imagen. Reanudá para reintentarlas».
4. **La interfaz no podía mostrar otra cosa.** `scene-image-failed` trae el código,
   pero la pantalla de progreso solo pinta la celda en rojo; la tarjeta de recarga
   cuelga de `job-failed`.

El cuerpo real con que Evolink rechaza sin saldo **no se conoce**: no hay una clave de
Evolink sin saldo para medirlo. Por eso la corrección no depende de ese texto.

## Corrección

**La sonda de cuenta** (`pipeline/stages/images/account-probe.ts`, nuevo). Ante un
rechazo ambiguo le pregunta el saldo al proveedor con los lectores que ya existían,
`getEvolinkCredits` y `getFalCredits`. Hace una lectura por proveedor y por corrida,
con la promesa compartida: 50 escenas rechazadas a la vez hacen UN pedido de saldo.
Veredictos posibles: `insufficient-credits`, `invalid-key`, `key-valid` y `unknown`.

- Evolink: saldo informado, no ilimitado y ≤ 0 → sin saldo. Si el endpoint de saldo
  también rechaza la clave, la clave es inválida. `EvolinkCredits.balanceReported`
  (nuevo) evita leer como cero una respuesta que no trae el campo.
- Fal: `current_balance` ≤ 0 → sin saldo. La sonda nunca concluye «clave inválida»,
  porque el billing de Fal exige una key ADMIN y una key normal recibe 401/403 ahí.

**Un 401/403 corta la fase** (`resolveAuthRejection`), en `evolink-lane`, `fal-lane`
y el carril de referencia de Fal en `character-lane`:

| Lo que dice la sonda              | Fallo del job                                                       |
| --------------------------------- | ------------------------------------------------------------------- |
| el saldo lee vacío                | `image_insufficient_credits` → pausa retomable + tarjeta de recarga |
| la sonda también rechazó la clave | `image_invalid_api_key`                                             |
| 401 y el saldo no se pudo leer    | `image_invalid_api_key`                                             |
| cualquier otro caso               | `image_account_rejected` (nuevo)                                    |

Un 4xx de Evolink al crear, en el primer intento y antes de las esperas, también
consulta la sonda (`resolveClientErrorRejection`). Solo corta si el saldo lee vacío;
si no, el carril sigue como siempre.

`images.ts` crea la sonda una vez por corrida y corta los carriles en vuelo ante
cualquier fallo de cuenta (`creditsAbort` pasó a llamarse `accountAbort`). Si la fase
igual termina en `images_incomplete`, el mensaje incluye el código de fallo más
repetido entre las escenas, solo como diagnóstico.

**Detección ampliada** (`pipeline/utils/insufficient-credits.ts`). El patrón suma
redacciones de gateway: «insufficient user quota», «balance is not enough»,
«exhausted balance», «user is locked», `pre_consume…` y sus textos en chino. También
entran los códigos de tarea `insufficient_quota`, `insufficient_user_quota` y
`pre_consume_token_quota_failed`. El 429 sigue sin ser saldo nunca. En
`pipeline/providers/image/evolink.ts`:

- se clasifica sobre 4.000 caracteres del cuerpo (el mensaje sigue en 300);
- el poll lee el cuerpo ante un 401/403;
- un 2xx sin id de tarea mira el saldo en su cuerpo;
- `uploadEvolinkReference` lanza `image_insufficient_credits` cuando la file-API
  rechaza por saldo, y sigue devolviendo `null` en el resto de los casos;
- `EvolinkHttpFailure` conserva el status HTTP, que antes se perdía.

**Interfaz:** solo el código nuevo. `image_account_rejected` →
`create.errors.imageAccountRejected` en los tres catálogos. No hizo falta tocar el
estado de la pantalla de progreso, porque las causas de cuenta ya llegan como
`job-failed`.

## Archivos

- `pipeline/stages/images/account-probe.ts` (nuevo), `images.ts`, `lane.ts`,
  `evolink-lane.ts`, `fal-lane.ts`, `character-lane.ts`
- `pipeline/providers/image/evolink.ts`, `pipeline/providers/music/evolink.ts`
- `pipeline/utils/insufficient-credits.ts`, `pipeline/types/music.ts`
- `src/modules/videos/constants.ts`, `public/locales/{es,en,pt}.json`
- `scripts/test/check-image-account-failures.mjs` (nuevo)

## QA

`node --test scripts/test/check-image-account-failures.mjs` cubre 15 casos con HTTP
simulado, corriendo la fase `images` real.

Detección por texto:

- las redacciones de gateway se reconocen, y un 429 nunca es saldo.

Evolink:

- un 403 opaco con saldo 0 → `image_insufficient_credits`, con UNA lectura de saldo
  para todas las escenas y sin pasadas de recuperación;
- un 403 opaco con el saldo respondiendo 401 → `image_invalid_api_key` terminal, sin
  ningún `scene-image-failed`;
- un 403 opaco con saldo positivo → `image_account_rejected`;
- una respuesta de saldo sin el campo no se lee como cero;
- una redacción reconocida se clasifica por texto, sin leer el saldo;
- un 400 opaco con saldo 0 → créditos, antes de cualquier espera;
- un 2xx con el error de saldo en lugar del id → créditos;
- el saldo que solo aparece en el poll → créditos;
- la subida de la referencia rechazada por saldo aflora, y otros fallos de subida
  siguen degradando.

Fal:

- el texto ESPERADO de cuenta bloqueada («User is locked… Exhausted balance») →
  créditos por texto. No está medido en este repo: se confirma en el punto 3 del QA
  manual;
- un 403 opaco con saldo 0 → créditos;
- un 401 → clave inválida terminal, sin pasadas de recuperación;
- un 403 con key no-admin, sin poder leer el saldo → `image_account_rejected`;
- el carril de referencia aflora el rechazo y no cae al carril normal.

Regresiones vecinas en verde: `check-preview-regressions` (32),
`check-editor-character-selection` (23), `check-character-identity-lock` (24) y
`check-catalog-prompts` (35). También pasan `pnpm format`, `pnpm lint`, `pnpm build`
y `pnpm check:locales` (1.199 claves alineadas).

No está cubierto por el script el tramo `run-video-pipeline` →
`state: 'paused'` + `pauseReason: 'insufficient-credits'`. Ese código no cambió:
decide con `isInsufficientCreditsCode`, que el script sí ejercita. Es el primer punto
del QA manual.

**QA manual pendiente, con una clave real sin saldo** (hay una de Fal disponible):

1. Crear un video con Fal desde la app.
   - Tras el primer rechazo no salen más pedidos de imagen.
   - `project.json` queda con `state: "paused"`,
     `pauseReason: "insufficient-credits"` y
     `errorCode: "image_insufficient_credits"`.
   - Aparece la tarjeta de recarga y, en Biblioteca, el badge «Sin créditos» con
     «Reanudar» deshabilitado.
2. «Regenerar imagen» desde el editor, con la misma clave: debe mostrar el estado de
   sin saldo, no una celda roja sin mensaje.
3. Copiar el cuerpo literal del rechazo de Fal al caso del script. El que está hoy es
   el texto esperado, no uno capturado.
4. Repetir con una clave inventada: mensaje de clave inválida y ninguna pasada de
   recuperación en el log.
5. Evolink: en cuanto haya una clave sin saldo, capturar status y cuerpo reales de
   `POST /v1/images/generations` y de `GET /v1/credits`, y sumarlos al patrón y al
   script.

## Límites conocidos

- Si `/v1/credits` no se puede leer (caído, o con otra forma), un 403 de Evolink sin
  saldo cae en `image_account_rejected`. Es terminal y visible, y su mensaje menciona
  el saldo, pero no muestra la tarjeta de recarga ni deja el proyecto en pausa
  retomable.
- Un fallo terminal lanzado por un carril descarta el resultado del lote en curso, así
  que los `imageTask` de Evolink de OTRAS escenas en vuelo no se persisten. Es la misma
  limitación que ADR-0031 ya aceptaba para el saldo agotado, y solo es alcanzable si la
  clave se revoca a mitad de una corrida.
- El chequeo previo de Crear sigue sin bloquear cuando el saldo no se puede leer o
  figura como ilimitado, por decisión de ADR-0031.
- Los previews de personaje y las muestras de estilo usan los proveedores directos, no
  los carriles, y no consultan la sonda. Sí se benefician del patrón ampliado.
