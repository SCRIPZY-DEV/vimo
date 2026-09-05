# ADR-0022 — El modelo de prompts es una preferencia, no la última elección

- **Estado:** Aceptada
- **Fecha:** 2026-09-04
- **Área:** app
- **Reemplaza:** la **decisión 3** de
  [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md) (el resto de
  esa ADR sigue vigente).

## Problema

El modelo LLM que escribe los prompts de imagen (carril verbatim, solo con «Mi
estilo») se elegía por video y se recordaba con «la última elección gana» en
`localStorage` (`vimo:create:promptModel`), como decidió la ADR-0020.

En uso real eso se comporta mal en dos sentidos: probar un modelo caro **una
vez** lo deja fijado para todos los videos siguientes sin que nadie lo haya
pedido, y no hay ninguna pantalla donde ver o cambiar «mi modelo» — el único
lugar donde existe es un selector que solo aparece si además elegiste un estilo
propio. El usuario pidió explícitamente poder fijarlo (2026-09-04), revirtiendo
su decisión del 2026-09-02.

Restricciones:

- La preferencia tiene que vivir donde viven las otras (store nativo
  `settings.json`, [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md)),
  no en `localStorage`.
- El catálogo de modelos lo sirve el sidecar (`list-prompt-models`): en web no
  hay lista y la sección no puede romperse.
- `settings` y `videos` necesitan el mismo selector, y `videos` ya importa hooks
  de `settings` — un import en el otro sentido crearía un ciclo entre módulos.

## Decisión

**El modelo predeterminado se fija en Ajustes; el selector de Crear lo pisa solo
para ese video.**

1. **Preferencia en el store nativo.** Clave `promptModel` en `settings.json`,
   con `getPromptModel`/`setPromptModel` en `src/modules/settings/api/index.ts` y
   el hook `usePromptModelPreference`. `null` = el modelo de la casa. Se
   normaliza (trim, tope de 200 = espejo del sidecar) pero **no** se valida
   contra el catálogo: sigue la decisión 2 de la ADR-0020, un id retirado o
   desconocido lo degrada `resolveVerbatimModel` al escribir.
2. **El selector completo va en Ajustes**, no un switch «usar en todos mis
   videos» en Crear: la preferencia se ve y se cambia en el mismo lugar donde se
   usa, sin un control que cambia de significado según dónde estés.
3. **Crear siembra y no persiste.** `Create.tsx` siembra `form.promptModel` con
   la preferencia (una sola vez, como el resto); `PromptModelSection` de
   `videos` solo patchea el form. `promptModelStorage.ts` y
   `PROMPT_MODEL_STORAGE_KEY` se borran — sin migración del valor viejo.
4. **Las piezas compartidas suben a `common`**, igual que hizo `PriceCell` en la
   decisión 4 de la ADR-0020: `PromptModelSelector`, `promptCost`,
   `usePromptModels` y el nuevo `resolvePromptModel` (la regla «un id que ya no
   se ofrece cae al de la casa en pantalla», antes duplicada). El catálogo pasa
   a `commonApi.listPromptModels()` con la query key `commonQueryKeys.promptModels`.

| Componente                     | Estado  | Ubicación                          | Para qué                             |
| ------------------------------ | ------- | ---------------------------------- | ------------------------------------ |
| `commonApi`                    | nuevo   | `src/modules/common/api/index.ts`  | catálogo de modelos                  |
| `PromptModelSelector`          | movido  | `src/modules/common/components/`   | lo usan Crear y Ajustes              |
| `resolvePromptModel`           | nuevo   | `src/modules/common/utilities/`    | la regla del default, una sola vez   |
| `usePromptModelPreference`     | nuevo   | `src/modules/settings/hooks/`      | leer/guardar la preferencia          |
| `PromptModelSection` (Ajustes) | nuevo   | `src/modules/settings/components/` | la sección                           |
| `PromptModelSection` (Crear)   | reusado | `src/modules/videos/components/`   | elección por video, ya sin persistir |

## Alternativas consideradas

- **Switch «usar en todos mis videos» en el selector de Crear**, con Ajustes solo
  como espejo de lectura — la forma del origen (v1.23.0). Descartada por el
  usuario: mete un control de configuración global adentro del `<form>` de un
  video, que es justo la mezcla que la ADR-0020 quería evitar.
- **Convivencia: la preferencia solo siembra la primera vez** y después manda la
  última elección. Descartada: deja dos fuentes de verdad y no arregla el
  problema original (un cambio puntual se sigue pegando).
- **Dejar el catálogo en `videos` e importarlo desde `settings`.** Descartada:
  `videos` ya importa `settings/hooks`, así que el import cruzado crea un ciclo.

## Consecuencias

- ✅ Una sola fuente de verdad para el modelo, en la pantalla donde se esperan
  las preferencias, y persistida como el resto (`settings.json`).
- ✅ Probar un modelo en un video ya no compromete a los siguientes.
- ⚠️ El simulador de costo en Ajustes corre con `gemChars: 0` y sin fase de
  personaje: la cifra es una base de comparación entre modelos, **no** el costo
  del próximo video. Se aclara con `settings.promptModelEstimateNote`.
- ⚠️ Crear espera una preferencia más antes de montar el formulario (misma
  lectura local con `staleTime: Infinity`; ya esperaba dos).
- ⚠️ Quien tenía un modelo en `localStorage` vuelve al de la casa: no hay
  migración a propósito (una elección de dos clicks).
- 🔒 Ningún módulo persiste el modelo por su cuenta: la única escritura es
  `settingsApi.setPromptModel`.

## Verificación de cumplimiento

- **Guards:** `pnpm build` (`tsc -b`) y `pnpm lint`. Un `grep -rn
"PROMPT_MODEL_STORAGE_KEY\|promptModelStorage" src` sin resultados prueba que
  la persistencia vieja no volvió.
- **Manual:** elegir un modelo en Ajustes → `promptModel` aparece en
  `settings.json` (`appDataDir`) y sobrevive a un reinicio. En Crear con «Mi
  estilo», cambiar el modelo, salir y volver: tiene que arrancar de nuevo en el
  de Ajustes.
- **Cómo se vería una regresión:** el selector de Crear vuelve a arrancar en el
  último modelo usado en vez del de Ajustes (alguien reintrodujo una escritura
  en el `onChange`), o la sección de Ajustes desaparece en escritorio (el
  catálogo dejó de responder y `resolvePromptModel` devuelve `null`).

## Referencias

- [ADR-0020](ADR-0020-selector-de-modelo-y-personaje-de-la-gema.md) — decisión 3,
  reemplazada por esta.
- [ADR-0009](ADR-0009-preferencias-nativas-y-carpeta-raiz.md) — dónde viven las
  preferencias.
