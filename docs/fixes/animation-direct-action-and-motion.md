# Animación directa desde el panel y acción del sujeto principal

Fecha: 2026-09-16. Corrección autorizada del botón individual y del redactor de animación.

## Problemas verificados

El botón del panel abría una segunda ventana antes de ejecutar la animación. El saldo de Kie y su actualización estaban dentro de esa ventana, aunque la estimación ya se mostraba fuera. Se elimina esa duplicación: saldo, estimación compacta a 18 px, segundos solicitados, segundos finales cuando difieren y recibo anterior se muestran en el panel derecho antes de la acción. «Animar clip», «Rehacer clip» y «Reanudar» usan la solicitud y el store existentes. El primer clic activa spinner y progreso; la exclusión existente evita repetir la solicitud por doble clic. Se mantienen las guardas de saldo, clave, proyecto ocupado y demo.

La inspección de un prompt guardado de una aspiradora confirmó instrucciones de mover apenas la manguera y detenerla, mientras burbujas y otros detalles recibían más movimiento. El redactor pedía «restrained opening micro-motion» y después reposo para cualquier tramo usado menor al encargo, incluidos cortes históricos cercanos a 2,98 s. También añadía al prompt final todos los nombres de personajes del proyecto, aunque no estuvieran en esa escena. No se ha atribuido la desaparición visual de personajes a una causa única ni se certifica que un prompt pueda impedirla en todos los modelos.

## Redacción vigente

- El guion completo aporta significado; el fragmento narrado y el prompt estático determinan qué ocurre en la escena. El contexto vecino no adelanta sucesos futuros.
- Cada segmento exige sujeto principal, acción observable, cámara, movimiento secundario opcional y continuidad. Solo cámara o ambiente ya no bastan como respuesta estructurada.
- La acción empieza en los primeros fotogramas y su gesto esencial cabe en la ventana utilizada. No se cambia la velocidad, la normalización ni la duración de ninguna escena vecina.
- La cámara mantiene al sujeto y al reparto encuadrados. Los rasgos, ropa, objetos y distribución se preservan mientras el movimiento continúa. Las letras existentes se conservan y no se añaden rótulos.
- `charactersPresent` acota el reparto: `[]` indica ningún personaje del proyecto y un valor ausente deja la inferencia al prompt estático. Las fichas de identidad no obligan a insertar personajes en todos los planos. También se protege la continuidad de personas anónimas que el prompt describe.
- El presupuesto sigue en 4.000 caracteres. Una salida incompleta se reintenta con el tier premium y después falla explícitamente antes de comprar video; no se trunca ni se fabrica un prompt genérico.

**Revisión autorizada 2026-09-16:** la elección Qwen inicial → DeepSeek de reparación queda sustituida por **DeepSeek-V3.2** desde el primer intento y en su reparación, mediante el tier premium. Los modelos globales y su recuperación por timeout siguen vigentes; la [comparación real de redactores](animation-writer-benchmark.md) distingue esta elección explícita de la recomendación Mistral por calidad/precio en la muestra. El generador de video sigue siendo **Grok Imagine Video 1.5 Preview por Kie**, con el respaldo Seedance ya establecido. El redactor no recibe imágenes ni usa visión.

## Alcance de la corrección

Código de producto modificado: solamente `SceneAnimationSection.tsx` y `pipeline/animation/prompt.ts`. El formato JSON del redactor es interno: no cambia el contrato app/sidecar, los comandos, fases ni transporte. La ventana para animar el inicio sigue siendo arrastrable y conserva X, Escape y cierre exterior.

Permanecen protegidos: selección de escenas 4/5, reproducción, tiempos, normalización FFmpeg, transiciones y Ken Burns, exportación, proveedor, tarifas, cortes, imágenes estáticas y recibos pagados. Reanudar un trabajo pagado conserva su prompt y tarea; la redacción mejorada se aplica a nuevas generaciones o a «Rehacer clip» explícito. No se modificaron los archivos de proyectos reales revisados.

