# Contribución

Cómo trabajar en este repositorio: para humanos (y los agentes de IA que te ayudan).

## Orientación

- **Arquitectura** (cómo está construido todo): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — lee esto primero.
- **Reglas** para modificar las reglas, modificar `CLAUDE.md`. Claude Code carga estos archivos automáticamente en cada sesión.

## Dos formas de trabajar con Claude

### A. Prompts estándar (opción predeterminada)

Simplemente haz tu petición. Utiliza esta opción para cualquier tarea que no implique una funcionalidad completa que abarque múltiples áreas:

- preguntas («¿cómo funciona la consulta del _feed_?»),
- cambios en un área específica («corrige esta validación del serializador», «ajusta este componente»),
- depuración, refactorización y correcciones puntuales.

### B. The `/feature` pipeline

Este proceso se encuentra en desarrollo, pero basicamente lo que hace es levantar varios agentes de IA para ayudarte a resolver una tarea específica. Sin embargo, puede llegar a ser más costoso si no se tiene claro la feature a implementar.

## Reglas básicas (se aplican a todos los cambios)

- **Claude nunca ejecuta comandos de git**: tú, como humano, te encargas del _staging_, los _commits_, las ramas y los _pushes_.
- Sigue las reglas del archivo `CLAUDE.md` de la zona; estas recogen las convenciones que los revisores utilizan para verificar el trabajo.
