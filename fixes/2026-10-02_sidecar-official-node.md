# Fix: el sidecar se compila con un Node oficial aunque la terminal tenga el de Homebrew

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

`pnpm tauri dev` y `pnpm tauri build` corren `pnpm run build:sidecar` antes de arrancar
(`beforeDevCommand` y `beforeBuildCommand` de `src-tauri/tauri.conf.json`).
`scripts/build-sidecar.mjs` arma el sidecar con Node SEA: genera el blob con el Node que lo ejecuta
(`process.execPath`), copia ese mismo binario y le inyecta el blob con postject.

El Node de Homebrew del dueño (v25.8.1, `/opt/homebrew/bin/node`) no sirve como base:

- es un lanzador de 68 KB que enlaza `libnode.dylib`;
- no trae el sentinel `NODE_SEA_FUSE`.

postject falla con «Could not find the sentinel NODE_SEA_FUSE_… in the binary» y el comando entero
falla. Además el script escribía directo sobre `src-tauri/binaries/vimo-pipeline-<triple>`: el
sidecar bueno quedaba reemplazado por un archivo roto de 50 000 bytes. Se reprodujo el 2026-10-02
con el Node de Homebrew. La trampa venía registrada en la memoria del proyecto (verificada 4 veces
en agosto) y en `~/.claude/ERRORES-CONOCIDOS.md` (`node-homebrew-sin-sentinel-sea`); el remedio
era anteponer a mano el Node oficial al PATH.

## Corrección

`scripts/build-sidecar.mjs`, antes de empaquetar, mira si el Node que lo corre tiene el fuse de SEA.

1. Si lo tiene (Node oficial, CI), sigue como siempre.
2. Si no lo tiene, busca un Node oficial:
   - `VIMO_SIDECAR_NODE`, si está definida;
   - si no, el runtime oficial pineado, `v22.23.2` para macOS arm64 e Intel. La URL es de
     nodejs.org y el SHA-256 sale del `SHASUMS256.txt` oficial, igual que los pins de
     `fetch-binaries.mjs`.
3. El runtime se descarga una sola vez a `src-tauri/sidecar-build/node-runtime/`, que git ignora,
   y se verifica el hash.
4. El script se vuelve a ejecutar con ese Node. El blob y la base salen del mismo Node, como exige
   SEA.

El binario se arma en `src-tauri/sidecar-build/` y se mueve a `src-tauri/binaries/` recién al
final: si algo falla, el sidecar anterior queda intacto.

## Límites deliberados

- Sin pins para Windows: el `node.exe` oficial ya trae el fuse. Si alguien corre uno que no lo
  trae, el error dice que use el Node de nodejs.org o `VIMO_SIDECAR_NODE`.
- La versión pineada se actualiza a mano, como los demás pins.
- No cambia qué se empaqueta: el sidecar sigue siendo un Node oficial con el blob del pipeline.

## Validación reproducible

```bash
# Con el Node de Homebrew primero en el PATH (el caso que fallaba):
node --version                      # v25.8.1
pnpm run build:sidecar              # descarga una vez el Node oficial y termina «sidecar listo»
grep -a -c NODE_SEA_FUSE src-tauri/binaries/vimo-pipeline-aarch64-apple-darwin   # 1
pnpm run build:sidecar              # segunda vez: sin descarga
# Un fallo ya no rompe el binario bueno:
VIMO_SIDECAR_NODE=/opt/homebrew/bin/node pnpm run build:sidecar   # error claro; el binario no cambia
pnpm tauri build                    # completa (Vimo.app y el .dmg)
```

## Pruebas manuales

- 2026-10-02, en la Mac del dueño con el Node de Homebrew.
- `pnpm run build:sidecar` dejó un sidecar de 112 MB con el fuse y firma ad-hoc.
- El fallo provocado dejó intacto el binario anterior (misma fecha y tamaño).
- `pnpm tauri build` llegó a `Vimo.app` y al `.dmg`. El `.dmg` falló una vez en el paso del Finder
  (`bundle_dmg.sh`) y pasó al reintentar.
- `pnpm tauri dev` compiló y abrió la app.
