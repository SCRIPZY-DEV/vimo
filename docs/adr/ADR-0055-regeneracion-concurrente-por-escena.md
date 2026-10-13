# ADR-0055 — Regeneración concurrente por escena

- **Estado:** Aceptada
- **Fecha:** 2026-10-13
- **Rama:** `feat/flow-export-motion`
- **Actualiza parcialmente:** [ADR-0014](ADR-0014-modulo-library-edicion-sobre-stages.md), exclusión de regeneración, y [ADR-0054](ADR-0054-recuperacion-multimagen-y-completado-pago.md), alcance de nuevas intenciones del editor.

## Contexto

El editor admitía clics de escenas distintas pero los procesaba en un solo job por proyecto. Una petición paga esperaba detrás de Flow. Además `pending` incluía el tiempo de guardar/redactar, por lo que «En cola» no distinguía preparación de espera. El usuario pide regenerar varias escenas con cualquier proveedor sin perder imágenes, recibos o borradores.

## Decisión

El store despacha hasta cinco trabajos locales de imágenes, con propiedad de IDs de escena y proveedor fijado al admitir el clic. Cada evento debe coincidir con solicitud y escena. Una escena ocupada rechaza otra petición, aunque cambie el proveedor. La selección múltiple permite imágenes existentes; cada petición Flow nueva es de una escena. El resto espera con estado de cola; un trabajo admitido muestra preparación hasta que el proveedor empieza.

```mermaid
flowchart LR
    editor["Vimo · Editor"]:::propio
    sidecar["Vimo · Sidecars de imágenes"]:::propio
    leases[("Leases locales y archivos del proyecto")]:::datos
    coordinator["Vimo · Coordinador Flow"]:::propio
    extension["Vimo · Extensión"]:::propio
    google(["Google Flow / Multimagen"]):::externo
    paid(["Evolink / Fal"]):::externo
    importer["Vimo · Importador de recibos"]:::propio
    editor -->|"solicita regeneración · invoke + stdin"| sidecar
    sidecar -->|"reserva escena y guarda checkpoint · filesystem"| leases
    sidecar -->|"envía u observa intención · HTTP loopback"| coordinator
    coordinator -.->|"asigna imagen · WebSocket"| extension
    extension -->|"genera imagen · SDK Flow"| google
    sidecar -->|"genera imagen autorizada · HTTPS"| paid
    coordinator -.->|"activa recuperación · callback local"| importer
    importer -->|"reserva escena y publica recibo · filesystem"| leases
    classDef externo fill:#f5f5f5,stroke:#9e9e9e,stroke-dasharray:4
    classDef propio fill:#e3f2fd,stroke:#1976d2
    classDef datos fill:#f3e5f5,stroke:#7b1fa2
```

### Contratos

- El lease compartido del proyecto tiene grupo `images`; no comparte con animación. Render, exportación, edición de tiempos, audio, borrado y pipeline completo conservan exclusión nativa. La reserva de escenas utiliza IDs ordenados para evitar dos trabajos del mismo destino.
- Se serializa la preparación global de biblia/protagonista; las generaciones posteriores trabajan en paralelo. La biblia usa primero el guion original. El mutex corto de `scenes.json` cubre toda la lectura, mezcla por IDs y publicación atómica. Metadata tiene su propio mutex, evitando locks reentrantes con animación y snapshots viejos de opciones.
- Descripción, calidad y personajes viajan en el payload de la regeneración y se guardan dentro de su reserva. Los borradores locales sobreviven al refetch causado por otra escena y no se transfieren entre proyectos.
- Las nuevas peticiones individuales Flow usan `scene:<id>:<raíz>`. El ámbito es estable: un replay recupera el mismo UUID durable sin reenviar. Crear y recibos previos mantienen `scenes:<raíz>`; no se migran ni se borran. Un histórico pendiente solapado conserva prioridad. Reanudar el pipeline global comprueba que no exista intención individual pendiente del mismo destino.
- El importador valida scope, raíz, escena, revisión y destino. Adquiere también el lease de proyecto/escena antes de verificar hash y publicar. Así una publicación paga no puede quedar entre la comprobación de hash y el rename de un recibo gratuito tardío. La barrera de completado pago sigue comparando el `batchId` exacto.
- El proveedor capturado de un pedido no cambia al mover el selector. «En cola» de Flow no contamina el estado de una petición paga. Cancelar conserva ownership hasta el evento terminal y cancela también handles recibidos después del clic.

### Fallo

Una escena ocupada se rechaza antes del envío; el importador la deja pendiente para la siguiente pasada. Un recibo de otro contenido o una imagen posterior no se sobrescribe. Una intención histórica incierta sigue recuperable: el cambio de scope no autoriza otro cargo. Las imágenes existentes se conservan ante error del proveedor o falta de clave. La cola no elimina límites ni latencia reales del proveedor.

### Por qué

Compartir únicamente lectura/operaciones remotas de escenas disjuntas elimina la espera de un proveedor detrás de otro sin introducir varios escritores de un mismo archivo. Mantener ámbitos históricos evita que una actualización se interprete como una autorización nueva.

## Validación

Fuente nativa y protocolo del artefacto se ejercitan por separado: 6 escenarios del store, 3 de borradores, 12 de comandos nativos/importador y 23 regresiones existentes de personajes. El SEA se prueba con dos procesos Flow en paralelo, tercero pago sin clave, exclusión de destinos, FFmpeg empaquetado, replay sin nuevo envío y conservación de metadata. Éxito pago con GPT Image 2 se valida en fuente con HTTP simulado; el artefacto no llama a proveedores pagos reales. Evidencia fuera de Git: `Documents/Vimo-Flow-QA/2026-10-13/editor-generation/`.
