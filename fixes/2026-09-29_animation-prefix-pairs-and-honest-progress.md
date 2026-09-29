# Fix: primer minuto por parejas y progreso de generación honesto

- **Fecha:** 2026-09-29
- **Rama:** `feat/animation-scenes-dev-20260922`

## Causa

La cabecera de prompts usaba el máximo entre borradores recibidos por streaming y prompts realmente publicados. Al llegar el stream al total anunciaba «listos» aunque faltaran revisión y guardado. El trabajo de animación estaba encapsulado en la fase de imágenes, así que imágenes completas seguían mostrando esa fase activa.

El formulario permitía alcances que el usuario pidió reservar al editor, y la política de prefijo generaba una sola imagen cada 6 s. El requerimiento final cambia únicamente la creación automática a dos referencias cada 6 s. Al reutilizar la estimación del editor para reanudar, los marcadores de 6 s en las nuevas fuentes de 3 s podían duplicar los segundos cotizados.

## Corrección

- Formulario: únicamente primer minuto; normaliza borradores antiguos al enviar, con `animationMinutes:1` y `animateWholeVideo:false`. Hasta 60 s reales, con estimación explícita de un minuto completo. No reescribe opciones de proyectos ya existentes.
- Cortador: fuentes cada 3 s dentro de `[0,min(audio,60)]`; parejas consecutivas para clips solicitados de 6 s. Fuera del intervalo usa la duración elegida. El último intervalo acaba en el audio real, según el reloj de 25 FPS ya existente.
- Confirmación: aclara fuentes de 3 s / clips de 6 s, configura solo el resto; en audio corto oculta controles irrelevantes sin impedir continuar.
- Nueva fase `animation` entre imágenes y ensamblaje; usa los mismos recibos, concurrencia y recuperación. Ver ADR-0045. No necesita modificar Rust.
- Progreso: azul desde 0, finalización solo con archivos listos, clips ampliables/reproducibles sin sonido. Al reanudar muestra archivos existentes aunque el editor los haya reparado con otra agrupación.
- Prompts: borrador no equivale a listo; el cierre de fase gobierna el 100%. Se conserva el stream para el watchdog y los mecanismos de pausa/cambio de modelo/reintento selectivo.
- Dirección de movimiento: refuerzo solo en una fuente individual, con acción visible del sujeto y cámara coherente; identidad y narración local prevalecen. Parejas y cadena de modelos permanecen iguales.
- Estimación al reanudar: activa la misma política de parejas solo para creación. No cobra otra vez los intervalos ya listos o enviados.

## Límites deliberados

- La planificación del editor, el generador de guiones, previews, modelos disponibles y bloqueo/rescate de modelos no se rediseñan.
- Proyectos anteriores de fuentes6s conservan sus cortes y activos. Para ver el nuevo primer minuto hay que crear un proyecto nuevo.
- Los porcentajes de animación durante el trabajo son orientativos, como en el editor; 100% exige completar la fase.
- La duración de los intervalos es comprobable; la fidelidad visual de un modelo generativo no puede garantizarse con pruebas de código. No se compraron videos de Kie en esta validación.
- Un clip parcial solicita 6 s y se normaliza a su hueco real. Puede costar un clip completo aunque ocupe menos tiempo.

## Validación reproducible

Comandos del repositorio:

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

Comprobaciones locales de esta sesión, fuera del repo y no destinadas al PR:

- `/private/tmp/vimo-prefix-pairs-20260929/`: 98 casos de cortes, colas, fases, conservación de palabras, caché y reanudación; 384 comparaciones del editor contra HEAD anterior, sin diferencias.
- `/private/tmp/vimo-create-prefix-form-20260929/check.mjs`: 12 casos de formulario, borradores, estimación y render estático del divisor.
- `resume-check.mjs` en el mismo directorio: 12 casos de presupuesto de reanudación, clips listos y tareas pagadas.
- `/private/tmp/vimo-prefix-ui-20260929/check.mjs`: 10 casos de progreso honesto, fase, cero inicial y tarjetas que respetan clips reparados.
- `/private/tmp/vimo-single-motion-20260929/`: 7 casos de compatibilidad de instrucciones; parejas idénticas a la solicitud anterior.
- Guardas del sidecar incluido en la app: 12 casos de catálogo, 3 de recuperación selectiva y 14 de fase nueva/cortes/reanudación con archivos locales; sin llamadas pagadas. La firma completa de la app pasa la verificación estricta.

Para repetir las comprobaciones, ejecutar los scripts con Node 22 y este worktree presente. Los scripts temporales no son tests oficiales ni van incluidos en el commit. El build usa `pnpm tauri build --bundles app --ci`, Node 22 y `APPLE_SIGNING_IDENTITY=-`, sin otras credenciales Apple. Se verifica con `codesign --verify --deep --strict` sobre la app completa.

## Pruebas manuales

Se inspeccionaron los componentes reales en un navegador con un fixture local: fase azul antes de ensamblaje, cinco tarjetas, progreso desde 0, texto de revisión con borradores completos pero sin prompts guardados; clic en un clip listo, reproducción de un MP4 sintético de 6 s, estado `muted=true`, reproducción hasta el final y cierre del modal. Esta prueba no equivale a ejecutar un proyecto real con Kie en la app nativa.

Dos solicitudes reales de redacción de movimiento dieron acciones más explícitas para aspiradora y personaje. Sus dos revisiones también se ejecutaron. La revisión dejó pasar el verbo audible «hums»; por ello se añadió una instrucción explícita de verbos visuales. Esa última frase se verificó localmente sin otra compra. No se afirma que el revisor garantice ausencia de errores.

Pendiente de aceptación en Vimo: crear 30 / 55,3 / 60 / 72 s en ambos formatos, con 4 s de estáticas después del minuto; revisar audio/límites, reproducción de clips, exportación, reanudación y un proyecto histórico. Ver checklist entregado en el chat.
