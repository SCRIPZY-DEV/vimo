# Entrega 3: el catálogo remoto administrado — plan

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado)
> o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

- **Fecha:** 2026-10-04
- **Estado:** propuesto. **No se escribe código hasta que el dueño apruebe este plan.**
- **Actualizado el 2026-10-05:** las gemas del catálogo ya no llevan descripción (pedido del
  dueño; enmienda del 2026-10-05 en la ADR-0039). Se sacó de los campos, de lo que exige
  «Publicar» y de «Traducir con IA».
- **Spec:** [design.md](design.md) §9 (aprobado el 2026-09-30), con las decisiones del dueño del
  2026-10-04 (sección 1).
- **Plan maestro:** [plan.md](plan.md), «Entrega 3: esquema» (E3-1 a E3-6).
- **Base de la app y el sidecar:** las Entregas 1 y 2 implementadas (`feat/catalogo-estilos`, HEAD
  `2648af4a`, 72 commits sobre `origin/dev`, sin push).
- **Base del servidor:** `origin/main` de `vimo-landing` (`50e3d33` al 2026-10-04). Ojo: la carpeta
  `/Users/sebas/Documents/vimo-landing` está en otra rama y 10 commits atrás; el frente del
  servidor trabaja en un worktree nuevo, fuera del repo, creado desde `origin/main`.

**Goal:** un admin crea, edita, genera muestras, publica, oculta y elimina estilos del catálogo
desde la pestaña Catálogo de la app, sin sacar versión, y todos los usuarios ven el catálogo
publicado al abrir Crear (criterio de éxito 6 del diseño).

**Architecture:** el catálogo pasa a una tabla de Supabase (`catalog_styles`) que solo toca
`vimo-landing` con el service role. Cada estilo tiene un borrador y, si se publicó, una copia
publicada. La app le pide a vimo.click el catálogo publicado y el sidecar lo deja en
`<carpeta raíz>/_catalog/`, con sus muestras; sin red sirve el último sincronizado y, si nunca
sincronizó, las 38 gemas que trae la app. El admin edita el borrador en un modal propio, genera
las muestras con sus claves y publica. Todo detrás de un interruptor nuevo,
`features.remoteCatalog`.

**Tech Stack:** el de las entregas anteriores (React 19, TypeScript, Vite, Tauri 2; sidecar Node SEA
con guards `node --test`; `vimo-landing` en Cloudflare Pages Functions con vitest y zod; Supabase
Postgres por PostgREST y, por primera vez en ese repo, Supabase Storage).

---

## 1. Decisiones

**Del dueño:**

| ID    | Decisión                                                                                                                                                         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E3-D1 | 2026-10-04: arranca el plan de la Entrega 3: editar las gemas del catálogo y sus etiquetas desde la app con la cuenta de admin.                                  |
| E3-D2 | 2026-10-04: el admin puede **añadir gemas nuevas** al catálogo desde la app.                                                                                     |
| D1    | (diseño) Admin = correo en la tabla `admins` de vimo.click.                                                                                                      |
| D2    | (diseño) Editar guarda un borrador; «Publicar» lo hace visible. Un estilo nuevo arranca oculto.                                                                  |
| D3    | (diseño) El admin genera las muestras con sus propias claves y elige con qué modo de personaje salen.                                                            |
| D4    | (diseño) Nombre en español, inglés y portugués (sin descripción desde el 2026-10-05).                                                                            |
| G1    | (diseño) El SQL de Supabase lo prepara Claude y lo aplica el dueño desde el panel. `vimo-landing` se trabaja en ramas nuevas, sin push ni deploy sin aprobación. |
| F4    | (diseño) Cada entrega se activa primero solo para admins y se abre a todos tras el visto bueno del dueño.                                                        |
| R1    | (2026-10-03) Las muestras del catálogo las genera Vimo, en calidad baja; nunca se toman de terceros. A GitHub va solo lo necesario.                              |

**De este plan** (el dueño las puede cambiar; cada una dice qué cuesta si está mal). Las dos
marcadas **«a decidir»** necesitan su respuesta antes de empezar:

