# Entrega 3: estado de la implementación y traspaso

Implementación de la Entrega 3 de [design.md](design.md) (§9) según [plan-e3.md](plan-e3.md), hecha
el 2026-10-06 con el patrón de las entregas anteriores: el orquestador escribió el contrato
([ADR-0049](../../adr/ADR-0049-catalogo-remoto-administrado.md)), aplicó el SQL, hizo la app y la
integración, y dos agentes en paralelo hicieron el sidecar y el servidor, cada uno con sus guards o
tests. Rama `feat/catalogo-remoto` (VIMO-TAURI, local, sobre `feat/catalogo-estilos` en
`58ef3911`) y rama `feat/catalogo-remoto` de `vimo-landing` (local, sobre `origin/main` `41fb4a8`).

## Qué quedó

- **Supabase (producción, proyecto Vimo.app), ya aplicado el 2026-10-06:** la tabla
  `public.catalog_styles` (borrador y copia publicada de cada estilo, `revision` como candado
  optimista, `samples_revision` con la última tanda del bucket, RLS activo sin políticas, índice
  parcial por posición e id de los publicados), el bucket público **`previews-gemas`** (JPEG de
  hasta 4 MiB, rutas `<id>/s<revision>/sample-<n>.jpg`, tandas inmutables) y la semilla: las 38
  gemas de hoy publicadas, en el orden de la pestaña, con `samples: { revision: 0, count: 4 }` (sus
  muestras siguen empaquetadas en la app, nadie baja 20 MB). Lo ejecutó Claude con la sesión del CLI
  de Supabase del dueño, por pedido suyo (reemplaza para esta entrega la decisión G1 del diseño).
  El SQL está en `SETUP_CATALOGO_REMOTO.md` de `vimo-landing`.
- **Servidor (`vimo-landing`, rama `feat/catalogo-remoto`):** `GET /api/catalogo?conocida=` (lo
  publicado con una versión; «sin cambios» si coincide), `GET|POST /api/admin/catalogo`,
  `PATCH|DELETE /api/admin/catalogo/:id`, `POST …/:id/muestras` (reserva la tanda siguiente y firma
  una subida por archivo), `…/:id/publicar`, `…/:id/ocultar` y `POST /api/admin/catalogo/traducir`
  (P8, con el modelo del reconstructor). Guardados por `exigirAcceso` más el interruptor
  `remoteCatalog` y, los de admin, el correo en `admins`; errores `{ code }` con CORS. Validación en
  dos niveles: al guardar, forma y límites (los mismos del sidecar y la app) y la coherencia de
  «Dinamismo»/«Personaje fijo» con sus secciones; al publicar, además el nombre en tres idiomas, el
  estilo visual, las 4 muestras presentes en el bucket, la oración «Outfit:» y ningún marcador
  `[…]` salvo `[IDIOMA DEL GUION]` en el inicio y el final fijos. `VIMO_FLAG_REMOTE_CATALOG` entra a
  `features.remoteCatalog`. Primer uso de Supabase Storage en ese repo.
- **Sidecar:** la caché `<raíz>/_catalog/` (`catalog.json`, tandas `<id>/s<n>/`, `_drafts/<id>/`;
  `_catalog` es carpeta reservada), `catalog-styles-list` con `remote`, `catalog-styles-sync`
  (valida todo el manifiesto antes de tocar el disco, baja solo lo que falta, JPEG ≤ 4 MiB solo del
  origen del bucket, escribe `catalog.json` al final y de forma atómica, borra lo viejo),
  `generate-style-samples` con `catalogDraft` (las 4 muestras del borrador en `_drafts/<id>/`),
  `catalog-style-samples-upload` (un `PUT` por archivo a su URL firmada) y la copia y el retrato con
  `resolveCatalogGem` (sincronizada primero solo con `remote`). Códigos nuevos
  `catalog_sync_failed` y `catalog_upload_failed`.
