# Fix: integrar dev preservando recuperación e idioma de prompts

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922

## Causa

Mientras se completaban los cambios de animación, dev avanzó con una corrección de
idioma de prompts, cambios de beta, documentación de diagnósticos y versión 0.8.7.
Tres archivos del redactor y tres documentos tenían conflictos reales. La ADR-0040
estaba ocupada tanto por la animación histórica como por la política de beta.

## Corrección

Se integra origin/dev mediante merge en la rama de trabajo, conservando la
recuperación de fragmentos válidos y el revisor narrativo de esta rama. Se conserva
la regla de salida completa en inglés de dev y su diagnóstico de gema incorrecta:
un lote completamente inválido por idioma no bloquea al modelo ni desencadena
rescate con otro modelo. La lectura temporal mantiene los IDs ya válidos ante una
respuesta parcialmente incompleta.

ADR-0040 de beta conserva su identificador. La nota histórica de animación se
renombra ADR-0047 y se actualizan sus referencias; el contenido y los contratos no
se sustituyen por la política de beta. El catálogo de movimientos no forma parte
de este commit de integración.

## Límites deliberados

No se reescribe el historial de commits previos. Dev y production no reciben
commits directos. El revisor narrativo sigue siendo temporal, con coste y latencia
adicionales y sin garantía universal de coherencia semántica.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm exec tsc -p tsconfig.pipeline.json
pnpm check:locales
node scripts/test/check-verbatim-prompt-language.mjs
```

Guards oficiales: 66/66 de catálogo, identidad y persistencia, y 10/10 del idioma
incorporado por dev. Otras seis comprobaciones temporales del writer real verifican
recuperación por ID, texto vacío, duplicados, idioma completo/mixto, red y revisión
selectiva, sin llamadas pagadas. El pipeline real de escritura se ejerce con cliente
simulado. Los scripts nuevos de esta comprobación no se incluyen en el commit.

La versión del paquete cambió de 0.8.6 a 0.8.7; dependencias y lockfile permanecen
idénticos. Pnpm 11 intentó reinstalación automática por el fingerprint del manifiesto.
Se verificó la igualdad y se usó `pnpm_config_verify_deps_before_run=warn` solamente
en los comandos de validación local para conservar las dependencias ya instaladas.

## Pruebas manuales

Inspección del diff de integración y contraste con ambos padres. Sin llamadas
pagadas ni generación de proyectos reales como parte de esta integración.

Comprobaciones completas: format, lint, build, tipos del pipeline y locales correctos.
