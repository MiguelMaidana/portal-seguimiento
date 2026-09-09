export function env(nombre: string): string {
  const valor = process.env[nombre]?.trim();
  if (!valor) throw new Error(`Falta configurar ${nombre}.`);
  return valor;
}
