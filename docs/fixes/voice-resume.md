# Reanudación de narración sin repetir encargos pendientes

Fecha: 2026-09-12. Bug 3. Ver ADR-0035.

## Causa

El proyecto reutilizaba `narration.mp3` y partes terminadas, pero el `task_id`
de DubVoice solo vivía en memoria. Al cancelar durante el POST o el polling,
reanudar encontraba el audio ausente y enviaba otro POST. Además, la cascada
de carriles trataba una descarga fallida como una síntesis fallida. Rust no
impedía dos jobs simultáneos del mismo proyecto.

## Corrección

- Recibo atómico `narration.mp3.request-N.json` antes de cada POST, con huella
  SHA-256 de texto, voz, motor, modelo, idioma, ajustes y contexto vecino.
  No guarda texto ni claves; sí el identificador remoto y, cuando existe, URL
  del resultado. Esa URL puede ser firmada: el recibo es privado al proyecto.
- DubVoice conserva la respuesta del POST aunque se cancele la UI; después
  respeta la cancelación. Reanudar consulta ese identificador sin repetir el POST,
  recupera porcentaje/tiempo anterior y descarga el resultado de esa tarea.
- Minimax guarda su URL antes de descargar. Los motores síncronos terminan la
  parte ya enviada y la guardan; cancelar impide mandar las partes siguientes.
- Un transporte incierto, error de disco, polling o CDN no activa otro carril.
  Solo rechazo explícito o tarea remota `failed` permite otra generación.
- Partes nuevas se validan también por identidad del motor/voz/ajustes. Los
  manifests antiguos mantienen su compatibilidad por hash de texto.
- FFmpeg escribe un archivo intermedio; el audio final aparece solo al terminar
  la unión y renombrar atómicamente. Una unión interrumpida no parece éxito.
- Rust verifica y registra el proyecto bajo el mismo mutex; la UI también bloquea
  reanudaciones duplicadas y arranques durante una tarea activa.
- Errores recuperables/no confirmables tienen textos equivalentes en es/en/pt.

## Límites deliberados

No existe garantía de exactamente un cobro sin idempotencia del proveedor. Si
se pierde el proceso después de enviar un POST pero antes de recibir su ID,
no se inventa éxito ni se repite el encargo: queda bloqueado para revisar el
historial del proveedor y recuperar el audio como audio propio. Tampoco se
pueden recuperar por ID encargos anteriores a esta corrección cuyo ID nunca
se guardó. Una recarga de WebView no reconecta el Channel a un proceso vivo:
Rust impide duplicarlo; hay que esperar su terminación antes de reanudar.
Si cambia la configuración de una solicitud pendiente, no se la reemplaza
silenciosamente. No se garantiza una latencia de red ni se modifica el pipeline,
su orden de fases, rutas o transporte invoke/Channel.

## Validación reproducible

`node --test scripts/check-voice-resume.mjs`: diez casos, HTTP interceptado,
sin claves reales ni cargos. Cuenta POSTs y verifica recibos/archivos reales:
cancelación durante POST; recuperación del mismo ID; fallo de descarga sin
fallback; envío incierto; ajustes incompatibles; tarea remota fallida;
cancelación síncrona; URL Minimax; recibo corrupto; progreso recuperado;
troceo/cancelación/unión fallida y reanudación con FFmpeg real (algunos casos
agrupan varias verificaciones). Ejecutar también `cargo check` y build de Tauri.

## Pruebas manuales en la app

1. Generar un video corto con ElevenLabs vía DubVoice. Durante la voz, navegar
   a Biblioteca y regresar: la tarea debe continuar, sin otro encargo remoto.
2. Repetir eligiendo crear otro video durante la voz. Volver al primer proyecto
   y reanudar: consultar su misma tarea o reutilizar el audio ya guardado.
   Comparar IDs/número de encargos en el historial del proveedor, no solo barras.
3. Interrumpir la red después de aceptar la tarea; restaurarla y reanudar.
   Debe recuperar esa tarea, no otra. Repetir durante la descarga.
4. Con texto largo, cancelar después de una parte y reanudar: las partes guardadas
   se reutilizan. Escuchar las uniones y confirmar duración completa.
5. Probar Minimax y ElevenLabs directo. La parte enviada puede seguir trabajando
   tras cancelar; no iniciar otra voz del mismo proyecto mientras siga viva.
6. Doble clic en Reanudar: debe existir un único job nativo por proyecto.
7. Cerrar forzosamente durante el POST: si falta ID, debe aparecer el mensaje
   de resultado no confirmable, sin POST automático adicional.
8. Repetir el conjunto en Windows empaquetado: compilación macOS no valida
   permisos, locks ni procesos de Windows.
