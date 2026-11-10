"""Rebuild Campina's graph with the same audited filters/encoding as Salvador.
Standard library only. No network required. Does not modify Salvador files.
"""
import gzip
import json
from pathlib import Path
import sys

import build

HERE = Path(__file__).resolve().parent


class CampinaFiles:
    """Adapt the two existing builder filenames without duplicating its logic."""

    def __truediv__(self, filename):
        mapping = {"salvador-source.json.gz": "campina-source.json.gz", "salvador.json": "campina.json"}
        return HERE / mapping[filename]


def main():
    if len(sys.argv) > 1:
        raise SystemExit("Run without arguments. Refresh source with campina-extract.py first.")
    source = json.loads(gzip.decompress((HERE / "campina-source.json.gz").read_bytes()))
    build.HERE = CampinaFiles()
    build.BBOX = tuple(source["bbox"])
    build.DATE = source["osm3s"]["timestamp_osm_base"]
    build.main()


if __name__ == "__main__":
    main()
