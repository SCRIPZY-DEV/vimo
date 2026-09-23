# Logs de diagnóstico: marca «visto» desde el panel admin — estado

- **Fecha:** 2026-09-23
- **Decisión:** [ADR-0038](../../adr/ADR-0038-logs-de-diagnostico-por-ejecucion-en-supabase.md),
  enmienda del 2026-09-23.
- **Estado:** código completo en vimo-landing y verificado con tests, build y
  compilación de Functions; **falta aplicar el SQL en Supabase y el QA manual** con
  datos reales. En vimo-portable solo cambian docs: la app no toca las columnas nuevas.
  Sin commits en ninguno de los dos repos (rama `feat/checkbox-diagnostics` en ambos).

## Qué se encontró

El panel «Diagnósticos» de vimo.click mostraba todas las ejecuciones fallidas iguales:
soporte no tenía forma de saber cuáles ya había mirado, y con 30 días de retención la
lista de un usuario activo mezcla lo nuevo con lo ya triado. Tres cosas condicionaron
el diseño:

1. **La app de escritorio no necesita cambios.** Solo hace `insert` con claves
   explícitas y sin `.select()`: una columna con default no la afecta, ni vieja ni
   nueva. El esquema canónico vive en la ADR y el SQL se aplica a mano.
2. **La `<table>` del panel no tiene filas de `diagnostic_logs`.** `TablaUsuarios`
   agrega por correo; las filas reales son las tarjetas de `PanelEjecuciones`. El
   checkbox va en la tarjeta y la tabla gana un contador combinado «Sin revisar».
3. **No hace falta abrir RLS.** La Pages Function ya opera con service role, y
   `avisos.ts` tenía el patrón de PATCH admin. Sí hubo que declarar `PATCH` en el
   CORS compartido (`functions/_lib/admin.ts`): toda request del panel lleva Bearer y
   preflightea.

Decisiones tomadas con el usuario: columnas `seen` + `seen_at` + `seen_by` (quién y
cuándo); checkbox solo en `failed`, `crashed` y `cancelled`; chip «Solo no vistos»
resuelto en el servidor; columna «Sin revisar» combinada (sin desglose por tipo).

## Qué se hizo

| Capa        | Archivos                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase    | 3 columnas, check `diagnostic_logs_seen_consistente`, `alter policy` del insert (`and seen = false`), `notify pgrst` — SQL en la enmienda de la ADR y más abajo. Sin índice nuevo (ver decisiones).                                                                                                                                                                       |
| Function    | `functions/api/admin/diagnosticos.ts` (`onRequestPatch`, filtro `?seen=`, cadena de degradación por columnas en los dos GET, `enmiendas_faltantes` en las respuestas), `functions/_lib/admin.ts` (CORS con PATCH)                                                                                                                                                         |
| Lógica pura | `src/lib/diagnosticLogs.ts` (`STATUS_REVISABLES`, `esRevisable`, `parsearSeen`, `paramsMarcarVisto`, `cuerpoMarcarVisto`, `sin_revisar` en `agregarPorUsuario`, `CADENA_COLUMNAS_EJECUCION` / `CADENA_COLUMNAS_USUARIOS`, `esColumnaInexistente` con `PGRST204`)                                                                                                       |
| Hooks       | `src/hooks/useDiagnosticLogs.ts` (`marcarVisto`, filtro `soloNoVistos`, `ajustarSinRevisar`, `actualizarCacheDetalle`, `enmiendasFaltantes` reemplaza a `esquemaIncompleto`)                                                                                                                                                                                             |
| UI          | `diagnosticos/TarjetaEjecucion.tsx` (checkbox, atenuación, «Visto por … · hace …»), `diagnosticos/PanelEjecuciones.tsx` (chip, banners por enmienda), `diagnosticos/TablaUsuarios.tsx` (columna «Sin revisar»), `SeccionDiagnosticos.tsx` (ajuste del contador, banner), `src/utils/formato.ts` (`textoEnmiendaFaltante`)                                             |
| Tests       | `src/test/diagnosticLogs.test.ts`, `src/test/SeccionDiagnosticos.test.tsx` (`simularApi` ahora responde PATCH; fixtures con `seen*`, `sin_revisar`, `enmiendas_faltantes`)                                                                                                                                                                                              |
| Docs        | ADR-0038 (esquema, policy, runbook, consecuencias, verificación, enmienda 2026-09-23), ARCHITECTURE §4 «Logs de diagnóstico», este handoff                                                                                                                                                                                                                                 |

Decisiones que no estaban en el plan original o que conviene conocer:

- **Sin índice parcial.** El resumen por usuario filtra solo por `created_at` y cuenta
  en JS; el listado de un usuario con `seen = false` ya usa
  `diagnostic_logs_email_created_idx`. Queda como opcional comentado en la ADR.
- **`seen_at` lo sella la Function** (`new Date().toISOString()`): PostgREST no puede
  llamar a `now()` en el body de un PATCH y el proyecto no tiene triggers.
- **Sin actualización optimista.** El checkbox refleja la fila, se deshabilita
  mientras guarda y, si el PATCH falla, queda como estaba. La fila se parchea en el
  lugar: un refetch rompería el cursor del polling. Con «Solo no vistos» activo, la
  fila marcada se queda atenuada hasta el próximo cambio de filtro (no desaparece bajo
  el cursor y se puede desmarcar).
