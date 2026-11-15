import { useEffect, useRef, useState } from "react";
import { api } from "./http";
import { Brand } from "./Brand";
/** The native device token never enters the URL or browser storage. */
export function DriverEditorEntry() {
  const started = useRef(false),
    [message, setMessage] = useState("Abrindo seu editor de rotas…");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    ).get("codigo");
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + "#/motorista",
    );
    if (!code || !/^[a-f0-9]{64}$/.test(code)) {
      setMessage("Abra o editor pelo botão do TrackBus Driver.");
      return;
    }
    api("/driver/web-exchange", { code })
      .then(() => window.location.replace("/#/routes"))
      .then(() => window.location.reload())
      .catch((e) => setMessage((e as Error).message));
  }, []);
  return (
    <div className="splash">
      <Brand />
      <strong>Rotas do motorista</strong>
      <p role="status">{message}</p>
      <small>
        O acesso dura até uma hora e acompanha a autorização do seu aparelho.
      </small>
      <a href="/">Voltar ao início</a>
    </div>
  );
}
