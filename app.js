import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, push, update, onValue, runTransaction, query, limitToLast, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js?v=13";
import { CICLO, DIAS, iso, hoyIso, turnoCiclo, esLibre, tipoTurno, trabaja, rango, dayNum, TIPOS_AUS, sumaDias, TIPOS_TURNO, lunesDe, GRUPOS, grupoDe, tiposDe, cicloDe } from "./ciclo.js?v=13";
import { FESTIVOS } from "./festivos.js?v=13";

const VERSION = 13;

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const $ = id => document.getElementById(id);
$("ver").textContent = "Versión " + VERSION;

// Crea elementos con textContent/append: el texto de otros usuarios nunca se interpreta como HTML
function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v; else if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

let ops = {}, notas = {}, cambios = {}, sols = {}, ausencias = {}, festivosDB = {};
let me = localStorage.getItem("turnos_me");
let view = new Date(), tab = "cal", modalFecha = null;

const nom = id => ops[id]?.nombre ?? "?";
// Prioridad: ausencia > cambio de turno > ciclo
const turnoEf = (id, f) => ausencias[f]?.[id] ?? cambios[f]?.[id] ?? turnoCiclo(ops[id], f);
const etiq = t => TIPOS_AUS[t]?.etq ?? t;
// Festivos: los guardados en Firebase; mientras no haya ninguno, los de festivos.js (2026)
const festEf = () => Object.keys(festivosDB).length ? festivosDB : FESTIVOS;
const festivo = f => festEf()[f] ? (festEf()[f] === "F" ? "Festivo" : "Festivo · " + festEf()[f]) : null;
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
function llenarTipos(sel, grupo) { sel.innerHTML = ""; for (const [k, v] of tiposDe(grupo)) sel.add(new Option(v.nombre, k)); }
function llenarSemanas(sel, tipo) { sel.innerHTML = ""; (TIPOS_TURNO[tipo]?.semanas ?? []).forEach((txt, w) => sel.add(new Option(txt, w * 7))); }
function actualizarAlta() {
  const t = $("tipoTurno").value, semanal = !!TIPOS_TURNO[t]?.semanas;
  $("rotArea").hidden = semanal; $("mtArea").hidden = !semanal;
  if (semanal) llenarSemanas($("mtSemana"), t);
}
for (const [k, v] of Object.entries(GRUPOS)) $("grupoSel").add(new Option(v.nombre, k));
$("grupoSel").onchange = () => { llenarTipos($("tipoTurno"), $("grupoSel").value); actualizarAlta(); };
$("tipoTurno").onchange = actualizarAlta;
$("grupoSel").onchange();

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
      const grupo = $("grupoSel").value, tipo = $("tipoTurno").value, semanal = !!TIPOS_TURNO[tipo]?.semanas;
      if (!semanal && !$("fechaBase").value) { msg.textContent = "Indica la fecha de referencia."; return; }
      id = push(ref(db, "operarios")).key;
      const turno = semanal
        ? { ref: lunesDe(hoyIso()), idx: parseInt($("mtSemana").value) }
        : { ref: $("fechaBase").value, idx: parseInt($("turnoBase").value) };
      await set(ref(db, "operarios/" + id), { nombre, grupo, tipo, ...turno, pinHash: await hashPin(pin, id) });
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
  $("viewCal").hidden = tab !== "cal"; $("viewQuien").hidden = tab !== "quien"; $("viewSol").hidden = tab !== "sol"; $("viewAus").hidden = tab !== "aus"; $("viewEq").hidden = tab !== "eq"; $("viewChat").hidden = tab !== "chat"; $("viewFest").hidden = tab !== "fest";
  if (tab === "chat") { marcarLeido(); renderChat(); $("chatTxt").focus(); }
});
$("prev").onclick = () => { view.setDate(1); view.setMonth(view.getMonth() - 1); render(); };
$("next").onclick = () => { view.setDate(1); view.setMonth(view.getMonth() + 1); render(); };

