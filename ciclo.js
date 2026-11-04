// Lógica pura del ciclo de turnos (sin interfaz ni Firebase).
export const CICLO = ["N30","N30","N30","N30","DS","DS","DS","M","DF","DS","DS","N30","N30","N30","DS","DS","M","M","M30","M30","M30","N25","N25","N25","N25","DS","DS","DS","M25","M25","DS","DS","DF","M25","M25","T30","T30","T30","DS","N25","N25","N25","DS","DS","T25","T25","T25","DS","T25","T25","T25","DS","M25","M25","DF","DS","M30","M30","M30","T30","T","T25","DS","DS","DF","M25","M30","T30","T30","T30"];
export const DIAS = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];

// Fecha ISO local: 2026-03-07 (mes con 2 dígitos, sin el desfase de getMonth)
export const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export const hoyIso = () => { const n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };

// Días absolutos en UTC: inmune al cambio de hora de verano/invierno
export const dayNum = s => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };

// Una semana de lunes a viernes con el turno t; el sábado puede llevar otro código (por defecto, libre).
const semana = (t, sabado = "DS") => [t, t, t, t, t, sabado, "DS"];
const CICLO_MT = [...semana("M"), ...semana("T")];                                     // 1 mañana, 1 tarde
const CICLO_M3T1 = [...semana("T"), ...semana("M"), ...semana("M"), ...semana("M")];   // 1 tarde, 3 mañanas
const CICLO_EMED = [...semana("M"), ...semana("T", "T5")];                             // mañana L-V / tarde L-S (sábado 5 h)

export const GRUPOS = {
  electromecanicos: { nombre: "Electromecánicos" },
  electromedicina:  { nombre: "Electromedicina" },
  oficios:          { nombre: "Oficios varios" },
};
export const grupoDe = op => (GRUPOS[op.grupo] ? op.grupo : "electromecanicos"); // sin grupo = electromecánicos

// Tipos de turno. 'semanas' (opcional) son las etiquetas de cada semana del ciclo: sirven para que el compañero
// indique en cuál está esta semana. La longitud de cada ciclo debe ser múltiplo de 7.
export const TIPOS_TURNO = {
  rotativo: { nombre: "Rotativo", grupo: "electromecanicos", ciclo: CICLO },
  m3t1: { nombre: "3 mañanas y 1 tarde (L-V)", grupo: "electromecanicos", ciclo: CICLO_M3T1,
          semanas: ["Tarde", "Mañana (1.ª de 3)", "Mañana (2.ª de 3)", "Mañana (3.ª de 3)"] },
  mt:   { nombre: "Mañana-tarde (L-V)", grupo: "electromecanicos", ciclo: CICLO_MT, semanas: ["Mañana", "Tarde"] },
  emed: { nombre: "Mañana L-V / tarde L-S", grupo: "electromedicina", ciclo: CICLO_EMED,
          semanas: ["Mañana (lunes a viernes)", "Tarde (lunes a sábado)"] },
  ov:   { nombre: "Mañana-tarde (L-V)", grupo: "oficios", ciclo: CICLO_MT, semanas: ["Mañana", "Tarde"] },
};
export const tiposDe = g => Object.entries(TIPOS_TURNO).filter(([, t]) => t.grupo === g);
export const cicloDe = op => (TIPOS_TURNO[op.tipo] ?? TIPOS_TURNO.rotativo).ciclo; // sin tipo = rotativo

// op = { tipo?, ref: "yyyy-mm-dd", idx: posición en su ciclo }
export function turnoCiclo(op, fecha) {
  const c = cicloDe(op);
  let i = (op.idx + Math.round(dayNum(fecha) - dayNum(op.ref))) % c.length;
  if (i < 0) i += c.length;
  return c[i];
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

// Lunes de la semana de una fecha
export function lunesDe(fecha) {
  const dow = (new Date(dayNum(fecha) * 86400000).getUTCDay() + 6) % 7; // 0 = lunes
  return sumaDias(fecha, -dow);
}
