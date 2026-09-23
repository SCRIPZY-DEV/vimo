# ADR-0040 — El trial no vence durante la beta: el servidor deja de validar `trial_expira`

- **Estado:** Aceptada
- **Fecha:** 2026-09-23
- **Área:** app / servidor vimo.click

## Problema

Vimo se entra con una cuenta de Google que vimo.click autoriza contra dos tablas de
Supabase: `allowlist_beta` (alumnos) y `usuarios_acceso` (plan por usuario). Hasta hoy
**todo usuario no admin recibía `plan='trial'` con `trial_expira = now() + TRIAL_DIAS`**
(10 días por defecto) —incluidos los de la allowlist, aunque `SETUP_GATE_BETA.md` dijera
lo contrario— y la Pages Function `verificar-acceso` bloqueaba con `trial-expirado` al
pasar esa fecha, marcando la fila como `expirado`. La app mostraba «Te quedan N días de
prueba» en la vista Licencia; la landing, en el navbar y en Descargar.

Todavía no existe el servidor de pagos que convierta un trial en suscripción. Mientras
tanto, el equipo extendía `trial_expira` a mano en Supabase cada mes para no perder a los
~400 usuarios en trial, y la cuenta regresiva empujaba a la gente a irse antes de tener
algo que venderles.

Restricciones:

- Retener a todos los usuarios actuales, incluidos los que ya figuran como `expirado`.
- No tocar el schema ni las filas de `usuarios_acceso`: `plan` y `trial_inicio` son el
  historial que va a necesitar el cobro.
- Que el cambio surta efecto en las apps ya instaladas sin esperar un release.
- Los bloqueos manuales (`cancelado`, tabla `revocaciones`) tienen que seguir funcionando.

## Decisión

**El servidor deja de validar la fecha del trial y de enviarla; los clientes muestran
«acceso completo durante la beta» en lugar del contador.**

En el repo `vimo-landing`:

- `functions/api/verificar-acceso.ts`, paso 6: `cancelado` → 403 `trial-expirado`;
  cualquier otro plan → 200 con `plan: "activo"` si la fila es `activo` y `plan: "trial"`
  en el resto (`trial` y `expirado`). Desaparecen `diasRestantes`, `trialExpira` y el
  PATCH a `expirado`. El alta sigue grabando `trial_expira` solo como registro.
- `functions/api/licencia/emitir.ts` (app legacy con servidor local): misma regla; el
  entitlement firmado sigue llevando `"activo" | "trial"`, así el verificador legacy no
  cambia.
- `src/hooks/useAcceso.ts` pierde `diasRestantes` y `trialExpira`; `Navbar.tsx` deja de
  mostrar la píldora; `Descargar.tsx` muestra un banner neutro para `trial`; `/admin`
  pierde la columna «Trial», solo `cancelado` cuenta como revocado y una nota explica que
  `expirado` entra igual.

En este repo:

- `src/modules/auth/types/access.ts`: `VerifyAccessResponse` y `AccessStatus` pierden
  `diasRestantes`/`trialExpira` y `daysLeft`/`trialExpiresAt`.
- `src/modules/auth/api/index.ts` (`verifyAccess`) deja de mapearlos.
- `src/modules/auth/views/License/License.tsx`: la tarjeta de `trial` pasa a
  `license.accesoBetaTitulo` / `license.accesoBetaDescripcion` (es/en/pt), sin días ni
  precio.
- `src/modules/auth/guards.ts` no cambia: `BLOCKING_REASONS` sigue siendo
  `['no-en-allowlist', 'trial-expirado']`, y el server solo emite `trial-expirado` para
  `cancelado` y `revocaciones`.

### Forma

| `usuarios_acceso.plan`          | Antes                             | Ahora                              |
| ------------------------------- | --------------------------------- | ---------------------------------- |
| `activo`                        | entra, `plan: "activo"`           | igual                              |
| `trial` con fecha futura        | entra, `plan: "trial"` + contador | entra, `plan: "trial"`, sin fechas |
| `trial` con fecha pasada        | PATCH a `expirado` + 403          | entra, `plan: "trial"`, sin PATCH  |
| `expirado`                      | 403 `trial-expirado`              | entra, `plan: "trial"`             |
| `cancelado` / en `revocaciones` | 403 `trial-expirado`              | igual                              |

`expirado` cuenta como `trial` porque solo lo escribía la validación por fecha que se
eliminó: no es una decisión humana.

## Alternativas consideradas

