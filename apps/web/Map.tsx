"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { FeatureCollection, LineString } from "geojson";
import type {
  Map as GLMap,
  GeoJSONSource,
  Marker,
  StyleSpecification,
} from "maplibre-gl";
import {
  BusFront,
  Footprints,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  PanelBottomOpen,
  Route,
  UserRound,
  Bell,
  X,
  Plus,
  Minus,
} from "lucide-react";
import type { Itinerary, Position, Point } from "../../packages/domain";
import { MapSearch } from "./MapSearch";
import type { EditorFix } from "./MapSearch";
import type { Poi } from "../../packages/shared/pois";
import {
  splitItinerary,
  type TrackingProgress,
} from "../../packages/domain/tracking";

const palette = {
  black: "#090909",
  surface: "#141414",
  raised: "#202020",
  yellow: "#FACC15",
  secondary: "#EAB308",
  light: "#FDE047",
  deep: "#A16207",
} as const;
const style: StyleSpecification = {
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
      paint: { "background-color": palette.black },
    },
    {
      id: "streets",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -1,
        "raster-brightness-min": 9 / 255,
        "raster-brightness-max": 32 / 255,
        "raster-contrast": 0.42,
      },
    },
  ],
};

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

type VehiclePoint = {
  id: string;
  label: string;
  position: Position;
  progress?: TrackingProgress | null;
};
type Props = {
  routes: (Itinerary & { tripId?: string })[];
  positions?: VehiclePoint[];
  onPick?: (p: Point) => void;
  onMoveStop?: (id: string, p: Point) => void;
  walking?: [number, number][];
  studentPosition?: Point | null;
  onTripDetails?: (tripId: string) => void;
  onNotices?: () => void;
  large?: boolean;
  editor?: boolean;
  onLocate?: (fix: EditorFix) => void;
  editorPosition?: EditorFix | null;
  onViewportChange?: (center: Point) => void;
  pointsOfInterest?: Poi[];
  onPoiSelect?: (poi: Poi) => void;
};
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function frameTime(ms: number) {
  return reducedMotion() ? 0 : ms;
}
function fitItineraries(
  map: GLMap,
  routes: Itinerary[],
  walking: [number, number][],
) {
  const coordinates = routes.flatMap((route) => route.geometry).concat(walking);
  if (!coordinates.length) return;
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const [lng, lat] of coordinates) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  map.fitBounds(
    [
      [west, south],
      [east, north],
    ],
    {
      padding: { top: 68, left: 48, right: 55, bottom: 65 },
      maxZoom: 16,
      duration: frameTime(380),
    },
  );
}
const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
function positionMessage(p: Position, now: number) {
  if (now - p.timestamp > 60000) return "Localização desatualizada";
  if (p.speed === null) return "Movimento desconhecido";
  return p.speed < 0.5 ? "Parado" : "Em movimento";
}

