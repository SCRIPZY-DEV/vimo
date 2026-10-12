# Fix: botón único de pausa y reanudación Flow

- **Fecha:** 2026-09-20
- **Rama:** `feat/extension-vimo-automater`

## Causa

Extensión y el panel del pipeline renderizaban dos botones con condiciones
independientes. Al reanudar, el coordinador quitaba `manualPaused` antes de que
todos los workers confirmaran su estado. Ese snapshot cumplía simultáneamente
«puede reanudar alguna cuenta» y «no hay pausa global», por lo que aparecían
Reanudar y Pausar uno al lado del otro. Deshabilitarlos durante la mutación no
impedía el cambio de composición visual.

## Corrección

`FlowPauseButton` reúne la acción en un solo botón estable, compartido por
Extensión y el pipeline. Durante el comando y su espera de confirmación muestra
spinner y Pausando… o Reanudando… según la intención enviada, sin depender del
snapshot parcial. Mantiene el bloqueo si vence la espera visual pero el comando
nativo todavía no respondió. La dirección de ese comando sobrevive al remontaje
a través del estado compartido existente de Query.

Al terminar la espera vuelve a una sola acción según el estado observado. Si
alguna cuenta sigue pausada, Reanudar tiene prioridad; si no, aparece Pausar.
El ancho mínimo estable evita saltos al cambiar a una etiqueta de carga corta.
Las etiquetas nuevas existen en es/en/pt; `aria-busy` y el bloqueo reflejan la
operación pendiente. Los avisos existentes siguen informando falta de
confirmación o error, sin presentar una espera agotada como éxito.

## Límites deliberados

No cambia el protocolo de extensión, los comandos nativos, el timeout15s,
los guards contra doble envío, cuotas, pausas del proveedor, concurrencia o
cadencia. Un refresco de estado no es una mutación ni activa este spinner.
En un estado mixto se ofrece una acción (Reanudar); ya no se muestra Pausar
al lado de Reanudar. No se agrega un framework ni scripts de QA al repositorio.

## Validación reproducible

```sh
pnpm format
pnpm lint
pnpm build
pnpm check:locales
```

Reproducir con el componente real y snapshots controlados: iniciar Reanudar
con pausa global, recibir `manualPaused:false` conservando perfiles pausados,
confirmar cada perfil y finalizar. En todos los renders debe existir un solo
botón; durante la espera debe conservar Reanudando…, estar bloqueado y llevar
`aria-busy=true`. Repetir Pausar, timeout sin ACK, respuesta tardía, desmontar/
remontar y refresco sin mutación. Revisar ambos consumidores del componente.

## Pruebas manuales realizadas

- Formato, lint, build TypeScript/Vite y paridad de 1.434 claves es/en/pt
  aprobados. Compilación `pnpm tauri build --bundles app` y firma local del
  bundle verificada con `codesign --verify --deep --strict`.
- 82 comprobaciones temporales de Extensión y FlowRunControls completos con
  React/TanStack/i18n reales en SSR y APIs/reloj simulados: botón único, carga,
  snapshots parciales y graduales, confirmación, timeout, RPC sin ACK, respuesta
  tardía, refresco normal, estado mixto y remontaje tras retirar MutationCache.
  Son comprobaciones locales no versionadas, no un framework oficial ni DOM real.
- Se abrió el bundle final y se hizo un ciclo real Pausar → Reanudar con las
  cuentas vinculadas, sin lotes ni imágenes pendientes. El mismo botón de la
  interfaz cambió de Pausar a Reanudar y de vuelta a Pausar, sin duplicación en
  los estados observados. La respuesta fue rápida y las capturas de accesibilidad
  llegaron después de la confirmación; la fase intermedia de carga se verificó
  con los snapshots controlados del párrafo anterior.
- Las tres cuentas quedaron conectadas como al inicio, con consumo7/3/3 de500
  conservado, cero imágenes en curso y la comprobación previa de una cuenta
  intacta. No se generó, borró ni volvió a vincular ninguna cuenta.

La app compilada quedó abierta en Extensión. No se necesita un cambio del
worker ni del panel Chrome para esta corrección visual.
