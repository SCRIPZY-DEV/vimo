# Ficha de personaje completa después de redactar con IA

Fecha: 2026-09-12. Corrección posterior a la prueba manual del usuario.

## Causa

El prompt de Catálogo decía explícitamente que edad y rol podían quedar vacíos.
Los dos comandos validaban solo la descripción y devolvían nombre/edad/rol
opcionales. Además descartaban edad si el proveedor la devolvía como número.
El texto gris «70 años» era el placeholder, no un valor asignado por la IA.

## Corrección

- Ambas respuestas exitosas requieren nombre, edad, rol e identidad. El validador
  común acepta los esquemas inglés/español de los expertos y una edad numérica
  finita no negativa (incluido cero), convertida a texto.
- Los datos escritos por el usuario tienen prioridad. Si el guion no determina
  edad/rol, se pide una elección coherente con el personaje; no se fija una edad
  arbitraria en la UI. Para personajes no humanos se contempla etapa de vida o
  no aplicabilidad justificada.
- Si falta un campo, un segundo intento recibe contexto y borrador anterior,
  exige completarlo y conservar al mismo personaje. No se acepta una ficha
  incompleta como éxito al agotar ese intento.
- La identidad se valida después de quitar términos de estilo. Catálogo conserva
  tier premium y respaldo determinístico solo si los datos previos ya permiten
  una ficha completa; nunca ante auth, saldo o cancelación. Mi estilo conserva
  su modelo seleccionado y dos intentos.
- No cambia la navegación ni los campos visuales: se corrige el dato que reciben.

## Verificación

Archivos tocados por este ajuste:

- `pipeline/prompts/character-profile.ts`: validador común y recordatorio.
- `pipeline/prompts/character-designer.ts`, `style-character-designer.ts`: consignas.
- `pipeline/commands/characters/suggest-character-profile.ts` y
  `pipeline/commands/styles/design-style-character.ts`: validación y reparación.
- `pipeline/types/characters.ts`, `styles.ts`: respuesta con campos obligatorios.
- `scripts/check-character-profile.mjs`, `check-character-ui.mjs`: regresiones.
- Este documento, `catalog-character-context.md`, ADR-0035 e informe PDF/HTML.

`node --test scripts/check-character-profile.mjs`: 24 casos con los comandos
reales y HTTP simulado; ambos expertos, edad numérica, campos omitidos, reparación,
fallo persistente, datos previos, poda, errores de cuenta/proveedor y cancelación.
`node scripts/check-character-ui.mjs`: comprueba valores reales de los cuatro
inputs, no solo presencia o placeholder, en Catálogo y Mi estilo.

Prueba manual con el nuevo build: repetir el astronauta con guion pero edad vacía;
verificar nombre, edad, rol e identidad rellenos. Repetir con edad ya escrita y
confirmar que se conserva. Repetir en Mi estilo. Sin edad explícita en el guion,
la propuesta debe ser coherente con el protagonista. Si el proveedor falla, debe
verse el error y no una ficha incompleta presentada como terminada.

HTTP simulado no valida la calidad de inferencias ni la latencia de proveedores.
