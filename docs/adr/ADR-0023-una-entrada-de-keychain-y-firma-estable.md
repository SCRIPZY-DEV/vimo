# ADR-0023 — Una sola entrada del keychain para todas las claves y firma estable pendiente

- **Estado:** Aceptada
- **Fecha:** 2026-09-07
- **Área:** app | seguridad | distribución
- **Enmienda:** la forma de almacenamiento de
  [ADR-0011](ADR-0011-claves-api-en-keychain-con-fuente-abstracta.md) (el trait
  `KeySource`, la metadata en `api-keys.json` y la validación en Rust siguen vigentes).

## Problema (obligatoria)

ADR-0011 guardaba **una entrada del keychain por proveedor** (service
`click.vimo.portable`, account = id del proveedor: seis entradas). En macOS el permiso
de lectura de cada entrada está ligado a la firma del binario que la creó, así que:

1. **Un diálogo por API.** El pipeline lee las seis claves al armar cada job y macOS
   muestra un diálogo por entrada. El caché por sesión de `job.rs` solo evitaba
   repetirlo dentro de la misma ejecución.
2. **Vuelve a preguntar tras cada actualización.** La app se firma ad-hoc
   (`codesign --sign -`) y esa firma cambia con cada build. Además el crate `keyring`
   (`security-framework::set_generic_password`) actualiza la entrada existente
   **conservando su lista de acceso**: el binario nuevo nunca queda autorizado.

Restricciones:

- Por ahora la app **no se firma con un certificado** (ni Apple Developer ni
  autofirmado). Sin identidad estable, el diálogo tras actualizar no se puede evitar
  por código; sí se puede reducir a uno.
- No se degrada la seguridad de ADR-0011: la clave nunca cruza al webview ni se escribe
  en claro en disco.

## Decisión (obligatoria)

Guardar **todas las claves en una única entrada** del almacén seguro, cachearla por
sesión en la fuente de claves, y dejar la firma estable como paso pendiente documentado.

- `src-tauri/src/api_keys/source.rs`: constante `KEYCHAIN_ACCOUNT = "api-keys"`; la
  entrada guarda un JSON `{ "<providerId>": "<key>" }`. `KeychainSource` carga la
  entrada una vez por sesión en `KEYS_CACHE` y `set`/`delete` reescriben la entrada y
  el caché en el mismo paso. Si el mapa queda vacío la entrada se borra.
- El trait `KeySource` gana `get_all(app)`: es lo que consume
  `src-tauri/src/pipeline/job.rs`, que ya no tiene caché propio ni recorre proveedores.
  En Android `get_all` itera los proveedores contra el Keystore (no hay diálogos).
- **Migración transparente:** si la entrada única no existe, `migrate_legacy_entries`
  lee las entradas por proveedor una última vez, crea la entrada única (el binario
  actual queda como dueño del permiso) y borra solo las legacy que se leyeron bien; una
  entrada cuyo diálogo el usuario negó se reintenta en la próxima carga.
- **Firma estable (pendiente):** el permiso de la entrada se ancla al requisito de firma
  del binario. Con un certificado (autofirmado local o Apple Developer) el requisito es
  «identificador + certificado» y sobrevive a las actualizaciones. Cómo activarlo está en
  la sección «Empaquetar para macOS» de `docs/CONTRIBUTING.es.md`; hasta entonces cada
  build nuevo pregunta **una** vez.

## Alternativas consideradas (obligatoria)

- **ACL «cualquier aplicación» en la entrada (`SecAccess`)** — elimina todos los
  diálogos, pero cualquier proceso del usuario podría leer las claves. Contradice la
  promesa de ADR-0011. Descartada.
- **Keychain con protección de datos (`kSecUseDataProtectionKeychain`)** — no muestra
  diálogos por entrada, pero exige provisioning profile y entitlement
  `keychain-access-groups`, es decir firma con Apple Developer. Queda como opción
  natural cuando exista el certificado; no resuelve nada hoy.
