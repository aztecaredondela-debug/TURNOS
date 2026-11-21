// Lógica pura de la pestaña Combustible (sin interfaz): filtros, distancias, colores y frases.
export const COMBUSTIBLES = {
  g95:     { nombre: "Gasolina 95",    frase: "la Gasolina 95 más barata" },
  diesel:  { nombre: "Diésel",         frase: "el Diésel más barato" },
  g98:     { nombre: "Gasolina 98",    frase: "la Gasolina 98 más barata" },
  dieselp: { nombre: "Diésel Premium", frase: "el Diésel Premium más barato" },
};

export const normalizar = t => (t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export const precio3 = p => p.toFixed(3).replace(".", ",");
export const euros2 = x => x.toFixed(2).replace(".", ",");

// Distancia en km entre dos puntos (fórmula de Haversine)
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Gasolineras con ese combustible, ordenadas de más barata a más cara. Con centro, añade la distancia; con radio, filtra.
export function filtrar(estaciones, { combustible, centro = null, radioKm = 0 }) {
  let r = estaciones.filter(e => typeof e[combustible] === "number");
  if (centro) {
    r = r.map(e => ({ ...e, dist: distanciaKm(centro.lat, centro.lon, e.lat, e.lon) }));
    if (radioKm) r = r.filter(e => e.dist <= radioKm);
  }
  return r.sort((a, b) => a[combustible] - b[combustible] || (a.dist ?? 0) - (b.dist ?? 0) || (a.rotulo || "").localeCompare(b.rotulo || "", "es"));
}

// Tercio más barato = verde, tercio medio = naranja, tercio más caro = rojo
export function umbrales(lista, combustible) {
  const p = lista.map(e => e[combustible]).sort((a, b) => a - b);
  if (!p.length) return { p33: 0, p66: 0 };
  return { p33: p[Math.floor((p.length - 1) * 0.33)], p66: p[Math.floor((p.length - 1) * 0.66)] };
}
export const nivel = (precio, u) => (precio <= u.p33 ? "bajo" : precio <= u.p66 ? "medio" : "alto");

// Busca por código postal (5 cifras) o por texto en localidad/municipio, sin distinguir mayúsculas ni tildes
export function buscarLugar(estaciones, texto) {
  const q = normalizar(texto);
  if (!q) return [];
  if (/^\d{5}$/.test(q)) return estaciones.filter(e => e.cp === q);
  return estaciones.filter(e => normalizar(e.localidad).includes(q) || normalizar(e.municipio).includes(q));
}
export const centroide = lista => ({
  lat: lista.reduce((s, e) => s + e.lat, 0) / lista.length,
  lon: lista.reduce((s, e) => s + e.lon, 0) / lista.length,
});

// "Una de las gasolineras con la Gasolina 95 más barata en la zona es ..., ahorras X € al repostar 50 litros frente a la más cara."
// La lista debe venir ordenada de menor a mayor precio. Las de venta restringida no cuentan para la frase.
export function titular(lista, combustible, zona) {
  const publicas = lista.filter(e => !e.restringida);
  if (!publicas.length) return "";
  const barata = publicas[0], cara = publicas[publicas.length - 1];
  let t = `Una de las gasolineras con ${COMBUSTIBLES[combustible].frase} ${zona} es ${barata.rotulo || "una gasolinera"}, ${barata.direccion} (${barata.localidad}) (${precio3(barata[combustible])} €/l)`;
  const ahorro = (cara[combustible] - barata[combustible]) * 50;
  return t + (ahorro >= 0.005 ? `; ahorras ${euros2(ahorro)} € al repostar 50 litros frente a la más cara.` : ".");
}

// Fecha del Ministerio: "21/11/2026 11:30:12"
export function parseFecha(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/.exec(s ?? "");
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]) : null;
}
export function fechaCorta(s) {
  const m = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/.exec(s ?? "");
  return m ? `${m[1]} - ${m[2]}` : (s ?? "—");
}
export const horasDesde = (fecha, ahora = new Date()) => (fecha ? (ahora - fecha) / 36e5 : null);
