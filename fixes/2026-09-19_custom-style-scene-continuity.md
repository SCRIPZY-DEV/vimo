# Experimento descartado: continuidad de escenas en Mi estilo

- **Fecha:** 2026-09-19.
- **Rama:** `feat/extension-vimo-automater`.
- **Resultado:** insuficiente; la repetición de escenificación no quedó resuelta.

## Causa

La primera prueba real de diez escenas con la gema `ESTILO COMIC` produjo diez
prompts situados en un estudio. El ejecutable activo contenía la consigna nueva
de usuario: no fue un bundle anterior. La gema se conservó idéntica y no fija
ese estudio para todo el relato, pero pide fondo repetido «durante la misma
escena» y ofrece ejemplos con «el mismo fondo».

Los prompts trasladaron ciudades, calles y drenaje a representaciones observadas
por el protagonista. La repetición ya existía en los textos antes de enviarlos
a Flow. La descripción de identidad añadida a los prompts no contiene el
estudio. El retrato crudo de Fase 1 no se conserva, por lo que no puede atribuirse
a esa salida la elección de escenario ni afirmarse cuál instrucción interna
motivó la interpretación del modelo.

## Ensayo

Se añadió temporalmente `NARRATIVE_SCENE_RULE` al system de Fase 2 después de la
gema y las reglas técnicas. Aclaraba el alcance local de continuidad y pedía
escenificación directa, respetando ubicaciones globales y representaciones
indirectas expresas. No exigía un lugar nuevo por ID ni alteraba la gema.

Se ejecutó el pipeline real hasta `scene-prompts` en una copia aislada, con voz,
transcripción y cortes reutilizados. **Este segundo ensayo generó solamente
prompts: no produjo imágenes nuevas, no envió trabajos Flow y no probó Catálogo.**
El proceso completó con código 0; no incluyó `flowRuntime`. Un observador temporal
registró hashes y tamaños del cuerpo de cada solicitud y delegó al `fetch` real
sin modificar sus argumentos. No guardó headers ni claves. El registro es de
la solicitud local; no es una respuesta firmada del proveedor.

| Comprobación del segundo ensayo                                       | Resultado                                 |
| --------------------------------------------------------------------- | ----------------------------------------- |
| Llamadas reales a DeepInfra                                           | 2: personaje y lote de escenas            |
| Modelo efectivo                                                       | `openai/gpt-oss-120b-Turbo`               |
| Mismo guion, gema, modo de personaje y diez fragmentos/timestamps     | Sí                                        |
| IDs y prompts válidos sin fallback                                    | 1–10; diez de diez                        |
| Prompts con SHA-256 distintos                                         | 10                                        |
| Gema como prefijo exacto de ambos systems                             | Sí, comprobado antes del envío            |
| Adenda en el system de Fase 2                                         | Sí; hash coincide con el constructor real |
| Escenas situadas en el estudio                                        | 10 de 10                                  |
| Prompts con mapa, pergamino, dibujo, ilustración o maqueta explícitos | 9 de 10                                   |
| Archivos de imagen en el proyecto del ensayo                          | 0                                         |

La escena 9 sitúa Harappa/Mohenjo-Daro sobre un mapa; la 10 representa el
drenaje mediante una maqueta. La escena 6 muestra un artefacto dentro del mismo
estudio. Nueve fondos repiten literalmente la misma descripción; el primero
usa el mismo lugar sin la palabra «same».

Hash SHA-256 de la gema, idéntico al primer ensayo y al original:
`e46a05cc2defc633bbf2f2e00ff789f49712e0051e3b2461b5d8d0405e330967`.
Hash del system de Fase 2 **ensayado y posteriormente descartado**, capturado
antes de `fetch`:
`3b9f90ff92dde12a9a4893a4539ba45e69e0df4711006d0b4a0b8ef53f9c6c13`.

## Corrección

Se retiró la adenda ineficaz y se restauró
`pipeline/prompts/verbatim-messages.ts` a la versión de HEAD previa al experimento,
mediante lectura y escritura controlada, sin `git reset`. Permanece la consigna
de usuario original, cuya eficacia también fue insuficiente en la primera
prueba real. No se presenta este descarte como una reparación de la repetición.
Los prompts y trabajos del proyecto activo se conservaron.

ADR-0019, ADR-0038 y el vault registran el resultado negativo y el descarte;
no se incorpora un cambio de arquitectura ni un contrato nuevo.

## Límites deliberados

Dos ejecuciones con un mismo guion, gema y modelo no demuestran el comportamiento
de todos los estilos o modelos. La segunda prueba valida una salida real de
prompts, no su posterior renderizado en imágenes. No se cambiaron Fase 1,
el modelo elegido, las fases del pipeline, las claves, Catálogo ni el protocolo
Flow. No se añadieron reparaciones por regex, nuevos envíos ni reintentos de
imágenes. La causa interna de la elección semántica del modelo no está observada.

## Validación reproducible

Los doce controles locales previos probaron que la adenda llegaba al escritor
en cuatro modos, preservaba la gema, IDs, contexto, notas y número de llamadas.
Pasaron tipos, lint y formato, pero la prueba real demostró que esos controles
no bastaban para acreditar calidad semántica.

Los artefactos temporales de la segunda ejecución viven fuera del repositorio,
en `/private/tmp/vimo-prompt10-20260919/`: `request-hashes.json`, `execution.json`
y `projects/scenification-check/scenes.json`. La auditoría compara IDs,
fragmentos y tiempos con el proyecto de diez escenas; recalcula el hash de la
gema y clasifica manualmente lugar/acción en cada prompt. Los hashes por mensaje
del registro usan `JSON.stringify(content)`; `systemSha256` usa el contenido
crudo, por lo que son campos distintos y no deben confundirse.

Tras retirar la adenda, verificar que no queda diff de producto:

```sh
git diff --exit-code -- pipeline/prompts/verbatim-messages.ts
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
pnpm exec eslint pipeline/prompts/verbatim-messages.ts
pnpm exec prettier --check docs/adr/ADR-0019-carril-verbatim-y-segundos-por-escena.md docs/adr/ADR-0058-flow-como-motor-de-imagenes.md fixes/2026-09-19_custom-style-scene-continuity.md
```

## Pruebas manuales realizadas

Se inspeccionaron los diez prompts de cada ensayo, la gema, la identidad tejida,
el artefacto del primer ensayo y los hashes de las solicitudes del segundo.
Ambos conservaron el estudio en diez de diez prompts. El segundo ensayo terminó
correctamente en términos de ejecución, pero **falló el objetivo narrativo**.
No se declararon imágenes nuevas ni mejora visual a partir de esa ejecución.
