import { NARRATION_ALIGNMENT_RULE } from './narration-alignment.ts'
// Los MENSAJES de la conversación del carril verbatim. Port de
// `motor-web/verbatim/mensajes.ts` del origen — los TEXTOS que viajan al
// modelo van byte-idénticos (fueron medidos así); solo los identificadores
// están en inglés.
//
// Acá NO vive ningún system prompt: el único que se manda es la GEMA del
// usuario, y viaja **VERBATIM, sin envoltorio**. Esa es la regla que gobierna
// todo este carril: si el system prompt es del usuario, todo lo que el motor
// necesita pedirle al modelo viaja en mensajes de USUARIO — o como regla
// técnica de la plataforma DECLARADA y sumada al final, nunca editando su
// texto (E34).
//
// Lo que NO es port y está declarado como regla propia, sumada sin tocar el
// texto portado: `STYLE_CHARACTER_PRECEDENCE_RULE` y
// `PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE` (el personaje escrito en el
// estilo es el protagonista del video), y el VESTUARIO POR ESCENA
// (`SCENE_WARDROBE_RULE`, `BATCH_WARDROBE_ADDENDUM`,
// `CHARACTER_OUTFIT_SENTENCE_RULE`), detrás de `VERBATIM_SCENE_WARDROBE`.
//
// Las gemas de chat definen dos fases que se activan por lo que RECIBEN: la
// Fase 1 con el GUION, la Fase 2 con la lista de FRAGMENTOS. Nuestras
// llamadas son sin estado, así que la conversación del playground se REPLICA
// turno por turno — incluida la respuesta que el modelo dio entre las dos
// fases (el turno de `assistant` con su «Documento Base»).

/**
 * Qué hace ESTE video con el protagonista. Lo decide el proyecto y manda
 * sobre toda la conversación: qué fases corren, qué turnos se mandan, qué
 * línea técnica va en el system y cómo se resuelve `[subject]`.
 *
 *  - `generic`   — el pipeline diseña el protagonista con la Fase 1 de la
 *                  gema. El default de siempre.
 *  - `text`      — el personaje lo escribió el usuario. Sin Fase 1: su prompt
 *                  entra como el turno de assistant.
 *  - `reference` — el usuario aportó una FOTO. Sin Fase 1 y sin assistant: la
 *                  identidad viaja en la imagen que se adjunta al generador.
 *  - `none`      — el video no tiene protagonista. Sin Fase 1, sin assistant
 *                  y sin `[subject]`.
 */
export type VerbatimCharacterMode = 'generic' | 'text' | 'reference' | 'none'

/**
 * Mensaje que dispara la FASE 1. El espacio después de "GUION:" y la línea en
 * blanco que sigue son parte del mensaje tal cual se tipeó en el playground
 * del origen. No se «limpian»: lo que se replica es la conversación que se
 * probó, no una versión prolija.
 */
export function buildScriptMessage(script: string): string {
  return `GUION: \n\n${script.trim()}`
}

/**
 * La consigna que acompaña al guion en la FASE 1 (el diseño del personaje).
 * NO es decorativa: medido en el origen, con el guion PELADO el modelo
 * respondía solo la frase de cierre de la gema, sin bloque y sin personaje
 * (3 de 3 corridas, `finish_reason: "stop"`). Pide el RETRATO COMPLETO de la
 * gema (el atajo de pedir la descripción directa producía fichas FLACAS);
 * los tijeretazos que lo dejan en descripción permanente son nuestros
 * (subject-weaver). Con dos ramas (v1.30.0): si la gema no define fase de
 * personaje, igual devuelve la FICHA — sin la rama, una gema pegada sin fase
 * devolvía un prompt de ESCENA y la pose quedaba congelada en todas.
 */
export const CHARACTER_DESIGN_INSTRUCTION =
  'Diseña ahora el protagonista de este guion: la lectura mas obvia y directa, interpretacion literal y clasica. ' +
  'Si tu estilo define una fase de diseño de personaje, ejecutala tal como la define. ' +
  'Si tu estilo NO define ninguna, devuelve igual la FICHA del protagonista tal como se veria en tu estilo. ' +
  'En los dos casos devuelve el prompt COMPLETO del personaje, en INGLES, dentro de un bloque de codigo, empezando por su rol — ' +
  'con el material segun tu estilo, proporciones, pelo, rasgos fisicos y la ropa con colores concretos. ' +
  "La ficha describe SOLO al personaje: sin escena, sin lugar, sin momento del dia, sin accion y sin encabezados como 'Prompt:'."

