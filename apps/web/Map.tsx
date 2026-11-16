"use client";
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./http";
import MapLibre, { type MapProps } from "./MapLibre";
import type { MapsConfig } from "../../packages/shared/maps";
export { BusIcon } from "./MapLibre";
const GoogleMap = lazy(() => import("./GoogleMap"));
export default function MapView(props: MapProps) {
  const [unavailable, setUnavailable] = useState(false);
  const { data } = useQuery({
    queryKey: ["maps-config"],
    queryFn: () => api<MapsConfig>("/maps/config"),
    staleTime: 300000,
    retry: false,
  });
  const google = data?.provider === "google" && !unavailable;
  const routes = props.routes.map((r) =>
    (r.geometryExpiresAt && r.geometryExpiresAt <= Date.now()) ||
    (!google && r.geometrySource === "google")
      ? {
          ...r,
          geometry: r.stops.map((s) => [s.lng, s.lat] as [number, number]),
          routed: false,
        }
      : r,
  );
  if (data?.provider === "google" && !unavailable)
    return (
      <Suspense fallback={<p role="status">Carregando mapa…</p>}>
        {data.demo && <p role="status">Google Maps · ambiente de avaliação</p>}
        <GoogleMap
          {...props}
          routes={routes}
          config={data}
          onUnavailable={() => setUnavailable(true)}
        />
      </Suspense>
    );
  return (
    <>
      {unavailable && (
        <p role="status">
          Google Maps indisponível. Exibindo o mapa de contingência
          OpenStreetMap.
        </p>
      )}
      <MapLibre
        {...props}
        routes={routes}
        walking={data?.provider === "google" ? undefined : props.walking}
      />
    </>
  );
}
