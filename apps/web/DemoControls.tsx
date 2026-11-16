import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Smartphone, Users } from "lucide-react";
import type { State } from "../../packages/shared/types";
import { api } from "./http";
export function DemoControls({
  d,
  refresh,
}: {
  d: State;
  refresh: () => void;
}) {
  const [driver, setDriver] = useState(
      d.drivers.find((r) => r.userId && r.status === "active")?.id || "",
    ),
    [code, setCode] = useState<{ code: string; expires: number } | null>(null),
    [margin, setMargin] = useState(d.organization.safetyMargin),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!code) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [code]);
  const change = async (open: boolean) => {
    setBusy(true);
    try {
      await api("/journey/room", { roomOpen: open, safetyMargin: margin });
      refresh();
      toast.success("Preferências salvas");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar. Selecione o endereço exibido.");
    }
  };
  const studentLink = window.location.origin + "/#/participar",
    seconds = Math.max(0, Math.ceil(((code?.expires || 0) - now) / 1000));
  return (
    <section className="panel settings-card connection-card">
      <span className="eyebrow">CONECTE A APRESENTAÇÃO</span>
      <h2>
        <Users size={22} /> Entrada dos alunos
      </h2>
      <p>
        Compartilhe este link. Cada aluno entra com o nome e escolhe uma das
        rotas publicadas.
      </p>
      <div className="copy-link">
        <input
          aria-label="Link de entrada do aluno"
          readOnly
          value={studentLink}
        />
        <button
          className="icon-button"
          aria-label="Copiar link do aluno"
          onClick={() => copy(studentLink)}
        >
          <Copy size={18} />
        </button>
      </div>
      <div className="journey-actions">
        <a
          className="button primary"
          href="#/participar"
          target="_blank"
          rel="noreferrer"
        >
          Abrir tela do aluno
        </a>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => change(!d.organization.roomOpen)}
        >
          {d.organization.roomOpen
            ? "Fechar entrada de alunos"
            : "Abrir entrada de alunos"}
        </button>
      </div>
      <small>
        {d.organization.roomOpen ? "Entrada aberta" : "Entrada fechada"} ·{" "}
        {d.routes.filter((r) => r.active && r.published).length} rota(s)
        disponível(is)
      </small>
      <hr />
      <h2>
        <Smartphone size={22} /> Conectar o motorista
      </h2>
      <p>
        No TrackBus Driver, informe o endereço abaixo e o código. Depois,
        escolha a viagem e toque em iniciar rota com GPS.
      </p>
      <a
        className="button secondary"
        href="/TrackBus-Driver-v11-arm64.apk"
        download
      >
        Baixar TrackBus Driver · Android
      </a>
      <small>Versão 7.1 · Android arm64 · Instale no celular autorizado.</small>
      <label>
        Endereço do TrackBus
        <input
          readOnly
          value={
            window.location.protocol === "https:"
              ? window.location.origin
              : "Disponível após a publicação em HTTPS"
          }
        />
      </label>
      <label>
        Motorista
        <select
          value={driver}
          onChange={(e) => {
            setDriver(e.target.value);
            setCode(null);
          }}
        >
          <option value="">Selecione o motorista</option>
          {d.drivers
            .filter((r) => r.userId && r.status === "active")
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
      </label>
      <button
        className="button primary"
        disabled={!driver || busy}
        onClick={async () => {
          setBusy(true);
          try {
            setCode(await api("/driver/pair", { driverId: driver }));
            setNow(Date.now());
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Gerando…" : "Gerar código de acesso"}
      </button>
      {code && (
        <div className="pair-code" role="status">
          {seconds > 0 ? (
            <>
              <strong>{code.code}</strong>
              <span>
                Uso único · expira em {Math.floor(seconds / 60)}:
                {String(seconds % 60).padStart(2, "0")}
              </span>
              <button className="text-button" onClick={() => copy(code.code)}>
                Copiar código
              </button>
            </>
          ) : (
            <span>Código expirado. Gere um novo para conectar.</span>
          )}
        </div>
      )}
      <small>
        Entregue o código apenas ao motorista autorizado. O acesso dura oito
        horas.
      </small>
      <details>
        <summary>Preferências da jornada</summary>
        <label>
          Margem de segurança (minutos)
          <input
            type="number"
            min={1}
            max={15}
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
          />
        </label>
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => change(d.organization.roomOpen)}
        >
          Salvar margem
        </button>
      </details>
    </section>
  );
}
