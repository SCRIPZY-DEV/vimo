---
title: Prueba real de diez escenas con Flow
date: 2026-09-19
tags: [vimo, flow, prompts, prueba-real]
---

# Prueba real de diez escenas con Flow

## Resultado: aceptación fallida

El pipeline nativo creó diez escenas y diez prompts distintos con la gema original de Mi estilo. Las diez solicitudes llegaron al coordinador con su identidad y texto correctos. **La repetición narrativa sigue presente:** todos los prompts escenifican al detective en un estudio; las siete imágenes obtenidas confirman ese escenario recurrente.

Flow devolvió siete imágenes y rechazó tres solicitudes con `ACTIVITY_BLOCKED`. No se completaron diez imágenes ni se considera aprobada la aceptación. Tampoco se comprobó Catálogo en esta corrida.

## Condiciones reproducidas

- Proyecto visible en Biblioteca: **Prueba Flow 10 escenas 2026-09-19**, carpeta `~/Documents/Vimo/prueba-flow-10-escenas-2026-09-19`.
- Origen conservado: `video-3-2`; mismo guion, gema ESTILO COMIC, modo de personaje genérico y modelo `openai/gpt-oss-120b-Turbo`.
- Voz/transcripción existentes reutilizadas: 42,25 segundos y 102 palabras; diez cortes verificados. No se volvió a generar voz ni transcribir.
- Motor Flow, formato 16:9, sin referencias adjuntas, sin exportación automática. Confirmación de diez escenas y ejecución desde la app nativa.
- SEA real de la app: SHA-256 `b9d927f79606cf4a1fda0af9143df5a8814bf209ef9e51df203d64cc5149ec51`; la consigna de escenificación anterior está incluida en ese artefacto.
- Gema SHA-256 `e46a05cc2defc633bbf2f2e00ff789f49712e0051e3b2461b5d8d0405e330967`, idéntica al origen. El proyecto original conserva sus archivos sin cambios.

## Integridad del lote

| Medición                                                      | Resultado                                                       |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| Escenas y prompts persistidos                                 | 10 y 10; sin fallback                                           |
| Solicitudes nuevas                                            | 10, con IDs únicos, un lote y una intención durable             |
| Prompt guardado → sanitizador común → intención → coordinador | 10/10 coinciden                                                 |
| POST de generación confirmados en recibos                     | 10; uno por trabajo                                             |
| Invocaciones locales                                          | 12: diez envíos y dos preparaciones canceladas antes del POST   |
| Reenvíos de operaciones inciertas / reescrituras              | 0 / 0                                                           |
| Resultados listos e importados                                | 7: escenas 1, 3, 4, 6, 7, 9 y 10                                |
| Solicitudes rechazadas                                        | 3: escenas 2, 5 y 8, `ACTIVITY_BLOCKED`, `submission: rejected` |
| JPEG válidos, decodificables y byte-idénticos al recibo       | 7/7                                                             |
| Presupuesto local utilizado                                   | +10; no equivale a diez imágenes logradas                       |
| Comprobaciones de integridad                                  | 133 sin discrepancias; aceptación visual fallida                |

El sanitizador añade las mismas cláusulas de texto y personas incidentales que los motores pagos; no introduce el estudio. La primera comparación temporal omitía este paso y marcó diferencias: se corrigió el auditor antes de obtener las cifras de la tabla. Eso no fue un defecto del transporte.

Un único perfil recibió los tres rechazos. La recuperación automática continuó dos preparaciones que aún no habían enviado un POST, conservando IDs y reservas. No volvió a enviar un trabajo `failed`. Al cierre del lote no había trabajos pendientes ni inciertos. Retomar la fase solo importó resultados ya disponibles, sin volver a generar los exitosos. El editor muestra las siete imágenes y los tres huecos con sus descripciones.

## Revisión semántica y visual

Cambian los encuadres y los objetos, pero no se representa directamente el cambio de tema del relato. Nueve prompts dicen literalmente «the same study» y los diez describen el estudio. La gema pide continuidad durante la misma escena; no obliga a situar todo el video en un estudio. La identificación del mecanismo interpretativo se infiere del texto producido, no del razonamiento interno del modelo.

