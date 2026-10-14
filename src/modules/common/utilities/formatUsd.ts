// Monto en dólares con el formato del idioma indicado: «3,68 US$» en es,
// «$3.68» en en y «US$ 3,68» en pt. El idioma lo pone quien llama (el activo de
// i18next), así el monto cambia de formato junto con los textos.
export function formatUsd(amount: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}