/**
 * EL PERSONAJE DEL ESTILO MANDA sobre el que sugiere el guion. NO es un port:
 * es una regla NUESTRA, declarada y sumada ANTES de la consigna portada (que
 * queda byte-idéntica). Caso real: el usuario escribe a su personaje DENTRO
 * del estilo («una chica pelirroja con buzo verde») y el video salía con
 * otro, porque la consigna pide «el protagonista de este guion: la lectura
 * mas obvia» y el modelo lo sacaba del guion. Las muestras del estilo ya
 * respetaban al personaje escrito (`PROTAGONIST_DESIGN_REQUEST`); el video
 * no. Solo decide QUIÉN es el protagonista: el formato de entrega sigue
 * siendo el de la consigna, y el personaje del USUARIO (biblioteca) le sigue
 * ganando a este — esos modos no pasan por la Fase 1.
 *
 * Reforzada el 2026-09-21: con un guion que dice «eres astronauta», el modelo
 * VESTÍA al personaje del estilo de astronauta (traje espacial en vez de
 * gabardina, fedora y placa). Medido con la gema real, Fase 1 sola, 4
 * repeticiones por modelo: la versión anterior conservaba al personaje 1/4
 * (DeepSeek V4 Flash) y 3/4 (GPT o4-mini Turbo); esta, 4/4 y 4/4. La clave es
 * decir que el personaje INTERPRETA la historia y que el prompt de diseño
 * escrito en el estilo se devuelve palabra por palabra.
 */
export const STYLE_CHARACTER_PRECEDENCE_RULE =
  'EL PERSONAJE DE TU ESTILO MANDA (regla tecnica de la plataforma, se suma a la consigna que sigue y no cambia tu estilo): ' +
  'si tu estilo YA describe a su propio personaje, narrador o sujeto recurrente (una seccion que diga como es, un narrador fijo, una ficha, un prompt de diseño), ' +
  'el protagonista de este video ES ese personaje, aunque el guion hable de otro oficio, otra epoca u otra persona (un astronauta, un chef, un rey): ' +
  'el personaje de tu estilo es quien INTERPRETA esa historia, con su mismo cuerpo, su misma cara, su misma ropa y sus mismos accesorios. ' +
  'NO lo conviertas en la persona que el guion narra ni lo vistas como ella, y no le quites ni le cambies nada de lo que tu estilo le da. ' +
  'Si tu estilo trae escrito el prompt de diseño de ese personaje, devuelve ESE prompt tal cual, palabra por palabra. ' +
  'Solo si tu estilo NO describe ningun personaje propio, diseñalo como pide la consigna que sigue. ' +
  'En los dos casos el formato de entrega es el de la consigna que sigue.'

/*
 * VESTUARIO POR ESCENA (2026-09-21). Decisión de producto: en «Mi estilo» el
 * personaje se adapta a la escena SOLO en la ropa; cara, pelo, piel,
 * contextura y accesorios distintivos quedan fijos. Hasta acá no existía
 * ningún canal para eso: la arquitectura prohíbe describir a [subject] y la
 * descripción (ropa incluida) se pega idéntica en todas las escenas, así que
 * el personaje salía en la playa, la nieve o la cama con el mismo buzo.
 *
 * Todo va detrás de esta constante. Apagada, cada prompt es byte-idéntico al
 * de antes. ENCENDIDA el 2026-09-21 tras el A/B con claves reales (los
 * prompts de este carril se midieron en el origen; resultados en
 * docs/handoff/2026-09-21-custom-style-scene-wardrobe/): GPT o4-mini Turbo
 * marca el 90-100 % de las escenas que exigen otra ropa y el 0 % de las
 * neutras; DeepSeek V4 Flash 70 % y 3 %, y con un muñeco de palitos solo
 * 30 % — ahí la escena queda como antes, con la ropa base. Sin fichas
 * incrustadas ni escenas faltantes en ninguna variante. El sidecar no lee el
 * entorno (ADR-0010): es una constante, no una variable; apagarla vuelve a
 * los prompts anteriores byte por byte.
 */
