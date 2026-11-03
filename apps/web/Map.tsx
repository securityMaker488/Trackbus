"use client";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection } from "geojson";
import type { Map as GLMap, GeoJSONSource, Marker } from "maplibre-gl";
import type { Itinerary, Position, Point } from "../../packages/domain";
import { LocateFixed, MapPin } from "lucide-react";
export function BusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="6"
        y="3"
        width="20"
        height="24"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <path
        d="M7 16h18M11 8h10M10 28v2m12-2v2"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="11" cy="22" r="1.7" fill="currentColor" />
      <circle cx="21" cy="22" r="1.7" fill="currentColor" />
    </svg>
  );
}
type Props = {
  routes: Itinerary[];
  positions?: { id: string; label: string; position: Position }[];
  onPick?: (p: Point) => void;
  walking?: [number, number][];
  large?: boolean;
};
export default function MapView({
  routes,
  positions = [],
  onPick,
  walking = [],
  large = false,
}: Props) {
  const box = useRef<HTMLDivElement>(null),
    map = useRef<GLMap | null>(null),
    markers = useRef<Marker[]>([]),
    pick = useRef(onPick),
    [ready, setReady] = useState(false),
    [error, setError] = useState(false);
  pick.current = onPick;
  useEffect(() => {
    let disposed = false;
    import("maplibre-gl").then((gl) => {
      if (disposed || !box.current) return;
      try {
        gl.setWorkerUrl("/map-worker-v6.mjs");
        const m = new gl.Map({
          container: box.current,
          center: [-38.488, -12.983],
          zoom: 13.4,
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                attribution:
                  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
              },
            },
            layers: [
              {
                id: "background",
                type: "background",
                paint: { "background-color": "#10151c" },
              },
              {
                id: "streets",
                type: "raster",
                source: "osm",
                paint: {
                  "raster-saturation": -1,
                  "raster-brightness-max": 0.26,
                  "raster-brightness-min": 0.06,
                  "raster-contrast": 0.35,
                },
              },
            ],
          },
          attributionControl: { compact: true },
        });
        map.current = m;
        m.addControl(
          new gl.NavigationControl({ showCompass: false }),
          "top-right",
        );
        m.on("load", () => {
          if (!disposed) setReady(true);
        });
        m.on("click", (e) =>
          pick.current?.({
            lat: Number(e.lngLat.lat.toFixed(6)),
            lng: Number(e.lngLat.lng.toFixed(6)),
          }),
        );
        m.on("error", () => setError(true));
      } catch {
        setError(true);
      }
    });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current) return;
    const m = map.current;
    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: routes.map((r, i) => ({
        type: "Feature",
        properties: { color: ["#facc15", "#e3b32c", "#8e9972"][i % 3] },
        geometry: { type: "LineString", coordinates: r.geometry },
      })),
    };
    if (m.getSource("routes"))
      (m.getSource("routes") as GeoJSONSource).setData(data);
    else {
      m.addSource("routes", { type: "geojson", data });
      m.addLayer({
        id: "route-glow",
        source: "routes",
        type: "line",
        paint: {
          "line-color": ["get", "color"],
          "line-width": 12,
          "line-opacity": 0.12,
        },
      });
      m.addLayer({
        id: "route-lines",
        source: "routes",
        type: "line",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
    }
    const coords = routes.flatMap((r) => r.geometry);
    if (coords.length) {
      const lngs = coords.map((p) => p[0]),
        lats = coords.map((p) => p[1]);
      m.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 65, maxZoom: 15, duration: 500 },
      );
    }
  }, [ready, JSON.stringify(routes)]);
  useEffect(() => {
    if (!ready || !map.current) return;
    let disposed = false;
    import("maplibre-gl").then((gl) => {
      if (disposed || !map.current) return;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      const seen = new Set<string>();
      routes.forEach((r) =>
        r.stops.forEach((s, i) => {
          if (seen.has(s.id)) return;
          seen.add(s.id);
          const el = document.createElement("div");
          el.className = "stop-marker";
          el.textContent = String(i + 1);
          el.title = s.name;
          markers.current.push(
            new gl.Marker({ element: el })
              .setLngLat([s.lng, s.lat])
              .addTo(map.current!),
          );
        }),
      );
      positions.forEach((p) => {
        const el = document.createElement("div");
        el.className = "bus-marker";
        el.title = `${p.label} · ${p.position.source === "simulation" ? "Posição simulada" : "GPS"}`;
        const svg = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "svg",
        );
        svg.setAttribute("viewBox", "0 0 32 32");
        svg.setAttribute("width", "25");
        svg.setAttribute("height", "25");
        const rect = document.createElementNS(svg.namespaceURI, "rect");
        for (const [k, v] of Object.entries({
          x: "6",
          y: "3",
          width: "20",
          height: "24",
          rx: "5",
          fill: "none",
          stroke: "#111",
          "stroke-width": "2.4",
        }))
          rect.setAttribute(k, v);
        svg.appendChild(rect);
        const path = document.createElementNS(svg.namespaceURI, "path");
        path.setAttribute("d", "M7 16h18M11 8h10M10 22h2m8 0h2M10 28v2m12-2v2");
        path.setAttribute("stroke", "#111");
        path.setAttribute("stroke-width", "2.4");
        svg.appendChild(path);
        el.appendChild(svg);
        if (Date.now() - p.position.timestamp > 60000)
          el.classList.add("stale");
        markers.current.push(
          new gl.Marker({ element: el })
            .setLngLat([p.position.lng, p.position.lat])
            .addTo(map.current!),
        );
      });
    });
    return () => {
      disposed = true;
    };
  }, [ready, JSON.stringify(positions), JSON.stringify(routes)]);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const data: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: walking },
    };
    if (m.getSource("walking"))
      (m.getSource("walking") as GeoJSONSource).setData(data);
    else {
      m.addSource("walking", { type: "geojson", data });
      m.addLayer({
        id: "walking-line",
        source: "walking",
        type: "line",
        paint: {
          "line-color": "#60a5fa",
          "line-width": 4,
          "line-dasharray": [2, 2],
        },
      });
    }
  }, [ready, JSON.stringify(walking)]);
  return (
    <div className={`map-frame ${large ? "large" : ""}`}>
      <div className="map-canvas" ref={box} />
      <div className="map-tag">
        <span className="live-dot" />{" "}
        {onPick ? "Clique para adicionar uma parada" : "Salvador, BA"}{" "}
        <span className="tag-divider" />{" "}
        {routes.some((r) => !r.routed) ? "Traçado esquemático" : "Itinerário"}
      </div>
      {!ready && (
        <div className="map-loading">
          <MapPin size={28} />
          <span>
            {error ? "Mapa indisponível neste dispositivo" : "Carregando mapa…"}
          </span>
        </div>
      )}
      <button
        className="map-center icon-button"
        title="Centralizar mapa"
        onClick={() => {
          const p = positions[0]?.position || routes[0]?.stops[0];
          if (p) map.current?.flyTo({ center: [p.lng, p.lat], zoom: 14 });
        }}
      >
        <LocateFixed size={20} />
      </button>
      <div className="map-legend">
        <i /> Rota escolar <span>●</span> Parada{" "}
        <span className="yellow">▣</span> Ônibus{" "}
        {positions.some((p) => p.position.source === "simulation") && (
          <b>POSIÇÃO SIMULADA</b>
        )}
      </div>
    </div>
  );
}
