# Integración de dev y exportación de clips

- **Fecha:** 2026-10-12
- **Rama:** feat/flow-export-motion

## Causa
Los commits nuevos de dev optimizan la repetición de imágenes en FFmpeg y cambian el mismo bloque que la exportación con movimiento opcional.

## Corrección
Integra origin/dev 87c84e37. Decodifica y escala una vez; el filtro de movimiento sigue dependiendo de imageMotion. Conserva diagnósticos y cierre de sidecar de dev.

## Límites deliberados
No cambia cuentas, proyectos ni imágenes existentes.

## Validación reproducible
`pnpm format`, `pnpm lint`, `pnpm build`; `node scripts/test/check-render-chunks.mjs` y `node scripts/test/check-final-mix-copy.mjs`.

## Pruebas manuales
Sin nueva prueba visual en este bloque. Las diez comprobaciones de FFmpeg ejecutan renders reales; la compilación final se valida por separado.