export const VERBATIM_SCENE_WARDROBE = true

/**
 * La ficha de la Fase 1 termina con UNA oración «Outfit:» para que el código
 * pueda separar la identidad fija de la MARCA del personaje: todo lo que
 * lleva puesto o en la mano (ropa, calzado, sombrero, placa, lentes,
 * libreta). Esa marca se queda con el personaje encima de la ropa de cada
 * escena; lo que no se lleva (cicatrices, tatuajes, lunares) va con los
 * rasgos. Regla propia, sumada entre la precedencia y la consigna portada.
 */
export const CHARACTER_OUTFIT_SENTENCE_RULE =
  'FORMATO DE LA FICHA (regla tecnica de la plataforma, se suma a la consigna que sigue): ' +
  'termina la ficha con UNA oracion final que empiece exactamente con "Outfit:" y contenga TODO lo que el personaje lleva puesto o en la mano: ' +
  'ropa, calzado, sombrero, lentes, placa, joyas y objetos que lo caracterizan, con sus colores. ' +
  'Lo que no se lleva puesto (cicatrices, tatuajes, lunares, barba) va ANTES, junto con los rasgos, nunca en esa oracion.'

/**
 * La regla del vestuario, ULTIMA del system de la Fase 2 (modos generic,
 * text y reference). Es la unica excepcion a «no describas a [subject]»: la
 * ropa, cuando la situacion del fragmento la exige O cuando el guion pone al
 * personaje en un oficio con vestimenta propia, en un parentesis pegado a la
 * etiqueta que el codigo lee y separa.
 *
 * El rol se sumo el 2026-09-21: con «eres astronauta en la estacion» y solo
 * el criterio de situacion, el modelo decidia (con razon realista) que
 * dentro de la estacion no hace falta otra ropa, y el detective salia sin
 * traje. Medido sobre 8 escenas del guion real, 2 corridas por modelo:
 * situacion sola → GPT Ultra 8/16, GPT Turbo 0/16, DeepSeek 9/16; con el rol
 * → 16/16, 16/16 y 8/16.
 */
export const SCENE_WARDROBE_RULE =
  'VESTUARIO POR ESCENA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'la UNICA excepcion a no describir a [subject] es lo que lleva puesto en ESA escena. ' +
  'SOLO cuando la situacion del fragmento exige claramente otra ropa que la habitual (playa, nieve, dormir, uniforme, deporte, espacio, epoca historica, disfraz, gala), ' +
  'escribe inmediatamente despues de la etiqueta un parentesis con la forma [subject] (wearing: ...) ' +
  '— en ingles, solo las prendas, el calzado y los accesorios que ESA situacion pide, con sus colores, maximo 14 palabras; ' +
  'la ropa la decide la situacion del fragmento, nunca la de un fragmento anterior ni una de ejemplo. ' +
  'Lo que CARACTERIZA al personaje (su sombrero, su placa, su abrigo, sus lentes, lo que lleva en la mano) se queda con el encima de esa ropa: ' +
  'la plataforma lo agrega sola, no lo repitas. Solo si la situacion hace IMPOSIBLE una de esas cosas, dilo en el mismo parentesis (por ejemplo, un casco en lugar del sombrero). ' +
  'NUNCA pongas ahi cara, piel, cuerpo, edad, ni el color o el largo del pelo: eso no cambia jamas. ' +
  'Y si el guion pone al personaje en un OFICIO o rol con vestimenta propia (astronauta, chef, medico, bombero, soldado, buzo, piloto), ' +
  'ese atuendo aplica en TODAS las escenas en que actua en ese rol, aunque la escena en si no lo exija: escribe el parentesis en cada una de ellas, con el mismo atuendo. ' +
  'Si el fragmento no exige otra ropa ni un rol asi, NO escribas el parentesis.'