| ID  | Decisión                                                                                                                                                                                                                                                                                                                                                  | Si está mal                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| P1  | **Las 38 gemas de hoy arrancan publicadas con las muestras que ya trae la app.** En la fila, `samples.revision = 0` significa «las de la app». La semilla es solo SQL: no se suben 152 imágenes al bucket ni cada usuario baja 20 MB. Solo se descargan las muestras de un estilo nuevo o regenerado.                                                     | Se suben al bucket con un script y pasan a la revisión 1.         |
| P2  | **Interruptor propio:** `VIMO_FLAG_REMOTE_CATALOG` (`off`, `admins`, `all`) → `features.remoteCatalog`. Apagado, la app no llama al servidor y usa las 38 gemas empaquetadas. Sirve para abrir primero a los admins (F4) y para volver atrás sin release si algo sale mal. Vale solo junto con `features.newCatalog`.                                     | Se cuelga de `newCatalog` y sobra una variable.                   |
| P3  | **El borrador vive en el servidor** (§9) y se edita en un modal propio del catálogo, armado con las piezas del modal de Mi estilo (secciones, «Pegá tu gema», avisos del agente, carrusel). Descartada la alternativa de editar una copia local en Mi estilo y «publicarla»: el borrador quedaría en una sola máquina (y el diseño dejó eso afuera, D6).  | Se reescribe el modal sobre una copia local.                      |
| P4  | **Muestras del borrador:** las genera el sidecar con el mismo carril del video (`generate-style-samples` acepta un borrador del catálogo), con las claves del admin y en calidad baja, en `_catalog/_drafts/<id>/`. El sidecar las sube al bucket por URLs firmadas que pide la app. Costo para el admin: 4 imágenes, alrededor de 2 centavos por estilo. | La subida pasa a la ventana (`fetch` con `PUT`).                  |
| P5  | **Publicar exige** el nombre en los tres idiomas, estilo visual y las 4 muestras. Un estilo sin muestras no llega a los usuarios.                                                                                                                                                                                                                         | Se relaja la validación del servidor.                             |
| P6  | **El admin puede usar un borrador o un estilo oculto en un video propio** («Usar en este video») para probarlo antes de publicar. El proyecto guarda su copia, como siempre.                                                                                                                                                                              | Se quita la opción del menú.                                      |
| P7  | **Etiquetas:** se eligen de la paleta que ya existe (`CATALOG_TAGS`, traducida a los tres idiomas) o se escriben a mano en los tres. «Dinamismo» y «Personaje fijo» las pone y las saca la app según las secciones; el servidor rechaza un borrador que no coincida.                                                                                      | Se dejan libres y la regla desaparece.                            |
| P8  | **A decidir por el dueño: «Traducir con IA».** Un botón del modal que completa inglés y portugués del nombre a partir del español (endpoint de admin chico, con el mismo cliente del agente; fracciones de centavo por uso). El diseño §14 lo dejaba afuera. Sin él, los tres idiomas se escriben a mano en cada estilo.                                  | Se sacan las tareas B5 y C6.                                      |
| P9  | **Versión del catálogo** = hash de (id, versión publicada, posición) de los estilos publicados. La app manda la que conoce y el servidor responde «sin cambios» sin repetir las gemas.                                                                                                                                                                    | Se cambia por un contador en una fila aparte.                     |
| P10 | **Cada tanda de muestras tiene su carpeta propia e inmutable** (`<id>/s<n>/`), aparte de la versión del texto: corregir una sección o una etiqueta no vuelve a bajar imágenes, y publicar es una sola escritura en la tabla (no hay nada que copiar en el bucket).                                                                                        | Se agrega una carpeta de borrador y una copia al publicar.        |
| P11 | **Dos admins no se pisan:** cada fila lleva un número de revisión. Guardar, pedir subida y publicar mandan la revisión que se abrió; si cambió en el medio, el servidor responde `borrador-cambio` y el modal ofrece recargar. Es un número y no la fecha porque PostgREST no puede poner `now()` y las fechas las escribe el código.                     | Gana el último que guarda.                                        |
| P12 | **A decidir por el dueño: la rama.** Recomendado: app y sidecar en una rama nueva `feat/catalogo-remoto` que sale de `feat/catalogo-estilos`, para que las Entregas 1 y 2 puedan ir a PR sin esperar a esta. En `vimo-landing`, rama nueva `feat/catalogo-remoto` desde `origin/main` (G1). La Entrega 2 se hizo en la misma rama por decisión suya.      | Se sigue en `feat/catalogo-estilos`.                              |
| P13 | **Subcomandos con «style» en el nombre** (P7 del plan E2, para el diagnóstico): `catalog-styles-sync` y `catalog-style-samples-upload`.                                                                                                                                                                                                                   | Se agrega «catalog» a las tablas de Rust.                         |
| P14 | **Las 38 gemas empaquetadas se quedan en la app** como respaldo sin red. Sacarlas (y sus 20 MB de muestras) se decide con el retiro del carril viejo, cuando el catálogo remoto lleve un tiempo abierto a todos.                                                                                                                                          | Se sacan en esta entrega y las muestras pasan al bucket (ver P1). |
| P15 | **El orden se edita con un número** (posición), como dice el diseño. Empates: por id.                                                                                                                                                                                                                                                                     | Se cambia por arrastrar y soltar.                                 |
| P16 | **Eliminar pide confirmación y no tiene deshacer** (el diseño §14 deja afuera el historial). Ocultar es la salida reversible.                                                                                                                                                                                                                             | Se agrega una papelera.                                           |
| P17 | **Las muestras del catálogo salen en modo genérico o cinemático** (`sampleMode` no acepta «Mi personaje»): no dependen del personaje de la biblioteca de un admin.                                                                                                                                                                                        | Se acepta `own` con un personaje elegido.                         |
| P18 | **Los endpoints del catálogo usan las reglas de acceso del agente** (`exigirAcceso` más admin), con errores `{ code }`, que es lo que entiende el cliente de la app. El diseño nombraba `verificarAdmin`, la guarda del panel web: esa no revisa revocaciones ni plan y responde un 404 con otra forma.                                                   | Se cambia la guarda de esos archivos.                             |

---

## 2. Global Constraints

Las de [plan.md](plan.md) («Global Constraints») y las del plan E2 (sección 2), y además:

- **Producción no se toca sin la aprobación puntual del dueño:** ni el SQL, ni el bucket, ni las
  variables de Cloudflare, ni un push o un merge de `vimo-landing` (mergear a `main` publica el
  sitio). El SQL lo aplica el dueño (G1).
- **El servidor no confía en la app:** cada endpoint valida la sesión, el acceso y el interruptor;
  los de admin, además, que el correo esté en `admins`. El service role solo existe en
  `vimo-landing`.
- **Con `remoteCatalog` apagado nada cambia:** la pestaña Catálogo, la copia y el payload de un
  proyecto son los de la Entrega 2, byte por byte. Lo fijan los guards actuales.
- **Los mismos límites en los tres lados** (servidor, sidecar y app): cada sección hasta 12 000
  caracteres y 30 000 en total; `character` hasta el tope de la identidad tejida; inicio y final
  fijos hasta 600; nombre hasta 80; hasta 5 etiquetas de 24 caracteres; 4 muestras JPEG de hasta
  4 MiB. El servidor los valida con zod; el sidecar, con `assertGemSections`.
- **Ids:** `^[a-z0-9][a-z0-9-]{0,39}$` o uno de los 5 heredados; nunca empiezan con `st-`; no
  cambian después de creado el estilo.
- **`src/` importa de `pipeline/` solo tipos** (`import type`). Las constantes se copian con una
  anotación `typeof`.
- **El sidecar no lee el entorno** (ADR-0010): los orígenes permitidos de descarga y de subida le
  llegan en el payload.
- **Los agentes no corren `git`, `pnpm format`, `pnpm build` ni `pnpm lint:fix`.** Verifican con
  `pnpm exec prettier --write <archivos>`, `pnpm exec eslint <archivos>`,
  `pnpm exec tsc -p <tsconfig> --noEmit` y `node --test scripts/test/<guard>`.
- **En `vimo-landing`**, como hace el agente reconstructor:
  - cada ruta exporta su `onRequestOptions`, y toda respuesta (también los errores) sale por un
    solo ayudante con JSON, `no-store` y CORS; todo el manejador va dentro de un `try`, porque una
    excepción suelta termina en una página de Cloudflare sin CORS y la app la lee como «sin red»;
  - Supabase se llama con `fetch` y `headersServiceRole`, con tope de tiempo
    (`plazoSupabase`, `antesDelPlazo`); las fechas las escribe el código; los errores de PostgREST
    se registran resumidos (`resumirErrorPostgrest`), nunca con el contenido de una fila;
  - `pnpm test`, `pnpm lint` y `pnpm build` en verde en cada commit, más
    `pnpm dlx wrangler pages functions build --outdir <carpeta temporal>`, que es la única
    comprobación de que las Functions compilan (están fuera de todo `tsconfig`).
