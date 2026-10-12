# Fix: integración Flow con catálogo, creador y animaciones de Vimo

- **Fecha:** 2026-10-06
- **Rama:** `feat/flow-dev-compat-20261006`
- **Bases:** `origin/dev` en `2950ebb35f3121d616618e3f0846b2814306a262` (0.9.2) y Flow en `8257e334927ea199c61947c7fdac2e96d1062717` (0.8.5).

## Causa

Flow estaba en una rama anterior al catálogo por secciones, al creador de estilos y al editor con cola de imágenes/animaciones. Copiar sus archivos completos sobre dev perdería esos comportamientos. El feedback de pausa además volvía a comparar una solicitud confirmada contra conexiones posteriores; desvincular una de ellas convertía un resultado completado en pendiente. Las tarjetas desconectadas mostraban readiness e identidad actuales retenidos del último snapshot.

Los snapshots tardíos del worker podían sobrescribir el resultado/estado de descarga local. El informe específico del guard del vendor documenta la reproducción y el port selectivo.

## Corrección

- Integración en copia propia aislada nacida del dev comprobado; las ramas originales y protegidas permanecen sin cambios.
- Confirmación de pausa/reanudación retenida por requestId, sin confundir el ACK del coordinador con confirmación de workers. Un target que desaparece antes de confirmar sigue pendiente; después de confirmar no revive la operación anterior.
- Cuentas desconectadas muestran disponibilidad desconectada e identidad histórica, sin inventar capacidad.
- Editor conserva cola de trabajos, bloqueos de imágenes animadas, fuentes visuales, cancelación y eventos identificados de dev. Flow se incorpora a esas estructuras existentes.
- Muestras de Mi estilo y borradores de catálogo conservan secciones, modelo de redacción, persistencia y subida versionada. Flow añade disponibilidad y recuperación sobre el mismo recorrido.
- Claves de voz/imágenes/animación se exigen según selección; el motor Flow no requiere API key pagada de imagen.
- El retrato identifica su gema por contenido (systemPrompt/secciones/planos); publicar muestras o actualizar mtime no invalida una generación ya correcta.
- El número de ADR de Flow pasa a 0052: 0038 ya corresponde a diagnósticos en dev.

## Límites deliberados

No se publican cambios ni se abre/reinicia una app real. No se usa el puerto43127, datos del usuario, perfiles reales ni Google. Los cinco peers del arnés son sintéticos: no acreditan generación real ni cinco logins reales. Las pruebas del navegador usan el componente y hooks reales, pero reemplazan la frontera invoke; Cargo verifica la integración nativa por separado.

El nuevo clonador IA conserva sus motores pagados actuales; no se ofrece Flow en ese comando hasta que exista un carril compatible. Las muestras guardadas de Mi estilo/catálogo sí incorporan Flow. No se cambian presupuesto, cadencia ni concurrencia de la extensión. La rama conserva el límite reportado por cada worker, sin inflar cuota visual.

## Validación reproducible

- `pnpm format` → `pnpm lint` → `pnpm build`: aprobados. El build web de QA usa URL y clave pública ficticias mediante variables del proceso; no es un paquete distribuible con configuración productiva.
- `pnpm check:locales`: 2030 claves alineadas en es/en/pt.
- `pnpm exec tsc --noEmit -p tsconfig.pipeline.json`: aprobado. `pnpm build:sidecar` con Node oficial 22.23.2: aprobado.
- `cargo check --manifest-path src-tauri/Cargo.toml --lib`: aprobado. `cargo test --manifest-path src-tauri/Cargo.toml --lib`: 51/51. Target y binaries de dependencias propios de la copia aislada; no se ejecutó la app.
- Guards existentes de gemas, catálogo y clonador (`node --test scripts/test/check-gem-*.mjs scripts/test/check-catalog-*.mjs scripts/test/check-style-clone-*.mjs scripts/test/check-app-style-clone*.mjs`): 613/613. El archivo del redactor `pipeline/prompts/verbatim-messages.ts` queda byte-idéntico a dev; se descarta la adenda de escenificación de la rama anterior que alteraba las huellas.
- Guards existentes de animación/editor/escenas silenciosas: 35/37. Los dos fallos se reprodujeron iguales en un archivo limpio de `2950ebb35f` con dependencias propias: `check-editor-character-ui.mjs` («panel cargado») y `check-silent-scene-images.mjs` (espera 1 llamada al redactor, recibe 9). No se modificaron expectativas para ocultarlos.
- Fixtures temporales fuera del repo: store de editor 22/22; confirmación de pausa 11/11; pipeline/Timeline/referencias 24/24; snapshots 14/14; enlace seguro 14/14. Cinco workers sintéticos; origen, TTL, socket, cuenta, replay, preservación de credenciales y cero generación durante vinculación.
- Regresión UI integrada contra SEA: 50/50 comprobaciones; 116 comandos en las corridas iniciales y 117 en la corrida final (incluye polling). Repetida después de integrar fuentes y formatear: sin fallos ni errores runtime. Sin salida de red salvo loopback del arnés.

## Pruebas manuales realizadas

No hubo prueba manual en la aplicación ni cambios sobre perfiles reales. QA automatizada de botones en Chromium for Testing aislado contra SEA compilado: 50 comprobaciones, 117 comandos en la corrida final, cinco workers sintéticos y cero errores runtime. Incluye vincular, refrescar, pausar/reanudar, recuperación, borrados confirmados, desvincular, desconectar y navegación de galería. Confirmación de Reanudar no revive al desvincular/desconectar; la tarjeta desconectada informa su estado real. El store del editor, el orden de trabajos imagen/clip, los recibos y los estados de Timeline se validaron con los fixtures indicados. No se afirma prueba de generación Google real.