/** El recordatorio del vestuario en el turno del lote, después del preámbulo portado. */
export const BATCH_WARDROBE_ADDENDUM =
  'Ropa: solo si un fragmento exige claramente otra ropa, escribe [subject] (wearing: ...) con las prendas y accesorios de esa situacion; lo que caracteriza al personaje se queda encima; si no, la etiqueta sola.'

export interface VerbatimMessageOptions {
  /** Vestuario por escena. Ausente = la constante `VERBATIM_SCENE_WARDROBE`. */
  sceneWardrobe?: boolean
}

/** Fase 1: el guion + la precedencia del estilo (+ el formato de la ficha) + la consigna, fuera del system. */
export function buildCharacterDesignMessage(
  script: string,
  options: VerbatimMessageOptions = {},
): string {
  const sceneWardrobe = options.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE
  const rules = sceneWardrobe
    ? `${STYLE_CHARACTER_PRECEDENCE_RULE}\n\n${CHARACTER_OUTFIT_SENTENCE_RULE}`
    : STYLE_CHARACTER_PRECEDENCE_RULE
  return `${buildScriptMessage(script)}\n\n${rules}\n\n${CHARACTER_DESIGN_INSTRUCTION}`
}

/**
 * La FASE DE PERSONAJE de la plataforma (v1.31.0 del origen). NO se manda
 * siempre: solo en los REINTENTOS de la Fase 1, cuando un intento ya demostró
 * que la gema no sabe diseñar su personaje (rol degradado o ficha flaca — las
 * señales E42). Es una sección NUESTRA sumada al final del system — la gema
 * viaja intacta. El rol se pide como PROSA con ejemplo: pedirlo a secas hizo
 * que gpt-oss titulara "Role: ..." y la etiqueta se colara al tejido.
 */
export const PLATFORM_CHARACTER_PHASE =
  '\n\n# CHARACTER DESIGN PHASE (added by the platform)\n' +
  'When asked to design the main character, return ONE character sheet inside a code block. ' +
  'The sheet is plain prose that OPENS with the role itself (for example: "a young explorer with..."), ' +
  'then body build, hair, facial features, and outfit with concrete colors, ' +
  "all rendered in this style's materials and technique. " +
  'The sheet describes ONLY the character: no scene, no place, no time of day, no action, and no labels or headers like "Role:".'

/**
 * La misma precedencia del estilo, para el reintento con la fase inyectada.
 * Sin esto la fase («return ONE character sheet…») rediseñaba desde cero
 * justo cuando la gema trae un personaje escueto (un muñeco de palitos no
 * junta las palabras de identidad que pide E42) y le inventaba pelo y ropa.
 * Tampoco es un port: va sumada DESPUÉS de la fase portada, que no se toca.
 */
export const PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE =
  ' If this style already describes its own recurring character, narrator or subject, ' +
  'the sheet is THAT character exactly as the style defines it (same traits, hair, clothing colors and accessories), never a new design.'

/** La gema con la fase de la plataforma sumada al final (la gema no se toca). */
export function gemWithCharacterPhase(gem: string): string {
  return (
    gem + PLATFORM_CHARACTER_PHASE + PLATFORM_CHARACTER_PHASE_STYLE_PRECEDENCE
  )
}

/**
 * La frase con la que el modelo cierra la Fase 1, palabra por palabra como se
 * la piden las gemas de chat. Con acentos porque así la escribe el modelo: es
 * una cita, no texto nuestro.
 */
export const CHARACTER_PHASE_CLOSING =
  'Aquí tienes el prompt de tu personaje. Genéralo, cárgalo como referencia y envíame los fragmentos del guion.'

/**
 * El turno de ASSISTANT que va entre las dos fases: el prompt del personaje
 * dentro de un bloque de código, más la frase de cierre. Replicarlo es lo que
 * activa la Fase 2 igual que en el playground y le dice al modelo a qué
 * protagonista se refiere `[subject]`.
 */
export function buildAssistantCharacterTurn(characterPrompt: string): string {
  return `\`\`\`text\n${characterPrompt.trim()}\n\`\`\`\n\n${CHARACTER_PHASE_CLOSING}`
}

