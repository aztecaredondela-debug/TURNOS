import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, push, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";
import { CICLO, DIAS, iso, hoyIso, turnoCiclo, esLibre, tipoTurno, trabaja, rango, dayNum } from "./ciclo.js";

// Si cualquier guardado falla (reglas, conexión...), se avisa en pantalla en vez de fallar en silencio
window.addEventListener("unhandledrejection", e => alert("No se pudo guardar: " + (e.reason?.message || e.reason)));

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = id => document.getElementById(id);

// Crea elementos con textContent/append: el texto de otros usuarios nunca se interpreta como HTML
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

let ops = {}, notas = {}, cambios = {}, sols = {}, ausencias = {};
let me = localStorage.getItem("turnos_me");
let view = new Date(), tab = "cal", modalFecha = null;

const nom = id => ops[id]?.nombre ?? "?";
// Prioridad: ausencia > cambio de turno > ciclo
const turnoEf = (id, f) => ausencias[f]?.[id] ?? cambios[f]?.[id] ?? turnoCiclo(ops[id], f);
const etiq = t => ({ V: "VAC", B: "BAJA" })[t] ?? t;
const fmt = f => new Date(f + "T00:00").toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
const claseTurno = t => ({ libre: "libre-shift", m: "m-shift", t: "t-shift", n: "n-shift", aus: "aus-shift" })[tipoTurno(t)];

async function hashPin(pin, salt) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}

/* ---------- Acceso ---------- */
const NUEVO = "__nuevo";
const dNoms = DIAS;
for (let i = 0; i < CICLO.length; i++) $("turnoBase").add(new Option(`S${Math.floor(i / 7) + 1} - ${dNoms[i % 7]} (${CICLO[i]})`, i));
$("fechaBase").value = hoyIso();

function pintarSelectorOperarios() {
  const sel = $("selOp"), actual = sel.value;
  sel.innerHTML = "";
  Object.entries(ops).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"))
    .forEach(([id, o]) => sel.add(new Option(o.nombre, id)));
  sel.add(new Option("➕ Soy nuevo", NUEVO));
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
  $("nuevoArea").hidden = sel.value !== NUEVO;
}
$("selOp").onchange = () => { $("nuevoArea").hidden = $("selOp").value !== NUEVO; };

$("btnEntrar").onclick = async () => {
  const msg = $("loginMsg"); msg.textContent = "";
  const pin = $("pin").value;
  if (!/^\d{4}$/.test(pin)) { msg.textContent = "El PIN son 4 cifras."; return; }
  let id = $("selOp").value;
  try {
    if (id === NUEVO) {
      const nombre = $("nuevoNombre").value.trim();
      if (!nombre) { msg.textContent = "Escribe tu nombre."; return; }
      if (!$("fechaBase").value) { msg.textContent = "Indica la fecha de referencia."; return; }
      id = push(ref(db, "operarios")).key;
      await set(ref(db, "operarios/" + id), {
        nombre, ref: $("fechaBase").value, idx: parseInt($("turnoBase").value), pinHash: await hashPin(pin, id)
      });
    } else if (ops[id].pinHash !== await hashPin(pin, id)) {
      msg.textContent = "PIN incorrecto."; return;
    }
  } catch (e) { msg.textContent = "No se pudo guardar: " + e.message; return; }
  entrar(id);
};

function entrar(id) {
  me = id; localStorage.setItem("turnos_me", id);
  $("pin").value = "";
  $("loginArea").hidden = true; $("mainArea").hidden = false;
  $("quien").textContent = nom(id);
  render();
}
$("btnSalir").onclick = () => { localStorage.removeItem("turnos_me"); location.reload(); };

/* ---------- Pestañas y navegación ---------- */
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
  $("viewCal").hidden = tab !== "cal"; $("viewSol").hidden = tab !== "sol"; $("viewAus").hidden = tab !== "aus"; $("viewEq").hidden = tab !== "eq";
});
$("prev").onclick = () => { view.setDate(1); view.setMonth(view.getMonth() - 1); render(); };
$("next").onclick = () => { view.setDate(1); view.setMonth(view.getMonth() + 1); render(); };

