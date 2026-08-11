# Contribución

[English](/docs/CONTRIBUTING.md) · **Español**

Cómo trabajar en este repositorio: para humanos (y los agentes de IA que te ayudan).

## Orientación

- **Arquitectura** (cómo está construido todo): [ARCHITECTURE.md](ARCHITECTURE.md) — lee esto primero.
- **Reglas**: para modificar las reglas, modifica `CLAUDE.md`. Claude Code carga estos archivos automáticamente en cada sesión.

## Dos formas de trabajar con Claude

### A. Prompts estándar (opción predeterminada)

Simplemente haz tu petición. Utiliza esta opción para cualquier tarea que no implique una funcionalidad completa que abarque múltiples áreas:

- preguntas («¿cómo funciona la consulta del _feed_?»),
- cambios en un área específica («corrige esta validación del serializador», «ajusta este componente»),
- depuración, refactorización y correcciones puntuales.

### B. El pipeline `/feature`

Este proceso se encuentra en desarrollo, pero básicamente lo que hace es levantar varios agentes de IA para ayudarte a resolver una tarea específica. Sin embargo, puede llegar a ser más costoso si no se tiene clara la _feature_ a implementar.

## Ramas y Pull Requests

- **Una rama por cada nueva característica.** Nunca trabajes directamente sobre `dev`. Nombra la rama según el cambio, usando el mismo prefijo que el tipo de commit: `feat/exportacion-portable`, `fix/validacion-serializador`.
- **Todo Pull Request apunta a `dev`, nunca a `production`.** Los cambios llegan a producción únicamente promoviendo `dev`; ningún PR va directo a la rama de producción.
- **El título del PR sigue git flow / Conventional Commits**: `<tipo>: <descripción corta>`, por ejemplo `feat: agregar exportación portable al panel de ajustes`.

  Tipos en uso: `feat` (nueva funcionalidad), `fix` (corrección de error), `docs` (documentación), `style` (formato, sin cambios de lógica), `refactor` (reestructuración sin cambio de comportamiento), `perf` (rendimiento), `test` (pruebas), `chore` (herramientas, dependencias, configuración).

- **La descripción del PR debe ser detallada** — suficiente para quien revisa sin haber estado presente. Incluye al menos:
  - **Qué se hizo**: los cambios, área por área.
  - **Por qué**: el problema que resuelve o la tarea/issue que cierra.
  - **Cómo probarlo**: pasos para reproducir o verificar el cambio.
  - **Notas**: cambios que rompen compatibilidad, migraciones o pendientes.

## Reglas básicas (se aplican a todos los cambios)

- **Claude nunca ejecuta comandos de git**: tú, como humano, te encargas del _staging_, los _commits_, las ramas y los _pushes_.
- Sigue las reglas del archivo `CLAUDE.md` de la zona; estas recogen las convenciones que los revisores utilizan para verificar el trabajo.
