// Lógica pura del ciclo de turnos (sin interfaz ni Firebase).
export const CICLO = ["N30","N30","N30","N30","DS","DS","DS","M","DF","DS","DS","N30","N30","N30","DS","DS","M","M","M30","M30","M30","N25","N25","N25","N25","DS","DS","DS","M25","M25","DS","DS","DF","M25","M25","T30","T30","T30","DS","N25","N25","N25","DS","DS","T25","T25","T25","DS","T25","T25","T25","DS","M25","M25","DF","DS","M30","M30","M30","T30","T","T25","DS","DS","DF","M25","M30","T30","T30","T30"];
export const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

// Fecha ISO local: 2026-03-07 (mes con 2 dígitos, sin el desfase de getMonth)
export const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const hoyIso = () => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };

// Días absolutos en UTC: inmune al cambio de hora de verano/invierno
export const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

// op = { ref: "yyyy-mm-dd", idx: 0..69 }
export function turnoCiclo(op, fecha) {
  let i = (op.idx + Math.round(dayNum(fecha) - dayNum(op.ref))) % CICLO.length;
  if (i < 0) i += CICLO.length;
  return CICLO[i];
}
// LC = libre por cambio de turno
export const esLibre = t => t === "DS" || t === "DF" || t === "LC";
// Tipos de ausencia. Para añadir uno nuevo basta una línea aquí (código de 1 a 3 letras MAYÚSCULAS,
// que no coincida con ningún turno del ciclo).
export const TIPOS_AUS = {
  V:  { nombre: "Vacaciones",             etq: "VAC",  icono: "🏖️" },
  B:  { nombre: "Baja",                   etq: "BAJA", icono: "🩺" },
  LD: { nombre: "Libre disposición",      etq: "LD",   icono: "🗓️" },
  FA: { nombre: "Permiso familiar",       etq: "FAM",  icono: "👪" },
  MA: { nombre: "Maternidad/paternidad",  etq: "MAT",  icono: "👶" },
  OT: { nombre: "Otros permisos",         etq: "PERM", icono: "📋" },
};
export const tipoTurno = t => (TIPOS_AUS[t] ? "aus" : esLibre(t) ? "libre" : t[0].toLowerCase()); // m | t | n | libre | aus
export const trabaja = t => ["m", "t", "n"].includes(tipoTurno(t));

// Lista de fechas ISO entre dos fechas, ambas incluidas
export function rango(desde, hasta) {
  const out = [];
  for (let t = dayNum(desde) * 86400000, fin = dayNum(hasta) * 86400000; t <= fin; t += 86400000) {
    const d = new Date(t);
    out.push(iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return out;
}

// Suma n días (puede ser negativo) a una fecha ISO
export function sumaDias(fecha, n) {
  const d = new Date((dayNum(fecha) + n) * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
