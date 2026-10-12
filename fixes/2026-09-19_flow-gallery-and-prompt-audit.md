# Fix: auditoría de prompts, galería y compatibilidad de Flow

> **Actualización tras prueba real del 2026-09-19:** la consigna de escenificación no resolvió el problema. Diez prompts nuevos mantuvieron el estudio; Flow produjo siete imágenes y rechazó tres. La integridad del transporte sí se verificó. Ver [resultado de diez escenas](../docs/handoff/2026-09-19-flow-audit/live-ten-scenes.md).

- **Fecha:** 2026-09-19
- **Rama:** `feat/extension-vimo-automater`

## Causa

La auditoría de `video-3-2` encontró 15 solicitudes e imágenes distintas: 14 iniciales y una regeneración de escena 3. Sus prompts, IDs, semillas, hashes y destinos se corresponden sin duplicación de transporte. Los 14 prompts originales sí repiten el mismo estudio; la consigna del estilo «durante la misma escena» terminó aplicada a todo el lote, aunque el relato cambia de lugar. Ver [auditoría y límites de evidencia](../docs/handoff/2026-09-19-flow-audit/prompts-audit.md).

La sección de recuperación ocultaba resultados listos y mostraba IDs técnicos como títulos. No había lectura de miniaturas desde la UI. Por separado, el paquete verificado de extensión 0.2.11 declara presupuesto local 500 mientras el coordinador incorporado solo aceptaba 400, lo que bloqueaba capacidad aun con vínculo autenticado.

La lista de nuevas cuentas depende de anuncios del worker. La extensión actual no anuncia perfiles sin preparación completa, y un vínculo antiguo reintenta autenticación en vez de ofrecer una transición segura. Esto es un límite comprobado del código, no una atribución única a los perfiles reales sin inspeccionarlos.

## Corrección

- Consigna de escenificación en Fase 2 de Mi estilo: distingue planos de un lote y continuidad de una escena, conserva la gema y las localizaciones globales explícitas. No añade llamadas al modelo ni reescribe prompts guardados.
- Galería de todos los estados con ocho trabajos por página, miniatura, ampliación y prompt enviado. La lectura solo comienza al abrir el lote. Conserva recuperación, confirmaciones y elegibilidad de cada acción.
- Lotes ordenados por fecha y titulados con nombre del directorio del proyecto, tipo y fecha. Los IDs quedan en detalles. La escena se obtiene del recibo original; una regeneración de escena 3 no se presenta como escena 1.
- `gallery.list` consulta archivos de intención archivados y validados, sin devolver rutas privadas. `preview.read` solo devuelve un resultado local verificado por hash, con máximo 12 MiB y MIME admitido. No descarga ni genera imágenes.
- Compatibilidad explícita con políticas válidas 400/500: se conserva el presupuesto de cada worker, el consumo y las reservas. No se reinician contadores.
- Ayuda visible para discovery, pausa y limpieza. El token automático continúa entre procesos y extensión; no se expone en React, URL, portapapeles o logs.

## Límites deliberados

Las imágenes existentes no se regeneran. El armado de la nueva consigna se comprobó con escritor real y cliente simulado; no se afirma una mejora visual medida con una generación nueva. El nombre del directorio evita abrir rutas arbitrarias para leer proyectos; estilos/personajes sin título archivado usan tipo y fecha.

Para descubrir perfiles que aún no se anuncian y cambiar de coordinador sin perder trabajo, la otra sesión debe implementar el [prompt de extensión](../docs/handoff/2026-09-19-flow-audit/prompt-extension.md). Vimo no puede enumerar perfiles ausentes del protocolo. No se modificó ese repositorio ni se llama `connection.test`, que sí generaría una imagen.

Pausar detiene nuevos envíos de todos los lotes; lo ya enviado puede terminar. Eliminar limpia resultados locales y compacta recibos elegibles del lote, conservando proyectos, imágenes importadas y originales de Google. No devuelve presupuesto ni elimina blobs compartidos de referencias.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
pnpm exec tsc -p tsconfig.pipeline.json --noEmit
```

Comprobaciones temporales fuera del repositorio: 15 correspondencias históricas y 15 cuerpos RPC puros; 10 controles del escritor; 29 controles de galería/lectura privada incluyendo archivos alterados, symlinks, rutas Windows, recibos corruptos, límites y privacidad; 26 controles de presupuesto y 40 de servicio con workers simulados 400/500/500, autenticación y envío idempotente. Galería: 15 comprobaciones de componentes y handlers con 200 trabajos, recuperación y confirmación.

Se repitieron satisfactoriamente los 29 controles de galería y los 40 de servicio contra el SEA extraído de `src-tauri/target/release/bundle/macos/Vimo.app`, compilada el 2026-09-19. Los datos usaron directorios temporales y puerto efímero. `pnpm format`, `pnpm lint`, `pnpm build`, TypeScript del pipeline y paridad de 1386 claves pasaron. El empaquetado macOS arm64 terminó y `codesign --verify --deep --strict` validó la app completa con firma ad-hoc local. No se creó DMG ni se publicó.

## Pruebas manuales

En Chrome, fixture local con los componentes reales, CSS del proyecto y APIs simuladas: abrir lote, ver miniatura, ampliar, desplegar prompt, comprobar escena original 3, cambiar página de 200 trabajos (ocho por página), mostrar estados activos/fallidos, reintentar lectura local y error de metadatos sin perder controles. El registro solo mostró `gallery.list` y `preview.read` durante navegación/reintento de lectura.

Se inspeccionaron dos imágenes reales del proyecto para comparar la escenificación. No se cambiaron datos, vínculos o trabajos del usuario; no se hizo generación en Google. El navegador de prueba no sustituye aceptación manual del paquete nativo con perfiles reales.
