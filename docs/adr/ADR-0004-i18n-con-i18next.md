# ADR-0004 — i18n con i18next y catálogos JSON por idioma

- **Estado:** Aceptada (reemplaza la decisión de i18n de ADR-0003)
- **Fecha:** 2026-08-12
- **Área:** app

## Problema

ADR-0003 adoptó un sistema de i18n propio (`defineMessages` + `useTranslations`
tipados, textos colocalizados en cada `.tsx`). Al empezar a usarlo aparecieron dos
fricciones de experiencia de desarrollo:

- El bloque `messages` con 3 idiomas al final de cada componente engorda los archivos
  y mezcla copy con lógica; editar textos obliga a tocar componentes.
- El sistema propio había que mantenerlo y extenderlo (plurales, formatos), reinventando
  lo que una librería estándar ya resuelve y documenta.

Restricciones: 3 idiomas (es/en/pt), interpolación, detección del idioma del sistema,
persistencia de la elección, y `<html lang>` sincronizado.

## Decisión

Usar **i18next** con `react-i18next`, `i18next-http-backend` (catálogos servidos desde
`public/locales/{es,en,pt}.json`) y `i18next-browser-languagedetector`
(localStorage → navigator). Configuración única en [src/i18n/index.ts](../../src/i18n/index.ts).

- Claves **agrupadas por prefijo de vista o área** (`login.*`, `layout.sidebar.*`);
  dentro del grupo, planas y nombradas por significado.
- Consumo con `useTranslation()`; idioma activo vía `i18n.resolvedLanguage`; cambio
  con `i18n.changeLanguage` (persiste solo).
- La regla de uso vive en la sección i18n de [CLAUDE.md](../../CLAUDE.md).

## Alternativas consideradas

- **Mantener el sistema propio de ADR-0003** — descartada: la validación tipada en
  build era su gran ventaja, pero el costo de colocalizar 3 idiomas por archivo y
  mantener infraestructura casera pesó más para quien desarrolla a diario.
- **react-intl (FormatJS)** — descartada: exige extracción/compilación de mensajes
  para rendir bien; más tooling para el mismo resultado.
- **Catálogos empaquetados en el bundle (import estático)** — descartada por ahora:
  el backend HTTP permite editar textos sin recompilar. Si el fetch inicial molesta en
  Tauri (archivo local igual), se puede pasar a `resources` embebidos sin tocar las
  claves.

## Consecuencias

- ✅ Librería estándar, documentada, con ecosistema (plurales, contextos, namespaces).
- ✅ El copy vive en 3 archivos JSON editables sin tocar componentes ni recompilar.
- ⚠️ **Se pierde la validación en build**: una clave faltante en un idioma ya no rompe
  `pnpm build` — se renderiza la clave cruda o cae al `fallbackLng` (en). Mitigación
  pendiente: guard que compare las claves de los tres JSON.
- ⚠️ Los catálogos cargan por HTTP al arrancar: la UI se suspende hasta tenerlos.
- 🔒 Ningún texto visible en JSX; los tres catálogos declaran siempre las mismas claves.

## Verificación de cumplimiento

- **Guard manual (candidato a script/CI):** comparar claves de los catálogos —
  `node -e "const l=['es','en','pt'].map(x=>require('./public/locales/'+x+'.json'));..."`
  o revisión de los tres archivos en cada PR que toque textos.
- **Grep:** textos hardcodeados en vistas nuevas → revisar strings literales en JSX
  durante la revisión de PR.
- **Cómo se vería una regresión:** una pantalla muestra una clave cruda
  (`login.boton`) o un texto en inglés dentro de la UI en español (cayó al fallback).

## Referencias

- ADR-0003 (decisión original de i18n propio, reemplazada en ese punto).
- [react.i18next.com](https://react.i18next.com/) — documentación oficial.
