> Continuidad 2026-09-19: el ID estable y el canje automático ya están implementados.
> Para resolver perfiles que no aparecen en «Vincular otra cuenta», seguir
> [el nuevo prompt de descubrimiento](../2026-09-19-flow-audit/prompt-extension.md).
> No volver a crear identidades ni reemplazar credenciales para repetir el bootstrap.

# Prompt para la sesión de la extensión

> **Actualización 2026-09-17:** la extensión ya entregó0.2.9 (`664909d`).
> Identidad pública y canje verificados; no repetir su preparación.
> [Revisión vigente y pendiente de traspaso a Vimo](review-extension-0.2.9.md).
> El prompt de abajo se conserva como antecedente de la solicitud.

La integración nativa ya está implementada en Vimo, rama
`feat/extension-vimo-automater`. No modificar el repositorio de Vimo desde esta
sesión. La aceptación conjunta con el coordinador empaquetado de Vimo sigue pendiente.

```text
Necesito cerrar la compatibilidad de vimo-automate con la integración nativa de
Vimo. Revisa AGENTS, el contexto del vault y los cambios actuales antes de editar.

1. Conserva una identidad Chrome estable mediante manifest.key público. Vimo ya
   verificó y fijó el ID bjpjjnjiikhccbjlkgmfpfhenbdpikbm, derivado del SPKI público
   SHA-256 19f99d988a72219ba6c5f574d13f8a1c82bc1703026291f46b5e46c92d036d7e.
   Confirma que la versión final empaquetada mantiene exactamente ese ID.
   No compartas ni generes una clave privada para entregarla a Vimo.
2. Comprueba discovery.link y el canje automático sin copiar tokens. El anuncio
   debe requerir presencia explícita del panel e identidad Chrome/Flow coherente.
   auth.pair debe revalidar que la identidad actual sigue verificada y coincide
   con la identidad anunciada. Rechaza orígenes ajenos y anuncios vencidos.
3. Protege la credencial en contextos confiables de la extensión. Ningún token,
   código de emparejamiento, cookie ni secreto de Google en logs, URLs o capturas.
4. Vimo empaqueta su propio coordinador: antes de probar, comprueba que no haya
   trabajos activos en el puente independiente. No mates ese puente ni recargues
   perfiles con trabajos activos. Un único propietario puede usar el puerto43127.
5. Valida el paquete final en tres perfiles aislados con proveedor simulado:
   descubrimiento, vinculación automática, identidad distinta, reconexión,
   revocación, cambio de identidad entre anuncio y canje y rechazo de un origen
   no autorizado. No generes imágenes reales ni realices benchmarks sin una
   autorización expresa para ese lote.
6. Mantén el contrato de IDs/recibos, capacidad mínima de tres cuentas, pausa,
   cancelación, recuperación de descargas y reintento RPC13 confirmado. Si cambia
   algo incompatible, descríbelo; no inventes una API nativa de proyectos.
7. Entrega versión final, commit local, ruta del paquete, ID público y resultados
   de las pruebas. No hagas push, PR ni publicación sin autorización nueva.

No necesito un backend cloud para esta integración. La comunicación es local
entre Vimo y la extensión, y la sesión Google permanece en Chrome.
```

La copia del coordinador en Vimo parte de 0.2.7 con adaptación documentada de la
comprobación de identidad al canjear. La revisión posterior confirmó equivalencia del coordinador con0.2.9; quedan
separadas la validación del paquete y la conexión real con Vimo.