- **Nada de claves en el repo ni en los informes.**
- **Trailer de los commits:** `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## 3. Review Focus

1. **El servidor a medio desplegar o el catálogo sin sembrar.** La app nunca se queda sin estilos:
   con un error o con `catalogo-vacio` sigue con el último catálogo sincronizado (o con las 38
   gemas empaquetadas, si nunca sincronizó); con el interruptor apagado, con las 38 empaquetadas.
   Guards de las Tareas A1 y C1.
2. **La sincronización cortada a mitad** (la app se cierra, se cae la red, una muestra llega rota).
   `catalog.json` se escribe al final y de forma atómica: sigue el catálogo anterior. Guard de A2.
3. **Publicar con muestras a medio subir.** El servidor comprueba que la tanda del borrador tenga
   sus archivos antes de la única escritura que publica; si falta uno, responde `faltan-muestras`
   y no cambia nada. Tests de B4.
4. **Alguien que no es admin llama a un endpoint de admin**, o un admin con el interruptor apagado.
   Responde 403 y no cambia nada. Tests de B3 y B4.
5. **Un estilo que se oculta o se elimina mientras alguien lo tiene elegido en Crear.** El envío no
   falla ni manda una gema fantasma: el formulario se queda con la copia que ya tenía o pide elegir
   otro, y los proyectos ya creados no cambian. Guard de C1.

---

## 4. Cómo se ejecuta en paralelo sin pisarse

| Frente       | Repo           | Puede tocar                                                                                                                                                                                                                | No toca                                             |
| ------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Orquestador  | los dos        | `pipeline/types/catalog.ts`, `docs/**`, `scripts/test/README.md`, `SETUP_CATALOGO_REMOTO.md` y la semilla en `vimo-landing`, commits y vault                                                                               | Lo que toquen A, B y C                              |
| B · servidor | `vimo-landing` | `functions/api/catalogo.ts`, `functions/api/admin/catalogo/**`, `functions/_lib/catalogo/**`, `functions/_lib/interruptores.ts` (solo sumar el interruptor), `tests/functions/catalogo*.test.ts` y su simulador            | El reconstructor, el creador de estilo, `acceso.ts` |
| A · sidecar  | VIMO-TAURI     | `pipeline/commands/catalog/**`, `pipeline/commands/styles/generate-style-samples.ts`, `pipeline/commands/characters/generate-character-preview.ts`, `pipeline/project/paths.ts`, guards `scripts/test/check-catalog-*.mjs` | `pipeline/types/catalog.ts`, `src/`, `docs/`, Rust  |
| C · app      | VIMO-TAURI     | `src/**`, `public/locales/*.json`, guards `scripts/test/check-app-catalog-*.mjs`                                                                                                                                           | `pipeline/`, `docs/`, `package.json`, `src-tauri/`  |

```
Ola 0  O1 ADR-0049 + contratos                     ──►  commit (abre A, B y C)
       O2 SQL de la tabla, el bucket y la semilla  ──►  para revisión del dueño
Ola 1  B1…B6  ║  A1…A4  ║  C1, C2        (tres frentes; C usa a B por contrato, con el servidor simulado)
Ola 2  C3…C5(+C6)                         (la interfaz del admin)
Ola 3  I1…I3  integración, documentación y vault (orquestador)
Ola 4  pasos del dueño: SQL, publicación del servidor, semilla, QA como admin, apertura
```

Reglas: las de plan.md («Reglas de la ejecución en paralelo»). Si un frente necesita cambiar un
contrato de la sección 5, se detiene y avisa.

---

## 5. Contratos congelados (los escribe O1)

### 5.1 Supabase

El SQL vive, como el de las otras tablas de ese repo, en un documento de puesta en marcha
(`SETUP_CATALOGO_REMOTO.md`) que el dueño pega en el editor SQL del panel, con su vuelta atrás.

```sql
create table public.catalog_styles (
  id text primary key check (
    (id ~ '^[a-z0-9][a-z0-9-]{0,39}$' and id not like 'st-%')
    or id in ('normal', 'pov_stickman', 'cartoon', 'fantasia', 'terror')
  ),
  position int not null default 0,
  status text not null default 'hidden' check (status in ('hidden', 'published')),
  draft jsonb not null,
  published jsonb,
  published_version int not null default 0,
  published_at timestamptz,
  -- La última tanda de muestras reservada en el bucket (0 = ninguna: las de la app).
  samples_revision int not null default 0,
  -- Sube en cada escritura: con ella dos admins no se pisan (P11).
  revision int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- RLS activo y sin políticas: solo el service role, desde vimo-landing.
alter table public.catalog_styles enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-samples', 'catalog-samples', true, 4194304, array['image/jpeg'])
on conflict (id) do nothing;
-- Lectura pública; sin políticas de escritura: solo el service role y las URLs firmadas.

notify pgrst, 'reload schema';
```

Rutas en el bucket: `<id>/s<revision>/sample-<n>.jpg` (n = 1..4). Una tanda nunca se reescribe: si
el admin regenera las muestras, van a la tanda siguiente.

### 5.2 El contenido de un estilo

`draft` y `published` guardan lo mismo que hoy lleva `CatalogGem`, menos el `id`:

```ts
interface CatalogStyleContent {
  name: LocalizedText // { es, en, pt }
  tags: LocalizedText[] // 0 a 5
  sections: GemSections
  templateVersion: number
  allowedModes: StyleCharacterMode[] // nunca vacío
  sampleMode: 'generic' | 'none' // P17; incluido en allowedModes
  colorFilter: ColorFilterId
  /** La tanda de muestras: revision 0 = las que trae la app; ≥ 1 = `<id>/s<revision>/`. */
  samples: { revision: number; count: number }
}
```

Reglas de validación (servidor con zod; las repite el sidecar al sincronizar):

- los límites de la sección 2;
- `allowedModes` sin repetidos y `sampleMode` incluido;
- las etiquetas «Dinamismo» y «Personaje fijo» de la paleta están si y solo si existen las
  secciones `dynamism` y `character` (P7); sin etiquetas repetidas (por `es`);
- `character`, `promptStart` y `promptEnd` sin marcadores `[…]` salvo `[IDIOMA DEL GUION]`, y
  `character` termina con una oración que empieza con `Outfit:` (lo que hoy fija
  `check-catalog-gems.mjs`);
- `samples` de un borrador solo puede ser la que ya tenía o una tanda que el servidor reservó para
  ese estilo (`revision` entre 1 y `samples_revision`). La revisión 0 con muestras solo existe en
  las filas de la semilla (P1).

### 5.3 Endpoints de `vimo-landing`

Todos con `Authorization: Bearer <access_token>` y JSON. Los errores son `{ code }`, como en
`estilos/reconstruir`.

| Método y ruta                            | Quién              | Pedido                            | Respuesta 200                                                           |
| ---------------------------------------- | ------------------ | --------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/catalogo?conocida=<version>`   | Usuario con acceso | —                                 | `{ version, sinCambios: true }` o `{ version, samplesBaseUrl, styles }` |
| `GET /api/admin/catalogo`                | Admin              | —                                 | `{ samplesBaseUrl, styles: AdminCatalogStyle[] }`                       |
| `POST /api/admin/catalogo`               | Admin              | `{ id, position?, draft }`        | `{ style }` (oculto)                                                    |
| `PATCH /api/admin/catalogo/:id`          | Admin              | `{ revision, draft?, position? }` | `{ style }`                                                             |
| `POST /api/admin/catalogo/:id/muestras`  | Admin              | `{ revision, count }` (1 a 4)     | `{ style, samplesRevision, uploads: [{ file, url }] }`                  |
| `POST /api/admin/catalogo/:id/publicar`  | Admin              | `{ revision }`                    | `{ style }`                                                             |
| `POST /api/admin/catalogo/:id/ocultar`   | Admin              | `{ revision }`                    | `{ style }`                                                             |
| `DELETE /api/admin/catalogo/:id`         | Admin              | —                                 | `{ ok: true }`                                                          |
| `POST /api/admin/catalogo/traducir` (P8) | Admin              | `{ name }` (es)                   | `{ name: { en, pt } }`                                                  |