/* ---------- Calendario ---------- */
function solsAbiertas() {
  const hoy = hoyIso();
  return Object.entries(sols).filter(([, s]) => s.estado === "abierta" && s.fecha >= hoy && ops[s.solicitante] && ops[me] && grupoDe(ops[s.solicitante]) === grupoDe(ops[me])).sort((a, b) => a[1].fecha.localeCompare(b[1].fecha));
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
    const cell = h("button", { class: `day-cell ${claseTurno(t)}${f === hoy ? " today" : ""}${festEf()[f] ? " festivo" : ""}`, onclick: () => abrirDia(f) },
      h("span", {}, String(d)), h("b", {}, etiq(t)),
      h("div", { class: "icons" }, (festEf()[f] ? "🎉" : "") + (hayNota ? "🔔" : "") + (abiertas.has(f) ? "🔄" : "") + (cambios[f]?.[me] && !ausencias[f]?.[me] ? "↔️" : "")));
    grid.append(cell);
  }
  renderFestMes(a, m);
}

function renderFestMes(a, m) {
  const cont = $("festMes"), pref = `${a}-${String(m + 1).padStart(2, "0")}-`;
  const del = Object.entries(festEf()).filter(([f]) => f.startsWith(pref)).sort();
  cont.hidden = !del.length; cont.innerHTML = "";
  if (!del.length) return;
  cont.append(h("b", {}, "🎉 Festivos de este mes: "), del.map(([f, t]) => fmt(f) + (t !== "F" ? ` (${t})` : "")).join(" · "));
}

/* ---------- Modal del día ---------- */
function abrirDia(f) { modalFecha = f; renderModal(); $("modal").hidden = false; }
const cerrar = () => { $("modal").hidden = true; modalFecha = null; };
$("modal").onclick = e => { if (e.target === $("modal")) cerrar(); };

function renderModal() {
  const f = modalFecha, body = $("modalBody"); body.innerHTML = "";
  const mio = turnoEf(me, f);
  body.append(h("h3", {}, fmt(f)), festivo(f) ? h("div", { class: "festivo-linea" }, "🎉 " + festivo(f)) : null, h("div", { class: "grupo" }, `Tu turno: `, h("b", {}, etiq(mio))));

  const g = { m: [], t: [], n: [], libre: [], aus: [] };
  Object.keys(ops).sort((x, y) => nom(x).localeCompare(nom(y), "es")).forEach(id => {
    const t = turnoEf(id, f), k = tipoTurno(t);
    g[k].push(k === "aus" ? `${nom(id)} (${TIPOS_AUS[t].nombre.toLowerCase()})` : nom(id) + (cambios[f]?.[id] ? " ↔️" : ""));
  });
  [["m", "Mañana"], ["t", "Tarde"], ["n", "Noche"], ["libre", "Libres"], ["aus", "Ausentes"]].forEach(([k, titulo]) =>
    body.append(h("div", { class: `grupo ${k}` }, h("b", {}, titulo), g[k].length ? g[k].join(", ") : "—")));

  Object.entries(notas[f] || {}).forEach(([id, txt]) => body.append(h("div", { class: "nota" }, `🔔 ${nom(id)}: ${txt}`)));

  const admin = !!ops[me]?.admin;
  for (const [sid, s] of Object.entries(sols)) {
    if (s.estado !== "cerrada" || !s.aceptada) continue;
    const dev = s.ofertas?.[s.aceptada]?.dev;
    if (s.fecha !== f && dev !== f) continue;
    if (s.fecha === f) body.append(h("div", { class: "cambio" }, `↔️ ${nom(s.solicitante)} cede su día a ${nom(s.aceptada)}`));
    if (dev === f) body.append(h("div", { class: "cambio" }, `↔️ ${nom(s.aceptada)} cede su día a ${nom(s.solicitante)}`));
    if (admin || s.solicitante === me || s.aceptada === me)
      body.append(h("div", { class: "row" }, h("button", { class: "warn", onclick: () => deshacer(sid) }, "Deshacer este cambio")));
  }
  if (ausencias[f]?.[me]) body.append(h("div", { class: "row" }, h("button", { class: "warn", onclick: async () => {
    if (!confirm("¿Quitar tu ausencia de este día? Volverás a tu turno normal.")) return;
    await set(ref(db, `ausencias/${f}/${me}`), null); cerrar();
  } }, `Quitar mi ${(TIPOS_AUS[ausencias[f][me]]?.nombre ?? "ausencia").toLowerCase()} de este día`)));

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
  if (grupoDe(ops[me]) !== grupoDe(ops[s.solicitante])) return alert("Solo puedes cubrir a compañeros de tu grupo.");
  if (dev) {
    if (!trabaja(turnoEf(me, dev))) return alert("Ese día no trabajas: no hay nada que devolver.");
    if (!esLibre(turnoEf(s.solicitante, dev))) return alert(`${nom(s.solicitante)} trabaja ese día y no puede cubrirte.`);
  }
  await set(ref(db, `solicitudes/${sid}/ofertas/${me}`), dev ? { t: Date.now(), dev } : { t: Date.now() });
}

