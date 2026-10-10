#!/usr/bin/env python3
"""
Motor de política de versiones de la Fábrica de Software.

Consulta https://endoflife.date (API v1) y recomienda, para cada producto,
la versión que cumple la política:

  1. Si el producto publica versiones LTS  -> la LTS más nueva que tenga
     al menos UMBRAL meses de soporte restante (por defecto 18).
  2. Si no hay LTS (PHP, Python, Perl, Go...) -> la versión estable más nueva
     con al menos MADUREZ días publicada (por defecto 60) y UMBRAL meses de vida.
  3. Si nada cumple -> la versión mantenida más nueva, marcada con advertencia.

Uso:
  python3 versiones.py php nodejs postgresql
  python3 versiones.py --perfil web-php
  python3 versiones.py --json --umbral 24 python django
  python3 versiones.py --listar-perfiles

Solo usa la biblioteca estándar de Python 3.8+.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta

API = "https://endoflife.date/api/v1/products/{}/"

ALIAS = {
    "node": "nodejs", "js": "nodejs", "java": "eclipse-temurin", "jdk": "eclipse-temurin",
    "rails": "ruby-on-rails", "postgres": "postgresql", "pg": "postgresql",
    "k8s": "kubernetes", "net": "dotnet", ".net": "dotnet", "csharp": "dotnet",
    "springboot": "spring-boot", "spring": "spring-boot", "next": "nextjs",
    "mongo": "mongodb", "sqlserver": "mssqlserver", "mssql": "mssqlserver",
    "elastic": "elasticsearch", "rn": "react-native", "golang": "go",
    "nuxtjs": "nuxt", "wp": "wordpress", "apache": "apache-http-server",
    "rhel": "rhel", "alma": "almalinux", "rocky": "rocky-linux",
}

PERFILES = {
    "web-php":       ["php", "laravel", "symfony", "composer", "nodejs", "mariadb", "mysql", "nginx", "redis", "ubuntu"],
    "web-node":      ["nodejs", "typescript", "react", "nextjs", "angular", "vue", "postgresql", "redis", "ubuntu"],
    "web-python":    ["python", "django", "postgresql", "redis", "nodejs", "ubuntu"],
    "web-java":      ["eclipse-temurin", "spring-boot", "kotlin", "postgresql", "redis", "ubuntu"],
    "web-dotnet":    ["dotnet", "mssqlserver", "postgresql", "redis", "ubuntu"],
    "web-ruby":      ["ruby", "ruby-on-rails", "postgresql", "redis", "nodejs"],
    "legacy-perl":   ["perl", "php", "mysql", "mariadb", "apache-http-server", "debian", "rhel"],
    "datos-ia":      ["python", "postgresql", "mongodb", "redis", "elasticsearch", "apache-spark", "apache-airflow", "kubernetes"],
    "movil":         ["react-native", "flutter", "nodejs", "kotlin", "eclipse-temurin"],
    "infra":         ["ubuntu", "debian", "rhel", "almalinux", "rocky-linux", "kubernetes", "docker-engine", "terraform", "ansible-core", "nginx"],
    "bases-datos":   ["postgresql", "mysql", "mariadb", "mssqlserver", "mongodb", "redis", "valkey", "elasticsearch", "opensearch"],
    "cms":           ["wordpress", "drupal", "php", "mariadb"],
}


def obtener(producto, timeout=20):
    url = API.format(producto)
    req = urllib.request.Request(url, headers={"User-Agent": "fabrica-software-versiones/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r)["result"]


def fecha(s):
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def meses_entre(a, b):
    return round((b - a).days / 30.44, 1)


def recomendar(producto, hoy, umbral_meses, madurez_dias):
    datos = obtener(producto)
    releases = datos.get("releases", [])
    limite = hoy + timedelta(days=int(umbral_meses * 30.44))

    cands = []
    for r in releases:
        rel = fecha(r.get("releaseDate"))
        eol = fecha(r.get("eolFrom"))
        if rel and rel > hoy:
            continue
        if r.get("isEol") or (eol and eol <= hoy):
            continue
        if r.get("isMaintained") is False:
            continue
        cands.append({
            "version": r.get("name"),
            "lts": bool(r.get("isLts")),
            "lanzamiento": rel,
            "fin_soporte_activo": fecha(r.get("eoasFrom")),
            "eol": eol,
            "ultimo_parche": (r.get("latest") or {}).get("name"),
            "edad_dias": (hoy - rel).days if rel else None,
        })

    if not cands:
        return {"producto": producto, "error": "sin versiones mantenidas"}

    # El orden de la API es de más nueva a más antigua; lo aseguramos por fecha.
    cands.sort(key=lambda c: c["lanzamiento"] or date.min, reverse=True)

    def vida_ok(c):
        return c["eol"] is None or c["eol"] >= limite

    def madura(c):
        return c["edad_dias"] is None or c["edad_dias"] >= madurez_dias

    elegido, motivo, advertencia = None, "", None
    hay_lts = any(c["lts"] for c in cands) or any(r.get("isLts") for r in releases)

    if hay_lts:
        lts = [c for c in cands if c["lts"]]
        ok = [c for c in lts if vida_ok(c)]
        if ok:
            elegido, motivo = ok[0], f"LTS más nueva con ≥{umbral_meses} meses de soporte"
        elif lts:
            elegido, motivo = lts[0], "LTS más nueva disponible"
            advertencia = f"ninguna LTS tiene ≥{umbral_meses} meses de soporte restante"
    if not elegido:
        ok = [c for c in cands if vida_ok(c) and madura(c)]
        if ok:
            elegido = ok[0]
            motivo = ("sin LTS formal: estable más nueva, madura (≥%d días) y con ≥%d meses de vida"
                      % (madurez_dias, umbral_meses)) if not hay_lts else "sin LTS vigente: estable más nueva que cumple"
        else:
            maduras = [c for c in cands if madura(c)] or cands
            elegido, motivo = maduras[0], "estable mantenida más nueva"
            advertencia = "no cumple el umbral de vida; revisar con el arquitecto"

    if elegido["eol"] is None and not elegido["lts"]:
        nota = "fecha EOL no publicada: el proyecto suele soportar solo las 1-2 últimas versiones; fijar revisión trimestral"
        advertencia = f"{advertencia}; {nota}" if advertencia else nota

    res = {
        "producto": producto,
        "version": elegido["version"],
        "ultimo_parche": elegido["ultimo_parche"],
        "lts": elegido["lts"],
        "lanzamiento": str(elegido["lanzamiento"]) if elegido["lanzamiento"] else None,
        "fin_soporte_activo": str(elegido["fin_soporte_activo"]) if elegido["fin_soporte_activo"] else None,
        "eol": str(elegido["eol"]) if elegido["eol"] else None,
        "meses_restantes": meses_entre(hoy, elegido["eol"]) if elegido["eol"] else None,
        "motivo": motivo,
        "advertencia": advertencia,
        "mas_nueva_disponible": cands[0]["version"],
    }
    return res


def tabla(resultados, hoy):
    out = [f"<!-- Generado por versiones.py el {hoy} desde endoflife.date -->",
           "| Producto | Versión | Último parche | LTS | Fin soporte activo | EOL | Meses restantes | Motivo | Advertencia |",
           "|---|---|---|---|---|---|---|---|---|"]
    for r in resultados:
        if "error" in r:
            out.append(f"| {r['producto']} | — | — | — | — | — | — | {r['error']} | verificar manualmente |")
            continue
        out.append("| {producto} | {version} | {ultimo_parche} | {lts} | {fsa} | {eol} | {mr} | {motivo} | {adv} |".format(
            producto=r["producto"], version=r["version"], ultimo_parche=r["ultimo_parche"] or "—",
            lts="sí" if r["lts"] else "no", fsa=r["fin_soporte_activo"] or "—", eol=r["eol"] or "no publicado",
            mr=r["meses_restantes"] if r["meses_restantes"] is not None else "—",
            motivo=r["motivo"], adv=r["advertencia"] or ""))
    return "\n".join(out)


def main():
    p = argparse.ArgumentParser(description="Recomienda versiones LTS/estables según la política de la Fábrica.")
    p.add_argument("productos", nargs="*", help="slugs de endoflife.date (ej. php nodejs postgresql)")
    p.add_argument("--perfil", action="append", default=[], help="perfil predefinido (ver --listar-perfiles)")
    p.add_argument("--umbral", type=float, default=18, help="meses mínimos de soporte restante (defecto 18)")
    p.add_argument("--madurez", type=int, default=60, help="días mínimos desde el lanzamiento para versiones no LTS (defecto 60)")
    p.add_argument("--fecha", help="fecha de referencia AAAA-MM-DD (defecto hoy)")
    p.add_argument("--json", action="store_true", help="salida JSON")
    p.add_argument("--listar-perfiles", action="store_true")
    a = p.parse_args()

    if a.listar_perfiles:
        for k, v in PERFILES.items():
            print(f"{k:12} {' '.join(v)}")
        return 0

    productos = list(a.productos)
    for perf in a.perfil:
        if perf not in PERFILES:
            print(f"Perfil desconocido: {perf}", file=sys.stderr)
            return 2
        productos += PERFILES[perf]
    productos = list(dict.fromkeys(ALIAS.get(x.lower(), x.lower()) for x in productos))
    if not productos:
        p.print_help()
        return 2

    hoy = fecha(a.fecha) if a.fecha else date.today()
    resultados = []
    for prod in productos:
        try:
            resultados.append(recomendar(prod, hoy, a.umbral, a.madurez))
        except urllib.error.HTTPError as e:
            resultados.append({"producto": prod, "error": f"HTTP {e.code} (¿slug correcto? ver https://endoflife.date)"})
        except Exception as e:  # red caída, proxy, etc.
            resultados.append({"producto": prod, "error": f"no se pudo consultar ({e.__class__.__name__})"})

    if a.json:
        print(json.dumps({"fecha": str(hoy), "umbral_meses": a.umbral, "resultados": resultados}, ensure_ascii=False, indent=2))
    else:
        print(tabla(resultados, hoy))
    errores = sum(1 for r in resultados if "error" in r)
    return 1 if errores == len(resultados) else 0


if __name__ == "__main__":
    sys.exit(main())