Formas:

```ts
/** Lo que ve cualquier usuario: solo lo publicado. */
interface PublishedCatalogStyle {
  id: string
  position: number
  version: number // published_version
  content: CatalogStyleContent
}

/** Lo que ve el admin: el borrador, lo publicado y el estado. */
interface AdminCatalogStyle {
  id: string
  position: number
  status: 'hidden' | 'published'
  draft: CatalogStyleContent
  published: CatalogStyleContent | null
  publishedVersion: number
  publishedAt: string | null
  revision: number
  updatedAt: string
  updatedBy: string | null
  /** El borrador difiere de lo publicado (o nunca se publicó). */
  unpublishedChanges: boolean
}
```

Qué hace cada operación:

- **Catálogo publicado:** filas con `status = 'published'`, por `position` y después `id`.
  `version` es el hash de P9, y para calcularlo alcanza con leer tres columnas: el contenido
  completo solo se lee cuando la versión cambió. `samplesBaseUrl` es la URL pública del bucket.
- **Crear:** inserta la fila oculta, con `draft` validado y `samples: { revision: 0, count: 0 }`.
- **Guardar:** reemplaza `draft` o `position` si `revision` coincide (P11) y la sube en uno.
- **Muestras:** reserva la tanda siguiente (`samples_revision + 1`) y devuelve una URL firmada de
  subida por archivo, a `<id>/s<tanda>/sample-<n>.jpg`. Después de subir, la app guarda el borrador
  con `samples: { revision: <tanda>, count }`.
- **Publicar:** valida P5 y, si la tanda del borrador es del bucket, que estén sus archivos.
  Después, en una sola escritura condicionada a `revision`: `published = draft`,
  `published_version + 1`, `status = 'published'` y `published_at`. Al terminar borra, sin frenar
  la respuesta, las tandas que ya no usa ni el borrador ni lo publicado.
- **Ocultar:** `status = 'hidden'`. Lo publicado queda guardado para volver a publicar.
- **Eliminar:** borra la fila y todo `<id>/` del bucket.

Códigos de error:

| HTTP | `code`                 | Cuándo                                                         |
| ---- | ---------------------- | -------------------------------------------------------------- |
| 401  | `sin-token`            | Falta la sesión.                                               |
| 401  | `token-invalido`       | La sesión no vale.                                             |
| 403  | `sin-acceso`           | La cuenta no tiene acceso a Vimo.                              |
| 403  | `funcion-desactivada`  | El interruptor `remoteCatalog` no alcanza a quien llama.       |
| 403  | `no-admin`             | Endpoint de admin llamado por alguien que no es admin.         |
| 400  | `pedido-invalido`      | El cuerpo no tiene la forma esperada.                          |
| 400  | `estilo-invalido`      | El contenido no pasa la validación (con `detalle`: qué campo). |
| 404  | `no-existe`            | No hay un estilo con ese id.                                   |
| 409  | `id-en-uso`            | Ya existe un estilo con ese id.                                |
| 409  | `borrador-cambio`      | Otro admin guardó o publicó en el medio (P11).                 |
| 409  | `faltan-muestras`      | Se pidió publicar sin las 4 muestras (P5) o falta un archivo.  |
| 502  | `almacenamiento-fallo` | Falló el bucket al firmar, listar o borrar.                    |
| 503  | `catalogo-vacio`       | No hay estilos publicados (todavía no se sembró).              |
| 500  | `error-interno`        | Cualquier otra cosa.                                           |

### 5.4 Sidecar

`pipeline/types/catalog.ts` suma (lo que hoy existe no cambia de forma):

```ts
export interface CatalogGem {
  // …los campos de hoy…
  /** Cuántas muestras empaquetadas trae la app (revisión 0). */
  sampleCount: number
  /** Muestras sincronizadas en `_catalog/` (revisión ≥ 1). Ausente = las de la app. */
  samples?: StyleSample[]
}

export interface CatalogListPayload {
  /** false o ausente = las gemas empaquetadas, aunque haya un catálogo sincronizado. */
  remote?: boolean
}

export interface CatalogListResult {
  entries: CatalogGem[]
  /** Versión del catálogo sincronizado; null = el empaquetado. */
  version: string | null
}

/** Lo que responde `GET /api/catalogo` cuando hay cambios. */
export interface CatalogManifest {
  version: string
  samplesBaseUrl: string
  styles: PublishedCatalogStyle[]
}

export interface CatalogSyncPayload {
  manifest: CatalogManifest
  /** Único origen del que el sidecar acepta bajar muestras. */
  samplesOrigin: string
}

export interface CatalogSyncResult extends CatalogListResult {
  /** Archivos bajados en esta corrida. */
  downloaded: number
}

export interface CatalogDraftSamplesUploadPayload {
  catalogStyleId: string
  uploads: { file: string; url: string }[]
  /** Único origen al que el sidecar acepta subir. */
  uploadOrigin: string
}
```

`GenerateStyleSamplesPayload` suma `catalogDraft?: { id, name, sections, sampleMode }`,
excluyente con `styleId`.

