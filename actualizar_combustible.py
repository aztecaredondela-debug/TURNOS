#!/usr/bin/env python3
"""Descarga los precios del Ministerio para la provincia de Pontevedra (36) y los guarda en
data/combustible-36.json con el formato que lee la pestaña Combustible. Reintenta si el servicio falla (503...)."""
import json, os, sys, time, urllib.request, urllib.error

URL = "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/36"
SALIDA = os.path.join(os.path.dirname(__file__), "..", "data", "combustible-36.json")
INTENTOS, ESPERA = 6, 20  # 6 intentos, esperando 20 s, 40 s, 60 s...


def num(txt):
    try:
        return float(str(txt).replace(",", "."))
    except (TypeError, ValueError):
        return None


def convertir(datos):
    estaciones = []
    for e in datos.get("ListaEESSPrecio", []):
        lat, lon = num(e.get("Latitud")), num(e.get("Longitud (WGS84)"))
        if lat is None or lon is None:
            continue
        est = {
            "id": str(e.get("IDEESS", "")),
            "rotulo": (e.get("Rótulo") or "").strip().title(),
            "direccion": (e.get("Dirección") or "").strip().title(),
            "localidad": (e.get("Localidad") or "").strip().title(),
            "municipio": (e.get("Municipio") or "").strip().title(),
            "cp": str(e.get("C.P.") or "").strip(),
            "lat": lat, "lon": lon,
            "horario": (e.get("Horario") or "").strip(),
            "restringida": (e.get("Tipo Venta") or "").strip().upper() == "R",
        }
        for clave, campo in (("g95", "Precio Gasolina 95 E5"), ("diesel", "Precio Gasoleo A"),
                             ("g98", "Precio Gasolina 98 E5"), ("dieselp", "Precio Gasoleo Premium")):
            p = num(e.get(campo))
            if p:
                est[clave] = p
        if any(k in est for k in ("g95", "diesel", "g98", "dieselp")):
            estaciones.append(est)
    return {"actualizado": datos.get("Fecha", ""), "estaciones": estaciones}


def descargar():
    cabeceras = {"Accept": "application/json", "Accept-Language": "es-ES,es;q=0.9",
                 "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
    for n in range(1, INTENTOS + 1):
        try:
            with urllib.request.urlopen(urllib.request.Request(URL, headers=cabeceras), timeout=60) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except (urllib.error.URLError, TimeoutError, ValueError, ConnectionError) as ex:
            print(f"Intento {n}/{INTENTOS} fallido: {ex}", file=sys.stderr)
            if n < INTENTOS:
                time.sleep(ESPERA * n)
    return None


def main():
    datos = descargar()
    if datos is None:
        sys.exit("El Ministerio no responde. Se mantienen los precios anteriores; se reintentará en la próxima ejecución.")
    salida = convertir(datos)
    if not salida["estaciones"]:
        sys.exit("La respuesta no trae gasolineras con precio: no se guarda nada.")
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    with open(SALIDA, "w", encoding="utf-8") as f:
        json.dump(salida, f, ensure_ascii=False, separators=(",", ":"))
    print(f"OK: {len(salida['estaciones'])} gasolineras, actualizado {salida['actualizado']}")


if __name__ == "__main__":
    main()
