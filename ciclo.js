// Lógica pura del ciclo de turnos (sin interfaz ni Firebase).
export const CICLO = ["N30","N30","N30","N30","DS","DS","DS","M","DF","DS","DS","N30","N30","N30","DS","DS","M","M","M30","M30","M30","N25","N25","N25","N25","DS","DS","DS","M25","M25","DS","DS","DF","M25","M25","T30","T30","T30","DS","N25","N25","N25","DS","DS","T25","T25","T25","DS","T25","T25","T25","DS","M25","M25","DF","DS","M30","M30","M30","T30","T","T25","DS","DS","DF","M25","M30","T30","T30","T30"];
export const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

// Fecha ISO local: 2026-03-07 (mes con 2 dígitos, sin el desfase de getMonth)
export const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const hoyIso = () => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };

// Días absolutos en UTC: inmune al cambio de hora de verano/invierno
const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

// op = { ref: "yyyy-mm-dd", idx: 0..69 }
export function turnoCiclo(op, fecha) {
  let i = (op.idx + Math.round(dayNum(fecha) - dayNum(op.ref))) % CICLO.length;
  if (i < 0) i += CICLO.length;
  return CICLO[i];
}
// LC = libre por cambio de turno
export const esLibre = t => t === "DS" || t === "DF" || t === "LC";
export const tipoTurno = t => (esLibre(t) ? "libre" : t[0].toLowerCase()); // m | t | n | libre