| Subcomando                     | Payload                            | Resultado                    | Qué hace                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ---------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `catalog-styles-list`          | `CatalogListPayload`               | `CatalogListResult`          | Con `remote` y un `_catalog/catalog.json` válido, devuelve el catálogo sincronizado con las rutas de sus muestras. Si no, las 38 gemas empaquetadas y `version: null`.                                                                                                                                                |
| `catalog-styles-sync`          | `CatalogSyncPayload`               | `CatalogSyncResult`          | Valida TODO el manifiesto antes de tocar el disco. Baja las muestras que faltan (revisión ≥ 1) a `_catalog/<id>/s<revision>/`, cada una JPEG, hasta 4 MiB y desde `samplesOrigin`. Escribe `catalog.json` al final (`writeFileAtomic`) y borra las tandas viejas. Si una descarga falla, no reemplaza `catalog.json`. |
| `generate-style-samples`       | con `catalogDraft`                 | `GenerateStyleSamplesResult` | Genera las 4 muestras del borrador con el marco y el modo `sampleMode`, en `_catalog/_drafts/<id>/`. Mismos eventos de avance que hoy.                                                                                                                                                                                |
| `catalog-style-samples-upload` | `CatalogDraftSamplesUploadPayload` | `{ uploaded: number }`       | Sube cada `_catalog/_drafts/<id>/<file>` con `PUT` a su URL firmada (`content-type: image/jpeg`), solo si la URL es de `uploadOrigin`.                                                                                                                                                                                |
| `catalog-style-copy`           | el de hoy                          | el de hoy                    | Busca la gema en el catálogo sincronizado y, si no está, en el empaquetado. Con muestras sincronizadas las copia del disco; `samples` del payload sigue valiendo para las empaquetadas.                                                                                                                               |

Códigos de fallo nuevos (`PipelineFailure`): `catalog_sync_failed` (descarga o validación de una
muestra) y `catalog_upload_failed`.

### 5.5 La carpeta `_catalog/`

```
<carpeta raíz>/_catalog/
  catalog.json                       { version, syncedAt, entries: CatalogGem[] } sin rutas absolutas
  <id>/s<revision>/sample-<n>.jpg    muestras publicadas (revisión ≥ 1)
  _drafts/<id>/sample-<n>.jpg        muestras recién generadas por el admin
```

`_catalog` se suma a `RESERVED_ROOT_DIRECTORIES`. `_drafts` no puede chocar con un id (los ids
empiezan con letra o número).

### 5.6 App

- `AccessFeatures` suma `remoteCatalog`. Vale solo junto con `newCatalog`.
- Rutas en `src/modules/videos/constants.ts`: `CATALOG_PATH = '/api/catalogo'` y
  `CATALOG_ADMIN_PATH = '/api/admin/catalogo'`. El origen de las muestras sale de la URL de
  Supabase que la app ya usa.
- Claves de query: `videosQueryKeys.catalogStyles` (la de hoy) y `catalogAdmin` (nueva).
- Cuándo sincroniza: al montarse la pestaña Catálogo con `remoteCatalog` encendido. Pide el
  manifiesto con la versión que devolvió `catalog-styles-list`; si cambió, corre
  `catalog-styles-sync` y vuelve a listar. Un fallo no se muestra como error: sigue lo que había.
- El admin, con conexión, ve la lista de `GET /api/admin/catalogo`: todos los estilos, con su
  borrador y su estado. Sin conexión ve el catálogo como cualquier usuario. Las muestras de un
  borrador que todavía no se publicó las ve directo desde el bucket.

---

## 6. Mapa del código

**App (`src/modules/videos/`)**, del trabajo de la Entrega 2:

- `hooks/useCatalogStyles.ts`: la lista del catálogo (`videosApi.listCatalogStyles`) y la copia.
  Acá entra la sincronización.
- `components/CatalogStyleGallery.tsx`, `CatalogStyleCard.tsx` y `CatalogStyleModal.tsx`: la
  pestaña, la tarjeta con su menú de tres puntos y «Ver».
- `utilities/catalogSamples.ts`: de dónde sale cada muestra (hoy, `/style-references/<id>_<n>.jpg`).
- `components/CustomStyleModal.tsx` (760 líneas): el modal de Mi estilo. De acá salen las piezas
  que reusa el modal del admin: `GemPasteStep`, `GemSectionsEditor`, `GemAgentWarnings`,
  `StyleSamplesCarousel` y el bloque de generar muestras (proveedor, saldo, avance), que hoy está
  dentro del modal y se extrae.
- `hooks/useStyleSampleGeneration.ts`: el avance de `generate-style-samples`.
- `api/index.ts`: `rebuildGem` (el agente; `origin: 'catalogo'` ya existe para admins, sin cupo, y
  responde `suggestions.allowedModes` y `characterMode`).
- `src/modules/common/fetcher/vimoServer.ts`: `vimoServerFetch`, el cliente de vimo.click con la
  sesión (acepta `method`).
- `src/modules/auth/types/access.ts`: `AccessStatus.admin` y `features`.

**Sidecar (`pipeline/`)**:

- `commands/catalog/`: `catalog-styles-list.ts` (hoy puro), `catalog-style-copy.ts`,
  `catalog-store.ts` (validación de la copia) y `subcommands.ts`.
- `prompts/catalog-gems/`: las 38 gemas, `catalog.ts` (`CATALOG_GEMS`, `findCatalogGem`) y
  `tags.ts` (`CATALOG_TAGS`, los límites de las etiquetas).
- `commands/styles/style-store.ts`: `assertGemSections`, los límites, `assertSampleUpload` y
  `writeFileAtomic` por `utils/atomic-fs.ts`.
- `commands/styles/generate-style-samples.ts`: `generateTemplateSamples` escribe en
  `styleDirectory(context, style.id)`; hay que parametrizar la carpeta de salida.
- `commands/characters/generate-character-preview.ts`: usa `findCatalogGem` para los ids nuevos.
- `commands/demo/download.ts` y `scripts/test/check-demo.mjs`: el precedente de bajar archivos y de
  probarlo contra un servidor HTTP local.
- `commands/videos/create-video-project.ts`: valida un proyecto del catálogo por la forma del id,
  no contra la lista: un estilo nuevo del catálogo remoto ya crea proyectos sin cambios.

**Servidor (`vimo-landing`, relevado el 2026-10-04 sobre `origin/main`)**:

- `functions/_lib/acceso.ts`: `exigirAcceso(request, env)` valida la sesión contra Supabase Auth,
  las revocaciones, el acceso y el plan, y devuelve `{ ok, userId, email, esAdmin, plan }`. Admin
  es una fila en `public.admins` con el correo de la sesión. `headersServiceRole` arma los
  encabezados del service role.
- `functions/_lib/interruptores.ts`: los `VIMO_FLAG_*` (`off`, `admins`, `all`) y `features`. Un
  cambio de variable necesita una publicación nueva para valer.
