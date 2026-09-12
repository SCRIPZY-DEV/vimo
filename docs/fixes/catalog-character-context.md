# Identidad desde el guion en Catálogo

Fecha: 2026-09-12. Bug 2.

`CharacterSection` solo enviaba el guion dentro de `styleContext`, exclusivo de
Mi estilo. En Catálogo, `CharacterProfileFields` exigía todos los campos llenos
porque el modal no sabía que había un guion.

Se pasa `script` por `CharacterPickerModal` a `CharacterModal`. Con 20 caracteres
o más habilita la redacción y lo envía al endpoint existente
`suggest-character-profile`, cuyo contrato ya admite guion. Mi estilo conserva
`design-style-character` y la biblioteca conserva su requisito de campos.
Los campos ya escritos siguen prevaleciendo sobre las sugerencias.

Prueba manual: Crear video → Catálogo → pegar un guion → elegir personaje →
crear uno sin foto. Con los campos vacíos, «Redactar identidad con IA» debe estar
habilitado si hay clave de DeepInfra. Debe inferir el protagonista del guion.
Repetir sin guion (deshabilitado hasta completar los campos), en Mi estilo y
desde Personajes. Sin clave configurada, la redacción debe permanecer deshabilitada.

Validación de compilación: `pnpm format`, `pnpm lint`, `pnpm build`.
La calidad de la inferencia requiere QA con el proveedor real.

`node scripts/check-character-ui.mjs`: tres escenarios en Chrome con componentes
y hooks reales; únicamente APIs y disponibilidad de claves simuladas. Recorre
Section → Picker → Modal, verifica botón habilitado con campos vacíos, guion
exacto enviado y ficha autocompletada; además biblioteca sin guion y Mi estilo.
No mide latencia del proveedor ni reemplaza QA en WebKit/Tauri. Se conserva la
política premium y el fallback determinístico del experto de Catálogo.
