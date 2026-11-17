// Limpieza de texto copiado desde WhatsApp (pura, sin interfaz).
// Al copiar mensajes, WhatsApp añade delante de cada uno la hora, la fecha y el nombre: "[10:15, 12/3/2026] Santos: texto"
// o "12/3/26, 10:15 - Santos: texto". Esta función quita ese prefijo y deja solo el texto.
const FECHA = String.raw`\d{1,2}[/.]\d{1,2}[/.]\d{2,4}`;
const HORA = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?`;
const PREFIJOS = [
  new RegExp(String.raw`^\[${HORA},\s*${FECHA}\]\s*[^:\n]{1,40}:\s?`, "i"),             // [10:15, 12/3/2026] Nombre:
  new RegExp(String.raw`^\[?${FECHA},?\s+${HORA}\]?\s*[-–]?\s*[^:\n]{1,40}:\s?`, "i"),   // 12/3/26, 10:15 - Nombre:  |  [12/03/26, 10:15:20] Nombre:
];
const AVISOS = /^<?(multimedia omitido|media omitted|imagen omitida|sticker omitido|audio omitido|video omitido)>?$/i;

export function limpiarWhatsApp(texto) {
  const salida = [];
  for (let linea of texto.replace(/\r/g, "").replace(/[\u200e\u200f\u202a-\u202e]/g, "").split("\n")) {
    for (const p of PREFIJOS) linea = linea.replace(p, "");
    linea = linea.trimEnd();
    if (AVISOS.test(linea.trim())) continue;
    salida.push(linea);
  }
  return salida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
