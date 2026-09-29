# Revisión de animación de escenas antes del merge a dev

- **Fecha:** 2026-09-29
- **Rama:** feat/animation-scenes-dev-20260922
- **Destino:** dev. PR abierto para revisión humana; no habilitar merge automático.
- **Base integrada:** dev en e50be2a1 (versión 0.8.7, beta e idioma de prompts).

## Alcance que debe revisar el compañero

### 1. Animación y exportación

Kie permite animar desde Crear, el editor y la galería. El formulario ofrece el
primer minuto: genera imágenes cada 3 s y las empareja en clips de 6 s, hasta el
menor valor entre 60 s y la duración del audio. Después del minuto se respeta la
duración estática elegida. La última pieza se ajusta a su intervalo, sin desplazar
la narración. Rangos personalizados y todo el video quedan en el editor.

Hay planificación por intervalos, estimaciones, saldo, recibos, reintentos y
respaldo automático Grok/Seedance. La exportación normaliza clips sin sonido,
conserva los cortes y permite exportar para editar. Los intervalos ya animados se
omiten al ampliar un rango; rehacer es una acción explícita.

El último fix corrige el temblor de las imágenes estáticas de video-rural-4:
zoompan redondeaba el recorte; perspective aplica la misma trayectoria con
interpolación subpíxel. Se conservan los ocho Ken Burns, su orden y amplitudes.
La caché v5 fuerza nuevo render; un MP4 antiguo necesita reexportación.

Referencias: [ADR-0042](../adr/ADR-0042-animacion-kie-por-intervalos-y-recibos.md),
[ADR-0045](../adr/ADR-0045-prefijo-animado-por-parejas-y-fase-propia.md),
[fix de movimiento](../../fixes/2026-09-29_static-motion-without-jitter.md).

### 2. Editor y galería

Galería de cinco columnas, selección reversible, descripciones individuales y
regeneración/animación múltiple sin salir de ella. Los trabajos compatibles se
encolan; cerrar la galería conserva el progreso visible en el editor. Se protegen
solapamientos, resultados tardíos y compras duplicadas. Deshacer un clip restaura
las imágenes fuente de todo su intervalo antes de regenerarlas.

Se muestran coste estimado, duración, coste registrado y estado de cada clip.
Se corrige la reproducción que retrocedía al cargar video y se distinguen los
fundidos asociados a animaciones de los fundidos opcionales entre imágenes.

Referencias: [ADR-0046](../adr/ADR-0046-recuperacion-y-deshacer-animaciones.md),
[selección y cola](../../fixes/2026-09-29_gallery-selection-and-queue.md),
[reproducción](../../fixes/2026-09-29_editor-animation-playback-rewind.md).

### 3. Prompts y conservación de dev

El selector ofrece DeepSeek V4.1 Flash como predeterminado y Claude Haiku 4.5 como
alternativo. El redactor de movimiento empieza con V4.1 Flash y admite MiMo V2.6
Flash como otra oportunidad; la revisión de movimiento puede recurrir a Haiku.

Se mantienen lotes de hasta 20 fragmentos, IDs inequívocos y persistencia de
prompts aceptados. Se repiten solo los faltantes/rechazados, sin borrar el trabajo
ya válido. La recuperación conserva bloqueo de modelo, elección del usuario y
reanudación. El límite local de concurrencia no coordina otras apps o procesos
que compartan la cuenta del proveedor, y el 429 sigue siendo posible.

La integración conserva la corrección de inglés de dev. Un lote completamente
inválido por idioma informa el error de gema, sin culpar ni bloquear al modelo.
Previews sin contexto temporal conservan su contrato; no se activa en ellas la
revisión narrativa de escenas con audio. Ver [integración](../../fixes/2026-09-29_integrate-dev-animation.md).

## Revisor narrativo: medida TEMPORAL, no garantía de cero errores

El revisor de imágenes con DeepSeek V4 Pro se mantiene **temporalmente mientras se
corrige la causa de redacción**. Es distinto del revisor de movimiento de clips.
Añade llamadas, coste y latencia; las estimaciones de créditos de video Kie no
representan ese consumo de texto. La evidencia histórica detectó tanto errores
de los redactores como un error semántico que el propio revisor no detectó.