async function aceptar(sid, oid) {
  const s = sols[sid], dev = s.ofertas?.[oid]?.dev, D = s.fecha;
  if (!ops[oid]) return alert("Ese compañero ya no existe.");
  if (grupoDe(ops[oid]) !== grupoDe(ops[me])) return alert("Solo se puede cambiar con compañeros del mismo grupo.");
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

// Deshace un cambio aceptado (lo puede hacer cualquiera de los dos o el administrador)
async function deshacer(sid) {
  const s = sols[sid], oid = s.aceptada, D = s.fecha, dev = s.ofertas?.[oid]?.dev;
  const okD = cambios[D]?.[s.solicitante] === "LC" && cambios[D]?.[oid] && cambios[D][oid] !== "LC";
  const okDev = !dev || (cambios[dev]?.[oid] === "LC" && cambios[dev]?.[s.solicitante] && cambios[dev][s.solicitante] !== "LC");
  if (!okD || !okDev) return alert("No se puede deshacer: esos días han vuelto a cambiar después.");
  if (!confirm(`¿Deshacer el cambio entre ${nom(s.solicitante)} y ${nom(oid)}? Cada uno volverá a su turno normal.`)) return;
  const up = { [`cambios/${D}/${s.solicitante}`]: null, [`cambios/${D}/${oid}`]: null, [`solicitudes/${sid}/estado`]: "anulada" };
  if (dev) { up[`cambios/${dev}/${oid}`] = null; up[`cambios/${dev}/${s.solicitante}`] = null; }
  await update(ref(db), up);
  cerrar();
}

/* ---------- Ausencias (vacaciones, bajas y permisos) ---------- */
$("ausDesde").value = $("ausHasta").value = hoyIso();
for (const [k, v] of Object.entries(TIPOS_AUS)) $("ausTipo").add(new Option(v.nombre, k));
$("btnAus").onclick = async () => {
  const d1 = $("ausDesde").value, d2 = $("ausHasta").value;
  if (!d1 || !d2 || d2 < d1) return alert("Revisa las fechas: 'Hasta' no puede ser anterior a 'Desde'.");
  const dias = rango(d1, d2);
  if (dias.length > 120) return alert("Máximo 120 días de una vez. Para una baja larga, registra otra después.");
  const up = {}; dias.forEach(f => { up[`ausencias/${f}/${me}`] = $("ausTipo").value; });
  await update(ref(db), up);
};

/* ---------- Contador de días por tipo de ausencia ---------- */
let ausAnio = new Date().getFullYear();
for (let y = ausAnio - 1; y <= ausAnio + 1; y++) $("ausAnio").add(new Option(y, y));
$("ausAnio").value = ausAnio;
$("ausAnio").onchange = () => { ausAnio = parseInt($("ausAnio").value); renderResumen(); };

// Para cada tipo: días registrados en el año y cuántos eran días en los que le tocaba trabajar
function resumenDe(id, anio) {
  const r = {};
  for (const [f, porOp] of Object.entries(ausencias)) {
    const t = porOp[id];
    if (!t || !f.startsWith(anio + "-")) continue;
    if (!r[t]) r[t] = { dias: 0, trabajo: 0 };
    r[t].dias++;
    if (trabaja(cambios[f]?.[id] ?? turnoCiclo(ops[id], f))) r[t].trabajo++;
  }
  return r;
}
const textoDias = n => `${n} día${n === 1 ? "" : "s"}`;

function renderResumen() {
  if (!me || !ops[me]) return;
  const mio = $("resumenAus"); mio.innerHTML = "";
  const r = resumenDe(me, ausAnio), tipos = Object.keys(r).sort();
  if (!tipos.length) mio.append(h("div", { class: "vacio" }, `Aún no tienes ausencias registradas en ${ausAnio}.`));
  tipos.forEach(t => mio.append(h("div", { class: "sol eq" },
    h("div", {}, h("b", {}, `${TIPOS_AUS[t]?.icono ?? "📋"} ${TIPOS_AUS[t]?.nombre ?? t}`),
      h("small", {}, `De ellos, ${r[t].trabajo} en días que te tocaba trabajar`)),
    h("b", {}, textoDias(r[t].dias)))));

  const eq = $("resumenEquipo"); eq.innerHTML = "";
  if (!ops[me].admin) return; // el resumen de todo el equipo solo lo ve el administrador
  eq.append(h("label", { style: "margin-top:18px" }, `Resumen del equipo · ${ausAnio}`));
  const filas = Object.keys(ops).sort((a, b) => nom(a).localeCompare(nom(b), "es"))
    .map(id => [id, resumenDe(id, ausAnio)]).filter(([, x]) => Object.keys(x).length);
  if (!filas.length) { eq.append(h("div", { class: "vacio" }, `Nadie tiene ausencias registradas en ${ausAnio}.`)); return; }
  filas.forEach(([id, x]) => eq.append(h("div", { class: "sol" }, h("b", {}, nom(id)),
    h("small", {}, Object.keys(x).sort().map(t => `${TIPOS_AUS[t]?.nombre ?? t}: ${x[t].dias}`).join(" · ")))));
}

function renderAus() {
  renderResumen();
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
    h("b", {}, `${TIPOS_AUS[r.t]?.icono ?? "📋"} ${nom(r.id)}`), ` · ${(TIPOS_AUS[r.t]?.nombre ?? "ausencia").toLowerCase()}`,
    h("small", {}, `${fmt(r.desde)} al ${fmt(r.hasta)}`),
    r.id === me || ops[me]?.admin ? h("div", { class: "row" }, h("button", { class: "bad", onclick: () => {
      if (!confirm(`¿Quitar esta ausencia${r.id === me ? "" : " de " + nom(r.id)}?`)) return;
      const up = {}; r.dias.filter(f => f >= hoy).forEach(f => { up[`ausencias/${f}/${r.id}`] = null; });
      update(ref(db), up);
    } }, r.desde < hoy ? "Quitar lo que queda" : "Quitar")) : null)));
}