- `functions/api/estilos/reconstruir.ts` y `functions/_lib/reconstructor/`: el patrón a seguir
  (acceso, validación en dos pasos con zod, errores `{ code }`, `responder` con CORS, registro y
  topes de tiempo). `esquema.ts` trae el esquema de las secciones.
- `functions/_lib/reconstructor/registro.ts`: `plazoSupabase`, `antesDelPlazo` y
  `resumirErrorPostgrest`, ya exportados para reusar.
- `functions/_lib/admin.ts`: `verificarAdmin`, la guarda del panel web (`/api/admin/*` de hoy). No
  se usa acá (P18).
- `tests/functions/`: vitest, proyecto `functions`. Cada manejador se llama directo
  (`onRequestPost({ request, env })`) con `fetch` reemplazado por simuladores
  (`simuladorSupabase.ts`, `simuladorRegistro.ts`). No hay tests de los `/api/admin/*` de hoy.
- **Supabase Storage no se usa en ningún lado de ese repo:** no hay ayudantes ni simulador. Las
  llamadas (URL firmada de subida, listar, borrar) se escriben contra la documentación vigente de
  la API de Storage y se confirman contra el bucket real en la Ola 4.
- El SQL de cada tabla vive en un `SETUP_*.md` (no hay carpeta de migraciones) y lo pega el dueño.
- Publicar es mergear a `main`: Cloudflare Pages compila con `pnpm run build`. No hay CI: los tests
  no frenan una publicación, así que se corren a mano antes de cada commit.

---

## Ola 0: orquestador

### Tarea O1: ADR-0049 y contratos

**Archivos:** `docs/adr/ADR-0049-catalogo-remoto-administrado.md` (nuevo, estado Propuesta),
`pipeline/types/catalog.ts`.

- [ ] Escribir la ADR-0049 con el problema, la decisión (esta sección 5), las alternativas
      descartadas (P3, P1, P18) y los modos de falla (sección 3).
- [ ] Sumar a `pipeline/types/catalog.ts` los tipos de la sección 5.4 (solo tipos: ningún
      comportamiento cambia).
- [ ] `pnpm exec tsc -p tsconfig.pipeline.json --noEmit` y `pnpm build`.
- [ ] Commit: `docs: propose ADR-0049 and freeze the remote catalog contracts`.

### Tarea O2: el SQL y la semilla (para revisión del dueño)

**Archivos (`vimo-landing`, rama `feat/catalogo-remoto`):** `SETUP_CATALOGO_REMOTO.md` y la
semilla.

- [ ] `SETUP_CATALOGO_REMOTO.md`: el SQL de la sección 5.1, la variable nueva, cómo mirar los
      registros y la vuelta atrás (interruptor en `off`; `drop table` y vaciado del bucket).
- [ ] Generar la semilla desde `CATALOG_GEMS`: 38 filas `published`, `published_version = 1`,
      `position` en el orden de hoy, `draft = published` y `samples: { revision: 0, count: 4 }`
      (P1). Va en un archivo `.sql` aparte (pesa unos 200 KB: no entra cómodo en un Markdown),
      partido si el editor del panel no lo acepta entero. El generador es una herramienta de una
      vez y no se versiona; el SQL sí.
- [ ] Comprobar la semilla sin tocar producción: 38 filas, ids únicos, cada contenido pasa la
      validación de la sección 5.2 y vuelve a dar las mismas 38 gemas de `CATALOG_GEMS`.
- [ ] Entregarle al dueño los archivos con el orden de aplicación. **No se aplica nada.**

---

## Ola 1, frente B: servidor (`vimo-landing`)

### Tarea B1: contenido, validación y versión

**Archivos:** `functions/_lib/catalogo/contenido.ts`, `version.ts`,
`tests/functions/catalogoContenido.test.ts` y `catalogoVersion.test.ts`.

- [ ] Tests primero: un contenido válido pasa; cada límite de la sección 2 falla y dice qué campo;
      etiquetas incoherentes con las secciones fallan; `sampleMode` fuera de `allowedModes` falla;
      unas `samples` que el servidor no reservó fallan.
- [ ] `contenido.ts`: esquema zod de `CatalogStyleContent`, reusando el esquema de secciones del
      reconstructor (`reconstructor/esquema.ts`).
- [ ] `version.ts`: `catalogVersion(rows)`, estable ante el orden de entrada. Tests: cambia al
      publicar, ocultar, eliminar o reordenar; no cambia al guardar un borrador.

### Tarea B2: la tabla y el bucket

**Archivos:** `functions/_lib/catalogo/almacen.ts`, `muestras.ts`,
`tests/functions/simuladorCatalogo.ts` y sus tests.

- [ ] El simulador primero: la tabla con sus `check` y su clave primaria, como Postgres, y el
      bucket (firmar, listar, borrar), con fallos inyectables por ruta.
- [ ] `almacen.ts`: listar publicados (tres columnas o completo), listar todos, leer uno,
      insertar, actualizar condicionado a `revision` (cero filas = `borrador-cambio`) y borrar.
      Las fechas las escribe el código. Con tope de tiempo en cada llamada.
- [ ] `muestras.ts`: URLs firmadas de subida a `<id>/s<n>/`, listar una tanda, borrar tandas y la
      URL pública base. Antes de escribirlo, leer la documentación vigente de la API de Storage.
- [ ] Tests: cada operación arma el pedido correcto; un fallo del bucket es `almacenamiento-fallo`.

### Tarea B3: guarda, interruptor y catálogo publicado

**Archivos:** `functions/_lib/interruptores.ts`, `functions/_lib/catalogo/guarda.ts`,
`functions/api/catalogo.ts`, sus tests y los de `interruptores` y `verificarAcceso`.

- [ ] `VIMO_FLAG_REMOTE_CATALOG` entra a `features` como `remoteCatalog`, con los mismos valores
      que los otros interruptores. Los tests de `verificar-acceso` fijan que no cambia nada más.
- [ ] `guarda.ts`: sobre `exigirAcceso`, exige el interruptor (`funcion-desactivada`) y, para las
      rutas de admin, `esAdmin` (`no-admin`).
- [ ] `GET /api/catalogo`: `conocida` igual a la versión → `sinCambios`; sin publicados → 503
      `catalogo-vacio`.
- [ ] Tests: sin token, token inválido, sin acceso, interruptor apagado, vacío, sin cambios y con
      cambios (orden por posición e id; nunca sale un oculto ni un borrador); Supabase caído
      responde con CORS.

### Tarea B4: endpoints del admin

**Archivos:** `functions/api/admin/catalogo/index.ts`, `[id]/index.ts`, `[id]/muestras.ts`,
`[id]/publicar.ts`, `[id]/ocultar.ts` y `tests/functions/catalogoAdmin*.test.ts`.