/* ---------- Calendario ---------- */
function solsAbiertas() {
  const hoy = hoyIso();
  return Object.entries(sols).filter(([, s]) => s.estado === "abierta" && s.fecha >= hoy).sort((a, b) => a[1].fecha.localeCompare(b[1].fecha));
}

function renderCal() {
  const grid = $("grid"); grid.innerHTML = "";
  const m = view.getMonth(), a = view.getFullYear(), hoy = hoyIso();
  $("monthLabel").textContent = view.toLocaleString("es", { month: "long", year: "numeric" });
  DIAS.forEach(d => grid.append(h("div", { class: "day-name" }, d)));
  const primer = (new Date(a, m, 1).getDay() + 6) % 7;
  for (let i = 0; i < primer; i++) grid.append(h("div"));
  const abiertas = new Set(solsAbiertas().map(([, s]) => s.fecha));
  for (let d = 1; d <= new Date(a, m + 1, 0).getDate(); d++) {
    const f = iso(a, m, d), t = turnoEf(me, f);
    const hayNota = notas[f] && Object.keys(notas[f]).length;
    const cell = h("button", { class: `day-cell ${claseTurno(t)}${f === hoy ? " today" : ""}`, onclick: () => abrirDia(f) },
      h("span", {}, String(d)), h("b", {}, etiq(t)),
      h("div", { class: "icons" }, (hayNota ? "🔔" : "") + (abiertas.has(f) ? "🔄" : "") + (cambios[f]?.[me] && !ausencias[f]?.[me] ? "↔️" : "")));
    grid.append(cell);
  }
}

/* ---------- Modal del día ---------- */
function abrirDia(f) { modalFecha = f; renderModal(); $("modal").hidden = false; }
const cerrar = () => { $("modal").hidden = true; modalFecha = null; };
$("modal").onclick = e => { if (e.target === $("modal")) cerrar(); };

function renderModal() {
  const f = modalFecha, body = $("modalBody"); body.innerHTML = "";
  const mio = turnoEf(me, f);
  body.append(h("h3", {}, fmt(f)), h("div", { class: "grupo" }, `Tu turno: `, h("b", {}, etiq(mio))));

  const g = { m: [], t: [], n: [], libre: [], aus: [] };
  Object.keys(ops).sort((x, y) => nom(x).localeCompare(nom(y), "es")).forEach(id => {
    const t = turnoEf(id, f), k = tipoTurno(t);
    g[k].push(k === "aus" ? `${nom(id)} (${t === "V" ? "vacaciones" : "baja"})` : nom(id) + (cambios[f]?.[id] ? " ↔️" : ""));
  });
  [["m", "Mañana"], ["t", "Tarde"], ["n", "Noche"], ["libre", "Libres"], ["aus", "Ausentes"]].forEach(([k, titulo]) =>
    body.append(h("div", { class: `grupo ${k}` }, h("b", {}, titulo), g[k].length ? g[k].join(", ") : "—")));

  Object.entries(notas[f] || {}).forEach(([id, txt]) => body.append(h("div", { class: "nota" }, `🔔 ${nom(id)}: ${txt}`)));

  for (const s of Object.values(sols)) {
    if (s.estado !== "cerrada" || !s.aceptada) continue;
    const dev = s.ofertas?.[s.aceptada]?.dev;
    if (s.fecha === f) body.append(h("div", { class: "cambio" }, `↔️ ${nom(s.solicitante)} cede su día a ${nom(s.aceptada)}`));
    if (dev === f) body.append(h("div", { class: "cambio" }, `↔️ ${nom(s.aceptada)} cede su día a ${nom(s.solicitante)}`));
  }

  const ta = h("textarea", { placeholder: "Ej: no vengo, médico, vacaciones...", maxlength: "200" });
  ta.value = notas[f]?.[me] ?? "";
  body.append(h("label", { style: "margin-top:12px" }, "Tu nota"), ta);

  const row = h("div", { class: "row" },
    h("button", { class: "ok", onclick: async () => { await set(ref(db, `notas/${f}/${me}`), ta.value.trim() || null); cerrar(); } }, "Guardar nota"));
  if (trabaja(mio)) {
    const ya = solsAbiertas().some(([, s]) => s.fecha === f && s.solicitante === me);
    row.append(h("button", { class: "warn", onclick: async () => { await crearSolicitud(f); cerrar(); }, ...(ya ? { disabled: "" } : {}) }, ya ? "Ya pedido" : "Pedir cambio"));
  }
  body.append(row);
  const hay = solsAbiertas().filter(([, s]) => s.fecha === f).length;
  if (hay) body.append(h("div", { class: "row" }, h("button", { class: "sec", onclick: () => { cerrar(); document.querySelector('[data-tab="sol"]').click(); } }, `Ver ${hay} solicitud${hay > 1 ? "es" : ""} abierta${hay > 1 ? "s" : ""}`)));
  body.append(h("div", { class: "row" }, h("button", { class: "sec", onclick: cerrar }, "Cerrar")));
}

