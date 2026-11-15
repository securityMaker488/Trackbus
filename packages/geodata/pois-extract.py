"""Offline POI index from the OSM France Paraiba extract. Requires pyosmium.
No residential addresses, contributors or user locations are retained.
Usage: python pois-extract.py /path/to/paraiba.osm.pbf
"""
import sys, json, hashlib
from pathlib import Path
import osmium

SOURCE = "https://download.openstreetmap.fr/extracts/south-america/brazil/northeast/paraiba-latest.osm.pbf"
HERE = Path(__file__).resolve().parent
CATEGORIES = {"school":"school", "kindergarten":"school", "university":"university", "college":"university", "bank":"bank", "hospital":"health", "clinic":"health", "pharmacy":"pharmacy", "bus_station":"transport", "place_of_worship":"worship", "townhall":"government", "library":"government", "marketplace":"commerce"}

class Extract(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.points = []
    def add(self, item, kind, lat, lng):
        tags = dict(item.tags)
        name = tags.get("name") or tags.get("brand")
        category = CATEGORIES.get(tags.get("amenity"))
        if not category and tags.get("shop") in {"supermarket", "mall", "convenience", "department_store"}: category="commerce"
        if not category and tags.get("leisure") in {"park", "garden"}: category="park"
        if not category and tags.get("office") == "government": category="government"
        if not name or not category or tags.get("access") in {"private", "no"}: return
        if not (-8.4 <= lat <= -5.9 and -38.8 <= lng <= -34.7): return
        self.points.append({"id":f"{kind}/{item.id}","name":name[:100],"category":category,"lat":round(lat,6),"lng":round(lng,6),"municipality":tags.get("addr:city","")[:100],"source":"OpenStreetMap"})
    def node(self,n): self.add(n,"node",n.location.lat,n.location.lon)
    def way(self,w):
        if not (w.tags.get("name") or w.tags.get("brand")): return
        points=[n.location for n in w.nodes if n.location.valid()]
        if points: self.add(w,"way",sum(n.lat for n in points)/len(points),sum(n.lon for n in points)/len(points))

path=Path(sys.argv[1])
reader=osmium.io.Reader(str(path)); timestamp=reader.header().get("osmosis_replication_timestamp"); reader.close()
extract=Extract(); extract.apply_file(str(path),locations=True,idx="flex_mem")
# Named point + building can describe the same facility. Keep one nearby item.
points=[]; seen=set()
for p in sorted(extract.points,key=lambda p:p["id"]):
    key=(p["name"].casefold(),round(p["lat"],3),round(p["lng"],3))
    if key not in seen: points.append(p); seen.add(key)
result={"source":SOURCE,"sourceSha256":hashlib.sha256(path.read_bytes()).hexdigest(),"dataDate":timestamp,"attribution":"© OpenStreetMap contributors · ODbL 1.0", "coverage":"Referências nomeadas disponíveis no extrato OSM da Paraíba; cadastro comunitário, não exaustivo.","points":points}
(HERE/"paraiba-pois.json").write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
print(json.dumps({"count":len(points),"date":timestamp,"categories":sorted(set(p["category"] for p in points))}))
