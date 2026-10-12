# Fix: navegación sin espera de salida animada

- **Fecha:** 2026-10-08
- **Rama:** `fix/ui-nonblocking-route-transition-20261008`
- **Base QA:** `3a6d3e5007c5c4e8b8935db89373223774159ab2`

## Causa

Root observó en la QA nativa que el hash y la selección del sidebar cambiaban,
pero la vista anterior seguía en AX/DOM y el main quedaba invisible. Los controles
locales respondían y la navegación terminaba minutos después, en ambos sentidos.

El contenedor usaba `AnimatePresence mode="wait"` y `FrozenOutlet`. La salida
reducía la opacidad a cero y retenía la vista hasta que terminara la promesa de
animación. Una entrega tardía de su callback dejaba el contenido anterior invisible
y no montaba el destino. La prueba causal retuvo únicamente el `onfinish` real
de esa salida WAAPI; reprodujo el estado y lo liberó enviando sólo el callback.
No demuestra por qué WebKit retrasó la entrega real: esa causa permanece abierta.

## Corrección

- Se reemplaza el contenedor Motion por un `div` con la misma key ruta/idioma.
  Se elimina la espera de salida; el destino se monta en el commit de React.
- Se conservan `FrozenOutlet` y `ErrorBoundary`, con una instancia del destino
  por visita, y el mismo nodo `<main>`/scroll. Sólo se actualiza el comentario
  de FrozenOutlet para reflejar que ya no hay una salida retenida.
- La entrada CSS conserva 220 ms y desplazamiento de 8 px, con opacidad 0.96→1
  y base visible. No tiene callbacks, timeout, fill-mode backwards/both ni estado
  inicial invisible. `prefers-reduced-motion` desactiva el efecto.
- Se actualiza [ADR-0005](../docs/adr/ADR-0005-layouts-explicitos-y-modulos-base.md).

## Límites deliberados

Sólo frontend. Sin cambios de auth, loaders, rutas, políticas, RPC, sidecar,
Rust, binarios, proyectos, credenciales ni el lote RPC de 323 escenas. No se
aplicó HMR ni se operó la QA canónica viva. Su aplicación requiere la coordinación
solicitada por Root; no hace falta reconstruir SEA, Cargo ni wrapper.

Los checks usan el layout/FrozenOutlet/ErrorBoundary y React Router/Motion reales,
con vistas y controles sintéticos en Chromium efímero, red externa bloqueada y
puerto aleatorio. No autentican, invocan Tauri ni acceden a datos reales. Las
animaciones internas de cada vista no forman parte del cambio. No se afirma
haber reproducido la causa interna de WebKit ni haber aceptado el fix en la app
nativa; eso corresponde a Root tras aplicación coordinada.

## Validación reproducible

La evidencia y el fixture temporal, excluidos del commit, viven en
`/Users/sebas/Documents/Vimo-Flow-QA/2026-10-08-navigation-evidence/`.
`route-fixture.mjs` compila el layout de la base por `git show` para baseline y
negative, sin restaurar ni escribir archivos servidos. Para fixed usa la fuente
actual del worktree aislado. Los manifiestos de inputs registran hashes reales.

```sh
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-08-navigation-evidence/route-fixture.mjs baseline
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-08-navigation-evidence/route-fixture.mjs fixed
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-08-navigation-evidence/route-fixture.mjs negative
pnpm --config.verify-deps-before-run=false format
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false build
```

Comprobaciones locales (no framework oficial de tests):

- Original: 13/13, incluida retención de salida y liberación del mismo callback.
- Corregido: 28/28. Ida/vuelta, una instancia por visita, navegación rápida,
  idioma, recuperación del ErrorBoundary, main/scroll conservados, actualización
  de datos/sidebar sin remontaje, movimiento reducido, rAF retenido, entrada CSS
  pausada/desactivada y StrictMode sin dos instancias de destino.
- Contraprueba: 13/13 reintroduciendo sólo el layout original en el bundle de
  fixture actual. Reaparece el contenido anterior invisible; el destino no se
  monta hasta liberar el callback. El CSS nuevo por sí solo no elimina la barrera.
- El primer intento del fixture no compiló por resolveDir omitido en los módulos
  sintéticos. El primer fixed falló idioma por catálogo sintético vacío, que
  dejaba resolvedLanguage sin resolver; se corrigió el fixture y se conservó
  ese reporte. Ninguno se atribuyó como bug del producto.
- Formato, lint y build (incluido TypeScript) terminaron con exit 0 en ese orden.
  El flag de pnpm evita una instalación implícita; no omite ninguno de los checks.
  Al inicio, pnpm intentó instalar sobre dependencias enlazadas y abortó antes
  de formatear por su guarda noTTY. Se conservó el log, se retiró sólo el enlace
  y se instalaron dependencias propias con lockfile fijo y scripts deshabilitados.
  No se habilitó purge/CI ni se modificaron dependencias canónicas.

## Pruebas manuales realizadas

Root aportó la observación nativa anterior al fix (00:51): Crear resaltado,
main invisible, título y cards de Extensión todavía montados. Esta sesión no
operó la app ni los perfiles. La aceptación manual posterior queda pendiente.

Después de aplicar coordinadamente, verificar Crear→Extensión→Crear sin espera
visual, una vista/título actuales, controles y lote abierto cuando corresponda,
sin cambios de pausa ni envíos. Registrar por separado el resultado de la app
real y el del fixture; una contraprueba sintética no acredita aceptación nativa.