/* ---------- Solicitudes ---------- */
const crearSolicitud = f => push(ref(db, "solicitudes"), { fecha: f, solicitante: me, estado: "abierta", creado: Date.now() });

function renderSol() {
  const cont = $("viewSol"); cont.innerHTML = "";
  const lista = solsAbiertas();
  $("badge").textContent = lista.filter(([, s]) => s.solicitante !== me).length || "";
  if (!lista.length) { cont.append(h("div", { class: "vacio" }, "No hay solicitudes abiertas. Pulsa un día de tu calendario para pedir un cambio.")); return; }

  for (const [sid, s] of lista) {
    const mia = s.solicitante === me;
    const card = h("div", { class: `sol${mia ? " mia" : ""}` },
      h("b", {}, `${fmt(s.fecha)} · ${nom(s.solicitante)}`), ` (${turnoEf(s.solicitante, s.fecha)})`);
    if (mia) {
      const ofs = Object.entries(s.ofertas || {});
      if (!ofs.length) card.append(h("small", {}, "Aún sin ofertas."));
      ofs.forEach(([oid, o]) => card.append(h("div", { class: "row" },
        h("small", { style: "flex:2;margin:0;align-self:center;color:#ddd" }, `${nom(oid)} se ofrece` + (o.dev ? ` y te devuelve el ${fmt(o.dev)}` : " (sin devolución)")),
        h("button", { class: "ok", onclick: () => aceptar(sid, oid) }, "Aceptar"))));
      card.append(h("div", { class: "row" }, h("button", { class: "bad", onclick: () => update(ref(db, "solicitudes/" + sid), { estado: "cancelada" }) }, "Cancelar solicitud")));
    } else if (s.ofertas?.[me]) {
      card.append(h("small", {}, "Te has ofrecido. Esperando respuesta."),
        h("div", { class: "row" }, h("button", { class: "sec", onclick: () => set(ref(db, `solicitudes/${sid}/ofertas/${me}`), null) }, "Retirar oferta")));
    } else if (esLibre(turnoEf(me, s.fecha))) {
      const dev = h("input", { type: "date", min: hoyIso() });
      card.append(h("small", {}, "Devolución opcional: un día tuyo de trabajo que él/ella cubriría"), dev,
        h("div", { class: "row" }, h("button", { class: "ok", onclick: () => ofrecer(sid, s, dev.value) }, "Me ofrezco")));
    } else {
      card.append(h("small", {}, `No puedes cubrirlo: ese día no libras (${etiq(turnoEf(me, s.fecha))}).`));
    }
    cont.append(card);
  }
}

async function ofrecer(sid, s, dev) {
  if (dev) {
    if (!trabaja(turnoEf(me, dev))) return alert("Ese día no trabajas: no hay nada que devolver.");
    if (!esLibre(turnoEf(s.solicitante, dev))) return alert(`${nom(s.solicitante)} trabaja ese día y no puede cubrirte.`);
  }
  await set(ref(db, `solicitudes/${sid}/ofertas/${me}`), dev ? { t: Date.now(), dev } : { t: Date.now() });
}

