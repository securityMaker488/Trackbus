"use client";

import { useState } from "react";
import "./map-search.css";
import { Search, LocateFixed } from "lucide-react";
import type { Point } from "../../packages/domain";
import places from "../../packages/geodata/paraiba-places.json";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase();
export type EditorFix = Point & { accuracy: number; timestamp: number };
export function MapSearch({
  onCenter,
  onLocate,
}: {
  onCenter: (point: Point) => void;
  onLocate?: (fix: EditorFix) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<
      { id: string; name: string; lat: number; lng: number; remote?: boolean }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function search() {
    setMessage("");
    const trimmed = query.trim();
    const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
    if (match) {
      const lat = Number(match[1]),
        lng = Number(match[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        onCenter({ lat, lng });
        setResults([]);
        return;
      }
      setMessage("Coordenadas fora do intervalo válido.");
      return;
    }
    const local = places.places
      .filter((p) => normalize(p.name).includes(normalize(trimmed)))
      .slice(0, 12);
    if (local.length) {
      setResults(local);
      return;
    }
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/geo/search?q=${encodeURIComponent(trimmed)}`, {
        credentials: "same-origin",
      });
      if (r.ok) {
        const remote = (await r.json()) as {
          id: string;
          name: string;
          lat: number;
          lng: number;
        }[];
        setResults(
          remote.map((p) => ({ ...p, remote: true })),
        );
        if (!remote.length)
          setMessage(
            "Local não encontrado. Use latitude, longitude para qualquer localidade.",
          );
      } else {
        setMessage("Não foi possível buscar. Tente coordenadas.");
      }
    } catch {
      setMessage("Busca indisponível. Use latitude, longitude.");
    } finally {
      setBusy(false);
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setMessage("Localização indisponível.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const fix = {
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
          timestamp: Date.now(),
        };
        onCenter(fix);
        onLocate?.(fix);
        setBusy(false);
        setMessage(
          `Sua posição · precisão aproximada de ${Math.round(fix.accuracy)} m. Usada somente neste mapa.`,
        );
      },
      () => {
        setBusy(false);
        setMessage(
          "Não foi possível obter sua localização. Verifique a permissão.",
        );
      },
      { timeout: 15000, maximumAge: 0, enableHighAccuracy: true },
    );
  }
  return (
    <div className="map-search">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <input
          aria-label="Buscar local ou coordenadas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar local ou latitude, longitude"
          minLength={2}
          required
        />
        <button aria-label="Buscar no mapa" title="Buscar no mapa">
          <Search size={17} />
        </button>
        <button
          type="button"
          aria-label="Minha localização"
          title="Minha localização"
          disabled={busy}
          onClick={locate}
        >
          <LocateFixed size={17} />
        </button>
      </form>
      {results.length > 0 && (
        <div className="map-search-results">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                onCenter(p);
                setQuery(p.name);
                setResults([]);
                setMessage("");
              }}
            >
              {p.name}
              {p.remote ? "" : " · PB"}
            </button>
          ))}
          <small>{places.attribution}</small>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
