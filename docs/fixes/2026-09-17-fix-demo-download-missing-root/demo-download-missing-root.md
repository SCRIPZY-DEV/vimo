# Fix: la descarga de la demo falla en una máquina sin carpeta raíz

**Fecha:** 2026-09-17 · **Rama:** `fix/demo-mode-for-new-admin`

## Síntoma

Un usuario recién agregado a la sección «demo» del panel admin ve el ítem Demo,
pero al entrar la preparación falla con «No se pudo preparar la demo» y
Reintentar falla igual. A los admins existentes les funciona.

## Causa

`installPack` (`pipeline/commands/demo/demo-prepare.ts`) descarga el zip directo
en la carpeta raíz de proyectos y `downloadFile` abre el destino con
`open(destination, 'w')` sin crear la carpeta padre. La raíz
(`~/Documents/Vimo` por defecto) solo se creaba al crear el primer proyecto
(`create-video-project.ts`) o al tocar la carpeta desde Ajustes; Rust la
resuelve pero no la crea. En una máquina recién instalada, entrar directo a
Demo daba `ENOENT`, que al no ser un `PipelineFailure` llegaba a la UI como
código `unknown`.

No es un problema de permisos: `verificar-acceso` (landing) consulta `admins` y
`demo_accesos` y responde `demo: true` si el email está en cualquiera de las
dos; el cliente solo mira ese booleano. La diferencia observada entre admins y
usuarios demo es indirecta: los admins ya habían usado la app (la carpeta
existía) y los usuarios demo llegan con una instalación limpia.

## Corrección

`installPack` asegura la raíz con `ensureDirectory(projectsRoot)`
(`pipeline/utils/atomic-fs.ts`) antes de limpiar restos y descargar.

## Archivos tocados

- `pipeline/commands/demo/demo-prepare.ts`

## QA

1. Con la app compilada, renombrar la carpeta raíz configurada (por ejemplo
   `~/Documents/Vimo` → `Vimo.bak`) para simular una máquina limpia. Agregar un
   usuario nuevo no alcanza para reproducirlo si la carpeta ya existe.
2. Iniciar sesión con un usuario con acceso demo y entrar a Demo: el pack se
   descarga, se instala y la app navega a Crear con la demo cargada.
3. Restaurar la carpeta original.

## Hallazgos fuera de alcance (repo de la landing)

- La sección demo del panel solo escribe `demo_accesos`: con el gate beta
  activo, un email que no esté en `allowlist_beta` recibe 403 antes de que el
  flag `demo` importe.
- `demo` solo viaja en respuestas autorizadas: un usuario solo-demo pierde el
  modo demo cuando vence su trial.