/**
 * La línea de IDS de escena (v1.8.0 del origen): la única mecánica nuestra en
 * el system de la Fase 2, junto con la arquitectura. Sin identidad en la
 * salida el ORDEN es el único amarre — un 14/15 obligaba a descartar el lote
 * entero. Con `((n))` el faltante queda identificado EXACTO y se re-pide
 * solo. Paréntesis DOBLES y no corchetes: el guard de huecos mira `[...]`.
 */
export const SCENE_ID_RULE =
  'REGLA TECNICA DE LA PLATAFORMA (se suma a todo lo anterior y no cambia nada mas del formato): ' +
  'antepon a CADA prompt el numero de su fragmento en la forma ((n)) al inicio de su primera linea ' +
  '— por ejemplo: ((7)) Low angle shot of... — sin punto despues del marcador y sin numerar nada mas.'

/*
 * La ARQUITECTURA DEL PROMPT FINAL (v1.18.0 del origen, propuesta del dueño).
 * A/B con el motor real — 36 corridas, 6 modelos × 2 condiciones × 3
 * repeticiones: escenas con la ficha pegada SIN la línea 105/270, CON la
 * línea 0/270. Y todos más rápidos (dejan de escribir ~400 chars de ficha
 * por escena). Declara la FORMA del entregable, no el contenido ni el estilo
 * — eso la mantiene del lado correcto de E34.
 *
 * En el origen tenía un interruptor de emergencia por `.env`
 * (VIMO_ARQUITECTURA_PROMPT=0); acá NO se porta: el sidecar no lee el entorno
 * (ADR-0010) y el interruptor era una vuelta atrás sin release, no una
 * opción del producto. La línea va siempre.
 */
export const PROMPT_ARCHITECTURE_RULE =
  'ARQUITECTURA DEL PROMPT FINAL (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'cada prompt de escena se arma SIEMPRE con estas partes y en este orden: ' +
  '(1) la toma o encuadre y lo que hace [subject] en esa escena; ' +
  '(2) donde ocurre y de que esta hecho el decorado; ' +
  '(3) la cola de estilo tal como la define tu estilo, cerrando el prompt. ' +
  'NO existe una cuarta parte: la descripcion fisica de [subject] la agrega la plataforma sola al final de cada prompt, ' +
  'asi que NUNCA la escribas — ni suelta ni como ficha de personaje ("character model", cuerpo entero, pose neutra, fondo aislado). ' +
  'Un prompt que ademas describe al personaje pide DOS encuadres a la vez y el generador devuelve la imagen partida en paneles.'

/**
 * La misma arquitectura cuando la identidad viaja en una FOTO (v1.19.0): la
 * de arriba afirma que «la descripcion fisica la agrega la plataforma», y con
 * foto eso sería mentira — el físico lo aporta la imagen adjunta. Sacarla y
 * no poner nada reabría E35 (fichas pegadas) justo donde peor pega.
 */
export const PROMPT_ARCHITECTURE_RULE_REFERENCE =
  'ARQUITECTURA DEL PROMPT FINAL (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'cada prompt de escena se arma SIEMPRE con estas partes y en este orden: ' +
  '(1) la toma o encuadre y lo que hace [subject] en esa escena; ' +
  '(2) donde ocurre y de que esta hecho el decorado; ' +
  '(3) la cola de estilo tal como la define tu estilo, cerrando el prompt. ' +
  'NO existe una cuarta parte: la identidad de [subject] viaja en una IMAGEN DE REFERENCIA que la plataforma le adjunta al generador, ' +
  'asi que NUNCA describas su fisico — ni suelto ni como ficha de personaje ("character model", cuerpo entero, pose neutra, fondo aislado). ' +
  'Un prompt que ademas describe al personaje pide DOS encuadres a la vez y el generador devuelve la imagen partida en paneles.'

/**
 * La misma arquitectura para un video SIN protagonista (v1.19.0). Contradice
 * a propósito un pedazo de la gema (su fase de personaje) — por eso se
 * declara como regla técnica explícita, nunca editando la gema. La
 * aclaración sobre las personas del guion no es de relleno: sin ella «sin
 * personajes» se entiende como «sin gente» y un guion sobre amigos termina
 * en paisajes vacíos.
 */
