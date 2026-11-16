"use client";
/// <reference types="google.maps" />
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LocateFixed,
  BusFront,
  MapPin,
  Layers,
  Navigation,
} from "lucide-react";
import type { MapProps } from "./MapLibre";
import { BusIcon } from "./MapLibre";
import type { MapsConfig } from "../../packages/shared/maps";
import { splitItinerary } from "../../packages/domain/tracking";
import type { Point } from "../../packages/domain";
import { loadGoogleMaps } from "./google-loader";
import "./google-map.css";
import { DrawOverlay } from "./DrawOverlay";
type Props = MapProps & {
  config: Extract<MapsConfig, { provider: "google" }>;
  onUnavailable: () => void;
};
function Marker({
  map,
  point,
  title,
  drag,
  children,
}: {
  map: google.maps.Map;
  point: Point;
  title: string;
  drag?: (p: Point) => void;
  children: React.ReactNode;
}) {
  const [host] = useState(() => document.createElement("div"));
  const marker = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const latest = useRef({ point, title, drag });
  latest.current = { point, title, drag };
  useEffect(() => {
    const m = new google.maps.marker.AdvancedMarkerElement({
      map,
      content: host,
      position: latest.current.point,
      title: latest.current.title,
      gmpDraggable: !!latest.current.drag,
    });
    marker.current = m;
    const listener = m.addListener(
      "dragend",
      (e: google.maps.MapMouseEvent) => {
        if (e.latLng) latest.current.drag?.(e.latLng.toJSON());
      },
    );
    return () => {
      listener.remove();
      m.map = null;
      marker.current = null;
    };
  }, [map, host]);
  useEffect(() => {
    if (marker.current) {
      marker.current.position = point;
      marker.current.title = title;
      marker.current.gmpDraggable = !!drag;
    }
  }, [point.lat, point.lng, title, !!drag]);
  return createPortal(children, host);
}
export default function GoogleMap(props: Props) {
  const box = useRef<HTMLDivElement>(null),
    search = useRef<HTMLDivElement>(null),
    current = useRef(props);
  current.current = props;
  const [map, setMap] = useState<google.maps.Map | null>(null),
    [message, setMessage] = useState(""),
    [follow, setFollow] = useState(false),
    [stops, setStops] = useState(true),
    [now, setNow] = useState(Date.now());
  const fitted = useRef(false);
  const fittedRoute = useRef("");
  const [places, setPlaces] = useState<google.maps.places.Place[]>([]),
    [selectedPlace, setSelectedPlace] =
      useState<google.maps.places.Place | null>(null),
    [category, setCategory] = useState("school"),
    [searching, setSearching] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    let disposed = false;
    const authFailed = () => current.current.onUnavailable();
    window.addEventListener("trackbus-google-error", authFailed);
    const listeners: google.maps.MapsEventListener[] = [];
    let widget: google.maps.places.PlaceAutocompleteElement | undefined;
    (async () => {
      await loadGoogleMaps(current.current.config.browserKey);
      const [{ Map }, , { PlaceAutocompleteElement, Place }] =
        await Promise.all([
          google.maps.importLibrary("maps") as Promise<google.maps.MapsLibrary>,
          google.maps.importLibrary("marker"),
          google.maps.importLibrary(
            "places",
          ) as Promise<google.maps.PlacesLibrary>,
        ]);
      if (disposed || !box.current) return;
      const m = new Map(box.current, {
        center: { lat: -7.2185, lng: -35.887 },
        zoom: 14,
        mapId: current.current.config.mapId,
        colorScheme: google.maps.ColorScheme.DARK,
        disableDefaultUI: true,
        heading: 0,
        tilt: 0,
        headingInteractionEnabled: false,
        tiltInteractionEnabled: false,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: true,
      });
      setMap(m);
      listeners.push(
        m.addListener("idle", () => {
          const p = m.getCenter()?.toJSON();
          if (p) current.current.onViewportChange?.(p);
          if (widget && m.getBounds()) widget.locationBias = m.getBounds()!;
        }),
      );
      listeners.push(m.addListener("dragstart", () => setFollow(false)));
      listeners.push(
        m.addListener("click", async (e: google.maps.IconMouseEvent) => {
          if (e.placeId && current.current.editor) {
            e.stop();
            try {
              const p = new Place({ id: e.placeId });
              await p.fetchFields({
                fields: ["displayName", "location", "primaryTypeDisplayName"],
              });
              if (!disposed) {
                setSelectedPlace(p);
                setMessage(
                  `${p.displayName || "Local selecionado"}${p.primaryTypeDisplayName ? " · " + p.primaryTypeDisplayName : ""}. Confirme a parada na via em um local seguro.`,
                );
              }
            } catch {
              if (!disposed)
                setMessage(
                  "Não foi possível consultar este local. Você pode posicionar a parada manualmente na via.",
                );
            }
          } else if (e.latLng) current.current.onPick?.(e.latLng.toJSON());
        }),
      );
      widget = new PlaceAutocompleteElement({
        requestedLanguage: "pt-BR",
        requestedRegion: "BR",
      });
      widget.setAttribute(
        "aria-label",
        "Buscar cidade, endereço ou local no mundo",
      );
      widget.addEventListener("gmp-select", async (event) => {
        try {
          const place = (
            event as google.maps.places.PlacePredictionSelectEvent
          ).placePrediction.toPlace();
          await place.fetchFields({
            fields: ["location", "viewport", "displayName"],
          });
          if (disposed) return;
          if (place.viewport) m.fitBounds(place.viewport);
          else if (place.location) {
            m.panTo(place.location);
            m.setZoom(16);
          }
          setMessage(
            `${place.displayName || "Local encontrado"}. Escolha uma parada na via; o endereço encontrado não confirma um ponto seguro de embarque.`,
          );
        } catch {
          if (!disposed)
            setMessage(
              "Busca indisponível. Navegue no mapa ou use sua localização.",
            );
        }
      });
      widget.addEventListener("gmp-error", () =>
        setMessage("Busca temporariamente indisponível."),
      );
      search.current?.appendChild(widget);
    })().catch(() => {
      if (!disposed) current.current.onUnavailable();
    });
    return () => {
      disposed = true;
      window.removeEventListener("trackbus-google-error", authFailed);
      listeners.forEach((l) => l.remove());
      widget?.remove();
    };
  }, []);
  const routeKey = JSON.stringify(props.routes),
    progressKey = JSON.stringify(
      props.positions?.map((p) => [
        p.id,
        p.progress?.alongMeters,
        p.progress?.reliable,
      ]),
    ),
    walkKey = JSON.stringify(props.walking);
  useEffect(() => {
    if (!map) return;
    const lines: google.maps.Polyline[] = [],
      bounds = new google.maps.LatLngBounds();
    const line = (
      coords: [number, number][],
      color: string,
      dashed = false,
    ) => {
      if (coords.length < 2) return;
      const path = coords.map(([lng, lat]) => ({ lat, lng }));
      lines.push(
        new google.maps.Polyline({
          map,
          path,
          strokeColor: color,
          strokeWeight: 5,
          strokeOpacity: dashed ? 0 : 1,
          clickable: false,
          icons: dashed
            ? [
                {
                  icon: {
                    path: "M 0,-1 0,1",
                    strokeOpacity: 1,
                    strokeColor: color,
                    scale: 2,
                  },
                  offset: "0",
                  repeat: "14px",
                },
              ]
            : undefined,
        }),
      );
      path.forEach((p) => bounds.extend(p));
    };
    for (const route of current.current.routes) {
      const progress = current.current.positions?.find(
        (p) => p.id === route.tripId,
      )?.progress;
      const split = splitItinerary(
        route.geometry,
        progress?.reliable ? progress.alongMeters : 0,
      );
      line(split.remaining, "#FACC15", !route.routed);
    }
    line(current.current.walking || [], "#FDE047", true);
    if (
      (!fitted.current ||
        (!current.current.editor && fittedRoute.current !== routeKey)) &&
      !bounds.isEmpty()
    ) {
      map.fitBounds(bounds, 70);
      fitted.current = true;
      fittedRoute.current = routeKey;
    }
    return () => lines.forEach((l) => l.setMap(null));
  }, [map, routeKey, progressKey, walkKey]);
  const bus = props.positions?.[0];
  async function nearby() {
    if (!map?.getCenter() || searching) return;
    setSearching(true);
    try {
      const { Place, SearchNearbyRankPreference } =
        (await google.maps.importLibrary(
          "places",
        )) as google.maps.PlacesLibrary;
      const result = await Place.searchNearby({
        fields: ["id", "displayName", "location", "primaryTypeDisplayName"],
        locationRestriction: { center: map.getCenter()!, radius: 1500 },
        includedPrimaryTypes: [category],
        maxResultCount: 15,
        rankPreference: SearchNearbyRankPreference.DISTANCE,
      });
      setPlaces(result.places);
      setMessage(
        result.places.length
          ? "Selecione um estabelecimento no mapa para ver a referência."
          : "Nenhum local encontrado nesta busca. Você pode adicionar paradas manualmente.",
      );
    } catch {
      setMessage(
        "Não foi possível consultar os estabelecimentos. Verifique a conexão ou tente mais tarde.",
      );
    } finally {
      setSearching(false);
    }
  }
  useEffect(() => {
    if (follow && bus) map?.panTo(bus.position);
  }, [follow, map, bus?.position.lat, bus?.position.lng]);
  function locate() {
    if (!navigator.geolocation) {
      setMessage("Localização indisponível neste aparelho.");
      return;
    }
    setMessage("Aguardando sua localização…");
    navigator.geolocation.getCurrentPosition(
      (fix) => {
        const point = {
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          accuracy: fix.coords.accuracy,
          timestamp: fix.timestamp,
        };
        map?.panTo(point);
        map?.setZoom(17);
        props.onLocate?.(point);
        setMessage(
          `Localização obtida · precisão aproximada de ${Math.round(point.accuracy)} m.`,
        );
      },
      () =>
        setMessage(
          "Localização não autorizada ou indisponível. Continue pela busca ou navegando no mapa.",
        ),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  return (
    <div className={`map-shell google-map ${props.large ? "large" : ""}`}>
      <div
        ref={box}
        className="google-map-canvas"
        aria-label="Mapa Google do itinerário escolar"
      />
      <div className="google-search" ref={search} />
      {map && props.onDraw && (
        <DrawOverlay
          unproject={(x, y) => {
            const projection = map.getProjection(),
              center = map.getCenter(),
              zoom = map.getZoom(),
              rect = box.current?.getBoundingClientRect();
            if (!projection || !center || zoom === undefined || !rect)
              return null;
            const pixel = projection.fromLatLngToPoint(center);
            if (!pixel) return null;
            return (
              projection
                .fromPointToLatLng(
                  new google.maps.Point(
                    pixel.x + (x - rect.width / 2) / 2 ** zoom,
                    pixel.y + (y - rect.height / 2) / 2 ** zoom,
                  ),
                )
                ?.toJSON() || null
            );
          }}
          onDraw={props.onDraw}
        />
      )}
      <div className="google-actions">
        <button type="button" onClick={locate} disabled={!map}>
          <LocateFixed size={16} /> Usar minha localização
        </button>
        {bus && (
          <button
            type="button"
            onClick={() => {
              map?.panTo(bus.position);
              setFollow(!follow);
            }}
            aria-pressed={follow}
          >
            <BusFront size={16} />
            {follow ? "Acompanhando ônibus" : "Centralizar ônibus"}
          </button>
        )}
        {props.studentPosition && (
          <button
            type="button"
            onClick={() => map?.panTo(props.studentPosition!)}
          >
            <Navigation size={16} /> Centralizar aluno
          </button>
        )}
        <button
          type="button"
          onClick={() => setStops(!stops)}
          aria-pressed={stops}
        >
          <Layers size={16} /> Paradas
        </button>
        {props.editor && (
          <>
            <select
              aria-label="Categoria de estabelecimento"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {[
                ["school", "Escolas"],
                ["university", "Universidades"],
                ["bank", "Bancos"],
                ["hospital", "Saúde"],
                ["pharmacy", "Farmácias"],
                ["supermarket", "Supermercados"],
                ["park", "Praças e parques"],
                ["bus_station", "Terminais"],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" disabled={!map || searching} onClick={nearby}>
              {searching ? "Buscando…" : "Buscar locais próximos"}
            </button>
          </>
        )}
      </div>
      {map && (
        <>
          {places
            .filter((p) => p.location)
            .map((p) => (
              <Marker
                key={p.id}
                map={map}
                point={p.location!.toJSON()}
                title={p.displayName || "Local"}
              >
                <button
                  className="stop-marker"
                  type="button"
                  aria-label={p.displayName || "Estabelecimento"}
                  onClick={() => setSelectedPlace(p)}
                >
                  <MapPin size={16} />
                </button>
              </Marker>
            ))}
          {stops &&
            props.routes
              .flatMap((r) => r.stops)
              .map((s, i) => (
                <Marker
                  key={s.id}
                  map={map}
                  point={s}
                  title={s.name}
                  drag={
                    props.onMoveStop
                      ? (p) => props.onMoveStop?.(s.id, p)
                      : undefined
                  }
                >
                  <button
                    className="stop-marker"
                    title={s.name}
                    type="button"
                    onClick={() => setMessage(`${i + 1}. ${s.name}`)}
                  >
                    {i + 1}
                  </button>
                </Marker>
              ))}
          {props.positions?.map((p) => (
            <Marker key={p.id} map={map} point={p.position} title={p.label}>
              <button
                type="button"
                className={`bus-marker ${now - p.position.timestamp > 60000 ? "stale" : ""}`}
                onClick={() => props.onTripDetails?.(p.id)}
                title={p.label}
              >
                <BusIcon />
                {p.position.heading !== null && (
                  <span
                    className="bus-direction"
                    style={{ transform: `rotate(${p.position.heading}deg)` }}
                  />
                )}
              </button>
            </Marker>
          ))}
          {props.studentPosition && (
            <Marker
              map={map}
              point={props.studentPosition}
              title="Sua localização"
            >
              <span className="student-marker">
                <MapPin size={20} />
              </span>
            </Marker>
          )}
          {props.editorPosition && (
            <Marker
              map={map}
              point={props.editorPosition}
              title="Sua localização no editor"
            >
              <span className="student-marker">
                <LocateFixed size={20} />
              </span>
            </Marker>
          )}
        </>
      )}
      {props.editor && selectedPlace?.location && (
        <div className="google-place-card">
          <strong>{selectedPlace.displayName || "Local selecionado"}</strong>
          <small>
            {selectedPlace.primaryTypeDisplayName || "Referência no mapa"}
          </small>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              props.onGoogleReference?.({
                id: selectedPlace.id,
                ...selectedPlace.location!.toJSON(),
              });
              setSelectedPlace(null);
              setMessage(
                "Agora toque em um local seguro na via, a até 150 m da referência.",
              );
            }}
          >
            Adicionar parada próxima
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setSelectedPlace(null)}
          >
            Fechar referência
          </button>
          <small>
            Google Maps · Confirme acesso, lado da via e segurança do embarque.
          </small>
        </div>
      )}
      <div className="google-status" role="status">
        {bus
          ? `${bus.position.source === "simulation" ? "SIMULAÇÃO — POSIÇÃO FICTÍCIA" : "GPS do motorista"} · ${now - bus.position.timestamp > 60000 ? "Posição desatualizada" : bus.progress?.waiting ? "Aguardando no ponto" : "Última posição"} · ${new Date(bus.position.timestamp).toLocaleTimeString("pt-BR")}`
          : props.onPick
            ? "Toque na via para adicionar uma parada"
            : "Explore o mapa ou busque um local"}
        {message && <small>{message}</small>}
      </div>
    </div>
  );
}
