# Fix: `pnpm tauri dev` carga la app aunque `src/` importe valores de `pipeline/`

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

Desde la animación de escenas (PR #91, ya en `dev`), unos 20 archivos de `src/` importan **valores**
de `pipeline/` con el alias `@pipeline`. Por ejemplo, `sceneAnimationBlocks` en
`src/modules/videos/utilities/animationClips.ts`, el planificador en `resumableAnimationIntervals.ts`
y constantes de `pipeline/types/video-provider.ts`.

- **En el build de producción (`vite build`)** esos imports se resuelven por los `paths` de
  `tsconfig.app.json`, y los módulos de `pipeline/` quedan dentro del bundle de la app.
- **En el servidor de dev,** `vite.config.ts` solo define el alias `@`. Vite responde «Failed to
  resolve import "@pipeline/…"».

Como el router importa todas las vistas sin carga diferida, con `pnpm tauri dev` no cargaba la app
entera. Se reprodujo el 2026-10-02 en el log de `pnpm tauri dev`.

## Corrección

`vite.config.ts` suma el alias `@pipeline` → `./pipeline`: el servidor de dev resuelve igual que el
build. No cambia qué se empaqueta en producción.

## Límites deliberados

- No se tocaron los imports del PR #91. La ADR-0010 dice que `src/` solo importa tipos de
  `pipeline/` y que un import sin `type` es una regresión. Esa regresión ya estaba en `dev` y en
  producción. Lo que falta decidir con el dueño, y queda anotado en la ADR-0010:
  - aceptar la excepción para el código puro compartido;
  - o mover ese código a un lugar compartido y volver a `import type`.
- El arreglo correspondería a `dev`. Va en esta rama porque es donde el dueño prueba.

## Validación reproducible

```bash
pnpm dev --port 5199 --strictPort &
for m in src/modules/videos/utilities/animationClips.ts \
         src/modules/videos/utilities/resumableAnimationIntervals.ts \
         src/modules/videos/hooks/useCreateTask.ts src/main.tsx; do
  curl -s -o /dev/null -w "%{http_code} $m\n" "http://localhost:5199/$m"   # 200 en todos
done
pnpm build && pnpm lint
```

Sin el alias, los mismos pedidos daban 500 y el log mostraba «Failed to resolve import».

## Pruebas manuales

2026-10-02: `pnpm tauri dev` compiló, abrió la app y el log de Vite quedó sin errores de resolución.
La pantalla de inicio de sesión cargó y respondió a cambios en caliente.