/* ---------- Administración del equipo (solo con operarios/{id}/admin = true) ---------- */
function renderEq() {
  const esAdmin = !!ops[me]?.admin;
  $("tabEq").hidden = !esAdmin;
  const cont = $("viewEq"); cont.innerHTML = "";
  if (!esAdmin) { if (tab === "eq") document.querySelector('[data-tab="cal"]').click(); return; }
  cont.append(h("button", { class: "btn-sync", style: "margin-bottom:14px", onclick: () => editarOp(null) }, "➕ Añadir compañero"));
  cont.append(h("label", {}, `Equipo (${Object.keys(ops).length})`));
  Object.entries(ops).sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es")).forEach(([id, o]) =>
    cont.append(h("div", { class: "sol eq" }, h("div", {}, h("b", {}, o.nombre + (o.admin ? " ★" : "")), h("small", {}, `${GRUPOS[grupoDe(o)].nombre} · ${TIPOS_TURNO[o.tipo]?.nombre ?? "Rotativo"}`)),
      h("div", { class: "acc" },
        h("button", { class: "sec", onclick: () => editarOp(id), "aria-label": "Editar " + o.nombre }, "✏️"),
        id === me ? null : h("button", { class: "bad", onclick: () => borrarOp(id), "aria-label": "Eliminar " + o.nombre }, "✕")))));
}