async function aceptar(sid, oid) {
  const s = sols[sid], dev = s.ofertas[oid].dev, D = s.fecha;
  // Se revalida con el estado actual por si los turnos cambiaron desde la oferta
  if (!esLibre(turnoEf(oid, D))) return alert(`${nom(oid)} ya no libra ese día.`);
  if (dev && (!trabaja(turnoEf(oid, dev)) || !esLibre(turnoEf(me, dev)))) return alert("La devolución ya no es válida.");
  const turnoA = turnoEf(me, D), turnoDev = dev ? turnoEf(oid, dev) : null;
  // La transacción evita aceptar dos veces la misma solicitud
  const r = await runTransaction(ref(db, `solicitudes/${sid}/estado`), cur => cur === "abierta" ? "cerrada" : undefined);
  if (!r.committed) return alert("Esta solicitud ya no está abierta.");
  const up = { [`cambios/${D}/${me}`]: "LC", [`cambios/${D}/${oid}`]: turnoA, [`solicitudes/${sid}/aceptada`]: oid };
  if (dev) { up[`cambios/${dev}/${oid}`] = "LC"; up[`cambios/${dev}/${me}`] = turnoDev; }
  await update(ref(db), up);
}

/* ---------- Ausencias (vacaciones y bajas) ---------- */
$("ausDesde").value = $("ausHasta").value = hoyIso();
$("btnAus").onclick = async () => {
  const d1 = $("ausDesde").value, d2 = $("ausHasta").value;
  if (!d1 || !d2 || d2 < d1) return alert("Revisa las fechas: 'Hasta' no puede ser anterior a 'Desde'.");
  const dias = rango(d1, d2);
  if (dias.length > 120) return alert("Máximo 120 días de una vez. Para una baja larga, registra otra después.");
  const up = {}; dias.forEach(f => { up[`ausencias/${f}/${me}`] = $("ausTipo").value; });
  await update(ref(db), up);
};

function renderAus() {
  const cont = $("listaAus"); cont.innerHTML = "";
  const hoy = hoyIso(), items = [];
  for (const [f, porOp] of Object.entries(ausencias)) for (const [id, t] of Object.entries(porOp)) if (ops[id]) items.push({ f, id, t });
  items.sort((a, b) => a.id.localeCompare(b.id) || a.t.localeCompare(b.t) || a.f.localeCompare(b.f));
  const rangos = [];
  for (const it of items) { // une días seguidos de la misma persona y tipo en un solo tramo
    const u = rangos[rangos.length - 1];
    if (u && u.id === it.id && u.t === it.t && dayNum(it.f) - dayNum(u.hasta) === 1) { u.hasta = it.f; u.dias.push(it.f); }
    else rangos.push({ id: it.id, t: it.t, desde: it.f, hasta: it.f, dias: [it.f] });
  }
  const vivos = rangos.filter(r => r.hasta >= hoy).sort((a, b) => a.desde.localeCompare(b.desde));
  if (!vivos.length) { cont.append(h("div", { class: "vacio" }, "Nadie tiene ausencias registradas.")); return; }
  cont.append(h("label", {}, "Ausencias del equipo"));
  vivos.forEach(r => cont.append(h("div", { class: "sol" + (r.id === me ? " mia" : "") },
    h("b", {}, `${r.t === "V" ? "🏖️" : "🩺"} ${nom(r.id)}`), ` · ${r.t === "V" ? "vacaciones" : "baja"}`,
    h("small", {}, `${fmt(r.desde)} al ${fmt(r.hasta)}`),
    r.id === me ? h("div", { class: "row" }, h("button", { class: "bad", onclick: () => {
      if (!confirm("¿Quitar esta ausencia?")) return;
      const up = {}; r.dias.forEach(f => { up[`ausencias/${f}/${me}`] = null; });
      update(ref(db), up);
    } }, "Quitar")) : null)));
}