export const PROMPT_ARCHITECTURE_RULE_NO_SUBJECT =
  'ARQUITECTURA DEL PROMPT FINAL (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'cada prompt de escena se arma SIEMPRE con estas partes y en este orden: ' +
  '(1) la toma o encuadre y lo que ocurre en esa escena; ' +
  '(2) donde ocurre y de que esta hecho el decorado; ' +
  '(3) la cola de estilo tal como la define tu estilo, cerrando el prompt. ' +
  'Este video NO tiene protagonista recurrente: no uses la etiqueta [subject] en ninguna escena y no inventes un personaje que se repita, ' +
  'aunque tu estilo hable de un sujeto fijo — en este video esa parte no aplica. ' +
  'Las personas que el guion menciona SI se dibujan cuando la escena las pide, como parte de lo que se esta narrando. ' +
  'Y NUNCA escribas una ficha de personaje ("character model", cuerpo entero, pose neutra, fondo aislado): cada prompt trae UNICAMENTE su escena.'

/**
 * v1.31.3 (E47) — El personaje del USUARIO le gana al personaje FIJO de la
 * gema. Caso real del origen: la gema traía su protagonista ESCRITO («repeat
 * this description in FULL every single time») y el modelo lo obedeció por
 * encima del turno fabricado con el personaje del usuario. Cuando un modo
 * EXISTE para contradecir un pedazo de la gema, esa contradicción tiene que
 * estar DICHA como regla técnica. Solo viaja en los modos `text` y
 * `reference`.
 */
export const USER_PROTAGONIST_RULE =
  'EL PROTAGONISTA DE ESTE VIDEO (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'el usuario ya definio al protagonista de este video, y esa identidad REEMPLAZA a cualquier personaje o sujeto fijo que tu estilo describa. ' +
  'Si tu estilo trae su propio personaje recurrente (una seccion que diga como es el sujeto, un narrador fijo, una ficha), en este video esa parte NO aplica: ' +
  'no describas ni dibujes a ese personaje del estilo. Cada vez que el protagonista aparezca, nombralo con la etiqueta [subject] como dicen las reglas de arriba, ' +
  'y conserva intactos la tecnica, los materiales y la cola de estilo que tu estilo define.'

/** ¿Este modo lleva la línea del protagonista del usuario? Solo `text` y
 * `reference`: son los únicos donde la identidad NO la decide la gema. */
export function modeCarriesUserProtagonist(
  mode: VerbatimCharacterMode,
): boolean {
  return mode === 'text' || mode === 'reference'
}

/**
 * v1.32.1 (E49) — La escena DESMARCADA no lleva NI al protagonista del guion.
 * Viaja SOLO en las reescrituras de escenas desmarcadas (flag
 * `withoutScriptProtagonist`), nunca en el modo `none` declarado — ese queda
 * byte por byte como siempre.
 */
export const SCENE_WITHOUT_PROTAGONIST_RULE =
  'ESTE PEDIDO VA SIN PROTAGONISTA (regla tecnica de la plataforma, se suma a todo lo anterior y no cambia tu estilo): ' +
  'el usuario quito al protagonista de las escenas de este pedido. La persona principal de la historia (la que el guion narra o nombra, ' +
  'y cualquier personaje o sujeto fijo que tu estilo describa) NO debe aparecer ni describirse en estos prompts, ' +
  'y NO la reemplaces por NADIE que haga su papel: ni otra persona generica, ni una figura anonima, ni una silueta, ni alguien de espaldas o a lo lejos, ' +
  'ni una mano o una parte del cuerpo haciendo la accion. Estas escenas no llevan sujeto humano y no usan la etiqueta [subject]. ' +
  'Si tu estilo pide empezar cada prompt por el sujeto, en estas escenas empieza por el escenario. ' +
  'Escribe cada escena como una toma del lugar SIN la persona que realiza la accion narrada: ' +
  'muestra el objeto, el espacio, la luz y las huellas o el resultado de ese momento, como si la camara llegara justo antes o justo despues. ' +
  'Las demas personas que la escena pida (gente alrededor, una multitud, personajes secundarios) SI pueden aparecer al fondo.'

