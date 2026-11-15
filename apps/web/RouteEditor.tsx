import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Hand,
  MapPin,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { distance, type Point, type Stop } from "../../packages/domain";
import type { Route } from "../../packages/shared/types";
import {
  poiCategories,
  type Poi,
  type PoiResult,
} from "../../packages/shared/pois";
import MapView from "./Map";
import type { EditorFix } from "./MapSearch";
import { Modal } from "./Modal";
import { api } from "./http";
import { useEditHistory } from "./useEditHistory";
import "./route-editor.css";

type Preview = {
  available: boolean;
  geometry?: [number, number][];
  meters?: number;
  message?: string;
};
const coordinateKey = (stops: Stop[]) =>
  JSON.stringify(stops.map((s) => [s.id, s.lat, s.lng]));
export function RouteEditor({
  school,
  route,
  sequence,
  driver,
  onClose,
  onSaved,
}: {
  school: string;
  route?: Route;
  sequence: number;
  driver: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(
      route?.name || `Nova rota ${String(sequence).padStart(2, "0")}`,
    ),
    [shift, setShift] = useState(route?.shift || "Manhã"),
    [departureTime, setDepartureTime] = useState(route?.departureTime || ""),
    [active, setActive] = useState(route?.active ?? true),
    [description, setDescription] = useState(route?.description || "");
  const history = useEditHistory<Stop[]>(route?.stops || []),
    stops = history.value,
    setStops = history.change;
  const [mode, setMode] = useState<"add" | "pan">("add"),
    [saving, setSaving] = useState(false),
    [confirmClear, setConfirmClear] = useState(false),
    [fix, setFix] = useState<EditorFix | null>(null),
    [pois, setPois] = useState<PoiResult | null>(null),
    [category, setCategory] = useState("all"),
    [selectedPoi, setSelectedPoi] = useState<Poi | null>(null),
    [armedPoi, setArmedPoi] = useState<Poi | null>(null),
    [suggestion, setSuggestion] = useState<{ stopId: string; poi: Poi } | null>(
      null,
    ),
    [loadingPois, setLoadingPois] = useState(false),
    [preview, setPreview] = useState<{ key: string; result: Preview } | null>(
      null,
    ),
    [previewBusy, setPreviewBusy] = useState(false);
  const center = useRef<Point>({ lat: -7.2185, lng: -35.8855 }),
    queryId = useRef(0),
    lastAdded = useRef("");
  const key = coordinateKey(stops),
    original = !!route?.routed && key === coordinateKey(route.stops),
    previewed = preview?.key === key ? preview.result : null,
    geometry =
      previewed?.geometry ||
      (original
        ? route!.geometry
        : stops.map((s) => [s.lng, s.lat] as [number, number])),
    routed = !!previewed?.available || original;
  function add(point: Point, first = false) {
    if (
      first &&
      (!fix || Date.now() - fix.timestamp > 120000 || fix.accuracy > 100)
    ) {
      toast.error("Atualize sua localização antes de usá-la como origem.");
      return;
    }
    if (stops.length >= 50) {
      toast.error("Limite de 50 paradas por rota.");
      return;
    }
    if (stops.some((s) => distance(s, point) < 2)) {
      toast.error("Já existe uma parada neste ponto.");
      return;
    }
    const stop: Stop = {
      lat: point.lat,
      lng: point.lng,
      id: crypto.randomUUID(),
      name: `Parada ${String(stops.length + 1).padStart(2, "0")}`,
      dwellSeconds: 45,
    };
    setStops(first ? [stop, ...stops] : [...stops, stop]);
    const nearby = [
      ...(armedPoi ? [armedPoi] : []),
      ...(pois?.points || []),
    ].find((p) => distance(p, point) <= 150);
    setSuggestion(nearby ? { stopId: stop.id, poi: nearby } : null);
    setArmedPoi(null);
    lastAdded.current = stop.id;
    if (!nearby)
      void api<PoiResult>(
        `/geo/pois?lat=${point.lat.toFixed(5)}&lng=${point.lng.toFixed(5)}&radius=150&category=all`,
      )
        .then((result) => {
          if (lastAdded.current === stop.id && result.points[0])
            setSuggestion({ stopId: stop.id, poi: result.points[0] });
        })
        .catch(() => {
          /* Optional naming must never prevent adding a stop. */
        });
  }
  function update(id: string, patch: Partial<Stop>) {
    setStops((s) => s.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  async function findPois() {
    const id = ++queryId.current;
    setLoadingPois(true);
    setSelectedPoi(null);
    setArmedPoi(null);
    try {
      const p = center.current;
      const result = await api<PoiResult>(
        `/geo/pois?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}&radius=1500&category=${category}`,
      );
      if (queryId.current === id) setPois(result);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (queryId.current === id) setLoadingPois(false);
    }
  }
  const body = () => ({
    name: name.trim() || `Nova rota ${String(sequence).padStart(2, "0")}`,
    description,
    shift,
    departureTime,
    stops,
    active,
    expectedVersion: route?.version,
  });
  return (
    <Modal
      wide
      title={route ? "Editar itinerário" : "Criar rota"}
      subtitle={
        driver
          ? "Crie um rascunho e envie para aprovação. Só a administração publica para os alunos."
          : "Toque no mapa para criar origem, paradas e destino. Os nomes são opcionais."
      }
      onClose={onClose}
    >
      <div className="editor-toolbar" aria-label="Ferramentas do itinerário">
        <div className="editor-modes">
          <button
            className="button secondary"
            aria-pressed={mode === "add"}
            onClick={() => setMode("add")}
          >
            <Plus size={16} />
            Adicionar paradas
          </button>
          <button
            className="button secondary"
            aria-pressed={mode === "pan"}
            onClick={() => {
              setMode("pan");
              setArmedPoi(null);
            }}
          >
            <Hand size={16} />
            Explorar mapa
          </button>
        </div>
        <button
          className="icon-button"
          title="Desfazer"
          aria-label="Desfazer"
          disabled={!history.canUndo}
          onClick={history.undo}
        >
          <Undo2 size={18} />
        </button>
        <button
          className="icon-button"
          title="Refazer"
          aria-label="Refazer"
          disabled={!history.canRedo}
          onClick={history.redo}
        >
          <Redo2 size={18} />
        </button>
        <button
          className="text-button"
          disabled={!stops.length}
          onClick={() => setConfirmClear(true)}
        >
          Limpar
        </button>
        <button
          className="button secondary"
          disabled={stops.length < 2 || previewBusy}
          onClick={async () => {
            setPreviewBusy(true);
            try {
              const result = await api<Preview>("/routes/preview", body());
              setPreview({ key, result });
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setPreviewBusy(false);
            }
          }}
        >
          {previewBusy ? "Calculando…" : "Pré-visualizar vias"}
        </button>
      </div>
      {confirmClear && (
        <div className="editor-confirm" role="alert">
          <span>Remover todas as paradas deste rascunho?</span>
          <button
            className="button secondary"
            onClick={() => setConfirmClear(false)}
          >
            Manter
          </button>
          <button
            className="button primary"
            onClick={() => {
              setStops([]);
              setSuggestion(null);
              setConfirmClear(false);
            }}
          >
            Limpar paradas
          </button>
        </div>
      )}
      <div className="route-editor">
        <div className="route-editor-form">
          <span className="eyebrow">{school}</span>
          <label>
            Nome da rota
            <input
              value={name}
              maxLength={100}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome automático ao salvar"
            />
          </label>
          <div className="editor-schedule">
            <label>
              Turno
              <select value={shift} onChange={(e) => setShift(e.target.value)}>
                {["Manhã", "Tarde", "Noite"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Horário de referência
              <input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
              />
            </label>
          </div>
          <details>
            <summary>Descrição e situação</summary>
            <label>
              Descrição
              <textarea
                rows={2}
                maxLength={500}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label>
              Situação
              <select
                value={active ? "active" : "inactive"}
                onChange={(e) => setActive(e.target.value === "active")}
              >
                <option value="active">Ativa</option>
                <option value="inactive">Inativa</option>
              </select>
            </label>
          </details>
          {fix && (
            <div className="editor-note">
              <strong>Minha localização</strong>
              <small>
                Precisão aproximada: {Math.round(fix.accuracy)} m. Confira a
                posição na via.
              </small>
              <button
                className="text-button"
                disabled={
                  Date.now() - fix.timestamp > 120000 || fix.accuracy > 100
                }
                onClick={() => add(fix, true)}
              >
                Usar como origem
              </button>
              <small>
                Apenas neste editor. Não inicia o GPS de uma viagem.
              </small>
            </div>
          )}
          <div className="stops-heading">
            <h3>
              Paradas <span>{stops.length}</span>
            </h3>
            <button className="text-button" onClick={() => add(center.current)}>
              <Plus size={14} />
              No centro do mapa
            </button>
          </div>
          {!stops.length && (
            <div className="editor-note">
              <MapPin size={22} />
              <strong>Seu primeiro toque cria a origem.</strong>
              <small>
                Depois, adicione as paradas. O último ponto será o destino.
              </small>
            </div>
          )}
          {suggestion && stops.some((s) => s.id === suggestion.stopId) && (
            <div className="editor-note" role="status">
              <strong>Referência próxima encontrada</strong>
              <span>{suggestion.poi.name}</span>
              <div className="editor-modes">
                <button
                  className="text-button"
                  onClick={() => {
                    update(suggestion.stopId, {
                      name: `Próximo a ${suggestion.poi.name}`.slice(0, 100),
                      reference: {
                        id: suggestion.poi.id,
                        name: suggestion.poi.name,
                        source: "OpenStreetMap",
                      },
                    });
                    setSuggestion(null);
                  }}
                >
                  Usar referência
                </button>
                <button
                  className="text-button"
                  onClick={() => setSuggestion(null)}
                >
                  Manter nome
                </button>
              </div>
            </div>
          )}
          <div className="stop-editor-list">
            {stops.map((s, i) => (
              <div className="stop-edit" key={s.id}>
                <span className="stop-index">{i + 1}</span>
                <div>
                  <small>
                    {i === 0
                      ? "Origem"
                      : i === stops.length - 1
                        ? "Destino"
                        : "Parada intermediária"}
                  </small>
                  <input
                    aria-label={`Nome da parada ${i + 1}`}
                    value={s.name}
                    maxLength={100}
                    onChange={(e) => update(s.id, { name: e.target.value })}
                  />
                  {s.reference && <small>Referência: {s.reference.name}</small>}
                  <details>
                    <summary>Ajustar coordenadas</summary>
                    <div className="coordinate-inputs">
                      <input
                        aria-label={`Latitude ${i + 1}`}
                        type="number"
                        step="any"
                        min={-90}
                        max={90}
                        value={s.lat}
                        onChange={(e) =>
                          update(s.id, { lat: Number(e.target.value) })
                        }
                      />
                      <input
                        aria-label={`Longitude ${i + 1}`}
                        type="number"
                        step="any"
                        min={-180}
                        max={180}
                        value={s.lng}
                        onChange={(e) =>
                          update(s.id, { lng: Number(e.target.value) })
                        }
                      />
                    </div>
                  </details>
                </div>
                <div className="stop-buttons">
                  <button
                    className="icon-button"
                    title="Subir parada"
                    disabled={i === 0}
                    onClick={() => {
                      const next = [...stops];
                      [next[i - 1], next[i]] = [next[i], next[i - 1]];
                      setStops(next);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Descer parada"
                    disabled={i === stops.length - 1}
                    onClick={() => {
                      const next = [...stops];
                      [next[i + 1], next[i]] = [next[i], next[i + 1]];
                      setStops(next);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="Excluir parada"
                    onClick={() => setStops(stops.filter((p) => p.id !== s.id))}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <section className="poi-panel" aria-label="Referências próximas">
            <h3>O que há por perto?</h3>
            <p>Explore o mapa e consulte referências a até 1,5 km do centro.</p>
            <label>
              Categoria
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setPois(null);
                  setSelectedPoi(null);
                  setArmedPoi(null);
                }}
              >
                <option value="all">Todas as categorias</option>
                {Object.entries(poiCategories).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={loadingPois}
              onClick={() => void findPois()}
            >
              {loadingPois ? "Buscando…" : "Buscar referências nesta região"}
            </button>
            {pois && (
              <>
                <small>{pois.coverage}</small>
                {!pois.points.length && (
                  <p role="status">
                    Nenhuma referência cadastrada nesta região. Continue criando
                    suas paradas normalmente.
                  </p>
                )}
                <div className="poi-results">
                  {pois.points.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPoi(p)}
                      aria-pressed={selectedPoi?.id === p.id}
                    >
                      <strong>{p.name}</strong>
                      <span>
                        {poiCategories[p.category]} · {p.meters} m do centro
                      </span>
                    </button>
                  ))}
                </div>
                {pois.truncated && (
                  <small>
                    Mostrando as 40 referências mais próximas. Filtre por
                    categoria.
                  </small>
                )}
                <small>
                  {pois.attribution} · {pois.dataDate?.slice(0, 10)}
                </small>
              </>
            )}
            {selectedPoi && (
              <div className="editor-note">
                <strong>{selectedPoi.name}</strong>
                <span>{poiCategories[selectedPoi.category]}</span>
                <small>
                  {selectedPoi.municipality ||
                    "Município não informado na fonte"}
                </small>
                <button
                  className="button primary"
                  onClick={() => {
                    setArmedPoi(selectedPoi);
                    setMode("add");
                  }}
                >
                  Adicionar parada próxima
                </button>
                <small>
                  Escolha no mapa um ponto seguro na via próxima. O prédio é
                  apenas uma referência.
                </small>
              </div>
            )}
          </section>
        </div>
        <div className="editor-map-area">
          <MapView
            large
            editor
            routes={stops.length ? [{ name, stops, geometry, routed }] : []}
            onPick={mode === "add" ? (p) => add(p) : undefined}
            onMoveStop={(id, p) => update(id, { ...p, reference: undefined })}
            onViewportChange={(p) => {
              center.current = p;
            }}
            onLocate={setFix}
            editorPosition={fix}
            pointsOfInterest={pois?.points || []}
            onPoiSelect={setSelectedPoi}
          />
          <div className="editor-map-hint" role="status">
            {armedPoi
              ? `Toque na via próxima a ${armedPoi.name}.`
              : mode === "add"
                ? "Toque para adicionar · Arraste o mapa para explorar · Arraste uma parada para ajustar"
                : "Explore sem adicionar pontos. Volte a “Adicionar paradas” quando quiser continuar."}
          </div>
          {previewed && (
            <p className="editor-preview" role="status">
              {previewed.available
                ? `Prévia sobre vias · ${((previewed.meters || 0) / 1000).toFixed(1)} km. Confira o trajeto e as condições locais.`
                : previewed.message}
            </p>
          )}
        </div>
      </div>
      <div className="form-actions">
        <span className="muted">
          {stops.length} paradas ·{" "}
          {driver ? "Rascunho privado" : "Publicação controlada"}
        </span>
        <button className="button secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={saving || stops.length < 2}
          onClick={async () => {
            setSaving(true);
            try {
              await api(
                route ? `/routes/${route.id}` : "/routes",
                {
                  ...body(),
                  stops: stops.map((s, i) => ({
                    ...s,
                    name:
                      s.name.trim() ||
                      `Parada ${String(i + 1).padStart(2, "0")}`,
                  })),
                },
                route ? "PUT" : "POST",
              );
              toast.success(
                driver
                  ? "Rascunho salvo. Envie para aprovação quando estiver pronto."
                  : "Itinerário salvo",
              );
              onSaved();
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving
            ? "Salvando…"
            : driver
              ? "Salvar rascunho"
              : "Salvar itinerário"}
          <Check size={16} />
        </button>
      </div>
    </Modal>
  );
}
