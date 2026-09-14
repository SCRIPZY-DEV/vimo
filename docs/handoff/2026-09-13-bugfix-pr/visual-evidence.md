# Evidencia visual: correcciones de Vimo

Fecha: 2026-09-13. Rama: `feat/fix-bugs-vimo`. Destino del PR: `dev`.

Las capturas son de componentes React reales con el CSS del build, tomadas en un
Chrome aislado. No son mockups ni imágenes generadas para representar una UI. Las
APIs, proyectos, resultados de IA y porcentajes son **fixtures ficticios**: documentan
los estados visibles, pero no prueban latencia ni calidad del proveedor. No contienen
claves, cuentas ni proyectos reales del usuario.

Las imágenes no se trackean: se regeneran localmente en `screenshots/` (ver
[Reproducir las capturas](#reproducir-las-capturas)). Cada una se describe abajo por
su nombre de archivo.

## Claves API

- **`api-unvalidated.png`**: hay una clave escrita, pero la conexión todavía no se
  probó, así que Guardar sigue deshabilitado.
- **`api-validated.png`**: después de una respuesta exitosa para esa misma clave,
  Guardar se habilita. Editar el valor invalida esa autorización. La respuesta de
  conexión es simulada.

## Identidad desde Catálogo

- **`catalog-character-ready.png`**: con guion cargado y biblioteca vacía, Crear
  personaje permite redactar con IA aunque los campos estén vacíos. Los textos grises
  son placeholders.
- **`catalog-character-complete.png`**: la respuesta completa llena nombre, edad, rol
  e identidad. `30 años` es un valor del input, no su placeholder. La captura usa una
  respuesta ficticia controlada.

## Previews de Mi estilo

- **`samples-prompts.png`**: las cuatro tarjetas se mantienen visibles mientras se
  redactan los prompts. Las barras de texto representan un avance estimado, no un
  porcentaje real del LLM.
- **`samples-images.png`**: en la fase de imágenes, cada tarjeta muestra su propio
  progreso. Los porcentajes son ficticios. La concurrencia de peticiones se comprueba
  con `scripts/check-preview-regressions.mjs`, no con una imagen estática.

## Editor: Exportar y selección de personaje

- **`editor-short.png`**: short 9:16 con Exportar video en el header, sin botón
  flotante sobre el timeline. El panel muestra el personaje desmarcado antes de
  regenerar.
- **`editor-long.png`**: formato largo 16:9, con Exportar en la misma ubicación y el
  personaje marcado en el panel.

En ambos casos, la imagen del visor es la referencia estática ya existente
`public/style-references/cartoon_1.jpg` y se usa solo para mostrar el layout. **No es
una regeneración** ni evidencia de presencia o ausencia de Ana, del estilo o de la
fidelidad narrativa. Cambiar el checkbox conserva la imagen anterior hasta una
regeneración explícita. El guardado, el rollback y el prompt según la selección se
verifican en los scripts del editor y en la QA manual con proveedores.

## Reproducir las capturas

Desde la raíz del repo, con las dependencias instaladas y Chrome disponible:

```sh
pnpm build
node scripts/capture-bugfix-pr.mjs
```

El script acepta la ruta del ejecutable de Chrome como primer argumento. Usa un
perfil temporal propio, no abre la app instalada, no guarda claves y no genera
imágenes ni videos pagados. Las capturas se escriben en
`docs/handoff/2026-09-13-bugfix-pr/screenshots/`, que está ignorada por git.

Las comprobaciones funcionales están documentadas en
[los informes de cada corrección](../../fixes/) y en la
[auditoría inicial](../2026-09-12-bugfix-audit/findings.md). Los informes de
personaje del editor, de claves API y la ADR-0017 complementan la auditoría con los
ajustes posteriores. El build empaquetado de Windows requiere su propia validación.
