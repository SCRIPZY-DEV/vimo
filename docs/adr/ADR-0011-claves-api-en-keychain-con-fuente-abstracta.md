# ADR-0011 — Claves API en el keychain del SO detrás de una fuente abstracta

- **Estado:** Aceptada
- **Fecha:** 2026-08-15
- **Área:** app | seguridad | providers
- **Enmendada por:** [ADR-0023](ADR-0023-una-entrada-de-keychain-y-firma-estable.md)
  (una sola entrada del keychain para todas las claves; el resto sigue vigente).

## Problema (obligatoria)

Los módulos por migrar (AI Music, Voices, Create — orden de la ADR-0010) necesitan
las claves API BYO del usuario, y el `PipelineJob` las recibe inyectadas por Rust.
En el proyecto origen las claves viven en un `.env` en texto plano gestionado por el
servidor Hono, mientras la UI promete «se guardan cifradas en tu máquina» — promesa
que nunca se cumplió. Además el catálogo de proveedores estaba triplicado (pasos del
wizard, dashboard y server) y los mensajes de error hardcodeados en español.

Restricciones que achicaron el campo:

- ADR-0007 eliminó el servidor local: no hay dónde poner validadores HTTP salvo Rust
  o el sidecar (que aún no existe).
- ADR-0010 marca como regresión que `src/` llame a proveedores de IA por HTTP y que
  un provider lea claves del env.
- Futura membresía: las claves llegarán gestionadas desde Supabase (el usuario no
  las carga a mano) — el diseño debe dejar ese camino abierto sin reescribir nada.
- Multiplataforma: el crate `keyring` no soporta Android.

## Decisión (obligatoria)

Las claves API se guardan **en el almacén seguro nativo de cada plataforma**, detrás
del trait `KeySource` en Rust; la UI solo ve estado y versiones enmascaradas, nunca
la clave completa. La validación contra proveedores se hace **en Rust con reqwest**.

### Forma (opcional)

| Componente              | Estado                     | Ubicación                                        | Para qué                                                                                 |
| ----------------------- | -------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Trait `KeySource`       | nuevo                      | `src-tauri/src/api_keys/source.rs`               | contrato get/set/delete; hoy manual, mañana managed (Supabase)                           |
| `KeychainSource`        | nuevo                      | mismo archivo, `cfg(not(target_os = "android"))` | crate `keyring`: Keychain macOS/iOS, Credential Manager Windows, secret-service Linux    |
| `AndroidKeystoreSource` | nuevo                      | mismo archivo, `cfg(target_os = "android")`      | delega en el plugin local `tauri-plugin-secure-keys` (Kotlin + Android Keystore AES-GCM) |
| Metadata NO sensible    | nuevo                      | `api-keys.json` en appDataDir vía `StoreExt`     | maskedKey/savedAt/lastValidatedAt — evita tocar el keychain en cada render               |
| Comandos invoke         | nuevos (primeros del repo) | `src-tauri/src/api_keys/commands.rs`             | `get_api_keys_status`, `save_api_key`, `delete_api_key`, `validate_api_key`              |
| Validadores             | nuevos                     | `src-tauri/src/api_keys/validation.rs`           | una request mínima por proveedor; el check Fal-Admin corre además al guardar             |
| Módulo frontend         | nuevo                      | `src/modules/api-keys/`                          | dashboard (sin wizard por pasos), catálogo único en `providers.ts` (patrón ADR-0008)     |

### Flujo de datos (opcional)

1. La vista llama `apiKeysApi.save(providerId, key)` → `invoke('save_api_key')`.
2. Rust valida formato mínimo (y Admin si es Fal), escribe en el keychain y
   actualiza `api-keys.json` con la metadata enmascarada.
3. `get_api_keys_status` responde SOLO metadata — la clave nunca cruza al webview.
4. Cuando exista el pipeline (ADR-0010), Rust lee del `KeySource` para armar
   `PipelineJob.apiKeys`. Se **enmienda** el literal de ADR-0010 «apiKeys (del store
   de ajustes)» → «apiKeys (de la fuente de claves, ADR-0011)».

## Alternativas consideradas (obligatoria)

- **`tauri-plugin-store` en texto plano (`api-keys.json`)** — cero dependencias
  nuevas y alineado literal con ADR-0010, pero repite el `.env` plano del origen:
  cualquier proceso del usuario lee las claves. Descartada por el requisito de
  seguridad; el store queda solo para metadata no sensible.
