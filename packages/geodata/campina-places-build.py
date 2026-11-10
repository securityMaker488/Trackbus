"""Generate the Paraiba municipality search index from IBGE's public census data.
Standard library only. No geocoding requests and no student coordinates are used.
"""
import hashlib
import argparse
import gzip
import io
import json
from pathlib import Path
import sqlite3
import urllib.request
import zipfile

URL = "https://geoftp.ibge.gov.br/organizacao_do_territorio/estrutura_territorial/localidades/Localidades_do_Brasil/2022/Localidades_Brasil_gpkg.zip"
HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--archive", type=Path)
    group.add_argument("--download", action="store_true")
    args = parser.parse_args()
    local_source = HERE / "campina-ibge-places-source.json.gz"
    if args.archive or args.download:
        if args.archive:
            raw = args.archive.read_bytes()
        else:
            request = urllib.request.Request(URL, headers={"User-Agent": "TrackBus/6.0 (https://github.com/securityMaker488/Trackbus)"})
            with urllib.request.urlopen(request, timeout=60) as response:
                raw = response.read(12_000_001)
        if len(raw) > 12_000_000:
            raise ValueError("IBGE archive exceeds expected bound")
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            data = archive.read("BR_localidades_2022.gpkg")
        database = sqlite3.connect(":memory:")
        database.deserialize(data)
        rows = database.execute(
            "SELECT CD_MUN, NM_MUN, LAT_LOCALIDADE, LONG_LOCALIDADE "
            "FROM BR_localidades_2022 WHERE SIGLA_UF = ? AND SCT_LOCALIDADE = ? "
            "ORDER BY NM_MUN", ("PB", "Sede Municipal")
        ).fetchall()
        database.close()
        normalized = {"sourceSha256": hashlib.sha256(raw).hexdigest(), "rows": rows}
        local_source.write_bytes(gzip.compress(json.dumps(normalized, ensure_ascii=False).encode("utf-8"), mtime=0))
    else:
        normalized = json.loads(gzip.decompress(local_source.read_bytes()))
        rows = normalized["rows"]
    if len(rows) != 223 or len({row[0] for row in rows}) != 223:
        raise ValueError("Expected 223 distinct municipality seats in the 2022 dataset")
    places = [{"id": code, "name": name, "lat": round(lat, 6), "lng": round(lng, 6)} for code, name, lat, lng in rows]
    result = {
        "source": URL,
        "sourceSha256": normalized["sourceSha256"],
        "dataDate": "2022",
        "attribution": "Fonte: IBGE, Censo Demográfico 2022 — Localidades do Brasil, edição disponibilizada em 2025.",
        "scope": "Sedes dos 223 municípios da Paraíba; coordenadas de referência do IBGE, não endereços nem paradas de ônibus.",
        "places": places,
    }
    output = (json.dumps(result, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    (HERE / "paraiba-places.json").write_bytes(output)
    print(f"{len(places)} municipalities; {len(output)} bytes; SHA256 {hashlib.sha256(output).hexdigest()}")
    print("Source archive SHA256", result["sourceSha256"])
    print(json.dumps([p for p in places if p["name"] in {"Campina Grande", "João Pessoa", "Guarabira", "Patos", "Sousa", "Cajazeiras", "Areia", "Bananeiras", "Queimadas", "Lagoa Seca"}], ensure_ascii=False))


if __name__ == "__main__":
    main()
