# Fix: preparación de Multimagen clara en Extensión

- **Fecha:** 2026-10-11.
- **Rama:** `fix/flow-qa-recovery-permit-20261010`.
- **Base:** `4a03bdd4afc52f14c2991feb57fa487c4f94857f`, QA canónica.

> **Seguimiento 2026-10-11:** el contador y la guía de esta primera corrección quedan sustituidos por [cuentas preparadas y guía de cuatro pasos](2026-10-11_extension-contador-preparadas-y-guia.md). La aceptación manual descrita aquí corresponde a la presentación anterior.

## Causa

Extensión mostraba disponibilidad general del coordinador como si acreditara Multimagen. Las tarjetas grandes repetían información y exponían acciones secundarias sin indicar el siguiente paso. Además, el resumen general consideraba los intentos históricos `unknown` como trabajo en curso: con 318 cancelados, 10 fallidos, 2 resultados listos y 3 sin confirmar aparecía actividad nueva inexistente.

## Corrección

La vista consulta capacidad con `requestedCount:1` y el `FLOW_TOOLS_EXECUTION_PLAN` existente. Separa cuentas vinculadas de disponibles para Multimagen y conserva el mínimo informado, nunca menor que cinco. Un error de estado/capacidad retira la confirmación de disponibilidad; un error al buscar otras cuentas se muestra dentro de descubrimiento sin invalidar la capacidad comprobada de las cuentas vinculadas.

Una acción principal permite consultar estado, mostrar cuentas para vincular, abrir la guía o revisar una pausa, o ir a Crear. Abrir la página, la guía o el descubrimiento no prepara, reserva, genera ni reanuda. Cada cuenta muestra estado y un siguiente paso breve; proyecto, uso y desvinculación quedan en detalles. La guía tiene tres pasos. Preparación de configuración y generación comprobada se distinguen.

El envoltorio local diferencia los `unknown` históricos de trabajos nuevos; mantiene su contador y una única instancia del panel de recuperación, con sus recibos y confirmaciones intactos. Los controles de generación existentes permanecen accesibles al revisar trabajo actual o una pausa. Un estado futuro desconocido se conserva como trabajo posible.

## Límites deliberados

- No cambia modelo, applet, plan, semilla, motor, cuotas, mínimo de cuentas, reservas, permisos, pausas o trabajos.
- Consultar disponibilidad de una imagen no promete capacidad para cualquier video: Crear verifica el número real de escenas.
- No hay API nativa para abrir un perfil exacto, preparar Tools o instalar la extensión. No se inventa una ni se añade un enlace a un paquete anterior. La entrega de la extensión 0.2.27 se gestiona por separado.
- No modifica navegación, montaje único, Rust, configuración QA, SEA ni wrapper. No copia el backend o los efectos automáticos de FlowMax.
- Un resultado sin confirmar no se transforma en fallo ni se reintenta; la causa histórica de esos resultados no queda resuelta por este cambio.

## Validación reproducible

En copia aislada de la base, con dependencias enlazadas individualmente y directorios de caché propios:

```sh
node node_modules/prettier/bin/prettier.cjs --check src/modules/extension public/locales/es.json public/locales/en.json public/locales/pt.json
node scripts/test/check-locales.mjs
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc -b
node node_modules/vite/bin/vite.js build
```

Arnés temporal no oficial, fuera del commit: `/private/tmp/vimo-flowmax-ux-20261011/check-ux.mjs`; ejecutar con `node` y la ruta de la copia como primer argumento. Comprueba estados y acciones de la vista real con hooks simulados, incluido el conjunto histórico de 333 trabajos, errores con caché previa, capacidad específica de Tools, pausa, reserva ocupada y ausencia de mutaciones al montar o abrir la guía. No prueba Google ni el render nativo. Resultados y hashes van en el manifiesto de entrega temporal.

## Pruebas manuales realizadas

El 2026-10-11 Root aplicó los diez archivos por preimagen/hash y abrió la QA canónica con el lanzador original. CUA confirmó Crear y la navegación a Extensión, cinco cuentas vinculadas y una disponible para Multimagen, filas compactas, siguiente acción y guía de tres pasos. El historial muestra tres resultados sin confirmar. La apertura de la guía no generó ni reanudó. El HMR inicial conservó traducciones anteriores; reiniciar la ventana cargó los catálogos nuevos. La revisión detectó una concordancia singular/plural en dos textos y se corrigió en los tres idiomas. Después del reinicio, los 333 trabajos conservaron sus hashes exactos y los cuatro binarios nativos conservaron sus SHA256. La actualización de la extensión0.2.27 en los perfiles y una generación nueva con Google siguen pendientes; esta aceptación es de interfaz y preservación, no del proveedor.