- **App**, detrás de `features.remoteCatalog` (y `newCatalog`): la pestaña Catálogo sincroniza al
  montarse (lista → manifiesto con la versión conocida → `catalog-styles-sync` → lista; un fallo no
  se muestra como error) y muestra las gemas sincronizadas con sus muestras de disco. Un admin con
  conexión ve todos los estilos del servidor con su distintivo («Sin publicar», «Oculto», «Cambios
  sin publicar»), el menú con Editar, Generar muestras, Publicar, Ocultar y Eliminar, la tarjeta
  «Crear estilo» y el modal del admin (`CatalogAdminModal`): pegar la gema → el agente con
  `origin: 'catalogo'` la ordena → id sugerido desde el nombre, nombre en tres idiomas con «Traducir
  con IA», etiquetas de la paleta o propias (las dos de comportamiento las pone la app sola),
  modos, filtro, posición, las muestras (guardar → generar con las claves del admin → reservar la
  tanda → subir → guardar con la tanda) y Publicar (apagado mientras falte algo, con la lista de lo
  que falta). Un `borrador-cambio` ofrece reintentar con la revisión nueva sin perder lo escrito.
  Los avisos de cada acción van pegados abajo, con la píldora amarilla del nombre, y «Usar en este
  video» vale para un borrador. Sin conexión, el admin ve el catálogo como cualquier usuario.
- **Eliminar = archivar 30 días (pedido del dueño del 2026-10-06, después del traspaso de las
  12:15):** `DELETE` archiva en vez de borrar (`status = 'archived'`, `archived_at`,
  `archived_from`; lo publicado y las muestras quedan), `POST …/:id/restaurar` vuelve al estado
  anterior, y guardar, reservar, publicar u ocultar un archivado responde `409 archivado`. El
  servidor purga los vencidos (fila y bucket) de a 5, después de responder `GET /api/catalogo`,
  `GET /api/admin/catalogo` y el `DELETE`. En la app, el admin tiene las pastillas «Catálogo · N» y
  «Archivados · N»; una archivada lleva «Se elimina en N días» y solo Ver y Restaurar. Migración
  aplicada en producción el 2026-10-06 a las 12:45 (`SETUP_CATALOGO_REMOTO.md`).

## Decisiones tomadas durante la implementación

- **`remote` también en la copia y el retrato.** `CatalogCopyToCustomPayload` y
  `GenerateCharacterPreviewPayload` suman `remote?: boolean` (ajuste del contrato tras la duda del
  frente A): sin `remote`, el sidecar busca solo en las gemas empaquetadas, así que con el
  interruptor apagado nada cambia aunque la persona haya sincronizado antes.
- **Dos niveles de validación en el servidor** (guardar vs. publicar), para que un borrador recién
  salido del agente (por ejemplo sin la oración «Outfit:», que el agente omite cuando la gema no
  describe la ropa) se pueda guardar y completar después. La app repite la lista de lo que falta
  (`catalogPublishBlockers`) para mostrarla antes de pedir.
- **El id «traducir» está reservado** (chocaría con `/api/admin/catalogo/traducir`): el servidor lo
  rechaza y la app sugiere `estilo-traducir`.
- **Las tandas son inmutables de verdad:** un segundo `PUT` a la misma URL firmada responde
  `KeyAlreadyExists` (visto contra el bucket real). Por eso cada generación reserva una tanda nueva
  y la app nunca vuelve a subir a una tanda ya usada.
- **El CDN sigue sirviendo un archivo borrado** hasta que vence su caché (`cf-cache-status: HIT`
  después del `DELETE`). Las rutas inmutables hacen que no importe; eliminar un estilo deja copias
  en caché unos minutos, nada más.
- **La paleta de etiquetas se espeja en la app** (`catalogTagPalette.ts`, tipada con
  `Record<CatalogTagKey, LocalizedText>` y fijada por guard contra `CATALOG_TAGS`), porque `src/`
  solo importa tipos de `pipeline/`.
