# Fix: el aviso de lo que ajustó la IA explica que esas reglas las pone Vimo

- **Fecha:** 2026-10-03
- **Rama:** feat/catalogo-estilos

## Causa

Al adaptar una gema a la ficha de Vimo, el agente descarta a propósito las reglas de flujo (las
fases de la conversación y las instrucciones para el usuario), el formato de salida y las
instrucciones de idioma (ADR-0048, reglas del agente), y lo cuenta en sus avisos: «Se descartaron
todas las reglas de flujo…». El aviso «Lo que la IA ajustó de tu gema» del modal mostraba esa lista
sin decir por qué: leído solo, parece que la gema perdió algo que necesitaba.

Pedido del dueño en la QA del 2026-10-03: el aviso «debe explicar que Vimo pone eso
automáticamente».

## Corrección

- `src/modules/videos/components/GemAgentWarnings.tsx`: debajo de la lista de avisos del agente va
  una línea fija: «Las reglas de flujo, de formato de salida y de idioma no hacen falta en tu gema:
  Vimo ya trae las suyas y las pone automáticamente en cada video. Por eso la IA las saca.»
- Texto `create.gemTemplate.warningsPlatformNote` en los tres idiomas
  (`public/locales/{es,en,pt}.json`).

La línea sale solo cuando el agente dejó avisos. Lo que afirma es lo que hace el marco de Vimo
(`buildTemplateSystem`, `pipeline/prompts/template-frame.ts`): el carril arma la conversación por
su cuenta y suma sus reglas de formato de salida y de idioma a cada pedido.

## Límites deliberados

- El texto de cada aviso lo sigue escribiendo el agente (`vimo-landing`): no se toca su prompt ni
  el servidor.
- La línea no nombra el rol del modelo. El marco de Vimo trae reglas de formato, idioma, seguridad
  y orden del prompt, pero no una línea de rol («Eres un director de arte…»). Sumarla cambia el
  `system` de todos los videos con gemas de plantilla: es una decisión aparte del dueño, anotada en
  el traspaso de la Entrega 2.
- El aviso de la galería (`GemMigrationNotice`) no cambia: ya manda a abrir el estilo para ver lo
  que ajustó la IA.

## Validación reproducible

```bash
node scripts/test/check-locales.mjs
pnpm format:check
pnpm lint
pnpm build
```

El cambio es de texto y markup, sin lógica pura: no hay guard. En la app: Crear → Mi estilo →
abrir una gema recién adaptada. Debajo de la lista de «Lo que la IA ajustó de tu gema» tiene que
leerse la línea nueva.

## Pruebas manuales

Con el formulario real de Crear montado en Chrome sin interfaz, dentro de `StrictMode` (como
`pnpm tauri dev`), con la API y el agente simulados:

- una gema adaptada con avisos del agente muestra la lista y, debajo, la línea nueva;
- una gema adaptada sin avisos muestra el pedido de revisar las secciones, sin la línea.

Falta el recorrido del dueño en `pnpm tauri dev`, con el agente real.