No aprobarlo como arquitectura permanente ni prometer coherencia universal. Para
retirarlo, comparar solicitudes/respuestas reales antes de revisión sobre varios
guiones, incluyendo cambios de lugar, negaciones, causas y final de intervalos.
Conservar siempre la validación local de IDs y la reanudación selectiva, que no
requieren otra llamada LLM. No se usa un interruptor nuevo para deshabilitarlo sin
esa evaluación.

Referencias vigentes: [ADR-0043](../adr/ADR-0043-correspondencia-temporal-de-prompts.md)
y la **rectificación final del 2026-09-28** de
[ADR-0044](../adr/ADR-0044-oferta-de-redactores-validada.md). Las decisiones antiguas
se conservan marcadas como superadas; ADR-0041 y ADR-0047 son históricas. ADR-0040
pertenece a la política de beta incorporada desde dev.

## Evidencia obtenida para esta entrega

- Format, lint, build con TypeScript, tipos del pipeline y paridad es/en/pt.
- 66 comprobaciones oficiales de catálogo, identidad y persistencia; 10 del guard
  de idioma de dev. Otras seis comprobaciones locales del writer con cliente
  simulado, sin llamadas pagadas; sus scripts quedan fuera del repo.
- 48 casos reales de render con FFmpeg empaquetado: ocho movimientos, 16:9/9:16,
  duraciones de 3/12/0,6 s; 6.240 cuadros sin inversiones inesperadas ni bordes
  negros. Comprobaciones de fundidos, clips IA, primer cuadro y caché antigua.
- App macOS Apple Silicon recompilada con firma ad-hoc y verificación codesign.
  Su sidecar reexportó una copia aislada de video-rural-4 en 17,8 s: 54,6 s,
  1.365 cuadros a 25 FPS, audio AAC y escenas idénticos. Los 71 archivos originales
  conservan sus hashes. Cero compras de imágenes, voz o video en esta validación.
- Los tres scripts oficiales de prompts modificados ya existían y estaban
  documentados en dev; no se añaden scripts personales, capturas ni binarios.

**Coste del fix de movimiento:** prueba sintética de 30 imágenes / 90 s:
9,09 → 54,19 s de render y 2,087 → 2,572 GB de memoria residente máxima. Evita
ampliación a 8K, pero requiere más CPU. Medición local, no compromiso de rendimiento.

No se ha operado la interfaz nativa en esta última verificación ni certificado
Windows/Intel, distribución notarizada o calidad audiovisual en todo guion. Las
muestras pagadas históricas están documentadas en sus fixes; las pruebas simuladas
no las sustituyen. El PR es para revisión, no una certificación de producción.

## Checklist de aceptación manual

- [ ] Reexportar video-rural-4: mirar escenas 17/18, escuchar narración y confirmar
      que no cambian cortes ni duración. Repetir un export 9:16 y exportar para editar.
- [ ] Crear un video menor a un minuto con animación inicial: cubre solo el audio
      disponible; el último clip termina junto con él.
- [ ] Crear uno mayor a un minuto: clips de 6 s al inicio, fuentes de 3 s por pareja
      y escenas posteriores con los segundos elegidos; revisar el cruce de 60 s.
- [ ] Animar y rehacer una escena sola y una pareja de 3+3 s: duración y cobertura
      correctas. Deshacer desde editor y galería recupera todas sus imágenes.
- [ ] Ampliar a todo el video después de animar el inicio: no regenerar ni volver
      a cobrar clips ya terminados; verificar estimación y saldo visible.
- [ ] Seleccionar/deseleccionar en galería, escribir descripciones distintas y
      enviar trabajos mientras otros siguen activos; cerrar y volver a abrir.
- [ ] Reproducir, pausar, buscar y cruzar clips animados: sin retrocesos ni saltos
      de narración. Probar el checkbox de fundidos entre imágenes.
- [ ] Recuperar un fallo de proveedor/saldo/cancelación: resultados terminados
      conservados, reintento explícito y sin compras duplicadas.
- [ ] Probar prompt faltante/duplicado y error de idioma: recuperar solo IDs
      pendientes; comprobar bloqueo/elección/reanudación y previews originales.
- [ ] Revisar precio/latencia del revisor temporal y rendimiento de render en las
      plataformas objetivo antes de aprobar el merge.

## Publicación y worktree

Los commits anteriores se conservan. Los pendientes finales se separan en
integración de dev, corrección de movimiento y esta guía de revisión. El PR apunta
a dev y queda abierto para el compañero. Conservar el worktree durante revisión
permite aplicar observaciones; no implica publicar ni firmar una release.