- **La sincronización es una query de TanStack con efecto** (`videosQueryKeys.catalogSync`), para
  que el admin la vuelva a correr invalidándola al publicar, ocultar o eliminar; con
  `networkMode: 'always'`, como todo lo que no debe quedar en pausa.

## Límites conocidos

- Un estilo publicado que el sidecar rechace al sincronizar (por ejemplo un `templateVersion` 2
  cuando exista) deja a esa app con el último catálogo sincronizado; el servidor valida al menos lo
  mismo que el sidecar, así que hoy no puede pasar con la versión 1.
- El retrato de un personaje con un estilo del catálogo usa las secciones publicadas (o las
  empaquetadas), no el borrador del admin.
- Las muestras de un borrador se muestran desde el disco hasta cerrar el modal; al reabrir salen
  del bucket. Una generación con un proveedor que no devuelva JPEG no se puede subir (Evolink y Fal
  piden JPEG explícitamente; nunca se vio otra cosa).
- Las redirecciones del bucket cuentan como fallo (la URL pública responde 200 directo).
- Sin historial de versiones (P16). La papelera es el archivado de 30 días: en ese plazo eliminar
  se deshace con Restaurar; vencido, la purga es definitiva. La purga es perezosa (corre con los
  pedidos al catálogo): si nadie pide el catálogo, un vencido espera a la próxima visita.
- La etiqueta «Se elimina en N días» se calcula al renderizar; una pestaña abierta días seguidos
  no la actualiza sola (se actualiza con cualquier acción o al volver a la pestaña).

## Verificación

- VIMO-TAURI: `pnpm format:check`, `pnpm lint`, `pnpm build` y `pnpm check:locales` en verde;
  guards del catálogo, las gemas, el carril y la app: 666 de 666 (nuevos:
  `check-catalog-cache.mjs`, `check-catalog-sync.mjs`, `check-catalog-draft-samples.mjs`,
  `check-app-catalog-sync.mjs`, `check-app-catalog-admin.mjs`). El recorrido del admin con el
  formulario real en Chrome sin interfaz, el servidor y el sidecar simulados: 31 de 31 (crear,
  preparar con IA, traducir, etiquetas, guardar, generar y subir muestras, publicar, ocultar,
  volver a publicar, editar con conflicto, usar en el video, eliminar, no admin, sin lista).
- `vimo-landing` (commit `48f137d`): `pnpm test` 1263 de 1263 (12 archivos y 429 casos nuevos con
  simuladores de la tabla y del bucket, incluido el recorrido de punta a punta y los Review Focus 3
  y 4), `pnpm build` y `wrangler pages functions build` en verde; `pnpm lint` sigue con 3 errores
  previos de `src/components/ui/` y `tailwind.config.ts` que vienen de `main`.
- La API de Storage, contra el bucket real: firmar, subir, listar, leer en público y borrar.
- Falta la prueba del dueño con el servidor desplegado (Ola 4).

## Pendientes y pasos del dueño

1. **Publicar el servidor:** aprobar el push de `feat/catalogo-remoto` de `vimo-landing`, el PR y el
   merge a `main` (eso despliega vimo.click), y cargar `VIMO_FLAG_REMOTE_CATALOG=admins` en
   Cloudflare Pages antes del merge (o redesplegar después).
2. **QA con la cuenta de admin** en la app de prueba: crear una gema nueva pegando su texto, generar
   sus muestras, publicarla; editar una existente y sus etiquetas; ocultar; eliminar; y verla desde
   una cuenta que no sea admin (necesita `all`, paso 3).
3. Visto bueno: `VIMO_FLAG_REMOTE_CATALOG=all` (junto con `newCatalog`), para que lo que se publique
   lo vean todos los usuarios.
4. Push y PR de la app cuando lo diga; la rama sale de `feat/catalogo-estilos`, que puede ir a PR
   antes.