| Escenas | Observación                                                                                  |
| ------- | -------------------------------------------------------------------------------------------- |
| 1       | Egipto y Grecia aparecen como ilustraciones sobre una mesa.                                  |
| 3–4     | Plano urbano genérico y pergamino vacío; representación indirecta de ciudades y olvido.      |
| 6–7     | Detective preocupado y mapamundi, sin mostrar las civilizaciones descritas.                  |
| 8       | El prompt propone un libro del Indo; no se obtuvo imagen.                                    |
| 9       | Maqueta cuadriculada sobre el escritorio, en lugar de las ciudades del Indo como entorno.    |
| 10      | Cuaderno y diagramas de tuberías de apariencia contemporánea; falta contexto urbano antiguo. |

La técnica sepia, papel crema y continuidad del detective sí se conservan. La variación de ángulos no basta para considerar distintos los escenarios narrativos.

## Ensayo adicional sin imágenes: descartado

Se probó una adenda explícita de continuidad en el system de Fase 2, conservando la gema. Un proyecto aislado recibió exactamente los mismos diez cortes y el mismo modelo; se ejecutó el pipeline solo hasta `scene-prompts`, sin runtime Flow.

Dos llamadas reales a DeepInfra: diseño del personaje y escritura de diez prompts. Una instrumentación temporal registró exclusivamente modelo, roles, tamaños y hashes del cuerpo antes del envío; no guardó claves, cabeceras ni texto de mensajes. El hash del system de Fase 2 enviado fue `3b9f90ff92dde12a9a4893a4539ba45e69e0df4711006d0b4a0b8ef53f9c6c13`; la gema permaneció como prefijo exacto. La clave existente se leyó del llavero y se entregó únicamente por stdin privado en memoria.

**La adenda también falló:** diez prompts en el mismo estudio, Harappa sobre un mapa y drenaje en una miniatura. Se retiró el cambio de producto experimental. Se conserva el registro del intento en `fixes/2026-09-19_custom-style-scene-continuity.md`; no se presenta como arreglo.

## Límites y siguiente diagnóstico

- La ejecución real demuestra conservación de gema y correspondencia de los diez trabajos, pero no fidelidad narrativa satisfactoria.
- El ensayo inicial no capturó el cuerpo HTTP del LLM; su system se verifica en código y artefacto. El ensayo adicional sí registró hashes del cuerpo enviado.
- No hubo nuevas imágenes en el ensayo adicional, pruebas de `connection.test`, cambio de modelo, borrado de recibos, copia de credenciales ni publicaciones.
- Una siguiente corrección debe medirse primero con estas diez escenas y con una gema que fije explícitamente un lugar global. Debe conservar esa intención y evitar imponer diez lugares diferentes. No se añadió un planificador ni otra fase del pipeline.
- El rechazo `ACTIVITY_BLOCKED` necesita un diagnóstico independiente del problema de prompts; no prueba por sí solo un error de autenticación, de cuenta o de la extensión. Ver `prompt-extension-generation-review.md`.

## Cómo revisar sin generar otra vez

Abrir Biblioteca → Prueba Flow 10 escenas 2026-09-19. Revisar las imágenes 1, 3, 4, 6, 7, 9 y 10 y comparar cada descripción con el guion. Las escenas 2, 5 y 8 permanecen sin imagen. No pulsar Regenerar para repetir esta auditoría de lectura.

La auditoría temporal recalculó hashes y decodificó los JPEG con FFmpeg. Sus scripts e imágenes de contacto permanecen fuera del repositorio. El informe agregado local se llama `vimo-live10-first-batch-audit-20260919.json`; los artefactos de la prueba de prompts están bajo `/private/tmp/vimo-prompt10-20260919/`.

La documentación final pasó `pnpm format`, `pnpm lint`, `pnpm build` y `git diff --check`. No quedó cambio de código de producto tras retirar el experimento, por lo que no se creó otra app ni se alteró el bundle probado.