## Comprobaciones reproducibles

Las comprobaciones y hashes de esta sección corresponden al cambio de interfaz y movimiento `cd63da1`. El redactor y el artefacto local posteriores se documentan en [la comparación real](animation-writer-benchmark.md).

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc --noEmit -p tsconfig.pipeline.json
node scripts/check-animation-provider.mjs
node scripts/check-animation-service.mjs
node scripts/check-animation-frontend.mjs
```

El recorrido visual usa componentes, hooks y store reales con servicios simulados. Comprueba saldo encima del botón, refresco sin compra, acción directa, doble clic, progreso, recibos, recuperación y las regresiones previas del editor. El servicio y proveedor usan HTTP simulado y FFmpeg real: rechazo del prompt incompleto antes del POST, campos de acción transmitidos al proveedor, reanudación y conservación de clips pagados.

Estas comprobaciones validan contratos, controles y archivos, **no la calidad semántica de un modelo remoto**. No se consumieron generaciones de video reales durante esta corrección. La aceptación visual requiere revisar una nueva animación de objeto, otra con personaje principal y otra con varias personas: acción perceptible desde el inicio, reparto estable, encuadre conservado y correspondencia con la narración.

## Errores a evitar

1. Duplicar el flujo individual en un diálogo cuando el usuario autorizó la acción directa.
2. Mostrar la estimación sin el saldo disponible antes de la compra.
3. Pedir solo restricciones de identidad sin describir una acción positiva del sujeto.
4. Aplicar micromovimiento y reposo a todo clip corto, ocultando su acción principal.
5. Insertar todos los personajes del proyecto sin respetar la escena.
6. Dar por garantizada la calidad de video con un doble de LLM que ya entrega la respuesta ideal.
7. Aprovechar una corrección de UI o prompt para modificar selección, reloj o clips ya pagados.

Referencia: el generador anima la imagen según las instrucciones textuales, tal como describe la [documentación oficial de image-to-video de xAI](https://docs.x.ai/developers/model-capabilities/video/image-to-video). Esto orienta la redacción; no es una garantía de continuidad perfecta.

## Evidencia de esta revisión

- Formato, lint, build, tipos del pipeline y 1.280 claves es/en/pt: aprobados.
- Chrome: 136 comprobaciones, incluidas interacción directa y controles flotantes de alcance.
- WebKit: 126 comprobaciones de página y captura del panel con saldo, duraciones e historial.
- Proveedor: 38 comprobaciones; servicio: 15. HTTP simulado y FFmpeg real.
- Aplicación macOS ARM compilada localmente; 28 comprobaciones NDJSON/render/export sobre su propio SEA y FFmpeg.
- El SEA empaquetado contiene la nueva instrucción de acción desde el inicio y ya no contiene la orden anterior de micromovimiento. Coincide con el sidecar recién construido.

SHA-256 del SEA: `41413907b1569a8eed7a67a56b1aed79f2fc55dc3ee9a4f1b79fdb6031933279`.
SHA-256 del ejecutable de la app: `aa276f4c4ce7ebac68f59a20ce1c5c93c257cd590ee3df12dd7158ef705958d3`.

Para recompilar desde la rama de trabajo:

```sh
cd "/Users/sebas/Documents/VIMO-TAURI/.claude/worktrees/feat+vimo-character-modal-improvements"
PATH="/Users/sebas/node-v22.23.2-darwin-arm64/bin:$PATH" pnpm tauri build --bundles app
```

Cerrar la instancia anterior de Vimo y abrir esta compilación:

```sh
open src-tauri/target/release/bundle/macos/Vimo.app
```

Se compiló para uso local, sin distribución ni notarización. El reporte visual vive en el vault, en `Proyectos/VIMO-TAURI/Reportes/2026-09-16-direct-animation-motion/animation-implementation.pdf`.
