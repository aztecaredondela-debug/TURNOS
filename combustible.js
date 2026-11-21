// Pestaña Combustible: mapa de Pontevedra con los precios del Ministerio (archivo data/combustible-36.json).
import { COMBUSTIBLES, filtrar, umbrales, nivel, buscarLugar, centroide, titular, precio3, parseFecha, fechaCorta, horasDesde } from "./combustible-logica.js?v=16";

const LIBS = {
  css: ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
        "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css",
        "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css"],
  js: ["https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
       "https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"],
};
const cargarScript = src => new Promise((ok, ko) => {
  const s = document.createElement("script");
  s.src = src; s.onload = ok; s.onerror = () => ko(new Error("No se pudo cargar el mapa (" + src.split("/").pop() + ")"));
  document.head.append(s);
});
async function cargarLibs() { // el mapa solo se descarga la primera vez que se abre la pestaña
  if (window.L?.markerClusterGroup) return;
  for (const href of LIBS.css) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.append(l); }
  for (const src of LIBS.js) await cargarScript(src); // en orden: primero Leaflet
}

export function crearCombustible(h, raiz) {
  const est = { combustible: "g95", centro: null, radioKm: 0, datos: null, lista: [], umbral: { p33: 0, p66: 0 },
                mapa: null, capa: null, capaRef: null, marcadores: new Map(), limite: 40, listo: false, cargando: false };

  /* ----- pantalla (se construye una vez) ----- */
  const msg = h("div", { class: "vacio" });
  const botones = Object.entries(COMBUSTIBLES).map(([k, v]) => h("button", {
    class: "chip-comb" + (k === est.combustible ? " on" : ""), "data-k": k,
    onclick: () => { est.combustible = k; botones.forEach(b => b.classList.toggle("on", b.dataset.k === k)); actualizar(false); },
  }, v.nombre));
  const buscar = h("input", { placeholder: "Localidad o código postal", autocomplete: "off", "aria-label": "Localidad o código postal" });
  buscar.onkeydown = e => { if (e.key === "Enter") buscarYCentrar(); };
  const radio = h("select", { "aria-label": "Radio de búsqueda" },
    ...[["0", "Toda la provincia"], ["5", "Radio de 5 km"], ["10", "Radio de 10 km"], ["20", "Radio de 20 km"]].map(([v, t]) => h("option", { value: v }, t)));
  radio.onchange = () => { est.radioKm = parseInt(radio.value); actualizar(true); };
  const titularEl = h("div", { class: "titular-comb" });
  const mapaEl = h("div", { id: "combMapa" });
  const actEl = h("div", { class: "act-comb" });
  const listaEl = h("div", {});
  raiz.append(
    h("div", { class: "chips-comb" }, ...botones),
    h("div", { class: "busca-comb" }, buscar,
      h("button", { class: "btn-chat", onclick: buscarYCentrar }, "Buscar"),
      h("button", { class: "sec", "aria-label": "Usar mi ubicación", onclick: usarUbicacion }, "📍")),
    radio, msg, titularEl, mapaEl, actEl, listaEl,
    h("div", { class: "pie-q" }, "Pulsa en el mapa para ver las gasolineras de ese punto. Precios: Ministerio para la Transición Ecológica y el Reto Demográfico. Mapa © OpenStreetMap."));

  /* ----- carga ----- */
  async function activar() {
    if (est.cargando) return;
    if (est.listo) { setTimeout(() => est.mapa.invalidateSize(), 60); return; } // el mapa estaba oculto: se reajusta
    est.cargando = true; msg.textContent = "Cargando mapa y precios...";
    try {
      const [, resp] = await Promise.all([cargarLibs(), fetch("data/combustible-36.json?v=" + Math.floor(Date.now() / 600000), { cache: "no-cache" })]);
      if (!resp.ok) throw new Error(resp.status === 404 ? "SIN_DATOS" : "Error " + resp.status + " al leer los precios");
      est.datos = await resp.json();
      if (!est.datos.estaciones?.length) throw new Error("SIN_DATOS");
      iniciarMapa(); est.listo = true; msg.textContent = "";
      actualizar(true);
    } catch (e) {
      msg.textContent = e.message === "SIN_DATOS"
        ? "Todavía no hay datos de precios. El administrador debe lanzar la actualización: en GitHub, pestaña Actions > «Actualizar precios de combustible» > Run workflow."
        : "No se pudo cargar: " + e.message;
    } finally { est.cargando = false; }
  }

  function iniciarMapa() {
    const L = window.L;
    est.mapa = L.map(mapaEl).setView([42.43, -8.64], 9);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(est.mapa);
    est.capa = L.markerClusterGroup({
      maxClusterRadius: 45, disableClusteringAtZoom: 14, showCoverageOnHover: false,
      iconCreateFunction: c => { // círculo con el nº de gasolineras, del color de la más barata que contiene
        const min = Math.min(...c.getAllChildMarkers().map(m => m.options.precio));
        return L.divIcon({ className: "cl-wrap", iconSize: [46, 46],
          html: `<div class="cl ${nivel(min, est.umbral)}"><b>${c.getChildCount()}</b><small>${precio3(min)}</small></div>` });
      },
    });
    est.mapa.addLayer(est.capa);
    est.capaRef = L.layerGroup().addTo(est.mapa);
    est.mapa.on("click", e => fijarCentro(e.latlng.lat, e.latlng.lng));
  }

  /* ----- actualizar mapa y lista ----- */
  function actualizar(reencuadrar) {
    if (!est.listo) return;
    const L = window.L, comb = est.combustible;
    const lista = filtrar(est.datos.estaciones, { combustible: comb, centro: est.centro, radioKm: est.radioKm });
    est.lista = lista; est.umbral = umbrales(lista, comb);

    titularEl.textContent = titular(lista, comb, est.centro && est.radioKm ? "en la zona" : "en la provincia")
      || (lista.length ? "" : "No hay gasolineras con este combustible en la zona elegida.");
    const horas = horasDesde(parseFecha(est.datos.actualizado));
    actEl.textContent = "Actualizado: " + fechaCorta(est.datos.actualizado) + (horas != null && horas > 24 ? `  ⚠️ Datos de hace ${Math.round(horas)} horas` : "") + "   * venta restringida";

    est.capa.clearLayers(); est.marcadores.clear();
    est.capa.addLayers(lista.map(e => {
      const m = L.marker([e.lat, e.lon], {
        precio: e[comb],
        icon: L.divIcon({ className: "pm-wrap", iconSize: [54, 22], iconAnchor: [27, 11],
          html: `<div class="pm ${nivel(e[comb], est.umbral)}${e.restringida ? " rest" : ""}">${precio3(e[comb])}</div>` }),
      });
      m.bindPopup(() => popup(e));
      est.marcadores.set(e.id, m);
      return m;
    }));

    est.capaRef.clearLayers();
    if (est.centro) {
      L.circleMarker([est.centro.lat, est.centro.lon], { radius: 8, color: "#0a84ff", weight: 3, fillColor: "#0a84ff", fillOpacity: .5 }).addTo(est.capaRef);
      if (est.radioKm) L.circle([est.centro.lat, est.centro.lon], { radius: est.radioKm * 1000, color: "#0a84ff", weight: 1, fillOpacity: .06 }).addTo(est.capaRef);
    }
    if (reencuadrar) encuadrar(lista);
    est.limite = 40; pintarLista();
  }

  function encuadrar(lista) {
    const L = window.L;
    if (est.centro && est.radioKm) est.mapa.fitBounds(L.latLng(est.centro.lat, est.centro.lon).toBounds(est.radioKm * 2000), { padding: [10, 10] });
    else if (lista.length) est.mapa.fitBounds(L.latLngBounds(lista.map(e => [e.lat, e.lon])), { padding: [20, 20] });
  }

  function popup(e) { // se construye con elementos (no con HTML) para que ningún texto de los datos se interprete como código
    return h("div", { class: "popup-comb" },
      h("b", {}, e.rotulo || "Gasolinera"),
      h("div", {}, `${e.direccion} · ${e.localidad}`),
      h("div", { class: "p-precio" }, `${COMBUSTIBLES[est.combustible].nombre}: ${precio3(e[est.combustible])} €/l`),
      e.horario ? h("div", {}, "Horario: " + e.horario) : null,
      e.restringida ? h("div", {}, "* Venta restringida") : null,
      h("a", { href: `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}`, target: "_blank", rel: "noopener" }, "Cómo llegar"));
  }

  function pintarLista() {
    listaEl.innerHTML = "";
    const comb = est.combustible;
    est.lista.slice(0, est.limite).forEach(e => listaEl.append(h("button", { class: "fila-comb", onclick: () => ir(e) },
      h("div", { class: "dir" }, h("b", {}, e.rotulo || "Gasolinera"), h("small", {}, `${e.direccion} · ${e.localidad}${e.restringida ? " *" : ""}`)),
      h("div", { class: "precio " + nivel(e[comb], est.umbral) }, precio3(e[comb])),
      h("div", { class: "dist" }, e.dist != null ? e.dist.toFixed(1).replace(".", ",") + " km" : ""))));
    if (est.lista.length > est.limite)
      listaEl.append(h("button", { class: "btn-sec", onclick: () => { est.limite += 40; pintarLista(); } }, `Mostrar más (${est.lista.length - est.limite} restantes)`));
  }

  function ir(e) { // al pulsar una gasolinera de la lista, el mapa va a ella
    const m = est.marcadores.get(e.id);
    mapaEl.scrollIntoView({ behavior: "smooth", block: "center" });
    if (m) est.capa.zoomToShowLayer(m, () => m.openPopup());
  }

  /* ----- centro de búsqueda: clic en el mapa, localidad/CP o ubicación ----- */
  function fijarCentro(lat, lon) {
    est.centro = { lat, lon };
    if (!est.radioKm) { est.radioKm = 10; radio.value = "10"; }
    actualizar(true);
  }
  function buscarYCentrar() {
    if (!est.listo) return;
    const q = buscar.value.trim();
    if (!q) { est.centro = null; est.radioKm = 0; radio.value = "0"; msg.textContent = ""; actualizar(true); return; }
    const res = buscarLugar(est.datos.estaciones, q);
    if (!res.length) { msg.textContent = `No encuentro «${q}» en la provincia de Pontevedra. Prueba con el municipio o el código postal.`; return; }
    msg.textContent = "";
    fijarCentro(centroide(res).lat, centroide(res).lon);
  }
  function usarUbicacion() {
    if (!est.listo) return;
    if (!navigator.geolocation) { msg.textContent = "Tu navegador no permite usar la ubicación."; return; }
    msg.textContent = "Buscando tu ubicación...";
    navigator.geolocation.getCurrentPosition(
      p => { msg.textContent = ""; fijarCentro(p.coords.latitude, p.coords.longitude); },
      () => { msg.textContent = "No se pudo obtener tu ubicación. Revisa el permiso del navegador."; },
      { timeout: 15000 });
  }

  return { activar };
}