- **El contador «Sin revisar» se ajusta en el lugar** (±1), no con `refrescar()`: el
  resumen baja hasta 5000 filas por llamada. Cualquier recarga trae el valor real.
- **Una marca hecha desde otra pestaña u otro admin** se ve al recargar la lista: el
  polling solo pide `created_at > cursor`. Limitación aceptada.
- **`enmiendas_faltantes: EnmiendaEsquema[]` reemplaza a `esquema_incompleto`** en las
  dos respuestas GET: con dos migraciones aplicables a mano, un booleano no alcanzaba
  para decir cuál falta. El texto de cada aviso vive en `textoEnmiendaFaltante`.
- **PostgREST devuelve `PGRST204`, no `42703`, cuando la columna desconocida viene en
  el body de un PATCH.** `esColumnaInexistente` reconoce los dos; sin eso el PATCH sin
  migración caía en un 502 opaco en vez del 409 `esquema-incompleto`.
- **El id del PATCH va siempre en el filtro de la URL y validado con `esUuid`**: un
  PATCH sin filtro actualizaría la tabla entera. No se filtra por status en el
  servidor (marcar una `completed` es inocuo; «solo revisables» lo decide la UI).
- `sin_revisar` es parcial cuando el resumen está truncado (5000 filas), igual que
  `fallidas` / `crashes`; el aviso «Resumen parcial» ya lo dice.

## Verificación hecha

En `vimo-landing/`:

- `pnpm test`: **107 tests en verde** (89 previos + 18 nuevos: 11 del módulo puro y
  10 de componente, menos 3 reescritos).
- `pnpm build` (Vite + `tsc -b`): en verde.
- `pnpm dlx wrangler pages functions build`: «Compiled Worker successfully». Es el
  único gate que compila `functions/`.
- `pnpm exec eslint` sobre los 11 archivos tocados: sin problemas. `pnpm lint`
  completo falla con 3 errores **preexistentes** en `src/components/ui/command.tsx`,
  `src/components/ui/textarea.tsx` y `tailwind.config.ts` (archivos sin tocar).

**No verificado:** el PATCH contra Supabase real, la policy nueva y la vista en el
navegador (requieren el SQL aplicado y `wrangler pages dev` con `.dev.vars`).

## Pasos para dejarlo andando

1. Aplicar en Supabase (SQL Editor). Compatible en ambos sentidos: si la landing se
   despliega antes, el panel funciona con un aviso y el checkbox responde 409.

   ```sql
   alter table public.diagnostic_logs
     add column if not exists seen    boolean     not null default false,
     add column if not exists seen_at timestamptz,
     add column if not exists seen_by text;

   alter table public.diagnostic_logs
     add constraint diagnostic_logs_seen_consistente check (
       (seen and seen_at is not null and seen_by is not null)
       or (not seen and seen_at is null and seen_by is null)
     );

   alter policy diagnostic_logs_insert_own on public.diagnostic_logs
     with check (
       user_id = auth.uid()
       and user_email = lower(auth.jwt() ->> 'email')
       and seen = false
     );

   notify pgrst, 'reload schema';
   ```

   Verificación: `select column_name, data_type, column_default from
   information_schema.columns where table_name = 'diagnostic_logs' and column_name
   like 'seen%';` → tres filas. `add constraint` no tiene `if not exists`: si se
   reejecuta el bloque, solo esa línea falla.

2. Commit y PR de vimo-landing (`feat/checkbox-diagnostics` → `main`) y de vimo-portable
   (`feat/checkbox-diagnostics` → `dev`, solo docs). Sin bump de versión de la app.

## QA manual pendiente

Con el SQL aplicado, `pnpm run build && pnpm dlx wrangler pages dev dist --port 8788`
(`.dev.vars` con la service role, ver README de la landing), sesión de admin:

1. Diagnósticos → la tabla muestra «Sin revisar» coherente con la query del runbook
   de la ADR (`where status in (…) and not seen`).
2. Abrir un usuario con fallos: solo `failed` / `crashed` / `cancelled` tienen el
   checkbox «Visto»; una `completed` no.
3. Marcar una → la tarjeta se atenúa, dice «Visto por <mi correo> · ahora» y «Sin
   revisar» baja 1. Recargar la página: persiste. En SQL: `select id, seen, seen_at,
   seen_by from diagnostic_logs where id = '<uuid>'`.
4. Desmarcar → las tres columnas vuelven a `false / null / null`.
5. Chip «Solo no vistos»: marcar una la atenúa pero no la saca; al cambiar de filtro
   desaparece. Esperar 15 s (polling): la marcada no vuelve a «no visto».
6. Abrir la línea de tiempo de una fila marcada: carga desde caché, sin pedir el
   detalle de nuevo.
7. `curl -i -X PATCH http://localhost:8788/api/admin/diagnosticos -H "Authorization:
   Bearer $TOKEN" -H "Content-Type: application/json" -d '{"id":"<uuid>","seen":true}'`
   → 200 con `item`; `"id":"nope"` → 400 `id-invalido`; `"seen":"si"` → 400
   `seen-invalido`; uuid inexistente → 404; sin Authorization → 401.
8. Policy: con un JWT de usuario normal, `insert` con `seen: true` → rechazado;
   `update … set seen` → 0 filas. Un job nuevo desde la app sigue insertando su fila
   con `seen = false`.
9. Degradación (opcional, en staging o antes del SQL): tabla y panel cargan con el
   aviso de la enmienda 2026-09-23 y el checkbox muestra el 409.
