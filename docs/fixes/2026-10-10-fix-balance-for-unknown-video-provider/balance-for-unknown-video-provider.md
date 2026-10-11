# Fix: el saldo de animación de un proveedor sin rama propia ya no lee el de Kie

- 📅 **Fecha:** 2026-10-10
- 🌿 **Rama:** `feat/edicion-avatar-ia`
- **Área:** `balanceFor` (`src/modules/common/utilities/creditsBalance.ts`), el pre-check de saldo de
  Crear y el aviso de «sin saldo».
- **Relacionado:** [ADR-0047](../../adr/ADR-0047-animacion-de-escenas-el-clip-canjea-huecos.md) (los dos
  proveedores de animación), [ADR-0057](../../adr/ADR-0057-escenas-de-avatar-con-heygen-sobre-la-narracion.md)
  (el dominio `avatar`, que llegó en el mismo cambio) y la spec del avatar
  (`docs/handoff/2026-10-09-avatar-heygen/design.md` §9).

## Causa

`balanceFor` (`src/modules/common/utilities/creditsBalance.ts`) resolvía el saldo del dominio
`animation` con `providerId === 'poyo' ? poyo : kie`: cualquier otro proveedor leía el saldo de
Kie.ai. Hoy no se nota (solo existen Kie y PoYo), pero la spec del avatar
(`docs/handoff/2026-10-09-avatar-heygen/design.md` §9) lo marca como bug latente: un proveedor
nuevo se compararía contra la billetera equivocada y podría frenar, o dejar pasar, una generación
por un saldo ajeno.

## Corrección

La rama de animación lee el saldo solo de `kie` y de `poyo`; cualquier otro proveedor sale como
saldo ilegible (avisa, no bloquea). El avatar presentador tiene su dominio y su rama propios
(`avatar` / `heygen`, en dólares), en el mismo cambio.

## Límites deliberados

Los dominios de imagen y música siguen con su regla de siempre (`evolink` o Fal): no hay un tercer
proveedor de imágenes y cambiarla no era parte de este arreglo.

## Validación reproducible

`node --test scripts/test/check-app-avatar-create.mjs`: el test «un proveedor de animación sin rama
propia no lee el saldo de Kie» pasa. Para ver que muerde, devolver la rama a
`providerId === 'poyo' ? balances.video?.poyo : balances.video?.kie`: falla con `500 !== null`.

## Pruebas manuales

No aplica: con Kie y PoYo, los únicos proveedores de animación, la persona ve lo mismo que antes.
