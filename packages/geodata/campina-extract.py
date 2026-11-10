"""One-time offline extract from OSM France's Paraiba PBF.
Requires pyosmium only to refresh the source; graph rebuilding uses stdlib.
No addresses, contributors, changesets or student positions are retained.
"""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

import osmium

BBOX = (-35.900, -7.245, -35.860, -7.205)
URL = "https://download.openstreetmap.fr/extracts/south-america/brazil/northeast/paraiba-latest.osm.pbf"
HERE = Path(__file__).resolve().parent


class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.nodes = {}
        self.ways = {}
        self.relations = []

    def node(self, node):
        west, south, east, north = BBOX
        if west <= node.location.lon <= east and south <= node.location.lat <= north:
            self.nodes[node.id] = {"type": "node", "id": node.id, "lat": node.location.lat, "lon": node.location.lon, "tags": dict(node.tags)}

    def way(self, way):
        if "highway" not in way.tags or not any(n.ref in self.nodes for n in way.nodes):
            return
        self.ways[way.id] = {"type": "way", "id": way.id, "nodes": [n.ref for n in way.nodes], "tags": dict(way.tags)}

    def relation(self, relation):
        if relation.tags.get("type") != "restriction" or not any(m.type == "w" and m.ref in self.ways for m in relation.members):
            return
        self.relations.append({"type": "relation", "id": relation.id, "tags": dict(relation.tags), "members": [{"ref": m.ref, "type": {"n": "node", "w": "way", "r": "relation"}[m.type], "role": m.role} for m in relation.members]})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    args = parser.parse_args()
    reader = osmium.io.Reader(str(args.source))
    timestamp = reader.header().get("osmosis_replication_timestamp")
    reader.close()
    if not timestamp:
        raise ValueError("Source PBF must contain replication timestamp")
    extract = Extract()
    extract.apply_file(str(args.source))
    used = {n for way in extract.ways.values() for n in way["nodes"]}
    elements = [n for nid, n in extract.nodes.items() if nid in used] + list(extract.ways.values()) + extract.relations
    allowed = {"highway", "name", "type", "area", "construction", "proposed", "impassable", "foot", "access", "bus", "motor_vehicle", "vehicle", "service", "sidewalk", "junction", "barrier", "except"}
    for item in elements:
        item["tags"] = {k: v for k, v in item.get("tags", {}).items() if k in allowed or k.startswith(("access:", "foot:", "bus:", "vehicle:", "motor_vehicle:", "oneway", "maxheight", "maxweight", "maxwidth", "maxlength", "maxaxleload", "restriction"))}
    data = {"source": URL, "sourceSha256": hashlib.sha256(args.source.read_bytes()).hexdigest(), "bbox": BBOX, "osm3s": {"timestamp_osm_base": timestamp}, "elements": elements}
    output = gzip.compress(json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), mtime=0)
    (HERE / "campina-source.json.gz").write_bytes(output)
    print(json.dumps({"date": timestamp, "nodes": len(extract.nodes), "ways": len(extract.ways), "rules": len(extract.relations), "outputBytes": len(output), "sourceSha256": data["sourceSha256"]}))


if __name__ == "__main__":
    main()