- **Blob cifrado en disco con la clave maestra en el keychain** — sigue siendo una
  entrada del keychain con el mismo diálogo, más criptografía propia que mantener.
  Descartada.
- **Firmar ya con un certificado autofirmado** — funciona sin cuenta de Apple, pero el
  usuario decidió no firmar todavía; queda documentado como Fase 2.

## Consecuencias (obligatoria)

- ✅ macOS pregunta **una vez por build instalado** (una entrada, «Permitir siempre»),
  no una vez por proveedor.
- ✅ El caché vive donde está el problema (la fuente de claves), y `commands.rs` ya no
  tiene que invalidar nada a mano: guardar o eliminar actualiza el caché y la entrada.
- ✅ El contrato `invoke` (`get_api_keys_status`, `save_api_key`, `delete_api_key`,
  `validate_api_key`), `PipelineJob.apiKeys` y `api-keys.json` no cambian. Sin cambios
  en `src/`, `pipeline/` ni catálogos i18n.
- ⚠️ Hasta que se active una identidad de firma, una actualización de Vimo vuelve a
  preguntar **una** vez. Es un límite de macOS, no del código.
- ⚠️ La primera apertura con esta versión muestra por última vez un diálogo por entrada
  legacy existente (la migración las lee para consolidarlas).
- 🔒 Sigue vigente ADR-0011: la clave nunca llega al webview ni se escribe en claro.

## Verificación de cumplimiento (obligatoria)

- **Guards (greps):** `grep -rn "KEYS_CACHE\|invalidate_api_keys_cache" src-tauri/src`
  → solo `api_keys/source.rs` (ningún caché fuera de la fuente).
  `grep -rn "Entry::new" src-tauri/src` → solo `api_keys/source.rs`.
- **Manual (hasta que haya framework de tests):**
  1. Con entradas legacy presentes, abrir la app y lanzar un job (o «Probar» una
     clave): en Acceso a Llaveros queda **una sola** entrada `click.vimo.portable` con
     account `api-keys` y ninguna con account de proveedor; la UI sigue mostrando todas
     las claves configuradas.
  2. Reiniciar y lanzar un job: un único diálogo (o ninguno si se eligió «Permitir
     siempre» y el binario no cambió). Probar, guardar y eliminar desde Claves de API no
     abre diálogos adicionales.
  3. Guardar una clave nueva y eliminar otra: el siguiente job recibe el mapa
     actualizado sin reiniciar.
  4. Reempaquetar (build ad-hoc nuevo) e instalar: aparece **un** diálogo, no seis.
- **Cómo se vería una regresión:** más de una entrada con service `click.vimo.portable`
  en Acceso a Llaveros; más de un diálogo del keychain en una misma sesión; un
  `HashMap` de claves cacheado fuera de `source.rs`.

## Fuera de alcance (opcional)

- ~~Activar la firma (`APPLE_SIGNING_IDENTITY`, notarización)~~ — **hecho en
  2026-09**: el workflow `build-installer.yml` firma con Developer ID y notariza a
  partir de los secretos `APPLE_*` (`docs/CONTRIBUTING.es.md`). La identidad ya es
  estable entre versiones: al instalar la primera build firmada sobre una ad-hoc, el
  llavero pregunta una última vez y, con «Permitir siempre», no vuelve a hacerlo. Los
  builds locales sin variables siguen siendo ad-hoc y conservan el diálogo por build.
- `ManagedSource` (membresía/Supabase): sigue pendiente según ADR-0011.

## Referencias (opcional)

- ADR-0011 (claves en el keychain), ADR-0013 (binarios empaquetados y firma ad-hoc).
- `keyring` 3.x sobre `security-framework`: `set_generic_password` crea o actualiza la
  entrada; al actualizar, la lista de acceso existente se conserva.