/* ---------- Administración del equipo (solo con operarios/{id}/admin = true) ---------- */
function renderEq() {
  const esAdmin = !!ops[me]?.admin;
  $("tabEq").hidden = !esAdmin;
  const cont = $("viewEq"); cont.innerHTML = "";
  if (!esAdmin) { if (tab === "eq") document.querySelector('[data-tab="cal"]').click(); return; }
  cont.append(h("label", {}, `Equipo (${Object.keys(ops).length})`));
  Object.entries(ops).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")).forEach(([id, o]) =>
    cont.append(h("div", { class: "sol eq" }, h("b", {}, o.nombre + (o.admin ? " ★" : "")),
      h("div", { class: "acc" },
        h("button", { class: "sec", onclick: () => editarOp(id), "aria-label": "Editar " + o.nombre }, "✏️"),
        id === me ? null : h("button", { class: "bad", onclick: () => borrarOp(id), "aria-label": "Eliminar " + o.nombre }, "✕")))));
}

function editarOp(id) {
  const o = ops[id], body = $("modalBody"); body.innerHTML = "";
  const nombre = h("input", { value: o.nombre, maxlength: "30" });
  const fr = h("input", { type: "date", value: o.ref });
  const sel = h("select");
  for (let i = 0; i < CICLO.length; i++) sel.add(new Option(`S${Math.floor(i / 7) + 1} - ${DIAS[i % 7]} (${CICLO[i]})`, i));
  sel.value = o.idx;
  const pin = h("input", { type: "password", inputmode: "numeric", maxlength: "4", placeholder: "Vacío = no cambiarlo" });
  body.append(h("h3", {}, "Editar compañero"),
    h("label", {}, "Nombre"), nombre, h("label", {}, "Fecha de referencia"), fr,
    h("label", {}, "Su turno ese día"), sel, h("label", {}, "Nuevo PIN (opcional)"), pin,
    h("div", { class: "row" },
      h("button", { class: "ok", onclick: async () => {
        if (!nombre.value.trim() || !fr.value) return alert("Faltan el nombre o la fecha.");
        if (pin.value && !/^\d{4}$/.test(pin.value)) return alert("El PIN son 4 cifras.");
        const datos = { nombre: nombre.value.trim(), ref: fr.value, idx: parseInt(sel.value) };
        if (pin.value) datos.pinHash = await hashPin(pin.value, id);
        await update(ref(db, "operarios/" + id), datos);
        cerrar();
      } }, "Guardar"),
      h("button", { class: "sec", onclick: cerrar }, "Cancelar")));
  $("modal").hidden = false;
}

async function borrarOp(id) {
  if (!confirm(`¿Eliminar a ${nom(id)}? Se borrarán también sus notas, ausencias, cambios y solicitudes.`)) return;
  const up = { ["operarios/" + id]: null };
  for (const [f, p] of Object.entries(notas)) if (p[id] !== undefined) up[`notas/${f}/${id}`] = null;
  for (const [f, p] of Object.entries(cambios)) if (p[id] !== undefined) up[`cambios/${f}/${id}`] = null;
  for (const [f, p] of Object.entries(ausencias)) if (p[id] !== undefined) up[`ausencias/${f}/${id}`] = null;
  for (const [sid, s] of Object.entries(sols)) {
    if (s.solicitante === id) up[`solicitudes/${sid}`] = null;
    else if (s.ofertas?.[id]) up[`solicitudes/${sid}/ofertas/${id}`] = null;
  }
  await update(ref(db), up);
}

/* ---------- Render global y suscripciones ---------- */
function render() { if (!me || !ops[me]) return; $("quien").textContent = nom(me); renderCal(); renderSol(); renderAus(); renderEq(); }

signInAnonymously(getAuth(app)).then(() => {
  onValue(ref(db, "operarios"), s => {
    ops = s.val() || {}; pintarSelectorOperarios();
    if (me && !ops[me] && !$("mainArea").hidden) { localStorage.removeItem("turnos_me"); alert("Tu usuario ha sido eliminado."); location.reload(); return; }
    if (me && ops[me] && $("mainArea").hidden) entrar(me); else render();
  });
  onValue(ref(db, "notas"), s => { notas = s.val() || {}; render(); });
  onValue(ref(db, "cambios"), s => { cambios = s.val() || {}; render(); });
  onValue(ref(db, "ausencias"), s => { ausencias = s.val() || {}; render(); });
  onValue(ref(db, "solicitudes"), s => { sols = s.val() || {}; render(); });
}).catch(e => { $("loginMsg").textContent = "Error de conexión: " + e.message; });
