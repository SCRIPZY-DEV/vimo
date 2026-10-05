# Fix: las animaciones pasan a Seedance después de un solo fallo de Grok

- **Fecha:** 2026-10-05
- **Rama:** feat/creador-estilo-ia-sobre-catalogo

## Causa

Cada clip animado se encarga a Kie con Grok Imagine Video 1.5. Si Kie confirmaba que la
generación había fallado, el carril (`pipeline/animation/lane.ts`, `nextModel`) volvía a pedirlo a
Grok y recién después del **segundo** fallo pasaba a Seedance 1.5 Pro (ADR-0042 y ADR-0046). El
dueño notó esperas largas por la poca disponibilidad de Grok en Kie.

La telemetría de 14 días (`diagnostic_logs`, subcomando `animate-scenes`, todos los usuarios, al
2026-10-05) muestra dónde se iba el tiempo:

| Caso                                | Escenas | Mediana |  p90 | Máximo |
| ----------------------------------- | ------: | ------: | ---: | -----: |
| Salió al primer Grok                |     649 |    54 s | 82 s |  218 s |
| Grok falla (lo que tarda en fallar) |      66 |    50 s | 98 s |  223 s |
| Salió al segundo Grok               |      56 |    46 s | 92 s |  235 s |
| El segundo Grok también falla       |       9 |    26 s | 83 s |  106 s |
| Salió con Seedance (tercer intento) |       8 |    33 s | 42 s |   46 s |

Después de un fallo de Grok, Seedance resolvía más rápido y más parejo que un segundo Grok, y
cuesta menos: 1,75 créditos por segundo contra 2,4.

## Corrección

`pipeline/animation/lane.ts`:

- `nextModel`: con un fallo de generación confirmado de Grok, el intento siguiente va con Seedance.
  Un fallo de Seedance sigue cerrando el presupuesto.
- `MAX_GENERATION_ATTEMPTS` baja de 3 a 2, así el avance de la escena dice «intento N de 2».
- Los dos se exportan para el guard nuevo.

Docs: sección «Seedance después de un solo fallo de Grok (2026-10-05)» en la ADR-0042, que
reemplaza la secuencia Grok, Grok y Seedance (también la frase de la ADR-0046), e índice de guards.

## Límites deliberados

- No cambia qué cuenta como fallo del modelo. Saldo, clave, moderación, 429, envíos inciertos y la
  espera de 15 minutos con la tarea todavía en cola (`animation_timeout`) siguen sin abrir el
  respaldo: pasar a Seedance con la tarea de Grok viva podría cobrar dos videos.
- El botón del editor sigue abriendo un presupuesto nuevo, que repite Grok y después Seedance.
- Un proyecto guardado con dos fallos de Grok sigue con Seedance, y uno guardado con un fallo de
  Grok ahora sigue con Seedance en vez de un segundo Grok. En el primer caso, que solo se da si la
  app se cerró en los 3 segundos entre el segundo fallo y el pedido a Seedance, ese reintento
  muestra «intento 3 de 2»; no se agregó código para un caso así.
- La escena que antes salía en el segundo Grok ahora sale en Seedance, con su propio movimiento.
- No cambia la estimación de créditos: ya contaba una sola generación exitosa a precio de Grok.

## Validación reproducible

- `node --test scripts/test/check-animation-fallback.mjs` (nuevo, 7 casos). Corre la regla real del
  carril, sin red ni FFmpeg. Los dos casos de la regla nueva se vieron fallar contra el código
  anterior: con un fallo de Grok volvía a Grok, y el presupuesto era de 3. Los otros cinco fijan lo
  que no cambia (primer intento con Grok, proyecto con dos fallos de Grok, fallos que no son del
  modelo, tarea muerta por saldo y solo Kie con respaldo).
- No había ningún guard del respaldo en el repo. Los scripts que listaba la ADR-0042
  (`scripts/check-animation-*.mjs`) se usaron en la rama del PR #91 y no entraron a `dev`.
- La telemetría de la tabla sale de `diagnostic_logs` con consultas de solo lectura: para cada
  escena, el intento más alto de `scene-animation-started` y el tiempo hasta
  `scene-animation-ready`.
- `pnpm format`, `pnpm lint` y `pnpm build` pasan.

## Pruebas manuales

No se puede forzar un fallo de Grok desde la app. Lo que se ve en una app de prueba: un clip que
reintenta muestra «intento 2 de 2» (antes «2 de 3»), y en el log de diagnóstico ese segundo intento
aparece como `scene-animation-started` con `attempt: 2` seguido de `scene-animation-ready`.
