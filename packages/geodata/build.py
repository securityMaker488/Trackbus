"""Build the offline TrackBus demo graph from the bounded OpenStreetMap extract.
Python 3.11+; standard library only. Source and output are licensed ODbL 1.0.
"""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request

HERE = Path(__file__).resolve().parent
BBOX = (-38.517, -13.005, -38.461, -12.969)  # west, south, east, north
DATE = "2026-11-04T02:37:28Z"  # timestamp_osm_base returned by Overpass
ENDPOINT = "https://overpass-api.de/api/interpreter"
WALK = {"footway", "steps", "pedestrian", "living_street", "residential", "unclassified", "tertiary", "secondary", "primary"}
BUS = {"living_street", "residential", "unclassified", "tertiary", "secondary", "primary", "trunk", "motorway"}
ALLOW = {"yes", "designated", "permissive", "official"}
ATTR = "© OpenStreetMap contributors, ODbL 1.0"

def download():
    w,s,e,n=BBOX
    query=f'[out:json][timeout:50][date:"{DATE}"];way[highway]({s},{w},{n},{e})->.roads;(.roads;.roads >;rel(bw.roads)[type=restriction];);out body;'
    url=ENDPOINT+"?"+urllib.parse.urlencode({"data":query})
    req=urllib.request.Request(url,headers={"User-Agent":"TrackBus-Salvador-Demo-Extract/3.0"})
    with urllib.request.urlopen(req,timeout=75) as resp:
        raw=resp.read(32_000_001)
    if len(raw)>32_000_000: raise ValueError("Extract exceeds bound")
    return raw

def allowed(tags, levels, default):
    for key in levels:
        if key in tags: return tags[key] in ALLOW
    return default

def mask(tags):
    ht=tags.get("highway","")
    if tags.get("area")=="yes" or tags.get("construction") or tags.get("proposed") or tags.get("impassable")=="yes": return 0
    foot=allowed(tags,("foot","access"),ht in WALK)
    bus=allowed(tags,("bus","motor_vehicle","vehicle","access"),ht.removesuffix("_link") in BUS)
    if ht in {"service","track","path","cycleway"}:
        foot=tags.get("foot") in ALLOW and tags.get("access") not in {"private","no"}
        bus=False
    if ht not in {k+suffix for k in BUS for suffix in ("","_link")} or tags.get("service") or tags.get("access")=="private": bus=False
    if ht in {"motorway","trunk","motorway_link","trunk_link"}:foot=False
    if tags.get("sidewalk") in {"no","none","separate"} and ht not in {"footway","pedestrian","steps"}: foot=False
    if any(k.startswith(("access:conditional","foot:conditional")) for k in tags):foot=False
    if any(k.startswith(("access:conditional","bus:conditional","vehicle:conditional","motor_vehicle:conditional","oneway:conditional","maxheight","maxweight","maxwidth","maxlength","maxaxleload")) for k in tags):bus=False
    ow=tags.get("oneway:bus", tags.get("oneway", "yes" if tags.get("junction")=="roundabout" or ht=="motorway" else "no"))
    fow=tags.get("oneway:foot","no")
    return (1 if foot and fow in {"no","0","false","yes","1","true"} and tags.get("foot:forward","yes") in ALLOW else 0) | (2 if foot and fow in {"no","0","false","-1"} and tags.get("foot:backward","yes") in ALLOW else 0) | (4 if bus and ow in {"no","0","false","yes","1","true"} and tags.get("motor_vehicle:forward","yes") in ALLOW else 0) | (8 if bus and ow in {"no","0","false","-1"} and tags.get("motor_vehicle:backward","yes") in ALLOW else 0)

def closed_node(tags):
    barrier=tags.get("barrier")
    foot=not allowed(tags,("foot","access"),barrier in {None,"kerb","bollard"})
    bus=not allowed(tags,("bus","motor_vehicle","vehicle","access"),barrier is None)
    return (3 if foot else 0)|(12 if bus else 0)