function editarOp(id) { // id === null: alta de un compañero nuevo
  const nuevo = id === null;
  const o = nuevo ? { nombre: "", grupo: "electromecanicos", tipo: "rotativo", ref: hoyIso(), idx: 0 } : ops[id];
  const body = $("modalBody"); body.innerHTML = "";
  const nombre = h("input", { value: o.nombre, maxlength: "30" });
  const grupo = h("select"), tipo = h("select"), sem = h("select");
  for (const [k, v] of Object.entries(GRUPOS)) grupo.add(new Option(v.nombre, k));
  grupo.value = grupoDe(o);
  const tipoActual = TIPOS_TURNO[o.tipo] ? o.tipo : "rotativo";
  const fr = h("input", { type: "date", value: o.ref });
  const sel = h("select");
  for (let i = 0; i < CICLO.length; i++) sel.add(new Option(`S${Math.floor(i / 7) + 1} - ${DIAS[i % 7]} (${CICLO[i]})`, i));
  sel.value = tipoActual === "rotativo" ? o.idx : 0;
  const areaRot = h("div", {}, h("label", {}, "Fecha de referencia"), fr, h("label", {}, "Su turno ese día"), sel);
  const areaSem = h("div", {}, h("label", {}, "Esta semana trabaja de"), sem);
  const refrescar = () => {
    const t = tipo.value, semanal = !!TIPOS_TURNO[t]?.semanas;
    areaRot.hidden = semanal; areaSem.hidden = !semanal;
    if (!semanal) return;
    llenarSemanas(sem, t);
    if (t === tipoActual) { // semana en la que está ahora, según su ciclo actual
      const len = cicloDe(o).length;
      const pos = (((o.idx + Math.round(dayNum(lunesDe(hoyIso())) - dayNum(o.ref))) % len) + len) % len;
      sem.value = String(Math.floor(pos / 7) * 7);
    }
  };
  const cambiarGrupo = () => {
    llenarTipos(tipo, grupo.value);
    tipo.value = tiposDe(grupo.value).some(([k]) => k === tipoActual) ? tipoActual : tiposDe(grupo.value)[0][0];
    refrescar();
  };
  grupo.onchange = cambiarGrupo; tipo.onchange = refrescar; cambiarGrupo();
  const pin = h("input", { type: "password", inputmode: "numeric", maxlength: "4", placeholder: nuevo ? "4 cifras" : "Vacío = no cambiarlo" });
  body.append(h("h3", {}, nuevo ? "Añadir compañero" : "Editar compañero"),
    h("label", {}, "Nombre"), nombre, h("label", {}, "Grupo"), grupo, h("label", {}, "Turno"), tipo, areaRot, areaSem,
    h("label", {}, nuevo ? "PIN inicial (se lo dices tú)" : "Nuevo PIN (opcional)"), pin,
    h("div", { class: "row" },
      h("button", { class: "ok", onclick: async () => {
        if (!nombre.value.trim()) return alert("Falta el nombre.");
        if ((nuevo || pin.value) && !/^\d{4}$/.test(pin.value)) return alert(nuevo ? "Pon un PIN de 4 cifras." : "El PIN son 4 cifras.");
        if (nuevo && Object.values(ops).some(x => x.nombre.toLowerCase() === nombre.value.trim().toLowerCase()) && !confirm("Ya hay alguien con ese nombre. ¿Crear de todos modos?")) return;
        const datos = { nombre: nombre.value.trim(), grupo: grupo.value, tipo: tipo.value };
        if (TIPOS_TURNO[tipo.value]?.semanas) { datos.ref = lunesDe(hoyIso()); datos.idx = parseInt(sem.value); }
        else { if (!fr.value) return alert("Falta la fecha de referencia."); datos.ref = fr.value; datos.idx = parseInt(sel.value); }
        if (nuevo) {
          const nid = push(ref(db, "operarios")).key;
          await set(ref(db, "operarios/" + nid), { ...datos, pinHash: await hashPin(pin.value, nid) });
        } else {
          if (pin.value) datos.pinHash = await hashPin(pin.value, id);
          await update(ref(db, "operarios/" + id), datos);
        }
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

/* ---------- Pestaña "Quién": quién trabaja cada día ---------- */
let quienFecha = hoyIso();
let quienGrupo = "";
const BLOQUES = [["m", "Mañana"], ["t", "Tarde"], ["n", "Noche"], ["libre", "Libres"], ["aus", "Ausentes"]];
const cambiarQuien = f => { quienFecha = f; renderQuien(); };
$("qPrev").onclick = () => cambiarQuien(sumaDias(quienFecha, -1));
$("qNext").onclick = () => cambiarQuien(sumaDias(quienFecha, 1));
$("qHoy").onclick = () => cambiarQuien(hoyIso());
$("qFecha").onchange = e => { if (e.target.value) cambiarQuien(e.target.value); };
$("qGrupo").add(new Option("Todos los grupos", ""));
for (const [k, v] of Object.entries(GRUPOS)) $("qGrupo").add(new Option(v.nombre, k));
$("qGrupo").onchange = () => { quienGrupo = $("qGrupo").value; renderQuien(); };

function gruposDelDia(f) {
  const g = { m: [], t: [], n: [], libre: [], aus: [] };
  for (const id of Object.keys(ops).filter(i => !quienGrupo || grupoDe(ops[i]) === quienGrupo)) { const t = turnoEf(id, f); g[tipoTurno(t)].push({ id, t }); }
  for (const k in g) g[k].sort((a, b) => nom(a.id).localeCompare(nom(b.id), "es"));
  return g;
}

function renderQuien() {
  if (!me || !ops[me]) return;
  const f = quienFecha, hoy = hoyIso();
  $("qLabel").textContent = (f === hoy ? "Hoy · " : "") + fmt(f) + (festEf()[f] ? " 🎉" : "");
  $("qHoy").hidden = f === hoy;
  if ($("qFecha").value !== f) $("qFecha").value = f;

  const lista = $("listaQuien"); lista.innerHTML = "";
  if (festivo(f)) lista.append(h("div", { class: "festivo-linea" }, "🎉 " + festivo(f)));
  const g = gruposDelDia(f);
  for (const [k, titulo] of BLOQUES) {
    const bloque = h("div", { class: `grupo-q ${k}` }, h("div", { class: "tit" }, `${titulo} (${g[k].length})`));
    if (!g[k].length) bloque.append(h("span", { class: "vacio-q" }, "—"));
    g[k].forEach(({ id, t }) => bloque.append(h("span", { class: "chip" + (id === me ? " yo" : "") },
      nom(id), " ", h("small", {}, etiq(t)), cambios[f]?.[id] && k !== "aus" ? " ↔️" : "")));
    lista.append(bloque);
  }
  lista.append(h("div", { class: "pie-q" }, `${g.m.length + g.t.length + g.n.length + g.libre.length + g.aus.length} compañeros registrados` + (quienGrupo ? ` en ${GRUPOS[quienGrupo].nombre}` : "")));

  const prox = $("proxQuien"); prox.innerHTML = "";
  for (let i = 1; i <= 7; i++) {
    const d = sumaDias(f, i), gd = gruposDelDia(d);
    prox.append(h("button", { class: "prox", onclick: () => cambiarQuien(d) },
      h("span", {}, fmt(d) + (festEf()[d] ? " 🎉" : "")),
      h("span", {}, h("b", { class: "c-m" }, `M ${gd.m.length}`), " ", h("b", { class: "c-t" }, `T ${gd.t.length}`), " ", h("b", { class: "c-n" }, `N ${gd.n.length}`), gd.aus.length ? ` · Aus ${gd.aus.length}` : "")));
  }
}

/* ---------- Chat general (últimos 100 mensajes) ---------- */
let chat = {};
let chatLeido = "";
try { chatLeido = localStorage.getItem("turnos_chat_leido") || ""; } catch (e) {}

function marcarLeido() {
  const k = Object.keys(chat).sort().pop();
  if (!k) return;
  chatLeido = k;
  try { localStorage.setItem("turnos_chat_leido", k); } catch (e) {}
}

async function enviarChat() {
  const inp = $("chatTxt"), txt = inp.value.trim();
  if (!txt) return;
  inp.value = "";
  try { await push(ref(db, "chat"), { autor: me, texto: txt.slice(0, 500), t: Date.now() }); }
  catch (e) { inp.value = txt; throw e; }
}
$("chatEnviar").onclick = enviarChat;
$("chatTxt").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); enviarChat(); } };

function renderChat() {
  if (!me || !ops[me]) return;
  const keys = Object.keys(chat).sort(); // las claves de Firebase van en orden cronológico
  if (tab === "chat") marcarLeido();
  const nuevos = keys.filter(k => k > chatLeido && chat[k].autor !== me).length;
  $("badgeChat").textContent = nuevos || "";
  if (tab !== "chat") return;

  const cont = $("chatMsgs");
  const abajo = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 80;
  cont.innerHTML = "";
  if (!keys.length) cont.append(h("div", { class: "vacio" }, "Aún no hay mensajes. ¡Escribe el primero!"));
  let diaPrev = "";
  keys.forEach(k => {
    const m = chat[k], d = new Date(m.t), f = iso(d.getFullYear(), d.getMonth(), d.getDate());
    if (f !== diaPrev) { cont.append(h("div", { class: "dia-sep" }, f === hoyIso() ? "Hoy" : fmt(f))); diaPrev = f; }
    const yo = m.autor === me;
    cont.append(h("div", { class: "burbuja" + (yo ? " yo" : "") },
      yo ? null : h("div", { class: "quien" }, nom(m.autor)),
      m.texto,
      h("span", { class: "hora" }, d.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" })),
      yo || ops[me]?.admin ? h("button", { class: "borrar", "aria-label": "Borrar mensaje", onclick: () => { if (confirm("¿Borrar este mensaje?")) set(ref(db, "chat/" + k), null); } }, "🗑") : null));
  });
  if (abajo) cont.scrollTop = cont.scrollHeight;
}

/* ---------- Festivos (solo administrador) ---------- */
let festAnio = new Date().getFullYear();
for (let y = festAnio - 1; y <= festAnio + 2; y++) $("festAnio").add(new Option(y, y));
$("festAnio").value = festAnio;
$("festFecha").value = festAnio + "-01-01";
$("festAnio").onchange = () => { festAnio = parseInt($("festAnio").value); renderFest(); };

// Si todavía no hay festivos guardados, se guardan primero los de festivos.js para no perderlos al tocar la lista
const baseFest = () => { const up = {}; if (!Object.keys(festivosDB).length) for (const [k, v] of Object.entries(FESTIVOS)) up["festivos/" + k] = v; return up; };

$("btnFest").onclick = async () => {
  const f = $("festFecha").value;
  if (!f) return alert("Elige la fecha del festivo.");
  const up = baseFest(); up["festivos/" + f] = ($("festTexto").value.trim() || "F").slice(0, 40);
  await update(ref(db), up);
  $("festTexto").value = "";
  festAnio = parseInt(f.slice(0, 4));
  if (![...$("festAnio").options].some(o => o.value === String(festAnio))) $("festAnio").add(new Option(festAnio, festAnio));
  $("festAnio").value = festAnio;
  renderFest();
};

function renderFest() {
  const esAdmin = !!ops[me]?.admin;
  $("tabFest").hidden = !esAdmin;
  if (!esAdmin) { if (tab === "fest") document.querySelector('[data-tab="cal"]').click(); return; }
  const lista = $("listaFest"); lista.innerHTML = "";
  const del = Object.entries(festEf()).filter(([f]) => f.startsWith(festAnio + "-")).sort();
  lista.append(h("label", { style: "margin-top:18px" }, `Festivos de ${festAnio} (${del.length})`));
  if (!del.length) { lista.append(h("div", { class: "vacio" }, `Todavía no hay festivos en ${festAnio}. Añade el primero arriba.`)); return; }
  del.forEach(([f, t]) => lista.append(h("div", { class: "sol eq" },
    h("div", {}, h("b", {}, fmt(f)), h("small", {}, t === "F" ? "Festivo" : t)),
    h("div", { class: "acc" }, h("button", { class: "bad", "aria-label": "Quitar festivo", onclick: async () => {
      if (!confirm(`¿Quitar el festivo del ${fmt(f)}?`)) return;
      const up = baseFest(); up["festivos/" + f] = null;
      await update(ref(db), up);
    } }, "✕")))));
}

/* ---------- Render global y suscripciones ---------- */
function render() { if (!me || !ops[me]) return; $("quien").textContent = nom(me); renderCal(); renderQuien(); renderChat(); renderSol(); renderAus(); renderEq(); renderFest(); }

const errLectura = ruta => e => window.mostrarError?.(`No se pueden leer los datos (${ruta}): ${e.message}. Revisa que las reglas de Firebase estén publicadas.`);

let uid = null;

// Se activa solo cuando el móvil ya está autorizado con el código del equipo
function iniciar() {
  if (!me) $("loginArea").hidden = false;
  onValue(ref(db, "operarios"), s => {
    ops = s.val() || {}; pintarSelectorOperarios();
    if (me && !ops[me] && !$("mainArea").hidden) { localStorage.removeItem("turnos_me"); alert("Tu usuario ha sido eliminado."); location.reload(); return; }
    if (me && !ops[me] && $("mainArea").hidden) { me = null; localStorage.removeItem("turnos_me"); $("loginArea").hidden = false; }
    if (me && ops[me] && $("mainArea").hidden) entrar(me); else render();
  }, errLectura("operarios"));
  onValue(ref(db, "notas"), s => { notas = s.val() || {}; render(); }, errLectura("notas"));
  onValue(ref(db, "cambios"), s => { cambios = s.val() || {}; render(); }, errLectura("cambios"));
  onValue(ref(db, "ausencias"), s => { ausencias = s.val() || {}; render(); }, errLectura("ausencias"));
  onValue(ref(db, "festivos"), s => { festivosDB = s.val() || {}; render(); }, errLectura("festivos"));
  onValue(ref(db, "solicitudes"), s => { sols = s.val() || {}; render(); }, errLectura("solicitudes"));
  onValue(query(ref(db, "chat"), limitToLast(100)), s => { chat = s.val() || {}; render(); }, errLectura("chat"));
}

// Firebase solo acepta el registro si el código escrito coincide con el guardado en la base de datos
$("btnCodigo").onclick = async () => {
  const c = $("codigo").value.trim(), msg = $("codigoMsg");
  msg.textContent = "";
  if (!c) { msg.textContent = "Escribe el código."; return; }
  try { await set(ref(db, "miembros/" + uid), c); }
  catch (e) { msg.textContent = "Código incorrecto."; return; }
  $("codigoArea").hidden = true; iniciar();
};
$("codigo").onkeydown = e => { if (e.key === "Enter") $("btnCodigo").click(); };

signInAnonymously(getAuth(app)).then(async cred => {
  uid = cred.user.uid;
  const snap = await get(ref(db, "miembros/" + uid));
  if (snap.exists()) iniciar(); else $("codigoArea").hidden = false;
}).catch(e => {
  const m = "No se pudo conectar con Firebase: " + e.message + ". ¿Está activado el acceso Anónimo?";
  $("loginMsg").textContent = m; window.mostrarError?.(m);
});
