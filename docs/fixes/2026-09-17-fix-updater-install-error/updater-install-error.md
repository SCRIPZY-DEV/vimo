# «No se pudo instalar la actualización» al pasar a 0.8.2

Fecha: 2026-09-17. Ver [ADR-0027](../../adr/ADR-0027-actualizaciones-automaticas-tauri-updater.md).

## Síntomas

- En macOS y Windows, algunos usuarios ven el toast «No se pudo instalar la
  actualización. Probá de nuevo más tarde.» al actualizar de 0.8.0 o 0.8.1 a 0.8.2.
- El toast sale **al terminar la descarga**. A otros usuarios les funciona.

## Qué se descartó

Auditoría contra lo publicado, no contra el repo:

- `https://vimo.click/releases/latest.json` responde 200, versión 0.8.2, con las
  tres plataformas.
- Los tres artefactos de `releases.vimo.click/v0.8.2/` responden 200 con su tamaño
  completo, sin `Content-Encoding` aunque el cliente pida compresión.
- Las firmas minisign de Windows y macOS arm64 verifican contra la pubkey de
  `tauri.conf.json` (mismo id de clave, firma Ed25519 prehasheada válida).
- El binario 0.8.1 distribuido (extraído del `.app.tar.gz` de R2) lleva la misma
  pubkey y el mismo endpoint que 0.8.2.
- El `.app.tar.gz` tiene la estructura que el plugin espera (raíz `Vimo.app/`).

## Causa

El fallo está en el paso de instalación de `tauri-plugin-updater` 2.11.0
(`install_inner`), después de descargar y verificar la firma, y depende del entorno:

- **macOS (confirmado):** el plugin hace `rename` de `Vimo.app` hacia la carpeta
  temporal y solo pide contraseña de administrador ante `PermissionDenied`. Si la app
  se abrió desde el DMG montado, sin arrastrarla a Aplicaciones, el volumen es de solo
  lectura (`os error 30`) y aborta. Lo mismo pasa con App Translocation y con una app
  en otro volumen que la carpeta temporal (`os error 18`). Reproducido: desde el DMG
  falla, desde `/Applications` actualiza.
- **Windows (hipótesis, sin reproducir):** el toast solo puede salir al escribir el
  instalador en `%TEMP%` o al lanzarlo con `ShellExecuteW`. El instalador no tiene
  firma Authenticode: un antivirus o Smart App Control puede bloquearlo.

Defecto de fondo: la app colapsaba cualquier error en un solo toast y descartaba el
texto, y `tauri-plugin-log` solo se registraba en builds de debug. No había forma de
saber qué le pasó a cada usuario.

## Corrección

- `src-tauri/src/lib.rs`: `tauri-plugin-log` también en release, a archivo `vimo` en
  el directorio de logs de la app, con el plugin updater en nivel `Debug`.
- `src-tauri/src/updates/`: módulo nuevo.
  - `get_update_install_location`: `installable`, `translocated` o `externalVolume`
    según la ruta del ejecutable (solo macOS; el resto siempre `installable`).
  - `has_running_pipeline_jobs`: no se instala con un video generándose.
  - `report_update_install_failure`: deja el error en el log (el plugin no lo registra).
- `src/modules/settings/api/index.ts`: descarga e instalación separadas
  (`downloadUpdate`, `installUpdate`). Reintentar no vuelve a bajar el paquete.
- `src/modules/settings/utilities/classifyUpdateInstallFailure.ts`: clasifica el error
  por su «(os error N)», estable aunque Windows traduzca el texto. Patrones en
  `constants.ts`.
- `AppUpdateProvider.tsx`: guarda el fallo clasificado, muestra un mensaje por causa y
  separa las fases `downloading` e `installing`.
- `UpdateInstallHelp.tsx`: en el aviso y en Ajustes explica la causa, muestra el detalle
  técnico y ofrece «Descargar instalador» (abre `INSTALLER_DOWNLOAD_URL` con opener).
  Si la ubicación no es instalable, reemplaza al botón de instalar.
- `src-tauri/capabilities/default.json`: `https://vimo.click/*` en `opener:allow-open-url`.
- Catálogos `es/en/pt`: nueve claves `settings.updates*` nuevas.

## Alcance

La corrección viaja en la 0.8.3. Las 0.8.0 a 0.8.2 instaladas conservan el updater
viejo: a quien hoy le falla hay que indicarle que mueva Vimo a Aplicaciones (macOS) o
que instale a mano una vez (Windows).

## QA

- `pnpm format`, `pnpm lint`, `pnpm build`, `pnpm check:locales` y `cargo check` pasan.
- `cargo test --lib updates`: 3 pruebas de clasificación de ruta pasan.
- Clasificador de errores probado con nueve textos reales del sistema.
- **Pendiente, manual:** ciclo completo de ADR-0027 con la app abierta desde el DMG
  (debe mostrar el mensaje de ubicación y no ofrecer instalar), camino feliz desde
  `/Applications`, y las pruebas de Windows listadas en ADR-0027.
