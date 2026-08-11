# ADRs — Architecture Decision Records de Vimo

[English](/docs/adr/README.md) · **Español**

> Registro **en el repo** de las decisiones de arquitectura que gobiernan el código.
> Es la memoria de largo plazo para cualquier persona o IA que desarrolle acá:
> antes de tocar un área, buscá si hay una ADR que la gobierne.

## Regla de oro: una ADR no es prosa, es un contrato verificable

Cada ADR declara **qué decide**, **por qué** (incluyendo lo que se descartó y por qué),
y — lo que la hace útil de verdad — **cómo se verifica que se cumple**: los tests, guards
o evidencia que demuestran que la decisión funciona, y cómo se detectaría una regresión.
Una ADR sin verificación ejecutable es una opinión, no un registro.

El otro criterio: una ADR se lee en **menos de cinco minutos**. Si no entra, el problema
es el alcance de la decisión, no el largo del documento — probablemente sean dos ADRs.

## Convención

- Un archivo por decisión: `ADR-NNNN-slug-corto.md` (numeración correlativa, 4 dígitos).
- Plantilla: [TEMPLATE.es.md](TEMPLATE.es.md). Las secciones marcadas `(obligatoria)`
  siempre se llenan; las `(opcional)` se borran si no aplican.
- **Estados:** `Propuesta` → `Aceptada` → (`Reemplazada por ADR-XXXX` | `Obsoleta`).
  Nunca se borra una ADR: si una decisión cambia, se escribe la nueva y la vieja se
  marca como reemplazada, con el link a la que la sustituye. El historial de decisiones
  descartadas es la mitad del valor de esta carpeta.
- **Idioma:** las ADRs se escriben en **español**, un solo archivo por decisión (no se
  traducen: un registro duplicado se desincroniza). Este README y la plantilla sí están
  en los dos idiomas, para que el proceso sea legible para cualquiera.

## Cuándo escribir una ADR

- La decisión afecta a más de un módulo, al contrato entre capas (React ⇄ Tauri), o a lo
  que recibe el usuario final (formato de la distribución portable, seguridad, providers).
- Hay un trade-off real entre alternativas y el «por qué» va a importar en 6 meses.
- Un bug de raíz arquitectónica obliga a fijar un patrón para que no vuelva a pasar.
- Cambio de arquitecturas o flujos de trabajo requieren una ADR.

**Cuándo NO:** cambios de un solo archivo, correcciones de estilo, dependencias de rutina,
o cualquier cosa que el propio código ya explica. Una ADR que nadie va a consultar solo
agrega ruido.

## Índice

| ADR                                 | Título | Estado | Área |
| ----------------------------------- | ------ | ------ | ---- |
| _(todavía no hay ADRs registradas)_ |        |        |      |

## Nota sobre distribución

Esta carpeta —y todo `docs/`— **nunca viaja dentro de la app**: Tauri empaqueta
únicamente `dist/` (`frontendDist` en [src-tauri/tauri.conf.json](/src-tauri/tauri.conf.json))
más los iconos. La única forma de que documentación termine en el binario es ponerla en
`public/`, que Vite copia a `dist/`. No lo hagas.