- [ ] Tests primero, por endpoint: 403 para quien no es admin, sin efectos; el camino feliz; cada
      código de la tabla de errores que le toca.
- [ ] Crear, listar, guardar, reservar una tanda y firmar sus subidas, ocultar y eliminar, sobre
      B1 y B2.
- [ ] Publicar, en el orden de la sección 5.3. Tests: sin las 4 muestras → `faltan-muestras`;
      falta un archivo de la tanda → `faltan-muestras` y la fila intacta; `revision` vieja →
      `borrador-cambio`; la limpieza de tandas viejas falla y la publicación igual queda hecha.
- [ ] Cada escritura deja `updated_by` con el correo del admin y sube `revision`.

### Tarea B5 (solo si el dueño aprueba P8): traducir

**Archivos:** `functions/api/admin/catalogo/traducir.ts` y su test.

- [ ] Un pedido al modelo con el cliente del reconstructor (`reconstructor/modelo.ts`): español →
      inglés y portugués, misma forma que la entrada, validado con zod y con los topes de largo.

### Tarea B6: documentación del repo del servidor

- [ ] `SETUP_CATALOGO_REMOTO.md` al día con lo implementado y `README.md` con la ruta nueva.

---

## Ola 1, frente A: sidecar

### Tarea A1: la caché del catálogo y la lista

**Archivos:** `pipeline/commands/catalog/catalog-cache.ts` (nuevo), `catalog-styles-list.ts`,
`pipeline/project/paths.ts`, guards `check-catalog-cache.mjs` (nuevo) y `check-catalog-list.mjs`.

- [ ] Guard primero: sin `_catalog/`, la lista es la empaquetada con `version: null`; con un
      `catalog.json` válido y `remote: true`, la sincronizada con sus `samples`; con
      `remote: false`, la empaquetada aunque haya caché; un `catalog.json` roto o con una gema
      inválida cae a la empaquetada; `_catalog` no se lista como proyecto.
- [ ] `catalog-cache.ts`: leer y validar `catalog.json`, las rutas de las tandas y
      `resolveCatalogGem(context, id)` (sincronizado primero, empaquetado después).
- [ ] `catalog-styles-list` recibe el contexto y el payload.

### Tarea A2: `catalog-styles-sync`

**Archivos:** `pipeline/commands/catalog/catalog-styles-sync.ts`, `catalog-store.ts`,
`subcommands.ts`, guard `check-catalog-sync.mjs` (servidor HTTP local, como `check-demo.mjs`).

- [ ] Guard primero: baja solo lo que falta; no baja nada para la revisión 0; un manifiesto con
      una gema inválida no toca el disco; una muestra que no es JPEG, que pesa más de 4 MiB o que
      viene de otro origen corta la corrida y deja el `catalog.json` anterior; una corrida cortada
      se completa en la siguiente; las tandas viejas se borran después de escribir `catalog.json`;
      un estilo que ya no está publicado desaparece de la lista y de la carpeta.
- [ ] Implementar con el patrón de `commands/demo/download.ts` (tope de tamaño mientras se lee,
      señal de corte) y `writeFileAtomic`.

### Tarea A3: muestras de un borrador

**Archivos:** `pipeline/commands/styles/generate-style-samples.ts`,
`pipeline/commands/catalog/catalog-style-samples-upload.ts` (nuevo), guards
`check-catalog-draft-samples.mjs` (nuevo) y `check-gem-style-samples.mjs`.

- [ ] Guard primero (proveedores simulados, sin claves): con `catalogDraft`, las 4 muestras quedan
      en `_catalog/_drafts/<id>/` y nada en `_styles/`; el `system` es el del marco, con el modo
      `sampleMode`; `styleId` y `catalogDraft` juntos, o ninguno, es `invalid_payload`; el camino
      de `styleId` sigue byte por byte.
- [ ] Parametrizar la carpeta de salida de `generateTemplateSamples`.
- [ ] `catalog-style-samples-upload`: `PUT` de cada archivo; rechaza una URL de otro origen y un
      archivo que no existe; un fallo es `catalog_upload_failed`. Guard con servidor local.

### Tarea A4: la copia y el retrato con gemas sincronizadas

**Archivos:** `pipeline/commands/catalog/catalog-style-copy.ts`, `catalog-store.ts`,
`pipeline/commands/characters/generate-character-preview.ts`, guards `check-catalog-copy.mjs` y
`check-catalog-preview.mjs`.

- [ ] Guard primero: «Pasar a mi estilo» de un estilo que solo existe en el catálogo sincronizado
      crea la copia con sus muestras tomadas del disco; el retrato de un personaje con ese estilo
      usa sus secciones; con una gema empaquetada todo sigue como hoy.
- [ ] Cambiar `findCatalogGem` por `resolveCatalogGem` en los dos subcomandos.

---

## Ola 1 y 2, frente C: app

### Tarea C1: sincronización para cualquier usuario

**Archivos:** `src/modules/auth/types/access.ts`, `src/modules/auth/utilities/accessFlags.ts`,
`src/modules/common/types/accessFeatures.ts`, `src/modules/videos/constants.ts`, `api/index.ts`,
`hooks/useCatalogStyles.ts`, `utilities/catalogSamples.ts`, `utilities/catalogSync.ts` (nuevo,
puro), guard `check-app-catalog-sync.mjs` (nuevo) y casos en `check-app-access-flags.mjs`.

- [ ] Guard primero, sobre los módulos puros: cuándo se sincroniza (interruptor, versión conocida,
      respuesta `sinCambios`); un error o `catalogo-vacio` deja la lista que había; de dónde sale
      cada muestra (empaquetada o sincronizada); un estilo elegido que desaparece del catálogo
      (Review Focus 5).
- [ ] `features.remoteCatalog`, con memoria sin red como los otros interruptores.
- [ ] `videosApi`: el manifiesto (`vimoServerFetch` con `GET`), `catalog-styles-sync` y la lista
      con `remote`.
- [ ] `useCatalogStyles`: lista → manifiesto → sincronización → lista. Sin spinner que bloquee: la
      pestaña muestra lo que hay mientras sincroniza.
- [ ] Con el interruptor apagado, la pestaña y la copia son las de la Entrega 2 (guards actuales).

### Tarea C2: datos del admin

**Archivos:** `src/modules/videos/types/catalogAdmin.ts` (nuevo), `api/index.ts`,
`hooks/useCatalogAdmin.ts` (nuevo), `utilities/catalogAdminDraft.ts` (nuevo, puro),
`public/locales/*.json` (errores), guard `check-app-catalog-admin.mjs` (nuevo).

