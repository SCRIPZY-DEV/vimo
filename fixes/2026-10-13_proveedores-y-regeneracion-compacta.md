# Fix: proveedores y regeneración compacta

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

Los formularios repetían la configuración de Multimagen, el refresco de conexión y los detalles de cuentas. Ese contenido ocupaba el panel de edición y truncaba el proveedor. La galería ampliada heredaba el proveedor del panel sin permitir elegirlo al regenerar; además, un proveedor no preparado podía deshabilitar la entrada antes de poder cambiarlo. El bloqueo global del editor impedía ajustar una escena libre mientras otra generaba.

## Corrección

- Crear, muestras de estilo/catálogo, personajes y editor muestran proveedor y badge compacto para Vimo gratis. El badge comprueba preparación real de Multimagen; cinco perfiles conectados sin preparación no se presentan como listos. La capacidad se sigue verificando antes del envío.
- Se conservan los detalles de conexión en su ruta de gestión y el desplegable del pipeline. Se retiran de los formularios los bloques grandes de Multimagen/cuentas.
- Los nombres son **Evolink (pago)**, **Fal (pago)** y **Vimo (gratis)**, con traducciones ES/EN/PT.
- La galería ofrece selector al editar una tarjeta y al seleccionar varias. El proveedor se captura explícitamente con cada solicitud. Un proveedor no disponible no impide abrir el formulario y elegir otro; sí impide enviarlo sin validar.
- El panel permite seleccionar varias escenas ya generadas, conservando el bloqueo de escenas ocupadas. Proveedor y personajes de una escena libre pueden ajustarse mientras otra genera; las operaciones incompatibles siguen bloqueadas.
- Las tarjetas distinguen preparación, cola y generación. La reserva/concurrencia nativa se documenta en el fix de regeneración paralela de esta fecha.

## Límites deliberados

- No modifica precios ni modelos de proveedores pagos. No inicia generaciones pagas ni gratuitas durante las comprobaciones visuales aisladas.
- La conexión sigue sujeta a preparación y disponibilidad de cuentas. Un badge no evita cuotas o rechazos del proveedor.
- La selección de proveedor de la galería sólo afecta la próxima solicitud; no vuelve a enviar trabajos existentes al cambiar el selector.

## Validación reproducible

1. Abrir un video y seleccionar una escena. Elegir Vimo (gratis): comprobar nombre completo, un badge pequeño y ausencia de controles de Multimagen/cuentas en el formulario.
2. Abrir Vista ampliada, seleccionar una tarjeta y Regenerar: elegir cualquiera de los tres proveedores. Repetir con selección múltiple. Con la extensión desconectada debe ser posible cambiar a un proveedor pago configurado; la opción gratuita no debe enviarse sin conexión preparada.
3. Lanzar una regeneración y seleccionar otra escena libre: comprobar que proveedor y personajes siguen editables. Los trabajos conservan el proveedor con el que se enviaron.
4. Revisar Crear, muestras de Mi estilo, catálogo y personajes: mismos nombres y badge compacto. Sin claves pagas, la ayuda de muestras no debe exigir Evolink/Fal para usar Vimo gratis.
5. Ejecutar formato, lint, build, typecheck del pipeline y `node scripts/test/check-locales.mjs`. La compilación nativa integra el mismo frontend y sidecar.

## Pruebas manuales

Se revisaron las capturas de componentes reales en Chrome aislado, incluido el panel de editor a 300 px: proveedor legible, badge pequeño y controles retirados. Pasaron cinco controles de formularios compactos y cuatro de galería con su hook real: proveedor pago explícito, selección múltiple y plan Multimagen. Los proveedores y datos del fixture fueron simulados; no se realizaron llamadas de generación pagas ni gratuitas.

Pasaron formato, lint completo, compilación frontend, typecheck del pipeline y paridad de 2156 claves en ES/EN/PT. También se compiló Tauri y se verificó el sidecar por stdin/NDJSON con siete controles aislados. La entrega final se recompila después de integrar el soporte de imágenes de prueba de Crear estilo con IA, documentado por separado. La aceptación visual de la app instalada con proyectos del usuario queda pendiente; no se presenta el harness como una generación real en Google Flow.
