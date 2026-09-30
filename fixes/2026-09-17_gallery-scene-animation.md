# Fix: animación individual desde la galería del editor

- **Fecha:** 2026-09-17
- **Rama:** feat/animation-scenes

> **Superado en la interacción de galería:** [revisión guiada del 2026-09-17](2026-09-17_guided-gallery-animation.md).
> Las tarjetas ahora tienen botones y llevan al panel del editor; ya no contienen
> el panel completo ni generan directamente. La auditoría de previews de este
> documento continúa vigente.

## Causa

La vista ampliada permitía revisar y regenerar imágenes, pero obligaba a salir al
panel del editor para animar una escena. No mostraba el presupuesto, duración,
saldo o estado de sus clips en el mismo lugar donde se comparan las imágenes.

## Corrección

Al seleccionar una tarjeta se muestra el mismo bloque azul `SceneAnimationSection`
que usa el panel derecho: estimación compacta, segundos a generar, intervalo en el
video si difiere, historial de clips, saldo Kie y refresco antes de la acción.
Se conserva **Animar clip**, **Rehacer clip** o **Reanudar** según el estado.

`EditorGallerySceneAnimation` adapta la escena al planificador de vista previa y
al store ya existentes. El saldo se comparte con el editor: abrir varias tarjetas
no multiplica las consultas de créditos. El botón solicita los IDs del plan de
esa tarjeta sin seleccionar otra escena del timeline, cambiar el cursor, cerrar
la galería o abrir un modal individual adicional.

Se aplican las mismas fusiones, duraciones, bloqueos de escenas ocupadas, trabajos
incompatibles, saldo, clave, demo y recuperación de tareas pagadas. La cola actual
permite animar otras escenas y publica estados/progreso en ambas superficies.
La selección múltiple conserva su revisión guiada de imágenes; no se convierte en
una solicitud masiva de animaciones.

El adaptador bloquea encargos nuevos cuando falta alguna imagen de referencia del
plan, incluida la segunda de una fusión. Recuperar una tarea ya pagada con cero
segundos nuevos no exige volver a tener la imagen original.

## Límites deliberados

No se añade «Animar el primer minuto» ni un selector de alcance dentro de la
galería. Esa acción sigue en el editor. No se modifica la redacción de guiones,
previews de estilo, prompts estáticos, sidecar, tarifas, planificador, selección
normal, tiempos, reproducción, transiciones ni exportación.

El bloque visual se reutiliza; no se copia su cálculo de créditos ni se introduce
otro carril de generación. La integración pendiente de previews que se describe
abajo es independiente de esta mejora y no queda reparada por ella.

## Auditoría solicitada sobre previews

La rama de animación no contiene `eb0f1f4` ni `1acf9a3`, que repararon las previews
en `feat/fix-bugs-vimo`. Los archivos de `generate-style-samples`, el hook de
muestras, su modal y el árbol de `scene-prompts` se conservaron desde la base común
`01384ae`; no fueron sobrescritos por los cambios de galería. El sidecar entregado
contiene esa implementación antigua, consistente con la rama.

Comparación local sin red: ante un 503 del modelo inicial, la versión actual
termina sin prompts; la rama corregida se recupera y produce cuatro. Ante 401,
la actual repite cuatro veces y devuelve un error genérico; la corregida detiene
tras el primer intento con el error de autenticación. Las 17 comprobaciones de
la corrección se ejecutaron sobre un snapshot de la otra rama, **no sobre esta
app**. No se presenta ese resultado como una reparación de la versión actual.

Por instrucción del usuario, no se integra ni reescribe ahora la lógica de previews.
Antes de producción queda pendiente recuperar esa corrección acotada y verificarla
en el artefacto que se vaya a distribuir. El informe con hashes, comandos y evidencia
vive en el vault: `Reportes/2026-09-17-gallery-animation/auditoria-previews.md`.
No se conoce la respuesta concreta del proveedor en el fallo real del usuario;
la reproducción demuestra la falta de recuperación, no atribuye aquel evento a 503.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

1. Abrir la galería y seleccionar una escena: comprobar datos y acciones frente
   al panel, saldo encima del botón y ausencia de controles de minutos.
2. Animar desde la tarjeta: la galería permanece abierta, el timeline conserva
   su selección y se ve preparación/espera/progreso en la tarjeta.
3. Seleccionar otra y animarla: debe usar su ID y permitir concurrencia conforme
   a la cola existente; un doble clic o un grupo ya ocupado no duplica encargos.
4. Probar short de 3 s, fusión horizontal de 3 + 3 y rehacer una fusión guardada.
   Estimación y contrato deben coincidir con el panel, incluido el costo histórico.
5. Cerrar y volver a abrir durante una generación: debe conservar el trabajo y
   reflejar su estado. Comprobar falta de clave, saldo, imagen y bloqueo demo.
6. Verificar que seleccionar varias imágenes, revisar con foco, regenerar y
   avanzar sigue funcionando. Comparar cinco columnas en ambos formatos y
   legibilidad sin desbordamientos en 1024 px y ventanas estrechas.

Las confirmaciones contra proveedores reales consumen sus créditos habituales.
Los scripts de verificación local y capturas se mantienen fuera del repositorio;
no se agregan como tests oficiales ni como archivos del PR.

Resultados locales: formato, lint y build aprobados; 1.312 claves alineadas en
es/en/pt. Pasaron 34 comprobaciones de animación en galería, 29 de la revisión
múltiple anterior y 143 de regresión de animación. Los servicios se simularon;
no se consumieron créditos ni se generaron videos remotos. Se inspeccionaron
capturas de estimación, recibos y adaptación de las tarjetas; se verificó ausencia
de desbordamiento horizontal a 1.440, 1.024 y 390 px.

El diff conserva intactos el pipeline, Rust, previews, selección temporal,
reproducción, store y planificador. La app local se recompila desde este worktree;
verificar un asset embebido y el SHA del sidecar permite identificarla, pero no
demuestra que los fixes ausentes de previews hayan sido integrados.

## Pruebas manuales realizadas

La aceptación con proveedores reales y una sesión manual en Tauri queda pendiente
del usuario. Las verificaciones automatizadas usan Chrome con componentes/store
reales y servicios simulados; las capturas se inspeccionan visualmente. Compilar
la app y comprobar sus assets no sustituye esa aceptación nativa ni la calidad
del video generado por Kie.
