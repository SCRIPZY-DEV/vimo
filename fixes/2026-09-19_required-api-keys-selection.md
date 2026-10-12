# Fix: claves exigidas por los proveedores seleccionados

- **Fecha:** 2026-09-19
- **Rama:** `feat/extension-vimo-automater`

## Causa

Crear calculaba las dependencias del formulario, pero entregaba la lista completa a `MissingApiKeysNotice`, que presenta literalmente lo que recibe. Al faltar Fal se enumeraban también claves ya configuradas y alternativas de voz. Además, antes de elegir voz, se aceptaba cualquiera de Dubvoice/ElevenLabs sin atender a la preferencia efectiva del selector.

Un fallo de lectura del keychain se confundía con una colección vacía. El antiguo bloqueo basado en `missingKeys` tampoco distinguía ese error de una verificación satisfactoria. Reintentar una primera lectura fallida sin datos volvía a `isLoading` y podía desmontar Crear, perdiendo el borrador.

## Corrección

- El aviso recibe exclusivamente `missingRequirements` comprobados. Fal/Evolink se exigen solo como motor seleccionado; Flow no exige una clave de imágenes. Música AI conserva Evolink cuando realmente se selecciona.
- Con TTS se exige el proveedor de la voz seleccionada; antes de elegir voz se usa la preferencia efectiva del selector. Subir audio no exige un proveedor TTS. DeepInfra y Deepgram siguen siendo dependencias reales del pipeline.
- Lectura pendiente o fallida bloquea generación sin afirmar que falten claves. Crear muestra error y reintento; el formulario permanece después de la primera respuesta, incluso si esa respuesta fue un error.
- Los consumidores existentes de `useRequiredApiKeys` en Música, Voces y Personajes usan `ready` para no generar durante un error de lectura. Formularios, Cancelar y la excepción existente de catálogo Flow se conservan.
- No se añadieron redirecciones ni se modificaron rutas o el almacenamiento de claves. Los tres idiomas mantienen paridad.

## Límites deliberados

No cambia qué APIs consume el pipeline, ni verifica credenciales haciendo llamadas pagas. Las comprobaciones usan estados enmascarados del keychain. No cambia la precedencia existente del selector de voz ante una preferencia sin clave disponible.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

Comprobaciones locales temporales de requisitos, renderizado de Crear y consumidores, con módulos reales y fronteras simuladas: Fal ausente, Evolink disponible, Flow sin claves de imágenes, ElevenLabs efectivo ausente, voz explícita, audio subido, música AI, lecturas pendientes y fallidas. Verificar que solo el requisito realmente ausente aparece, que enviar no llama al generador y que no hay navegación automática. El caso de reintento usa TanStack Query real sin datos previos y comprueba que el borrador permanece.

Resultados: 21 controles de requisitos/hooks, seis renders de Crear, 30 controles de consumidores y 13 comprobaciones con React/TanStack/Create montados. Todos pasaron, sin APIs reales. `pnpm format`, `pnpm lint`, `pnpm build` y paridad de 1386 claves también pasaron. La app macOS arm64 quedó compilada con firma ad-hoc local completa verificada. Los scripts temporales no forman parte del repositorio.

## Pruebas manuales

En Chrome se ejecutó y leyó por CUA la fixture con React, TanStack Query y Crear reales: error inicial sin caché, edición de nombre/guion/motor, reintento pendiente, nuevo error y éxito conservaron valores y un solo montaje. El primer éxito siguió preseleccionando Evolink configurado. No se generaron videos con credenciales ni se provocó un fallo real del keychain del usuario; los fallos se inyectaron en la frontera de consulta.