- [ ] Guard primero: el borrador que se arma desde la respuesta del agente (secciones, modos
      sugeridos, etiquetas de comportamiento puestas solas); «Dinamismo» y «Personaje fijo» entran
      y salen con sus secciones; el id sugerido a partir del nombre cumple el patrón; qué le falta
      a un borrador para publicarse (P5); cada `code` del servidor tiene su clave de i18n en los
      tres idiomas.
- [ ] `videosApi`: listar, crear, guardar, reservar una tanda, publicar, ocultar, eliminar (y
      traducir, P8).
- [ ] `useCatalogAdmin`: la lista del admin y las mutaciones. Van a la red de verdad: un corte de
      conexión se muestra como error y no queda una mutación en pausa.

### Tarea C3: la pestaña para el admin

**Archivos:** `components/CatalogStyleGallery.tsx`, `CatalogStyleCard.tsx`, locales.

- [ ] Con `admin`, `remoteCatalog` y conexión: la galería muestra todos los estilos, con un
      distintivo en la tarjeta («Oculto», «Sin publicar», «Cambios sin publicar»).
- [ ] El menú de tres puntos suma, para el admin: Editar, Generar muestras (abre el modal en ese
      bloque, como en Mi estilo), Publicar, Ocultar y Eliminar (con confirmación nativa, como al
      borrar un estilo propio). «Usar en este video» vale también para un borrador (P6).
- [ ] La tarjeta «Crear estilo», al final, igual a la de Mi estilo.
- [ ] Los avisos de estas acciones siguen las reglas de la QA del 2026-10-03: a la vista, sin
      pasos intermedios y con X.

### Tarea C4: el modal del admin

**Archivos:** `components/CatalogAdminModal.tsx` (nuevo) y sus piezas (`CatalogAdminFields.tsx`,
`CatalogTagsField.tsx`, `LocalizedTextField.tsx`), locales.

- [ ] Estilo nuevo: arranca en «Pegá tu gema» (el mismo paso de Mi estilo, con
      `origin: 'catalogo'`), y con la respuesta del agente pasa a las secciones y los campos del
      catálogo ya sugeridos.
- [ ] Campos: id (solo al crear, sugerido desde el nombre), nombre en los tres
      idiomas, etiquetas (paleta más texto libre), modos permitidos, modo de las muestras, filtro
      de color y posición.
- [ ] «Guardar borrador» y «Publicar» (deshabilitado con la lista de lo que falta, P5). Un
      `borrador-cambio` ofrece recargar sin perder lo escrito.
- [ ] El modal de Mi estilo no cambia de comportamiento.

### Tarea C5: muestras en el modal del admin

**Archivos:** `components/StyleSamplesPanel.tsx` (nuevo, extraído de `CustomStyleModal.tsx`),
`CustomStyleModal.tsx`, `CatalogAdminModal.tsx`, `hooks/useStyleSampleGeneration.ts`.

- [ ] Extraer del modal de Mi estilo el bloque de muestras (proveedor, saldo, botón, avance y
      carrusel) a un componente que reciban los dos modales. El de Mi estilo queda igual a la vista.
- [ ] En el del admin: genera con `catalogDraft`, reserva la tanda, sube con
      `catalog-style-samples-upload` y guarda el borrador con la tanda nueva. El carrusel muestra
      las muestras del borrador desde el bucket.
- [ ] Calidad baja siempre (R1).

### Tarea C6 (solo si el dueño aprueba P8): «Traducir con IA»

- [ ] Botón junto al nombre en español: completa inglés y portugués y deja
      editar el resultado.

---

## Ola 3: integración (orquestador)

### Tarea I1: verificación completa

- [ ] VIMO-TAURI: `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm check:locales` y los guards
      de la app, el catálogo, las gemas y el carril.
- [ ] `vimo-landing`: `pnpm test`, `pnpm lint`, `pnpm build` y la compilación de las Functions.
- [ ] El recorrido del admin con el formulario real en Chrome y el servidor simulado, como en la
      QA de la Entrega 2 (crear, guardar, generar, publicar, ocultar, eliminar, conflicto entre dos
      admins, sin conexión).

### Tarea I2: documentación

- [ ] ADR-0049 a Aceptada con lo resuelto; `docs/ARCHITECTURE.md` (frontera del sistema y la
      sección del catálogo); `scripts/test/README.md`; `implementation-e3.md` con los pasos del
      dueño.

### Tarea I3: vault

- [ ] `Recursos/Supabase Schema Completo.md` (tabla y bucket), `APIs y Servicios Externos.md`
      (endpoints), `Variables de Entorno.md` (`VIMO_FLAG_REMOTE_CATALOG`),
      `Costos Operativos Mensuales.md` (almacenamiento, descarga y traducción) y la nota de ADR en
      `Proyectos/VIMO-TAURI/`, con su diagrama.

---

## Ola 4: pasos del dueño

1. Aprobar este plan y responder P8 («Traducir con IA») y P12 (la rama).
2. Revisar y aplicar en el panel de Supabase el SQL de la tabla y del bucket.
3. Aprobar el push, el PR y el merge a `main` de `vimo-landing` (eso publica el servidor), con
   `VIMO_FLAG_REMOTE_CATALOG=admins` cargada en Cloudflare.
4. Aplicar la semilla (las 38 gemas publicadas).
5. QA con su cuenta de admin: crear una gema nueva pegando su texto, generar sus muestras,
   publicarla y verla desde una cuenta que no sea admin; editar una gema existente y sus
   etiquetas; ocultar; eliminar.
6. Visto bueno: `VIMO_FLAG_REMOTE_CATALOG=all` (junto con `newCatalog`, cuando corresponda).
7. Push y PR de la app cuando lo diga.

## Costos

- **Supabase:** una tabla chica y un bucket de pocos megas, dentro del plan actual. La descarga
  crece con los estilos nuevos: unos 0,6 MB por estilo y por usuario, una sola vez.
- **Muestras:** las paga el admin con sus claves, unos 2 centavos por estilo (4 imágenes en
  calidad baja).
- **Agente al crear una gema:** como hoy, unos 0,4 centavos por gema; los admins no tienen cupo.
- **Traducir (P8):** fracciones de centavo por uso.
- **Cloudflare:** sin costo nuevo. Los endpoints hacen poco trabajo de CPU; el catálogo completo
  (unos 200 KB) solo se arma cuando la versión cambió.

## Fuera de alcance

- «Publicar en el catálogo» desde Mi estilo (D6 del diseño).
- Un panel web para editar el catálogo.
- Historial de versiones y papelera (P16).
- Buscador, filtros o categorías en la pestaña.
- Sacar de la app las gemas empaquetadas y sus muestras (P14).
- Abrir el catálogo nuevo a todos y el retiro del carril viejo: siguen su propio plan.