// The host is stable through polling. Interpolate only from the rendered point
// to the newest received point, then stop. Never predict an unreported position.
function MapMarker({
  map,
  point,
  animate = false,
  onDrag,
  children,
}: {
  map: GLMap;
  point: Point;
  animate?: boolean;
  onDrag?: (p: Point) => void;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const marker = useRef<Marker | null>(null);
  const current = useRef(point);
  current.current = point;
  const drag = useRef(onDrag);
  drag.current = onDrag;
  useEffect(() => {
    let disposed = false;
    import("maplibre-gl").then(({ Marker: GLMarker }) => {
      if (disposed) return;
      const element = document.createElement("div");
      const p = current.current;
      element.addEventListener("click", (e) => e.stopPropagation());
      marker.current = new GLMarker({
        element,
        anchor: "center",
        draggable: !!drag.current,
      })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
      marker.current.on("dragend", () => {
        const fix = marker.current?.getLngLat();
        if (fix)
          drag.current?.({
            lat: Number(fix.lat.toFixed(6)),
            lng: Number(fix.lng.toFixed(6)),
          });
      });
      setHost(element);
    });
    return () => {
      disposed = true;
      marker.current?.remove();
      marker.current = null;
    };
  }, [map]);
  useEffect(() => {
    const target = marker.current;
    if (!target) return;
    const start = target.getLngLat();
    const duration = animate ? frameTime(520) : 0;
    if (!duration || (start.lat === point.lat && start.lng === point.lng)) {
      target.setLngLat([point.lng, point.lat]);
      return;
    }
    let frame = 0;
    const began = performance.now();
    const draw = (time: number) => {
      const progress = Math.min(1, (time - began) / duration);
      target.setLngLat([
        start.lng + (point.lng - start.lng) * progress,
        start.lat + (point.lat - start.lat) * progress,
      ]);
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [host, point.lat, point.lng, animate]);
  return host ? createPortal(children, host) : null;
}

function BusMarker({
  map,
  vehicle,
  now,
  onSelect,
}: {
  map: GLMap;
  vehicle: VehiclePoint;
  now: number;
  onSelect: () => void;
}) {
  const previous = useRef<Point | null>(null);
  const [course, setCourse] = useState<number | null>(null);
  const p = vehicle.position,
    old = now - p.timestamp > 60000;
  useEffect(() => {
    const from = previous.current;
    if (p.heading !== null) setCourse(p.heading);
    else if (from && (from.lng !== p.lng || from.lat !== p.lat)) {
      const east = (p.lng - from.lng) * Math.cos((p.lat * Math.PI) / 180);
      setCourse((Math.atan2(east, p.lat - from.lat) * 180) / Math.PI);
    }
    previous.current = { lat: p.lat, lng: p.lng };
  }, [p.lat, p.lng, p.heading]);
  const name =
    vehicle.label +
    " · " +
    (p.source === "simulation" ? "Simulação" : "GPS do motorista") +
    " · " +
    (vehicle.progress?.waiting && !old
      ? "Aguardando no ponto"
      : positionMessage(p, now)) +
    " · " +
    formatTime(p.timestamp);
  return (
    <MapMarker map={map} point={p} animate={!old}>
      <button
        type="button"
        className={"bus-marker" + (old ? " stale" : "")}
        title={name}
        aria-label={name}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <BusIcon size={21} />
        {course !== null && !old && (
          <span
            className="bus-direction"
            aria-hidden="true"
            style={{ transform: "rotate(" + course + "deg)" }}
          />
        )}
      </button>
    </MapMarker>
  );
}

export default function MapView({
  routes,
  positions = [],
  onPick,
  walking = [],
  studentPosition = null,
  onMoveStop,
  onTripDetails,
  onNotices,
  large = false,
  editor = false,
  onLocate,
  editorPosition,
  onViewportChange,
  pointsOfInterest = [],
  onPoiSelect,
}: Props) {
  const box = useRef<HTMLDivElement>(null),
    pick = useRef(onPick);
  const [map, setMap] = useState<GLMap | null>(null),
    [failed, setFailed] = useState(false);
  const [sourceError, setSourceError] = useState(false),
    [follow, setFollow] = useState(false);
  const [showStops, setShowStops] = useState(true),
    [showRoute, setShowRoute] = useState(true);
  const [expanded, setExpanded] = useState(false),
    [selected, setSelected] = useState("");
  const [now, setNow] = useState(() => Date.now());
  pick.current = onPick;
  const viewport = useRef(onViewportChange);
  viewport.current = onViewportChange;
  const fitted = useRef(false);
  const current = positions.find((v) => v.id === selected) || positions[0];
  const routeKey = JSON.stringify(routes),
    progressKey = JSON.stringify(
      positions.map((v) => [v.id, v.progress?.alongMeters]),
    ),
    walkKey = JSON.stringify(walking);
  useEffect(() => {
    let disposed = false,
      instance: GLMap | undefined;
    import("maplibre-gl")
      .then((gl) => {
        if (disposed || !box.current) return;
        gl.setWorkerUrl("/map-worker-v6.mjs");
        instance = new gl.Map({
          container: box.current,
          center: [-35.8855, -7.2185],
          zoom: 13.4,
          style,
          attributionControl: { compact: false },
        });
        const m = instance;
        m.on("load", () => {
          if (!disposed) setMap(m);
        });
        m.on("error", () => {
          if (!disposed) setSourceError(true);
        });
        m.on("dragstart", () => setFollow(false));
        m.on("moveend", () => {
          const p = m.getCenter();
          viewport.current?.({ lat: p.lat, lng: p.lng });
        });
        m.on("click", (event) =>
          pick.current?.({
            lat: Number(event.lngLat.lat.toFixed(6)),
            lng: Number(event.lngLat.lng.toFixed(6)),
          }),
        );
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      instance?.remove();
    };
  }, []);
  useEffect(() => {
    if (!positions.length) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, [positions.length]);
  useEffect(() => {
    if (!map) return;
    const data: FeatureCollection<LineString> = {
      type: "FeatureCollection",
      features: routes
        .filter((r) => r.geometry.length >= 2)
        .flatMap((r, i) => {
          const progress = positions.find((v) => v.id === r.tripId)?.progress;
          const parts = progress
            ? splitItinerary(r.geometry, progress.alongMeters)
            : { remaining: r.geometry, completed: [] };
          return (["remaining", "completed"] as const)
            .filter((part) => parts[part].length >= 2)
            .map((part) => ({
              type: "Feature" as const,
              properties: {
                part,
                color:
                  part === "completed"
                    ? palette.deep
                    : [palette.yellow, palette.secondary, palette.light][i % 3],
              },
              geometry: {
                type: "LineString" as const,
                coordinates: parts[part],
              },
            }));
        }),
    };
    const existing = map.getSource("routes") as GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource("routes", { type: "geojson", data });
      map.addLayer({
        id: "route-glow",
        source: "routes",
        type: "line",
        filter: ["==", ["get", "part"], "remaining"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": 11,
          "line-opacity": 0.15,
        },
      });
      map.addLayer({
        id: "route-lines",
        source: "routes",
        type: "line",
        filter: ["==", ["get", "part"], "remaining"],
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": ["get", "color"], "line-width": 4 },
      });
      map.addLayer({
        id: "route-completed",
        source: "routes",
        type: "line",
        filter: ["==", ["get", "part"], "completed"],
        paint: {
          "line-color": palette.deep,
          "line-width": 2,
          "line-dasharray": [2, 3],
          "line-opacity": 0.65,
        },
      });
    }
  }, [map, routeKey, progressKey]);
  useEffect(() => {
    if (!map) return;
    if (!editor || !fitted.current) fitItineraries(map, routes, walking);
    fitted.current = true;
  }, [map, routeKey, editor]);
  useEffect(() => {
    if (!map) return;
    const data: FeatureCollection<LineString> = {
      type: "FeatureCollection",
      features:
        walking.length < 2
          ? []
          : [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: walking },
              },
            ],
    };
    const existing = map.getSource("walking") as GeoJSONSource | undefined;
    if (existing) existing.setData(data);
    else {
      map.addSource("walking", { type: "geojson", data });
      map.addLayer({
        id: "walking-line",
        source: "walking",
        type: "line",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": palette.light,
          "line-width": 4,
          "line-dasharray": [0.4, 1.6],
        },
      });
    }
  }, [map, walkKey]);
  useEffect(() => {
    for (const id of ["route-lines", "route-glow", "route-completed"]) {
      if (map?.getLayer(id))
        map.setLayoutProperty(id, "visibility", showRoute ? "visible" : "none");
    }
  }, [map, showRoute, routeKey]);
  useEffect(() => {
    if (follow && map && current)
      map.easeTo({
        center: [current.position.lng, current.position.lat],
        duration: frameTime(520),
      });
  }, [follow, map, current?.position.lng, current?.position.lat, current?.id]);
  const center = (p: Point) =>
    map?.easeTo({
      center: [p.lng, p.lat],
      zoom: Math.max(map.getZoom(), 15),
      duration: frameTime(360),
    });
  const uniqueStops = new Map(
    routes.flatMap((route) =>
      route.stops.map((stop, i) => [stop.id, { stop, number: i + 1 }] as const),
    ),
  );
  return (
    <div className={"map-frame" + (large ? " large" : "")}>
      <div
        className="map-canvas"
        ref={box}
        role="region"
        aria-label="Mapa do itinerário escolar"
      />
      {map && (
        <>
          {pointsOfInterest.map((p) => (
            <MapMarker key={p.id} map={map} point={p}>
              <button
                type="button"
                className="poi-marker"
                aria-label={`Referência: ${p.name}`}
                title={p.name}
                onClick={() => onPoiSelect?.(p)}
              >
                <MapPin size={15} />
              </button>
            </MapMarker>
          ))}
          {editorPosition && (
            <MapMarker map={map} point={editorPosition}>
              <span
                className="student-marker"
                title={`Minha localização · precisão ${Math.round(editorPosition.accuracy)} m`}
                aria-label="Minha localização no editor"
              >
                <UserRound size={17} />
              </span>
            </MapMarker>
          )}
          {showStops &&
            [...uniqueStops.values()].map(({ stop, number }) => (
              <MapMarker
                key={stop.id}
                map={map}
                point={stop}
                onDrag={onMoveStop ? (p) => onMoveStop(stop.id, p) : undefined}
              >
                <span
                  className="stop-marker"
                  title={stop.name}
                  aria-label={"Parada " + number + " · " + stop.name}
                >
                  {number}
                </span>
              </MapMarker>
            ))}
          {positions.map((vehicle) => (
            <BusMarker
              key={vehicle.id}
              map={map}
              vehicle={vehicle}
              now={now}
              onSelect={() => setSelected(vehicle.id)}
            />
          ))}
          {studentPosition && (
            <MapMarker map={map} point={studentPosition}>
              <span
                className="student-marker"
                title="Sua posição autorizada"
                aria-label="Sua posição autorizada"
              >
                <UserRound size={17} />
              </span>
            </MapMarker>
          )}
        </>
      )}
      <div className="map-tag">
        <div className="map-kicker">
          <Route size={13} />
          {editor || onPick ? "EDITOR DE PARADAS" : "MAPA DA VIAGEM"}
        </div>
        <strong>
          {onPick
            ? "Clique para adicionar uma parada"
            : editor
              ? "Explorar o mapa"
              : current
                ? current.label
                : routes[0]?.name || "Nenhuma rota"}
        </strong>
        <span>
          {current
            ? (current.position.source === "simulation"
                ? "SIMULAÇÃO — POSIÇÃO FICTÍCIA"
                : "GPS do motorista") +
              " · " +
              (current.progress?.waiting &&
              now - current.position.timestamp <= 60000
                ? "Aguardando no ponto"
                : positionMessage(current.position, now))
            : routes.some((r) => !r.routed)
              ? "Traçado esquemático"
              : "Itinerário escolar"}
        </span>
        {current && (
          <small>
            Última posição às {formatTime(current.position.timestamp)}
          </small>
        )}
        {current?.progress && (
          <small className="route-progress" role="status">
            {Math.round(
              Math.max(
                0,
                current.progress.totalMeters - current.progress.alongMeters,
              ),
            )}{" "}
            m de trajeto restante
            {current.progress.offRoute ? " · Fora do itinerário" : ""}
            {!current.progress.reliable ? " · Progresso sem confirmação" : ""}
          </small>
        )}
      </div>
      {map && <MapSearch onCenter={center} onLocate={onLocate} />}
      {!map && (
        <div className="map-loading">
          <MapPin size={25} />
          <span>
            {failed
              ? "Mapa indisponível neste dispositivo"
              : "Carregando mapa…"}
          </span>
        </div>
      )}
      <div className="map-tools">
        <button
          type="button"
          title="Ampliar mapa"
          aria-label="Ampliar mapa"
          disabled={!map}
          onClick={() => map?.zoomIn({ duration: frameTime(180) })}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          title="Reduzir mapa"
          aria-label="Reduzir mapa"
          disabled={!map}
          onClick={() => map?.zoomOut({ duration: frameTime(180) })}
        >
          <Minus size={17} />
        </button>
        <button
          type="button"
          title="Controles do mapa"
          aria-label="Controles do mapa"
          aria-expanded={expanded}
          disabled={!map}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <X size={17} /> : <Layers size={17} />}
        </button>
      </div>
      {expanded && (
        <div className="map-options">
          {!editor && !onPick && (
            <>
              <button
                type="button"
                disabled={!current}
                onClick={() => current && center(current.position)}
              >
                <BusFront size={14} />
                Centralizar ônibus
              </button>
              <button
                type="button"
                disabled={!studentPosition}
                onClick={() => {
                  if (studentPosition) {
                    setFollow(false);
                    center(studentPosition);
                  }
                }}
              >
                <LocateFixed size={14} />
                Centralizar minha posição
              </button>
              <button
                type="button"
                aria-pressed={follow}
                disabled={!current}
                onClick={() => setFollow(!follow)}
              >
                <Navigation size={14} />
                {follow ? "Parar de acompanhar" : "Acompanhar ônibus"}
              </button>
            </>
          )}
          <button
            type="button"
            disabled={!routes.length}
            onClick={() => {
              if (map) {
                setFollow(false);
                setShowRoute(true);
                fitItineraries(map, routes, walking);
              }
            }}
          >
            <Route size={14} />
            Enquadrar itinerário
          </button>
          <button
            type="button"
            aria-pressed={showRoute}
            onClick={() => setShowRoute(!showRoute)}
          >
            <Route size={14} />
            {showRoute ? "Ocultar trajeto" : "Mostrar trajeto"}
          </button>
          <button
            type="button"
            aria-pressed={showStops}
            onClick={() => setShowStops(!showStops)}
          >
            <MapPin size={14} />
            {showStops ? "Ocultar paradas" : "Mostrar paradas"}
          </button>
          {current && onTripDetails && (
            <button type="button" onClick={() => onTripDetails(current.id)}>
              <PanelBottomOpen size={14} />
              Detalhes da viagem
            </button>
          )}
          {onNotices && (
            <button type="button" onClick={onNotices}>
              <Bell size={14} />
              Consultar avisos
            </button>
          )}
        </div>
      )}
      <div className="map-legend">
        <i /> Ônibus{" "}
        {walking.length > 1 && (
          <>
            <Footprints size={12} /> Caminhada pontilhada
          </>
        )}{" "}
        {showStops && <span>◉ Parada</span>}
        {sourceError && <small>Base cartográfica indisponível</small>}
      </div>
    </div>
  );
}
