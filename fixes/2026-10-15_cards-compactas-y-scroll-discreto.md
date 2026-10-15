# Fix: cards compactas y scroll discreto en modales

- **Fecha:** 2026-10-15
- **Rama:** `feat/flow-export-motion`

## Causa

La grilla de transiciones usaba columnas flexibles con `minmax(135px, 1fr)`: una sola card ocupaba todo el ancho disponible del panel estrecho. El límite de ampliación de 720 px tampoco correspondía al espacio necesario para cuatro cards compactas. Los contenedores desplazables conservaban barras nativas del sistema o la barra más ancha de Radix, con presentaciones distintas entre modales.

## Corrección

- Las cards de transiciones tienen 128 px de ancho, imagen con proporción 2:1 y título compacto; el efecto actual mide 93 px de alto. Ampliar el panel agrega columnas sin agrandar las cards.
- El ancho máximo del panel es 590 px: cuatro cards de 128 px, tres separaciones de 12 px, padding, bordes y espacio para scroll. Una quinta card pasa a otra fila. Se conserva el ancho inicial de 320 px y el redimensionamiento inmediato existente.
- Los diálogos, alertas, drawers y paneles del editor comparten una barra discreta con fondo transparente, adaptada a los temas claro y oscuro. En Chromium/WebKit, el indicador visible mide 4 px dentro de una zona de arrastre de 8 px.
- Los scrolls internos de los modales reciben el mismo estilo. El viewport nativo oculto de Radix se conserva para evitar barras duplicadas; su barra personalizada recibe el estilo mediante atributos dedicados. Las barras fuera de estos contenedores mantienen su presentación anterior.

## Límites deliberados

- El catálogo sigue teniendo una sola transición. Las cards adicionales usadas para comprobar cuatro columnas existen únicamente en la fixture temporal de validación.
- El mínimo de 280 px permite una columna; el ancho inicial de 320 px admite dos. El espacio disponible en la ventana puede limitar la ampliación antes de llegar al máximo.
- No se cambian la aplicación de transiciones, los SFX, el cierre de paneles, la reproducción ni la exportación. La validación de este ajuste se concentra en la presentación y el scroll.
- La app preparada es una compilación local de prueba, sin push, PR ni release.

## Validación reproducible

Desde el repositorio, con Node 22:

```sh
pnpm --config.verify-deps-before-run=false format
pnpm --config.verify-deps-before-run=false lint
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec tsc -p tsconfig.pipeline.json --noEmit
pnpm --config.verify-deps-before-run=false check:locales
git diff --check
```

Para reproducir la comprobación visual:

1. Abrir un proyecto en el editor y entrar en Transiciones. La card mantiene un ancho de 128 px al reducir o ampliar el panel.
2. Ampliar desde el tirador: el límite es 590 px cuando la ventana dispone de espacio suficiente. La grilla admite cuatro columnas de 128 px con separaciones de 12 px.
3. Desplazar el contenido de un panel del editor y de un diálogo con scroll, tanto claro como oscuro. La barra debe ser fina, sin pista rellena ni barra nativa duplicada dentro de un ScrollArea.
4. Cerrar y volver a abrir Transiciones. Debe seguir apareciendo únicamente el efecto disponible y conservarse el comportamiento de aplicación existente.

Resultado: format, lint, build, tipos del pipeline y locales correctos; 158 comprobaciones en Chrome y 158 en cada una de dos ventanas WKWebView (1040 y 1440 px). Compilación nativa de la app completada.

Los scripts y las capturas de QA son temporales y se conservan fuera del repositorio. La comprobación automatizada usa componentes y CSS reales con APIs aisladas: mide las cards, prueba el reparto de cinco elementos temporales, verifica scroll efectivo y compara las barras dentro y fuera de los modales. Los eventos de redimensionamiento se simulan mediante DOM; no equivalen a una prueba física del ratón.

## Pruebas manuales

La interacción se validó mediante automatización en Chrome y WKWebView; no se declara una sesión manual del usuario. Se inspeccionaron visualmente las capturas del panel normal claro, del panel ampliado claro con cuatro columnas de cards temporales, y del panel ampliado oscuro en WebKit. Se confirmó que las cards conservan su tamaño y que la vista previa sigue visible. Los resultados y las capturas quedan en el informe local de QA, fuera del repositorio.