- **`tauri-plugin-stronghold`** — vault cifrado multiplataforma, pero exige
  password/salt propios (¿de dónde sale sin fricción?) y es una dependencia pesada
  para ~7 claves. Descartada.
- **Validar claves desde la SPA con fetch/plugin HTTP** — CORS lo impide para varios
  proveedores y expone claves al contexto JS (XSS); además ADR-0010 lo lista como
  regresión. Descartada.
- **Hashear las claves** (idea para la versión web) — inviable por definición: el
  hash es unidireccional y el backend necesita la clave en claro para llamar al
  proveedor. En web el patrón correcto es cifrado reversible en DB (AES-256-GCM con
  clave maestra en KMS, envelope por usuario); se hashean contraseñas, no API keys.

## Consecuencias (obligatoria)

- ✅ La promesa «cifradas en tu máquina» es verdadera por primera vez; claves fuera
  del alcance del webview y de otros procesos de usuario (en macOS el acceso queda
  ligado a la firma de la app).
- ✅ Camino abierto para la membresía: `ManagedSource` (baja claves de Supabase con
  la sesión y las cachea en el keychain) implementa el mismo trait; `ApiKeyStatus`
  ya expone `source: 'manual' | 'managed'` y el dashboard ocultará inputs managed.
- ✅ En web el `api/` del módulo cambia `invoke()` por `fetch()` (dual de ADR-0007)
  sin tocar UI ni tipos.
- ⚠️ Primeros comandos Rust del repo: se estrena `invoke_handler`, manejo de errores
  serializable (`{ code }` → i18n en la UI) y deps nuevas (`keyring`, `reqwest`
  rustls, `thiserror`).
- ⚠️ Android requiere un plugin móvil propio en Kotlin (el crate `keyring` no lo
  cubre); en móvil el pipeline no corre (sin sidecars), así que el uso real llegará
  con el modo cliente-delgado/membresía — el storage queda listo desde ahora.
- 🔒 Ningún comando devuelve la clave completa al webview. Ninguna clave se escribe
  en JSON/disco en claro. `src/` no llama a proveedores de IA por HTTP (refuerza
  ADR-0010).
- 🔒 ADR-0009 se matiza: «sin comandos Rust propios» aplica a preferencias que los
  plugins ya resuelven; secretos + HTTP saliente SÍ son lógica propia y van por
  invoke.

## Verificación de cumplimiento (obligatoria)

- **Guards (greps):**
  - `grep -rn "invoke(" src/modules` → solo `src/modules/*/api/index.ts`.
  - `grep -rn "fetch(" src/modules/api-keys` → vacío.
  - `grep -rn "plugin-store" src/` → solo `modules/settings/api/index.ts` (la
    metadata de claves se escribe desde Rust, no desde JS).
- **Manual (hasta que haya framework de tests):** guardar clave → aparece en
  Keychain Access dentro de la única entrada con service `click.vimo.portable` y
  account `api-keys` (ADR-0023) y NO en `api-keys.json`;
  reiniciar app → estado persiste; clave Fal no-Admin → error `not_admin`
  traducido; eliminar → desaparece del keychain.
- **Cómo se vería una regresión:** una respuesta de `get_api_keys_status` con el
  campo de la clave completa; una clave legible en `api-keys.json`; un hook de React
  llamando a un proveedor.

## Fuera de alcance (opcional)

- `ManagedSource` (membresía/Supabase): documentada acá, se implementa con esa
  feature.
- Backend web con claves cifradas en DB: llegará con la versión web.
- Biometría/passphrase para desbloquear claves: el keychain del SO ya protege con la
  sesión del usuario; no se agrega fricción extra.

## Referencias (opcional)

### Adenda 2026-09-12 — Guardar exige probar la clave actual

Por pedido del usuario, la tarjeta ya no permite guardar sin conexión exitosa.
El hook comprueba el valor exacto normalizado y la revisión del intento: editar,
cancelar o reprobar revoca el éxito anterior y descarta respuestas tardías.
Esto es una condición del editor de claves, no un nuevo contrato de Rust ni un
cambio del llavero. Los validadores y el control Fal Admin siguen vigentes.
Ver [corrección y QA](../fixes/api-key-validation-before-save.md).

- ADR-0007 (invoke reemplaza al servidor local), ADR-0008 (catálogo como dataset),
  ADR-0009 (plugins nativos y store), ADR-0010 (PipelineJob con apiKeys inyectadas).
- Origen: `02-vimo/cursor-video/app/servidor-local/ajustes/validadores.ts` y
  `rutas/ajustes.ts` (check Fal-Admin), `BienvenidaWizard.tsx` (UX de referencia).
