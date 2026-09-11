# ADRs — Vimo Architecture Decision Records

**English** · [Español](/docs/adr/README.es.md)

> An **in-repo** record of the architecture decisions that govern this code.
> It is the long-term memory for any human or AI working here: before touching an
> area, check whether an ADR already governs it.

## Golden rule: an ADR is not prose, it's a verifiable contract

Every ADR states **what it decides**, **why** (including what was rejected and why),
and — the part that actually makes it useful — **how compliance is verified**: the tests,
guards, or evidence proving the decision works, and how a regression would be caught.
An ADR with no executable verification is an opinion, not a record.

The other bar: an ADR reads in **under five minutes**. If it doesn't fit, the problem is
the scope of the decision, not the length of the document — it's probably two ADRs.

## Convention

- One file per decision: `ADR-NNNN-short-slug.md` (sequential, 4 digits).
- Template: [TEMPLATE.es.md](TEMPLATE.es.md) (English structure: [TEMPLATE.md](TEMPLATE.md)).
  Sections marked `(required)` are always filled in; delete the `(optional)` ones that
  don't apply.
- **Statuses:** `Propuesta` → `Aceptada` → (`Reemplazada por ADR-XXXX` | `Obsoleta`).
  An ADR is never deleted: when a decision changes, write the new one and mark the old
  as superseded, linking to its replacement. The trail of rejected decisions is half the
  value of this folder.
- **Language:** ADRs are written in **Spanish**, one file per decision (they are not
  translated — a duplicated record drifts). This README and the template are bilingual so
  the process itself is readable to everyone.
- Code paths are relative to the repo root: `src/file.ts`.

## When to write an ADR

- The decision affects more than one module, the contract between layers (React ⇄ Tauri),
  or what the end user receives (portable distribution format, security, providers).
- There's a real trade-off between alternatives and the "why" will matter in 6 months.
- An architectural bug forces a pattern to be pinned down so it can't happen again.
- Architecture changes or workflow with APIs

**When NOT to:** single-file changes, style fixes, routine dependency bumps, or anything
the code already explains. An ADR nobody will consult is just noise.

## Index

| ADR                                                                            | Title                                                                      | Status                   | Area                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------ | ----------------------------- |
| [ADR-0027](ADR-0027-modo-demo-pipeline-simulado-sobre-pack-prehecho.md)        | Demo mode: simulated pipeline over a pre-built pack, access via vimo.click | Aceptada                 | app / pipeline                |
| [ADR-0024](ADR-0024-dos-proveedores-de-voces-dubvoice-y-elevenlabs-directo.md) | Two voice providers: DubVoice and direct ElevenLabs                        | Aceptada                 | providers / pipeline / app    |
| [ADR-0023](ADR-0023-una-entrada-de-keychain-y-firma-estable.md)                | One keychain entry for every API key, stable signing pending               | Aceptada                 | seguridad / distribución      |
| [ADR-0022](ADR-0022-modelo-de-prompts-como-preferencia.md)                     | The prompt model is a preference, not the last choice                      | Aceptada                 | app                           |
| [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md)              | Prompt model selector, cost simulator and the style's character            | Aceptada                 | pipeline / app                |
| [ADR-0019](ADR-0019-carril-verbatim-y-segundos-por-escena.md)                  | Verbatim lane and seconds-per-scene for custom styles                      | Aceptada                 | pipeline / app                |
| [ADR-0018](ADR-0018-estilos-visuales-propios-fase-basica.md)                   | Custom visual styles ("My style"), basic phase                             | Aceptada                 | pipeline / app                |
| [ADR-0017](ADR-0017-formato-de-video-16-9-y-9-16.md)                           | Video format 16:9 / 9:16 end to end                                        | Aceptada                 | pipeline / app                |
| [ADR-0016](ADR-0016-adopcion-del-rediseno-de-vimo-dev-por-ramas.md)            | Adoption of the vimo_dev redesign, branch by branch                        | Aceptada                 | proceso                       |
| [ADR-0015](ADR-0015-fal-solo-gpt-image-2.md)                                   | Fal generates only with gpt-image-2: Flux retired                          | Aceptada                 | providers                     |
| [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md)                    | Library: editing on top of the stages, selective regeneration              | Aceptada                 | pipeline / app                |
| [ADR-0013](ADR-0013-modulo-create-runner-de-stages-y-binarios.md)              | Create: stage runner, scene confirmation and bundled binaries              | Aceptada                 | pipeline / app / distribución |
| [ADR-0012](ADR-0012-primitivas-del-runner-y-contratos-cerrados.md)             | Runner primitives and closed contracts in the pipeline                     | Propuesta                | pipeline                      |
| [ADR-0011](ADR-0011-claves-api-en-keychain-con-fuente-abstracta.md)            | API keys in the OS keychain behind an abstract source                      | Aceptada                 | seguridad                     |
| [ADR-0010](ADR-0010-pipeline-por-stages-y-migracion-por-modulos.md)            | Pipeline as staged Node sidecar and module-by-module migration             | Aceptada                 | pipeline                      |
| [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md)                    | Native preferences via official plugins and single projects root           | Aceptada                 | app                           |
| [ADR-0008](ADR-0008-catalogo-de-costos-local.md)                               | Cost catalog as a local client dataset                                     | Aceptada                 | app                           |
| [ADR-0007](ADR-0007-invoke-reemplaza-al-servidor-local.md)                     | Tauri's invoke() replaces the local server                                 | Aceptada                 | distribución                  |
| [ADR-0006](ADR-0006-autenticacion-doble-flujo-oauth-y-gate-por-loaders.md)     | Auth: dual OAuth flow (web/deep link) and router-loader gate               | Aceptada                 | app                           |
| [ADR-0005](ADR-0005-layouts-explicitos-y-modulos-base.md)                      | Explicit layouts (Authenticated/Guest) and base modules                    | Aceptada                 | app                           |
| [ADR-0004](ADR-0004-i18n-con-i18next.md)                                       | i18n with i18next and per-language JSON catalogs                           | Aceptada                 | app                           |
| [ADR-0003](ADR-0003-fundaciones-de-la-interfaz.md)                             | Interface foundations: port the original app's common layer                | Aceptada (i18n → 0004)   | app                           |
| [ADR-0002](ADR-0002-servidor-local-como-sidecar-de-tauri.md)                   | The local server ships as a Tauri sidecar                                  | Reemplazada por ADR-0007 | distribución                  |
| [ADR-0001](ADR-0001-separacion-interfaz-y-pipeline.md)                         | Split the interface from the pipeline and rewrite it from scratch          | Reemplazada por ADR-0002 | app                           |

## A note on distribution

This folder — and all of `docs/` — **never ships inside the app**: Tauri bundles only
`dist/` (`frontendDist` in [src-tauri/tauri.conf.json](/src-tauri/tauri.conf.json)) plus
the icons. The only way documentation ends up in the binary is by putting it in `public/`,
which Vite copies into `dist/`. Don't.