- **Flag de entorno (`TRIAL_ENFORCEMENT_ENABLED`) + valor de plan nuevo `beta`** —
  descartada: más piezas (módulo compartido, tipos nuevos en tres clientes, aviso en el
  panel) para un estado transitorio; volver a validar fechas va a ser un PR con lógica de
  pago nueva de todas formas, no un flip de configuración.
- **Migrar las filas a `plan='activo'`** — descartada: `activo` va a significar «pagó» y
  contaminaría el dato; además obligaría a otra migración al cobrar.
- **`TRIAL_DIAS` gigante + extensión masiva por SQL** — descartada: el contador seguiría
  visible y habría que volver a tocar filas.
- **Quitar `trial-expirado` de `BLOCKING_REASONS` en la app** — descartada: no arregla la
  landing ni las apps instaladas, y el server seguiría marcando `expirado`.

## Consecuencias

- ✅ Nadie pierde acceso por fecha; los `expirado` vuelven con solo iniciar sesión; cero
  cambios de DB y cero tareas mensuales.
- ✅ Efecto inmediato al desplegar la landing, también en apps viejas: reciben
  `plan: "trial"` sin `diasRestantes`, y su `License.tsx` solo pintaba el contador con
  `daysLeft !== null`, así que no muestran nada y entran igual.
- ⚠️ Reactivar el vencimiento es un cambio de código en las dos Functions. Como las filas
  nuevas siguen recibiendo `now() + TRIAL_DIAS`, para entonces casi todos estarán
  vencidos: ese PR debe dar un período de gracia antes
  (`update public.usuarios_acceso set plan = 'trial', trial_expira = now() + interval '14 days' where plan in ('trial', 'expirado')`).
- ⚠️ La vista `usuarios_acceso_resumen` y el badge `expirado` de `/admin` siguen
  reflejando la fecha: son informativos, no bloquean.
- ⚠️ `/trial-expirado` en la landing y la variante «Tu prueba se terminó» de AccessDenied
  solo se alcanzan con `cancelado` o `revocaciones`, y su texto sigue hablando de prueba;
  lo mismo `login.info` («prueba de 10 días gratis»). Copy pendiente, fuera de alcance.
- 🔒 Ningún cliente vuelve a leer ni mostrar `diasRestantes`/`trialExpira`. Si el server
  los reintroduce, la UI se diseña de nuevo; no se resucita el contador.

## Verificación de cumplimiento

- **Tests:** no hay framework de tests para `functions/` de la landing ni para `src/` de
  la app. La Function se compila con
  `pnpm dlx wrangler pages functions build --outdir /tmp/vimo-functions-build`.
- **Guards:** `pnpm check:locales` (mismas claves en es/en/pt); `pnpm build` (tsc) falla
  si algún consumidor sigue leyendo `daysLeft`/`trialExpiresAt`.
- **Greps:** `grep -rn "diasRestantes\|trialExpira" functions src` en la landing y
  `grep -rn "daysLeft\|trialExpiresAt\|trialTitulo" src public/locales` acá, sin
  resultados.
- **Manual (landing con `wrangler pages dev`):** con un usuario cuya fila esté en
  `expirado`, `POST /api/verificar-acceso` responde
  `{"autorizado":true,"motivo":"ok","plan":"trial"}` y la fila sigue `expirado`;
  `POST /api/licencia/emitir` responde `ok:true` con `"plan":"trial"` en el payload; un
  usuario `cancelado` recibe 403.
- **Manual (app):** la vista Licencia muestra «Acceso completo durante la beta» y ningún
  contador.
- **Cómo se vería una regresión:** un usuario bloqueado en `/trial-expirado` o en
  AccessDenied sin estar `cancelado`; o una cuenta regresiva en Licencia, Descargar o el
  navbar.

## Fuera de alcance

- Abrir el gate (`BETA_GATE_ENABLED=false`): decisión aparte.
- El copy de marketing que promete «prueba de 10 días» y «$20/mes» (login de la app,
  `NoAutorizado`, `TrialExpirado`).
- El servidor de pagos y la lógica de gracia: se diseñan cuando exista el cobro.

## Referencias

- ADR-0006 (gate por loaders y contrato del veredicto), ADR-0029 (flag `demo` del
  veredicto).
- `vimo-landing/SETUP_GATE_BETA.md` (operación del gate y tabla de planes).
- `vimo-landing/functions/api/verificar-acceso.ts`,
  `vimo-landing/functions/api/licencia/emitir.ts`.