/** Cuál de las tres arquitecturas le toca a este video. */
function architectureRuleFor(mode: VerbatimCharacterMode): string {
  switch (mode) {
    case 'reference':
      return PROMPT_ARCHITECTURE_RULE_REFERENCE
    case 'none':
      return PROMPT_ARCHITECTURE_RULE_NO_SUBJECT
    default:
      // `generic` y `text` comparten la de siempre: en los dos casos la
      // plataforma pega una descripción al final de cada prompt.
      return PROMPT_ARCHITECTURE_RULE
  }
}

/**
 * El system de la Fase 2: la gema del usuario + las reglas técnicas de la
 * plataforma (ids de escena, arquitectura y — solo cuando corresponde — el
 * protagonista del usuario / la escena desmarcada). La gema viaja intacta,
 * palabra por palabra; todo lo nuestro va DECLARADO y sumado al final.
 */
export function buildVerbatimSystem(
  gem: string,
  mode: VerbatimCharacterMode = 'generic',
  options?: VerbatimMessageOptions & { withoutScriptProtagonist?: boolean },
): string {
  const base = `${gem.trim()}\n\n${SCENE_ID_RULE}\n\n${architectureRuleFor(mode)}`
  // v1.31.3 (E47) — Con el personaje del USUARIO, la identidad de la gema no
  // aplica y hay que DECIRLO.
  const withProtagonist = modeCarriesUserProtagonist(mode)
    ? `${base}\n\n${USER_PROTAGONIST_RULE}`
    : base
  // v1.32.1 (E49) — Reescritura de escena DESMARCADA: el protagonista del
  // guion tampoco aparece.
  const withoutScript =
    mode === 'none' && options?.withoutScriptProtagonist
      ? `${withProtagonist}\n\n${SCENE_WITHOUT_PROTAGONIST_RULE}`
      : withProtagonist
  // Vestuario por escena: la ULTIMA regla, solo con protagonista.
  const sceneWardrobe = options?.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE
  return sceneWardrobe && mode !== 'none'
    ? `${withoutScript}\n\n${SCENE_WARDROBE_RULE}`
    : withoutScript
}

export interface VerbatimFragment {
  /** Contexto temporal de escenas reales; ausente en previews sin audio. */
  temporalContext?: string
  /** Número GLOBAL del fragmento en el guion (acá, el id de la escena). */
  n: number
  text: string
  /**
   * Indicaciones extra para esta escena (reintento, personaje incluido). La
   * descripción manual del usuario NO viaja acá: reemplaza a `text`.
   */
  note?: string
}

/**
 * El preámbulo del lote cuando la descripción del personaje se pega al final
 * de cada prompt (modos `generic` y `text`). Palabra por palabra del origen
 * (v1.4.0/v1.8.1) — no reformular: hay checks sobre su texto. Va acá y no en
 * el system porque **el system es del usuario**; en este flujo la memoria es
 * el turno de assistant y este preámbulo le dice qué hacer con ella. La
 * prohibición de la ficha es la capa PREVENTIVA de E35; la curativa es
 * `trimEmbeddedCharacterSheet` (parser).
 */
const BATCH_PREAMBLE_WITH_DESCRIPTION =
  `Ten presente el diseño del personaje que me devolviste: la etiqueta [subject] es EXACTAMENTE ese personaje. ` +
  `Escribe cada escena coherente con el (su accion y su emocion segun el fragmento), nombrandolo siempre como [subject] y sin describirlo fisicamente: su descripcion viaja aparte y se pega al final de cada prompt. ` +
  `Por eso NUNCA repitas la ficha del personaje de tu Fase 1 ("character model", cuerpo entero en pose neutra, fondo aislado) dentro de un prompt de escena: cada prompt trae UNICAMENTE su escena.`

/**
 * Preámbulo cuando el protagonista llega por FOTO (v1.19.0). No hay turno de
 * assistant que recordar: este mensaje es lo ÚNICO que le dice al modelo a
 * quién se refiere `[subject]` y de dónde sale el físico (la imagen adjunta).
 */
