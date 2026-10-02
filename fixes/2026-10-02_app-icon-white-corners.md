# Fix: el ícono de la app salía con esquinas blancas y más grande que los demás

- **Fecha:** 2026-10-02
- **Rama:** feat/catalogo-estilos

## Causa

En el Dock de macOS (y en la barra de tareas de Windows) el ícono de Vimo se veía con un borde
blanco en las esquinas y más grande que los íconos vecinos.

- Todos los archivos de `src-tauri/icons/` (`icon.png`, los `NxN.png`, los `Square*Logo.png`,
  `icon.ico` y las diez imágenes dentro de `icon.icns`) tenían las esquinas **opacas y blancas**:
  el cuadrado redondeado azul estaba pintado sobre un fondo blanco, no sobre transparente. Medido
  el 2026-10-02: el píxel `(0, 0)` de cada archivo era `(255, 255, 255, 255)`.
- Además el cuadrado redondeado llenaba el lienzo entero. La plantilla de Apple deja un margen: el
  cuadrado ocupa 824 de 1024 px, centrado, y el resto es transparente. Por eso los demás íconos del
  Dock se ven más chicos y alineados entre sí, y el de Vimo sobresalía.

## Corrección

Se regeneraron todos los íconos de escritorio a partir de la imagen de 1024 px que estaba dentro de
`icon.icns`:

1. Se recuperó la transparencia de las esquinas: en las cuatro esquinas (240 px), cada píxel que
   está en la recta entre el azul `(31, 35, 71)` y el blanco pasa a ser azul con la opacidad que le
   corresponde (así el borde queda suavizado como estaba, sin halo). El logo no se toca: sus
   amarillos y el punto turquesa no están en esa recta ni en las esquinas.
2. **macOS (`icon.icns`):** lienzo de 1024 px transparente con el cuadrado redondeado de 824 px
   centrado (plantilla de Apple), y de ahí las diez medidas del iconset con `iconutil`.
3. **Windows (`icon.ico`, 16/24/32/48/64/256) y los PNG (`icon.png`, `32x32`, `64x64`, `128x128`,
   `128x128@2x`, `Square*Logo`, `StoreLogo`):** el cuadrado redondeado a sangre completa, con las
   esquinas transparentes. Windows y Linux no usan el margen de Apple.

`tauri.conf.json` no cambia: sigue leyendo los mismos archivos. Las carpetas `android/` e `ios/`
no se tocaron (no se compilan).

## Límites deliberados

- No se cambió el dibujo del ícono (la V y el fondo azul son los mismos píxeles). Solo la
  transparencia y el margen.
- No se adoptó el formato de íconos de macOS 26 (Icon Composer, `.icon`): queda como ícono clásico,
  que el sistema sigue mostrando.

## Validación reproducible

```bash
python3 - <<'EOF'
from PIL import Image
for name in ['icon.png', '32x32.png', '128x128@2x.png', 'Square150x150Logo.png', 'StoreLogo.png']:
    im = Image.open(f'src-tauri/icons/{name}').convert('RGBA')
    assert im.getpixel((0, 0))[3] == 0, name          # esquina transparente
    assert im.getpixel((0, im.height // 2))[:3] == (31, 35, 71), name  # borde azul intacto
ico = Image.open('src-tauri/icons/icon.ico')
assert ico.info['sizes'] == {(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (256, 256)}
EOF
iconutil -c iconset src-tauri/icons/icon.icns -o /tmp/vimo-check.iconset && ls /tmp/vimo-check.iconset
# diez archivos, de icon_16x16.png a icon_512x512@2x.png
```

Para volver a generarlos (si cambia el dibujo), el procedimiento de la sección «Corrección» con
Pillow e `iconutil`, partiendo de una imagen de 1024 px con las esquinas transparentes.

## Pruebas manuales

Pendiente del dueño: `pnpm tauri build` y mirar el `.app` en el Dock junto a otros íconos (mismo
tamaño, sin esquinas blancas). En Windows, el `.exe` en la barra de tareas y el Explorador.
