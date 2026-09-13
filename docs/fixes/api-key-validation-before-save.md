# Claves API: probar antes de guardar

Fecha: 2026-09-12.

## Causa y corrección

Guardar solo exigía texto no vacío; probar la conexión era opcional y el resultado
no estaba asociado al valor probado. Una respuesta tardía podía mostrar éxito
después de cambiar el campo o cerrar la edición.

La tarjeta ahora exige una prueba exitosa para la clave actual. El hook verifica
la misma condición antes de llamar a Guardar, no solo en el botón. Cada edición,
cancelación y nueva prueba invalida la anterior; respuestas de otra revisión se
descartan. Los valores se normalizan con el mismo `trim` al probar y guardar.
Durante el guardado no se permite cambiar el campo ni cancelar.

Se reutilizan los comandos nativos y sus validadores: no cambia Rust, el llavero,
el contrato invoke, la validación Fal Admin ni se añade una segunda prueba de red.
Una clave guardada antes de este cambio no se elimina ni se revalida sola.

## Archivos

- `src/modules/api-keys/components/ApiKeyCard.tsx`: controles de la tarjeta.
- `src/modules/api-keys/hooks/useApiKeyActions.ts`: condición de guardado y vigencia.
- `src/modules/api-keys/types/apiKeys.ts`: intento local tipado con revisión.
- `scripts/check-api-key-ui.mjs`: tarjeta y hook reales en Chrome, API simulada.

## Cómo probar

1. En Claves API, Configurar o Cambiar: pegar una clave. Guardar sigue deshabilitado.
2. Probar conexión: Guardar sigue deshabilitado durante la consulta y ante fallo.
3. Con éxito, Guardar se habilita y permite guardar ese valor.
4. Cambiar un carácter: Guardar se deshabilita y desaparece el éxito anterior.
5. Editar o cancelar mientras prueba: la respuesta vieja no habilita la nueva edición.
6. Cancelar el cambio de una clave configurada: se conserva la anterior.

Verificación automatizada reproducible: `node scripts/check-api-key-ui.mjs`.
Las cuentas y el llavero reales quedan para aceptación manual en la app nativa.
