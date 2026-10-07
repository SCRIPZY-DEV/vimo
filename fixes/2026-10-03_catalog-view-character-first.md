# Fix: en «Ver» del catálogo el personaje se elige antes de las muestras

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

«Ver» de un estilo del catálogo (`CatalogStyleModal`) mostraba primero el carrusel de muestras, que
con su 16:9 ocupa casi todo el alto del modal, y recién debajo el bloque «Personaje de este estilo»
con los interruptores. Para elegir quién protagoniza había que scrollear, y el orden era el inverso
del modal de Mi estilo (personaje, después muestras).

Pedido del dueño en la QA del 2026-10-03: los interruptores van arriba, debajo de la descripción y
las etiquetas.

## Corrección

`src/modules/videos/components/CatalogStyleModal.tsx`: el `StyleCharacterBlock` pasa arriba del
carrusel (y del marcador «Este estilo todavía no tiene muestras»). El encabezado (nombre,
descripción y etiquetas) y el pie fijo con «Pasar a mi estilo» y «Usar en este video» no cambian.

## Límites deliberados

- No cambia qué modos de personaje ofrece cada estilo ni cómo se recuerdan.
- El modal sigue scrolleando cuando el bloque y el carrusel no entran juntos en la ventana; el pie
  sigue fijo.

## Validación reproducible

```bash
pnpm format:check
pnpm lint
pnpm build
```

No hay framework de tests de componentes (ver `CLAUDE.md`), así que el orden no tiene guard. En la
app: Crear → pestaña Catálogo → los tres puntos de una tarjeta → «Ver». El bloque «Personaje de este
estilo» tiene que quedar debajo de las etiquetas y arriba de la primera muestra.

## Pruebas manuales

- Con el formulario real de Crear montado en Chrome sin interfaz (dentro de `StrictMode`, con la API
  simulada y las 38 gemas reales): en «Ver» de POV Stickman las etiquetas quedan a 316 px del borde
  superior, el bloque de personaje a 366 px y la primera muestra a 655 px. Captura revisada.
- Falta el recorrido del dueño en `pnpm tauri dev`.