def varint(values):
    out=bytearray()
    for v in values:
        while v>=128:out.append((v&127)|128);v>>=7
        out.append(v)
    return base64.b64encode(out).decode("ascii")

def zz(v):return 2*v if v>=0 else -2*v-1

def main():
    ap=argparse.ArgumentParser()
    group=ap.add_mutually_exclusive_group()
    group.add_argument("--source", type=Path, help="Original Overpass JSON or .gz file")
    group.add_argument("--download", action="store_true", help="Fetch the historical extract from Overpass")
    args=ap.parse_args()
    if args.download:
        raw=download()
    else:
        source=args.source or HERE/"salvador-source.json.gz"
        raw=source.read_bytes()
        if source.suffix==".gz":raw=gzip.decompress(raw)
    data=json.loads(raw)
    if data.get("remark"):raise ValueError(data["remark"])
    elements=data["elements"];w,s,e,n=BBOX
    nodes={x["id"]:x for x in elements if x["type"]=="node" and w<=x["lon"]<=e and s<=x["lat"]<=n}
    ways={x["id"]:x for x in elements if x["type"]=="way"}
    restrictions=[];blocked=set()
    for r in (x for x in elements if x["type"]=="relation"):
        tags=r.get("tags",{})
        if {"bus","psv"}.intersection(tags.get("except","").split(";")):continue
        kind=tags.get("restriction:bus",tags.get("restriction",""))
        members=r["members"]
        fr=[m["ref"] for m in members if m["role"]=="from" and m["type"]=="way"]
        to=[m["ref"] for m in members if m["role"]=="to" and m["type"]=="way"]
        via=[m["ref"] for m in members if m["role"]=="via" and m["type"]=="node"]
        if len(via)!=1 or not fr or not to or not kind.startswith(("no_","only_")) or any("conditional" in k for k in tags):
            blocked.update(fr);blocked.update(to);continue
        for a in fr:
            for b in to:restrictions.append((via[0],a,b,2 if kind=="no_u_turn" else 1 if kind.startswith("only") else 0))
    edges=[];used=set();validways=set()
    for wid,way in sorted(ways.items()):
        flags=mask(way.get("tags",{}))
        if wid in blocked:flags&=3
        if not flags:continue
        for a,b in zip(way["nodes"],way["nodes"][1:]):
            if a==b or a not in nodes or b not in nodes:continue
            m=flags&~(closed_node(nodes[a].get("tags",{}))|closed_node(nodes[b].get("tags",{})))
            if not m:continue
            edges.append((a,b,wid,m));used.update((a,b));validways.add(wid)
    order=sorted(used);idx={node:i for i,node in enumerate(order)};widx={way:i for i,way in enumerate(sorted(validways))}
    coords=[];x=y=0
    for node in order:
        nx=round(nodes[node]["lon"]*1e6);ny=round(nodes[node]["lat"]*1e6);coords.extend((zz(nx-x),zz(ny-y)));x,y=nx,ny
    links=[];last=0
    for a,b,wid,m in edges:
        links.extend((zz(idx[a]-last),zz(idx[b]-idx[a]),widx[wid],m));last=idx[a]
    rules=sorted((idx[v],widx[a],widx[b],mode) for v,a,b,mode in restrictions if v in idx and a in widx and b in widx)
    obj={"format":1,"bbox":BBOX,"attribution":ATTR,"dataDate":DATE,"nodes":len(order),"links":len(edges),"ways":len(validways),"rules":rules,"points":varint(coords),"edges":varint(links)}
    output=(json.dumps(obj,ensure_ascii=False,separators=(",",":"))+"\n").encode()
    (HERE/"salvador.json").write_bytes(output)
    print(f"{len(order)} nodes / {len(edges)} edges / {len(validways)} ways / {len(rules)} rules; {len(output)} bytes; SHA256 {hashlib.sha256(output).hexdigest()}")
if __name__=="__main__":main()
