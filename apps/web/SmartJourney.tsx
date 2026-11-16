"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell,
  BusFront,
  Footprints,
  MapPin,
  Star,
  Navigation,
  LogOut,
} from "lucide-react";
import MapView from "./Map";
import { Brand } from "./Brand";
import type { journeyState } from "../api/journey";
import type { Point } from "../../packages/domain";
import { departure } from "../../packages/domain";
import { api } from "./http";
import { PushChoice } from "./PushChoice";
import { InstallApp } from "./InstallApp";
type Journey = Awaited<ReturnType<typeof journeyState>> & {
  pushKey?: string | null;
};
const clock = (n: number) =>
  new Date(n).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bahia",
  });
const descriptions = {
  scheduled: "Viagem programada",
  in_progress: "Ônibus a caminho",
  paused: "Viagem pausada",
  interrupted: "Viagem interrompida",
  completed: "Viagem concluída",
  cancelled: "Viagem cancelada",
};
export function JoinJourney({ onJoin }: { onJoin: () => void }) {
  const schools = useQuery({
    queryKey: ["open-schools"],
    queryFn: () => api<{ id: string; name: string }[]>("/journey/schools"),
  });
  const [name, setName] = useState(""),
    [school, setSchool] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <form
      className="journey-entry"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        try {
          await api("/journey/join", {
            name,
            schoolId: school || schools.data?.[0]?.id,
          });
          onJoin();
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Como podemos te chamar?
        <input
          required
          minLength={2}
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seu nome ou apelido"
          autoComplete="off"
        />
      </label>
      <label>
        Escola demonstrativa
        <select
          required
          value={school || schools.data?.[0]?.id || ""}
          onChange={(e) => setSchool(e.target.value)}
        >
          {schools.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {schools.isSuccess && !schools.data.length && (
        <p>
          Nenhuma escola abriu a sala de apresentação. A gestão pode abri-la em
          Configurações.
        </p>
      )}
      {schools.isError && (
        <p role="alert">
          Não foi possível consultar as escolas.{" "}
          <button type="button" onClick={() => schools.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <button
        className="button primary"
        disabled={busy || !schools.data?.length}
      >
        {busy ? "Entrando…" : "Entrar no TrackBus"}
      </button>
    </form>
  );
}
type Walk = {
  available: boolean;
  reason?: string;
  geometry?: [number, number][];
  seconds?: number;
  meters?: number;
  source?: string;
  calculatedAt?: number;
  validUntil?: number;
};
export function SmartJourney({
  visitor = false,
  onLeave,
}: {
  visitor?: boolean;
  onLeave?: () => void;
}) {
  const qc = useQueryClient(),
    query = useQuery({
      queryKey: ["smart-journey"],
      queryFn: () => api<Journey>("/journey/state"),
      refetchInterval: (q) =>
        q.state.data?.trip &&
        ["in_progress", "paused", "interrupted"].includes(
          q.state.data.trip.status,
        )
          ? 5000
          : 15000,
      refetchIntervalInBackground: false,
      retry: false,
    });
  const [search, setSearch] = useState(""),
    [shift, setShift] = useState(""),
    [routeId, setRoute] = useState(""),
    [stopId, setStop] = useState(""),
    [favorite, setFavorite] = useState(false),
    [notify, setNotify] = useState(true),
    [busy, setBusy] = useState(false),
    [position, setPosition] = useState<Point | null>(null),
    [walk, setWalk] = useState<Walk | null>(null),
    [locating, setLocating] = useState(false),
    [now, setNow] = useState(Date.now()),
    [showAlerts, setShowAlerts] = useState(false);
  const [habitualMinutes, setHabitualMinutes] = useState("");
  const picker = useRef<HTMLDetailsElement>(null);
  const openedNotification = useRef(false);
  const lastAlert = useRef(""),
    generation = useRef(0),
    seen = useRef(new Set<string>()),
    d = query.data,
    selected = d?.preferences.find((p) => p.selected),
    storedRoute = d?.routes.find((r) => r.id === selected?.routeId);
  useEffect(() => {
    if (!d || openedNotification.current) return;
    openedNotification.current = true;
    const params = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    );
    const tripId = params.get("trip"),
      stop = params.get("stop");
    if (!tripId || !stop) return;
    const targetTrip = d.trips.find((t) => t.id === tripId);
    const route = d.routes.find((r) => r.id === targetTrip?.routeId);
    if (
      !targetTrip ||
      !route?.stops.some((s) => s.id === stop) ||
      targetTrip.currentCycle !== Number(params.get("cycle")) ||
      ["completed", "cancelled"].includes(targetTrip.status)
    ) {
      toast.info(
        "Este aviso é de uma viagem ou volta anterior. Consulte a situação atual.",
      );
      return;
    }
    if (selected?.routeId === route.id && selected.stopId === stop) return;
    const pref = d.preferences.find((p) => p.routeId === route.id);
    void api("/journey/select", {
      routeId: route.id,
      stopId: stop,
      favorite: pref?.favorite ?? false,
      notify: pref?.notify ?? true,
    })
      .then(() => query.refetch())
      .catch((e: Error) => toast.error(e.message));
  }, [d, selected, query]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    generation.current++;
    setWalk(null);
    setPosition(null);
    setLocating(false);
    setRoute(selected?.routeId || "");
    setStop(selected?.stopId || "");
    setFavorite(selected?.favorite || false);
    setNotify(selected?.notify ?? true);
  }, [
    selected?.routeId,
    selected?.stopId,
    selected?.favorite,
    selected?.notify,
    d?.trip?.currentCycle,
  ]);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const visible = (d?.routes || []).filter(
      (r) =>
        (!shift || r.shift === shift) &&
        r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
    ),
    draft = d?.routes.find((r) => r.id === routeId),
    target = storedRoute?.stops.find((s) => s.id === selected?.stopId);
  const eta = d?.position && now - d.position.timestamp <= 60000 ? d.eta : null,
    remaining = (d?.trip?.waitUntil || 0) - now,
    waiting = !!(
      d?.progress?.waiting &&
      d.position &&
      now - d.position.timestamp <= 60000 &&
      d.trip &&
      ["in_progress", "paused"].includes(d.trip.status)
    ),
    rec = departure(
      eta?.minMinutes ?? null,
      walk?.validUntil && now > walk.validUntil
        ? null
        : (walk?.seconds ?? null),
      d?.margin,
    );
  const recommendation =
    rec.status === "on_time"
      ? "Você provavelmente consegue chegar a tempo."
      : rec.status === "leave_now"
        ? rec.minutes === 0
          ? "Hora recomendada de sair."
          : "Margem pequena para chegar à parada."
        : rec.status === "insufficient"
          ? "O ônibus poderá chegar antes de você. Não corra nem tente alcançar o veículo em movimento."
          : "Estimativa de saída indisponível.";
  useEffect(() => {
    if (!selected?.notify || !d?.trip) return;
    const approaching = eta?.available && eta.minMinutes <= 3;
    const message =
      rec.status === "leave_now"
        ? "Hora recomendada de sair para a parada."
        : approaching
          ? "O ônibus está se aproximando da parada."
          : "";
    const key =
      d.trip.id + ":" + d.trip.currentCycle + ":" + selected.stopId + message;
    if (message && !seen.current.has(key)) {
      seen.current.add(key);
      toast.info(message);
    }
  }, [rec.status, eta?.minMinutes, selected, d?.trip]);
  useEffect(() => {
    const n = d?.notices[0];
    if (selected?.notify && n && lastAlert.current !== n.id) {
      if (lastAlert.current) toast.info(n.message);
      lastAlert.current = n.id;
    }
  }, [d?.notices, selected?.notify]);
  const retire = async () => {
    await api("/journey/leave", {});
    qc.clear();
    onLeave?.();
  };
  if (!d)
    return (
      <div className="panel journey-panel">
        <p>{query.error ? query.error.message : "Carregando sua viagem…"}</p>
        <button className="button secondary" onClick={() => query.refetch()}>
          Atualizar
        </button>
        {visitor && <button onClick={retire}>Sair da demonstração</button>}
      </div>
    );
  const choose = async () => {
    setBusy(true);
    try {
      await api("/journey/select", { routeId, stopId, favorite, notify });
      await query.refetch();
      if (picker.current) picker.current.open = false;
      toast.success("Preferência salva");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  function locate() {
    if (!navigator.geolocation) {
      toast.error("GPS indisponível neste dispositivo");
      return;
    }
    setLocating(true);
    const request = ++generation.current;
    navigator.geolocation.getCurrentPosition(
      async (fix) => {
        if (request !== generation.current) return;
        if (fix.coords.accuracy > 100 || Date.now() - fix.timestamp > 60000) {
          setLocating(false);
          toast.error(
            "GPS impreciso ou antigo. Tente novamente em um local aberto.",
          );
          return;
        }
        const p = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        setPosition(p);
        try {
          const result = await api<Walk>("/journey/walk", p);
          if (request === generation.current) setWalk(result);
        } catch (err) {
          if (request === generation.current)
            setWalk({ available: false, reason: (err as Error).message });
        } finally {
          if (request === generation.current) setLocating(false);
        }
      },
      () => {
        if (request === generation.current) {
          setLocating(false);
          toast.error(
            "Localização indisponível. Verifique a permissão do navegador.",
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }
  const fresh = d.position && now - d.position.timestamp <= 60000;
  return (
    <section className="journey-shell">
      <header className="journey-header">
        <div>
          <Brand />
          <span className="eyebrow">SMART JOURNEY</span>
          <h1>Sua viagem, {d.name}.</h1>
          <p>
            {d.school} ·{" "}
            {visitor ? "Participante da demonstração" : "Portal do aluno"}
          </p>
        </div>
        {visitor && (
          <button className="button secondary" onClick={retire}>
            <LogOut size={16} /> Sair
          </button>
        )}
      </header>
      <InstallApp />
      {!d.routes.length && (
        <section className="panel first-route">
          <BusFront size={38} />
          <h2>Estamos preparando as rotas.</h2>
          <p>
            Assim que a gestão publicar um trajeto, ele aparecerá aqui para você
            escolher.
          </p>
          <button className="button secondary" onClick={() => query.refetch()}>
            Atualizar rotas
          </button>
        </section>
      )}
      {d.routes.length > 0 && (
        <details
          ref={picker}
          className="panel journey-panel"
          open={!selected || undefined}
        >
          <summary>
            <Navigation size={17} />{" "}
            {selected
              ? `Escolha de rota · ${storedRoute?.name || "Atualizar"}`
              : "Escolha sua rota e parada"}
          </summary>
          <div className="journey-fields">
            <label>
              Buscar rota
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome da rota"
              />
            </label>
            <label>
              Turno
              <select value={shift} onChange={(e) => setShift(e.target.value)}>
                <option value="">Todos</option>
                {Array.from(new Set(d.routes.map((r) => r.shift))).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Rota da escola
              <select
                value={routeId}
                onChange={(e) => {
                  const r = d.routes.find((r) => r.id === e.target.value),
                    saved = d.preferences.find((p) => p.routeId === r?.id);
                  setRoute(e.target.value);
                  setStop(saved?.stopId || r?.stops[0]?.id || "");
                  setFavorite(saved?.favorite || false);
                  setNotify(saved?.notify ?? true);
                }}
              >
                <option value="">Selecionar rota</option>
                {visible.map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name} · {r.shift}
                    {d.preferences.some((p) => p.favorite && p.routeId === r.id)
                      ? " ★"
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Parada de embarque
              <select value={stopId} onChange={(e) => setStop(e.target.value)}>
                <option value="">Selecionar parada</option>
                {draft?.stops.map((s, i) => (
                  <option value={s.id} key={s.id}>
                    {i + 1}. {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="journey-route-cards" aria-label="Rotas disponíveis">
            {visible.map((r) => {
              const trip = d.trips.find(
                (t) =>
                  t.routeId === r.id &&
                  !["completed", "cancelled"].includes(t.status),
              );
              return (
                <button
                  key={r.id}
                  className={
                    "journey-route-card" + (routeId === r.id ? " selected" : "")
                  }
                  aria-pressed={routeId === r.id}
                  onClick={() => {
                    const saved = d.preferences.find((p) => p.routeId === r.id);
                    setRoute(r.id);
                    setStop(saved?.stopId || r.stops[0]?.id || "");
                    setFavorite(saved?.favorite || false);
                    setNotify(saved?.notify ?? true);
                  }}
                >
                  <span>
                    <strong>
                      {routeId === r.id ? "✓ " : ""}
                      {r.name}
                    </strong>
                    <small>
                      {r.departureTime || r.shift} ·{" "}
                      {trip
                        ? descriptions[trip.status]
                        : "Sem viagem programada"}
                    </small>
                  </span>
                  <Star
                    size={19}
                    fill={
                      d.preferences.some(
                        (p) => p.routeId === r.id && p.favorite,
                      )
                        ? "currentColor"
                        : "none"
                    }
                  />
                </button>
              );
            })}
            {!visible.length && (
              <p>Nenhuma rota encontrada para este filtro.</p>
            )}
          </div>
          {draft && (
            <p>
              {draft.description} · Horários:{" "}
              {d.trips
                .filter((t) => t.routeId === draft.id)
                .slice(0, 4)
                .map((t) => clock(t.plannedStart))
                .join(" / ") || "Sem viagens programadas"}
            </p>
          )}
          <div className="journey-actions">
            <label>
              <input
                type="checkbox"
                checked={favorite}
                onChange={(e) => setFavorite(e.target.checked)}
              />{" "}
              <Star size={15} /> Favoritar rota e parada
            </label>
            <label>
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
              />{" "}
              <Bell size={15} /> Alertas nesta tela
            </label>
            <button
              className="button primary"
              disabled={busy || !routeId || !stopId}
              onClick={choose}
            >
              Salvar escolha
            </button>
          </div>
          <small>
            A escolha serve para acompanhamento. A escola confirma a vaga e o
            embarque.
          </small>
        </details>
      )}
      {selected && storedRoute && (
        <>
          {!!d.trip?.currentCycle && (
            <div className="panel" style={{ padding: 18, marginBottom: 16 }}>
              <strong>
                Volta {d.trip.currentCycle} ·{" "}
                {selected.stopId &&
                  d.trip.snapshot.stops.find((s) => s.id === selected.stopId)
                    ?.name}
              </strong>
              <p>
                {d.checkin
                  ? `Espera confirmada até ${clock(d.checkin.expiresAt)}.`
                  : "Já está na parada? Avise o motorista sem compartilhar sua localização."}
              </p>
              <button
                className="button secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/journey/checkin", {
                      tripId: d.trip!.id,
                      cycle: d.trip!.currentCycle,
                      stopId: selected.stopId,
                      active: !d.checkin,
                    });
                    await query.refetch();
                    toast.success(
                      d.checkin
                        ? "Confirmação cancelada"
                        : "Espera confirmada por 15 minutos",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {d.checkin
                  ? "Cancelar minha confirmação"
                  : "Estou aguardando nesta parada"}
              </button>
              <small style={{ display: "block", marginTop: 8 }}>
                O motorista vê apenas a quantidade por parada. Não confirma
                vaga, embarque ou obrigação de espera.
              </small>
            </div>
          )}
          <div className="journey-grid">
            <section className="panel journey-map">
              <MapView
                large
                routes={[
                  { ...(d.trip?.snapshot || storedRoute), tripId: d.trip?.id },
                ]}
                positions={
                  d.position && d.trip
                    ? [
                        {
                          id: d.trip.id,
                          label: d.trip.name,
                          position: d.position,
                          progress: d.progress,
                        },
                      ]
                    : []
                }
                walking={walk?.geometry}
                studentPosition={position}
                onNotices={() => setShowAlerts(true)}
              />
            </section>
            <section className="panel journey-panel">
              <span className="eyebrow">{storedRoute.name}</span>
              <h2>
                {waiting
                  ? "Aguardando no ponto"
                  : d.trip
                    ? descriptions[d.trip.status]
                    : "Aguardando viagem"}
              </h2>
              <p>
                <MapPin size={15} /> {target?.name}
              </p>
              {waiting && (
                <p role="status">
                  Parado por pelo menos 2 minutos em{" "}
                  {d.trip?.snapshot.stops.find(
                    (s) => s.id === d.progress?.stopId,
                  )?.name || "uma parada"}
                  . Detecção pelo GPS; sem garantia de espera ou embarque.
                </p>
              )}
              <div className="eta-big">
                {eta?.available ? (
                  <>
                    <strong>
                      {eta.minMinutes}–{eta.maxMinutes}
                    </strong>
                    <span>minutos{eta.simulated ? " · simulado" : ""}</span>
                  </>
                ) : (
                  <>
                    <strong>—</strong>
                    <span>{eta?.reason || "Previsão indisponível"}</span>
                  </>
                )}
              </div>
              {eta?.available && (
                <p>
                  {eta.meters} m restantes · previsão entre{" "}
                  {clock(d.serverTime + eta.minMinutes * 60000)} e{" "}
                  {clock(d.serverTime + eta.maxMinutes * 60000)}.
                </p>
              )}
              <p>
                <BusFront size={16} />{" "}
                {d.position
                  ? (d.position.source === "simulation"
                      ? "SIMULAÇÃO — POSIÇÃO FICTÍCIA"
                      : "GPS do motorista") +
                    " · " +
                    clock(d.position.timestamp) +
                    (fresh ? " · atual" : " · desatualizado")
                  : "GPS indisponível"}
              </p>
              {remaining > 0 && (
                <p role="status">
                  Espera autorizada · {Math.floor(remaining / 60000)}:
                  {String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}{" "}
                  restantes
                </p>
              )}
              <button
                className="button primary"
                disabled={locating}
                onClick={locate}
              >
                <Footprints size={17} />
                {locating ? "Consultando…" : "Caminho até minha parada"}
              </button>
              <small>
                Ao tocar, você autoriza usar sua posição para calcular esta
                caminhada. Ela não é gravada nem exibida ao motorista. Para
                alertas de saída, guardamos somente o tempo calculado por até 10
                minutos; atualize ao mudar de posição. Com Google Maps ativado,
                a posição é enviada ao provedor para calcular o percurso.
              </small>
              {walk && (
                <div className="walking-result">
                  {walk.available ? (
                    <>
                      <strong>
                        {Math.ceil((walk.seconds || 0) / 60)} min a pé ·{" "}
                        {Math.round(walk.meters || 0)} m
                      </strong>
                      <p>{recommendation}</p>
                      {walk.validUntil && now > walk.validUntil && (
                        <p role="status">
                          Atualize a caminhada antes de decidir quando sair.
                        </p>
                      )}
                      <small>
                        {walk.source === "osm-local"
                          ? "Rede viária local · © OpenStreetMap contributors, ODbL"
                          : walk.source === "google"
                            ? "Google Maps · confira calçadas e travessias"
                            : "Provedor institucional"}
                      </small>
                      {rec.minutes !== null && rec.minutes >= 0 && (
                        <p>
                          Saia em até aproximadamente {rec.minutes} min, por
                          volta de {clock(d.serverTime + rec.minutes * 60000)} ·
                          margem de segurança {d.margin} min.
                        </p>
                      )}
                    </>
                  ) : (
                    <p>{walk.reason}</p>
                  )}
                </div>
              )}
            </section>
          </div>
          <details
            id="journey-alerts"
            className="panel journey-panel"
            open={showAlerts || undefined}
            onToggle={(e) => setShowAlerts(e.currentTarget.open)}
          >
            <summary>
              <Bell size={17} /> Avisos da rota (
              {d.notices.length + d.alerts.length})
            </summary>
            <PushChoice publicKey={d.pushKey} />
            <details>
              <summary>Informar meu tempo habitual de caminhada</summary>
              <p>
                Use uma estimativa própria se não quiser usar GPS ou para
                receber recomendações de saída com o Google Maps e a página
                fechada.
              </p>
              <label>
                Quantos minutos você costuma levar?
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={habitualMinutes}
                  onChange={(e) => setHabitualMinutes(e.target.value)}
                />
              </label>
              <button
                className="button secondary"
                disabled={busy || !habitualMinutes}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("/journey/walk-estimate", {
                      minutes: Number(habitualMinutes),
                    });
                    await query.refetch();
                    toast.success("Tempo informado salvo por 10 minutos");
                  } catch (e) {
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Usar meu tempo para alertas
              </button>
            </details>
            {d.walkEstimate && (
              <p>
                Última caminhada: {Math.ceil(d.walkEstimate.seconds / 60)} min ·{" "}
                {now > d.walkEstimate.validUntil
                  ? "desatualizada; calcule novamente"
                  : "válida até " + clock(d.walkEstimate.validUntil)}
                . Não acompanha mudanças de posição com o aplicativo fechado.
              </p>
            )}
            {d.alerts.map((a) => (
              <p key={a.id}>
                <strong>
                  {clock(a.createdAt)} · Volta {a.cycle}
                </strong>{" "}
                {a.message}
              </p>
            ))}
            {d.notices.length ? (
              d.notices.map((n) => (
                <p key={n.id}>
                  <strong>
                    {clock(n.createdAt)}
                    {n.simulated ? " · SIMULADO" : ""}
                  </strong>{" "}
                  {n.message}{" "}
                  {n.read ? (
                    <small>✓ Lido</small>
                  ) : (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await api("/notices/" + n.id + "/read", {});
                          await query.refetch();
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      Marcar como lido
                    </button>
                  )}
                </p>
              ))
            ) : (
              <p>Nenhum aviso recebido.</p>
            )}
          </details>
        </>
      )}
    </section>
  );
}
