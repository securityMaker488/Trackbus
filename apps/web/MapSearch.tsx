import { useState } from "react";
import "./map-search.css";
import { Search, LocateFixed } from "lucide-react";
import type { Point } from "../../packages/domain";
import places from "../../packages/geodata/paraiba-places.json";
const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
      { id: string; name: string; lat: number; lng: number }[]
    >([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  function search() {
    setMessage("");
    const match = query
      .trim()
      .match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
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
    const found = places.places
      .filter((p) => normalize(p.name).includes(normalize(query.trim())))
      .slice(0, 12);
    setResults(found);
    if (!found.length)
      setMessage(
        "Cidade não encontrada. Use latitude, longitude para qualquer localidade.",
      );
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
          timestamp: p.timestamp,
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
          aria-label="Buscar cidade ou coordenadas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cidade na PB ou latitude, longitude"
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
              {p.name} · PB
            </button>
          ))}
          <small>{places.attribution}</small>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
