# El personaje del estilo no se disfraza del personaje del guion

Fecha: 2026-09-21. Tercer QA del caso real del
[fix del 2026-09-19](../2026-09-19-fix-style-character-video/style-character-video.md):
mismo estilo (un detective minimalista de cabeza blanca, gabardina, fedora, placa y
corbata), mismo guion («imagina que despiertas flotando, eres astronauta…»), mismo
modelo (DeepSeek V4 Flash). Esta vez el video salió consistente, pero sin ninguno de
los accesorios del personaje.

## Causa

El protagonista guardado en el proyecto lo dice todo:

> «a slim minimalist astronaut character with a small round white head, dot eyes, and
> a simple curved smile. He is wearing a classic white NASA-style space suit…»

En la Fase 1 el modelo convirtió al detective en astronauta: conservó la cabeza
blanca y los ojos de punto, y cambió gabardina, fedora, placa y corbata por un traje
espacial. Como el protagonista se guarda una vez por proyecto y se teje idéntico, el
video quedó consistente con el personaje equivocado. Dos empujones:

1. El estilo del usuario dice en su Fase 1 «Analiza la historia para identificar al
   Personaje Principal» y recién después da el prompt de diseño del detective. Con un
   guion que arranca con «eres astronauta», el modelo resuelve esa contradicción
   vistiendo al detective de astronauta.
2. `STYLE_CHARACTER_PRECEDENCE_RULE` pedía devolver «SU ficha exactamente como tu
   estilo lo define», pero no decía qué hacer cuando el guion narra a otra persona u
   otro oficio.

Medido con la gema y el guion reales, Fase 1 sola, 4 repeticiones por modelo:

| Regla    | DeepSeek V4 Flash conserva al detective | GPT o4-mini Turbo conserva al detective |
| -------- | --------------------------------------- | --------------------------------------- |
| anterior | 1/4 (3/4 lo convirtió en astronauta)    | 3/4                                     |
| nueva    | 4/4                                     | 4/4                                     |

## Corrección

Solo la regla (`pipeline/prompts/verbatim-messages.ts`). Ahora dice que el personaje
del estilo ES el protagonista «aunque el guion hable de otro oficio, otra época u otra
persona (un astronauta, un chef, un rey)»: es quien **interpreta** esa historia, con su
mismo cuerpo, cara, ropa y accesorios; no se lo convierte en la persona que el guion
narra ni se lo viste como ella; y si el estilo trae escrito el prompt de diseño, se
devuelve palabra por palabra. Las muestras del estilo lo heredan porque usan la misma
Fase 1. La consigna portada sigue byte-idéntica.

## QA

`node --test scripts/test/check-style-character-video.mjs` (19 casos, uno nuevo sobre
el texto de la regla) y `check-preview-regressions.mjs` (32) en verde; `pnpm format`,
`pnpm lint` y `pnpm build` pasan. La medición de arriba es la verificación con claves
reales; queda repetirla desde la app con el guion del astronauta y comprobar que el
detective conserva fedora, gabardina y placa en todas las escenas.

Recomendación para ese estilo, aparte del fix: reemplazar «Analiza la historia para
identificar al Personaje Principal» por «El Personaje Principal es siempre el detective
descrito abajo, sea cual sea la historia», para que el estilo no se contradiga.
