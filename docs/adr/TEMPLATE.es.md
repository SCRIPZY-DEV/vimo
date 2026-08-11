# ADR-NNNN — Título corto de la decisión

- **Estado:** Propuesta | Aceptada | Reemplazada por ADR-XXXX | Obsoleta
- **Fecha:** YYYY-MM-DD (última actualización de estado)
- **Área:** app | pipeline | seguridad | distribución | testing | providers

<!--
  Copiá este archivo a docs/adr/ADR-NNNN-slug-corto.md y borrá los comentarios.
  Las secciones marcadas (obligatoria) siempre se llenan. Las (opcional) se borran
  si no aplican: una ADR debe leerse en menos de cinco minutos. Ejemplo:
  Escribí en español, con rutas de código relativas a la raíz (`src/archivo.ts`).
-->

## Problema (obligatoria)

Qué situación obligó a decidir, con evidencia si la hay (reporte de usuario, medición,
incidente). Suficiente contexto para que alguien sin la historia entienda por qué esto
no era obvio. Cerrá con las restricciones que achicaron el campo de opciones:

- Restricción 1 (ej: tiene que funcionar sin instalador, desde un USB).
- Restricción 2 (ej: el contribuidor usa un modelo más barato y con menos contexto).

## Decisión (obligatoria)

La decisión en una frase imperativa. Después, cómo se materializa en el código:
archivos y funciones concretos con sus rutas.

> Ejemplo: «El estado de la sesión vive en `src/state/session.ts` y se persiste en
> disco solo al cerrar la app.»

### Forma (opcional)

Un diagrama o tabla cuando la decisión tiene piezas móviles. ASCII le gana a la prosa:

```
usuario -> comando   -> etapa 1 -> etapa 1.5 (revisión) -\
                                                          | ciclo de corrección
                     <- resultado <- etapa 2 <------------/
```

| Componente | Estado          | Ubicación | Para qué  |
| ---------- | --------------- | --------- | --------- |
| `algo`     | nuevo / reusado | `src/...` | una línea |

### Flujo de datos (opcional)

Los pasos numerados, solo si el orden importa y no se deduce del diagrama.

1. Entra X por `src/...`.
2. Se valida en `...`; si falla, se corta acá.
3. Sale Y hacia `...`.

## Alternativas consideradas (obligatoria)

Sin esta sección la ADR no sirve: es lo que evita volver a discutir lo mismo en 6 meses.

- **Alternativa A** — por qué se descartó (costo, riesgo, evidencia concreta).
- **Alternativa B** — ídem. Si se descartó _por ahora_ y podría volver, decilo y
  aclará qué tendría que cambiar para reconsiderarla.

## Consecuencias (obligatoria)

- ✅ Lo que mejora.
- ⚠️ La deuda o el costo que aceptamos a sabiendas.
- 🔒 Lo que a partir de ahora **no** se puede hacer (la restricción que impone).

## Verificación de cumplimiento (obligatoria)

Cómo se demuestra que la decisión funciona y se sigue cumpliendo. Una ADR sin
verificación ejecutable es una opinión, no un registro.

- **Tests:** ruta exacta + qué assertan + dónde corren (CI / local).
- **Guards:** chequeos del build o del lint que la protegen.
- **Cómo se vería una regresión:** el síntoma concreto, y qué lo detectaría.

## Modos de falla (opcional)

Qué pasa cuando algo sale mal, y quién se hace cargo: qué se aborta, qué se reintenta,
qué se le reporta al usuario.

## Fuera de alcance (opcional)

Lo que deliberadamente **no** se construyó, para que nadie lo lea como un olvido.
Agregar alguno solo cuando el uso real demuestre que hace falta.

## Referencias (opcional)

Commits, issues, PRs, ADRs relacionadas (`ADR-NNNN`), documentación externa.
