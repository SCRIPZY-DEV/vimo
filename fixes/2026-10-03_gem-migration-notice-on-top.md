# Fix: el aviso «Adaptamos …» sale arriba de las tarjetas de Mi estilo

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

La pestaña Mi estilo dibujaba los avisos de la adaptación de una gema (hecha o fallida) debajo de la
grilla de tarjetas. Con pocas tarjetas se veían; con muchos estilos guardados quedaban al final de
la lista, fuera de la vista, y el aviso de una gema ya adaptada además dura solo una visita a la
pestaña (ver `2026-10-03_gem-adaptation-notices.md`): podía irse sin que nadie lo leyera.

Pedido del dueño en la QA del 2026-10-03: «debe salir al inicio del tab Mi estilo; si no, si tiene
muchos estilos se perderá el mensaje abajo al final».

## Corrección

`src/modules/videos/components/CustomStyleGallery.tsx`: los avisos (`GemMigrationNotice`) pasan a
dibujarse entre el título de la pestaña y la grilla, como ya hace la pestaña Catálogo con su aviso
de «Elegí con qué estilo sale tu video». No cambia cuáles se muestran ni cuánto duran.

## Límites deliberados

- El aviso «Elegí con qué estilo…» de Mi estilo sigue debajo de la grilla (no se pidió moverlo y el
  bloqueo del envío lo repite).
- No se trae a la vista con scroll: si la adaptación termina con la persona al final de una lista
  larga, el aviso la espera arriba y la tarjeta ya muestra la etiqueta «Gema adaptada».
- Una adaptación en curso se sigue viendo en su tarjeta, no en estos avisos.

## Validación reproducible

```bash
pnpm format:check
pnpm lint
pnpm build
```

El cambio es de orden en el JSX y el repo no tiene framework de tests de componentes: no hay guard.
En la app: Crear → pestaña Mi estilo → elegir una gema vieja (texto, sin secciones). Al terminar la
adaptación, el aviso «Adaptamos «…» a la ficha de Vimo» tiene que quedar debajo del título de la
pestaña y arriba de la primera tarjeta.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` (como
`pnpm tauri dev`), con la API y el agente simulados: al terminar la adaptación de una gema vieja, el
borde inferior del aviso queda por encima de la primera tarjeta de la galería. Captura revisada.

Falta el recorrido del dueño en `pnpm tauri dev`, con el agente real.
