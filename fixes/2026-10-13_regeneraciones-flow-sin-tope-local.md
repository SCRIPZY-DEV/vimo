# Fix: regeneraciones Flow sin tope artificial en el editor

- **Fecha:** 2026-10-13
- **Rama:** `feat/flow-export-motion`

## Causa

El dispatcher comparaba todos los trabajos activos con un máximo local de cinco, aunque Multimagen permite varios envíos por cuenta y su coordinador ya administra esos cupos. Una selección de veinte escenas sólo admitía cinco jobs locales. Quitar el límite sólo para Flow sin cambiar la elección de candidato habría dejado otra espera: cinco jobs pagos activos y un sexto pago al frente de la cola impedirían llegar a los pedidos Flow posteriores.

## Corrección

`useLibraryEditorTask.ts` delega la concurrencia gratuita al coordinador y aplica `EDITOR_PAID_IMAGE_CONCURRENCY` exclusivamente a los jobs pagos. Puede despachar una solicitud Flow posterior a pagos sin cupo, retirando únicamente las entradas de ese pedido y conservando las otras en orden. La barrera de animaciones se mantiene: ningún pedido de imágenes adelanta una animación admitida antes. Los jobs de una escena, eventos y cancelaciones conservan su propietario exacto.

Esto reemplaza el máximo universal de cinco descrito en [el fix inicial](2026-10-13_editor-regeneracion-concurrente.md). Contratos, fallo y diagrama actualizados en [ADR-0055](../docs/adr/ADR-0055-regeneracion-concurrente-por-escena.md).

## Límites deliberados

No se eliminan cuotas reales ni se multiplican envíos de una misma intención. El coordinador y la extensión deciden cuándo cada cuenta puede ejecutar un trabajo. Los jobs pagos conservan cinco carriles locales; una selección paga puede contener varias escenas. Continúan los bloqueos por escena y la exclusión con render, exportación, animación, audio y pipeline completo. Esta corrección del editor no acredita por sí misma la recuperación de una cuenta pausada en el pipeline; ese diagnóstico se valida por separado.

## Validación reproducible

```sh
pnpm --config.verify-deps-before-run=false exec eslint src/modules/videos/hooks/useLibraryEditorTask.ts src/modules/videos/constants.ts
pnpm --config.verify-deps-before-run=false exec tsc -b --pretty false
node /Users/sebas/Documents/Vimo-Flow-QA/2026-10-13/editor-unlimited/vimo-editor-unlimited-store-check-20261013.mjs
```

El arnés temporal carga el store real y simula sólo la frontera API. Se conserva fuera de Git, sin convertirse en un test oficial del repositorio. Verifica **13 escenarios**:

- Veinte escenas Flow despachadas sin esperar el primer resultado y conservando UUID por escena.
- Veinte Flow junto a cinco jobs pagos; los pagos pendientes mantienen orden y ocupan el siguiente slot libre.
- Un pago se despacha aunque haya veinte Flow activos; los estados siguen el proveedor de cada pedido.
- Rechazo del mismo destino, aislamiento de eventos tardíos y conservación de las otras escenas al terminar una.
- Imágenes antes y después de animaciones; la saturación paga no permite saltar esa barrera.
- Cancelación de diecinueve handles tardíos y eliminación de pendientes de ambos carriles sin nuevos envíos al drenar.

## Pruebas manuales realizadas

No se realizaron generaciones reales ni clics en cuentas del usuario para esta corrección. Las comprobaciones son locales, sin Google, Fal o Evolink y sin consumo de créditos. La captura del usuario demuestra el problema del pipeline; no sustituye una comprobación real de esta entrega.
