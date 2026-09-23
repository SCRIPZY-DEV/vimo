# Fix: alcance visible de parejas y tarjetas uniformes en la galería

- **Fecha:** 2026-09-22
- **Rama:** `feat/animation-scenes-dev-20260922`

## Causa

El planificador ya agrupaba correctamente dos escenas consecutivas de tres
segundos en un clip de seis segundos cuando el formato y los intervalos lo
permitían. La galería no explicaba que animar la escena 5 podía incluir también
la escena 6 aunque esta última no estuviera seleccionada. Seleccionar 1, 2 y 5
producía los grupos 1 + 2 y 5 + 6, pero la ampliación visible durante la generación
parecía un error. El panel individual mostraba la fusión como texto poco destacado.

Las tarjetas usaban alineación al inicio de la fila y una descripción de hasta dos
líneas sin reservar su altura. Una descripción de una sola línea dejaba una tarjeta
más corta, y las tarjetas con controles o errores tenían dimensiones distintas.

## Corrección

- `galleryAnimationPlan.ts` expone las unidades que ya calculaba. No se vuelve a
  decidir cómo agrupar ni se suman planes individuales que podrían solaparse.
- `AnimationPairingNotice.tsx` presenta los grupos reales, su duración y las escenas
  adicionales a la selección. Si ambas escenas ya están seleccionadas, aclara que
  la pareja genera un solo clip.
- `EditorImageGallery.tsx` muestra la explicación general de 3 + 3 segundos cuando
  existen parejas compatibles en 16:9 y el detalle exacto de la selección antes de
  pulsar Animar. La selección individual y múltiple se expresa mediante guard
  clauses. Los planes destinados al aviso no se calculan con la galería cerrada.
- `SceneAnimationSection.tsx` reutiliza el mismo aviso para el plan individual,
  antes del saldo y el botón de animación.
- La cuadrícula conserva cinco columnas en escritorio y usa filas de igual altura.
  Las tarjetas se estiran y reservan dos líneas para la narración. Los inputs,
  mensajes y controles siguen pudiendo crecer sin recortarse.
- Los textos están disponibles en español, inglés y portugués. El mensaje final
  de redacción agotada indica que se conservaron imágenes y clips y permite
  reintentar; no atribuye automáticamente el fallo al guion del usuario.

## Límites deliberados

No se cambian el planificador, los tiempos, las solicitudes de generación, la
concurrencia, los prompts estáticos ni las descripciones pendientes guardadas.
Tampoco se modifica el modal existente para reintentar animaciones fallidas.

El aviso describe el plan actual: no promete fusionar escenas nuevas en shorts
9:16, una última escena sin pareja ni una escena cuya siguiente ya esté cubierta.
Un clip fusionado histórico puede conservar su grupo al rehacerse y el aviso debe
reflejar ese grupo real.

Para mantener todas las tarjetas con el mismo tamaño, abrir una descripción o
mostrar un error extenso aumenta también la altura de las demás tarjetas. Se
prioriza conservar todo el contenido y la uniformidad solicitada; puede requerir
más scroll mientras esos controles están desplegados.

La comprobación visual realizada fue en Chrome con componentes reales y mocks de
proveedores/jobs. No constituye aceptación de WebKit, Windows ni generaciones
remotas. Los scripts de comprobación temporal y sus imágenes no se incorporan al
repositorio.

## Validación reproducible

Comprobaciones de código desde esta rama:

```bash
pnpm exec tsc -b
pnpm check:locales
pnpm exec eslint src/modules/videos/components/AnimationPairingNotice.tsx src/modules/videos/components/EditorImageGallery.tsx src/modules/videos/components/EditorImageGalleryCard.tsx src/modules/videos/components/SceneAnimationSection.tsx src/modules/videos/utilities/galleryAnimationPlan.ts
```

La comprobación temporal del plan real cubrió estos casos:

| Entrada                                            | Resultado esperado                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------ |
| 14 escenas de 3 s en 16:9; selección 1, 2 y 5      | Dos unidades: 1 + 2 y 5 + 6; 12 s solicitados; adicional: escena 6 |
| Misma selección desordenada y con IDs repetidos    | Las mismas dos unidades, sin duplicados                            |
| Escenas de 3 s en 9:16; selección 1, 2 y 5         | Tres clips individuales; sin escena 6 añadida                      |
| Seleccionar únicamente la última escena de 3 s     | Clip individual, sin pareja inventada                              |
| Seleccionar la escena 5 con la escena 6 ya animada | La escena 5 se anima individualmente                               |
| Escenas de 4 s; selección 1, 2 y 5                 | Tres unidades individuales                                         |

Para repetir la aceptación en la app compilada:

1. Abrir un proyecto 16:9 con al menos seis escenas contiguas de tres segundos.
2. Abrir Vista ampliada y seleccionar 1, 2 y 5. Antes de generar deben aparecer
   «Escenas 1 y 2 · 6 s» y «Escenas 5 y 6 · 6 s», más el aviso de inclusión de la 6.
3. Desmarcar la 2: el primer grupo debe seguir siendo 1 + 2 y la 2 pasar a figurar
   entre las escenas adicionales. Volver a marcarla no debe duplicar la pareja.
4. Seleccionar una escena individual en el editor y comprobar el aviso del panel.
5. Repetir con un short, una última escena y una siguiente ya animada: el aviso
   debe coincidir con el plan disponible, sin prometer parejas nuevas imposibles.
6. Comparar tarjetas con narración corta y larga, incluida la última fila. Abrir
   varias descripciones y comprobar altura uniforme, scroll y botones accesibles.
7. Con una animación fallida, comprobar el mensaje completo y el botón existente
   para reintentar; no debe desaparecer la imagen ni el clip anterior.

## Pruebas manuales realizadas

En una fixture local con los componentes React, los estilos de Vimo y el
planificador reales, usando Chrome mediante `cua_repl`:

- Las 14 tarjetas se distribuyeron en cinco columnas y midieron 227,70 px de alto,
  incluida la última fila y una escena con narración de una sola línea.
- Al seleccionar 1, 2 y 5 se observaron las parejas 1 + 2 y 5 + 6 y el aviso
  explícito de la escena 6 antes de pulsar Animar clips.
- Al seleccionar también la segunda escena de una pareja, se observó el texto de
  generación única del grupo.
- Al desplegar las descripciones de 1, 2 y 5 hubo tres inputs, tarjetas de
  468,32 px de alto, sin overflow horizontal y con el pie de acciones visible.
- En 9:16, seleccionar una escena no mostró el aviso de pareja; las tarjetas
  mantuvieron igual altura y no presentaron overflow horizontal.
- Con un error largo en la escena 4, las 14 tarjetas midieron 319,70 px de alto;
  el mensaje completo quedó visible sin overflow de las tarjetas.

Los seis casos del planificador pasaron. También pasaron TypeScript, ESLint focal
y el guard de catálogos, con 1374 claves alineadas. La evidencia temporal está en
`/private/tmp/vimo-animation-dev-20260922/gallery-pairing/checks.json` y
`ui-evidence.json`; puede desaparecer con la limpieza del sistema.

No se efectuaron compras ni animaciones reales durante esta validación de UI. La
prueba final en el proyecto del usuario y la aplicación nativa queda pendiente de
aceptación, y se distingue expresamente de la fixture de Chrome.
