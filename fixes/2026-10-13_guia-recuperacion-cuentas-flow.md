# Fix: explicación y guía de recuperación de cuentas Flow

- **Fecha:** 2026-10-13
- **Rama:** feat/flow-export-motion

## Causa

La disponibilidad de una cuenta reducía problemas distintos a «Pausa temporal» o
«Revisar en Flow». El usuario no veía si Google había bloqueado actividad, pedía
CAPTCHA o había perdido la sesión. El modo `checking` sin trabajo se presentaba
como «máx. 1 imagen», sin dejar claro que todavía esperaba una imagen real.

En la lista de preparación, un perfil `checking` con un trabajo asignado podía
figurar pausado o reservado. Los motivos de capacidad repetían el diagnóstico
genérico y no ofrecían una secuencia para recuperar un bloqueo humano.

## Corrección

- `flowAccountRecoveryGuide` deriva presentación de `profileAvailability`: una
  comprobación sin `checkingJobId` espera la próxima imagen; con identificador
  describe la imagen en curso. La ausencia del campo en un protocolo antiguo
  conserva estado sin confirmar.
- Un `cooldown` técnico anuncia recuperación automática y muestra `nextCheckAt`
  si es válido. La interfaz no crea permisos, no inicia generación y no convierte
  un estado manual de una extensión antigua en recuperación automática.
- Actividad inusual temporal explica la espera y muestra tres pasos: abrir ese
  perfil, revisar el aviso y dejarlo abierto para el intento automático. Actividad
  persistente, CAPTCHA, sesión e identidad también presentan tres pasos; en esos
  casos el último usa la etiqueta de la extensión: «Ya lo revisé, comprobar cuenta». CAPTCHA y login requieren
  intervención del usuario; no se simula que la extensión pueda resolverlos.
- La guía vive en cuentas y en los desplegables de disponibilidad/capacidad.
  Los formularios de muestras, estilos y editor conservan proveedor y badge
  compacto. No añade un nuevo panel a los generadores.
- `RECOVERY_RECEIPTS_PENDING` explica que las solicitudes sin confirmar siguen
  ocupando espacios. La hora se refiere a comprobar recibos, no a una garantía de
  resolución ni a volver a enviar esos intentos.
- La comprobación técnica no bloquea ni vuelve a admitir trabajos desde la UI:
  sigue mandando la capacidad del coordinador. Las pausas del usuario, la falta
  de identidad y la desconexión conservan su prioridad.
- El aviso general de comprobación y el contador de cuentas distinguen la cola
  lógica del envío físico: se pueden encolar más imágenes, mientras cada cuenta
  envía una sola imagen de comprobación a la vez. No describen ese estado como
  un máximo de una imagen total ni como un límite de reserva.
- Traducciones equivalentes en español, inglés y portugués. Las instrucciones
  EN/PT conservan el nombre español del botón existente de la extensión.

## Límites deliberados

La UI describe estados confirmados del coordinador. Los reintentos, la reparación
conservadora del documento y la migración de pausas técnicas pertenecen al worker
integrado en el mismo cambio, no a componentes de React. Los plazos de Google y
las verificaciones humanas no se omiten. El texto indica que las demás cuentas
**pueden** continuar, condicionado a su disponibilidad real.

## Validación reproducible

1. `pnpm exec tsc -b`.
2. `pnpm check:locales`: 2179 claves iguales en ES/EN/PT.
3. Verificar formato y ESLint de los componentes, tipos y utilidades afectados;
   ejecutar `pnpm format`, `pnpm lint` y `pnpm build` al integrar toda la entrega.
4. En un entorno aislado, renderizar `FlowConnectionAvailability` con el catálogo
   real y perfiles ficticios para: checking nulo/activo/sin campo; cooldown por
   actividad/técnico/modelos; manual por actividad/CAPTCHA/sesión/usuario;
   desconexión, identidad en conflicto y fecha no válida.
5. Confirmar que actividad persistente/CAPTCHA/sesión tienen tres pasos, que la actividad temporal termina en espera automática, que la
   espera técnica no los tiene, y que nunca se muestra una verificación activa
   cuando `checkingJobId` es nulo. Confirmar que `flowSetupAccountKey` conserva
   el motivo y que capacidad no lo transforma en pausa genérica.

El arnés provisional vive fuera de Git en
`/private/tmp/vimo-recovery-guidance-check.mjs`. Resultado: **21/21 controles de
render estático y helpers**; sobre los archivos anteriores fallan 15 de esos
controles. Es evidencia local, no un framework de tests oficial ni una prueba
contra Google. Las tres traducciones se verificaron también contra los valores
reales del catálogo para detectar claves ausentes e interpolaciones sin resolver.

## Pruebas manuales realizadas

No se generaron imágenes ni se manipularon las cuentas reales del usuario en este
bloque. No se declara validación visual en la app empaquetada. La compilación y
aceptación integradas corresponden al cierre de la entrega, con esta guía y el
worker actualizado juntos.
