# Fix: un prompt vacío sigue vacío aunque la gema tenga frases fijas

- **Fecha:** 2026-10-01
- **Rama:** feat/catalogo-estilos

## Causa

`sanitizeFinalPrompt` (`pipeline/stages/shared/prompt-safety.ts`) vuelve a sumar, en su paso 5, la
cláusula de plataforma de «sin texto» cuando el recorte la sacó (Tarea A6, solo para gemas de
plantilla con frases fijas). Ese paso no miraba si el prompt estaba vacío: con frases fijas, un
prompt vacío o en blanco volvía como «. Do NOT print the narration …» en vez de `''`. Eso rompía el
contrato de los helpers de anexado (`if (!trimmed) return trimmed`), del que dependen los llamadores
para saber que no hay escena.

## Corrección

El paso 5 solo corre si hay texto: la condición pasa a exigir `result` además de las frases y la
falta de la cláusula. Sin escena no hay nada que proteger, y los pasos 3 y 4 ya dejan vacío un
prompt vacío.

## Límites deliberados

- Hoy no se llega a este caso: `images.ts` valida el prompt antes de sanearlo y el carril solo
  sanea prompts con texto. El arreglo cierra un contrato roto, no un fallo visible.
- No cambia nada para las gemas viejas ni para el catálogo (sin frases fijas, el paso 5 no corre).

## Validación reproducible

```bash
node --test scripts/test/check-gem-fixed-phrases.mjs
```

El caso nuevo prueba `''`, `'   '` y `'\n\t '`, con frases y sin ellas: los seis devuelven `''`. Sin
la corrección, el caso falla (22 de 23); con ella, 23 de 23.

## Pruebas manuales

Ninguna en la app: el camino no se alcanza hoy desde la interfaz. Lo cubre el guard.
