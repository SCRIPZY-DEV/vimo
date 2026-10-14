// Dónde vive el menú de eliminar un avatar (`AvatarDeleteMenu`): en una
// tarjeta de «Mis avatares» (`stock`: el botón arriba a la izquierda de la
// imagen, que aparece con el mouse o el foco), en una tarjeta de la biblioteca
// (`library`: el botón en la fila del nombre) o en el panel de un avatar
// (`panel`: el botón con su texto y las opciones debajo). En las dos tarjetas
// las opciones cubren la imagen.
export type AvatarDeleteMenuVariant = 'stock' | 'library' | 'panel'