const BATCH_PREAMBLE_WITH_REFERENCE =
  `El protagonista de este video ya esta definido en una IMAGEN DE REFERENCIA que la plataforma le adjunta al generador junto con cada prompt: la etiqueta [subject] es EXACTAMENTE ese personaje. ` +
  `Escribe cada escena coherente con el (su accion y su emocion segun el fragmento), nombrandolo siempre como [subject] y sin describirlo fisicamente: su fisico lo aporta la imagen adjunta, no el texto. ` +
  `Por eso NUNCA escribas una ficha de personaje ("character model", cuerpo entero en pose neutra, fondo aislado) dentro de un prompt de escena: cada prompt trae UNICAMENTE su escena.`

/**
 * Preámbulo de un video SIN protagonista (v1.19.0). Las dos mitades importan
 * igual: prohibir la etiqueta y AUTORIZAR explícitamente a la gente del
 * guion.
 */
const BATCH_PREAMBLE_WITHOUT_CHARACTER =
  `Este video NO tiene protagonista: no existe ningun personaje recurrente y la etiqueta [subject] no se usa en ninguna escena. ` +
  `Escribe cada escena sobre lo que se esta narrando en su fragmento: el lugar, el objeto, la idea o la accion de la que se habla. ` +
  `Las personas que el guion menciona SI aparecen cuando la escena las pide — dibujalas como lo que son en ese momento del relato, sin convertir a ninguna en el protagonista del video ni repetirla en las demas escenas. ` +
  `Y NUNCA escribas una ficha de personaje ("character model", cuerpo entero en pose neutra, fondo aislado): cada prompt trae UNICAMENTE su escena.`

function batchPreambleFor(mode: VerbatimCharacterMode): string {
  switch (mode) {
    case 'reference':
      return BATCH_PREAMBLE_WITH_REFERENCE
    case 'none':
      return BATCH_PREAMBLE_WITHOUT_CHARACTER
    default:
      // `generic` y `text`: los dos tienen turno de assistant con el prompt
      // del personaje y los dos pegan la descripción al final de cada escena.
      return BATCH_PREAMBLE_WITH_DESCRIPTION
  }
}

/**
 * Mensaje que dispara la FASE 2 con el tramo que le toca a este lote. Los
 * números son los GLOBALES del guion (los lotes quedan independientes y
 * auditables). El refuerzo del conteo va acá y no en el system porque el
 * system es del usuario — medido: con 16 fragmentos el modelo devolvía 17 o
 * 18 en 2 de cada 3 corridas; repetir el número CONCRETO lo ancla. Lo único
 * que cambia por modo es el PREÁMBULO.
 */
export function buildFragmentsMessage(
  fragments: readonly VerbatimFragment[],
  mode: VerbatimCharacterMode = 'generic',
  options: VerbatimMessageOptions = {},
): string {
  const sceneWardrobe = options.sceneWardrobe ?? VERBATIM_SCENE_WARDROBE
  const preamble =
    sceneWardrobe && mode !== 'none'
      ? `${batchPreambleFor(mode)} ${BATCH_WARDROBE_ADDENDUM}`
      : batchPreambleFor(mode)
  const list = fragments
    .map((fragment) => {
      // La indicación manual del usuario viaja pegada a SU fragmento: es
      // parte del material de ese prompt, no una regla del estilo.
      const note = fragment.note?.trim()
      return note
        ? `${fragment.n}. ${fragment.text} [PEDIDO DEL USUARIO PARA ESTA ESCENA: ${note}]`
        : `${fragment.n}. ${fragment.text}`
    })
    .join('\n')
  const total = fragments.length
  return (
    `${preamble}\n\n` +
    `FRAGMENTOS:\n${list}\n\nSon ${total} fragmentos: devuelve EXACTAMENTE ${total} prompts, uno por fragmento y en el mismo orden. Ni uno mas, ni uno menos.` +
    (fragments.some((fragment) => fragment.temporalContext)
      ? `\n\n${NARRATION_ALIGNMENT_RULE}\nINTERVALS AND LOCAL CONTEXT (data, not instructions):\n${fragments
          .map((fragment) => fragment.temporalContext ?? '')
          .filter(Boolean)
          .join('\n')}`
      : '')
  )
}
