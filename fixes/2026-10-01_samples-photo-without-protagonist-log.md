# Fix: las muestras explican por qué no usaron la foto del personaje

- **Fecha:** 2026-10-01
- **Rama:** feat/catalogo-estilos

## Causa

En las muestras de una gema de plantilla (`pipeline/commands/styles/generate-style-samples.ts`), la
foto del personaje viaja solo con los momentos que nombran al protagonista
(`written.scenesWithSubject`), como en el video. Si ningún momento lo nombra, la foto ni se sube y
las cuatro muestras salen sin el personaje, sin ningún rastro de por qué: parece que la foto se
ignoró.

## Corrección

Con el personaje en modo referencia y `scenesWithSubject` vacío, el comando emite un evento `log`
de nivel `info`: «no sample moment shows the protagonist: the character photo was not used». El
guard `check-gem-style-samples.mjs` lo exige en el caso en que ningún momento nombra al
protagonista y comprueba que no aparece cuando alguno lo nombra.

## Límites deliberados

- Es una línea de log, sin aviso en la app: el comportamiento (no subir la foto) no cambia.
- No cambia nada para las gemas viejas ni para los modos texto, genérico o sin personaje.

## Validación reproducible

```bash
node --test scripts/test/check-gem-style-samples.mjs
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm exec eslint pipeline/commands/styles/generate-style-samples.ts
```

Sin la línea nueva, el caso de Evolink con los cuatro momentos sin protagonista falla.

## Pruebas manuales

Ninguna en la app todavía: hace falta una gema cuyo dinamismo no muestre al protagonista en los
momentos de muestra y un personaje con foto. Queda en la QA de la Entrega 1 con claves reales (ver el
log del job de muestras).
