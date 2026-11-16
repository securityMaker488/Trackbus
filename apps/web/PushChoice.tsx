import { useEffect, useState } from "react";
import { api } from "./http";
type Preferences = {
  privatePreview: boolean;
  smart: boolean;
  operational: boolean;
  approaching: boolean;
};
const defaults: Preferences = {
  privatePreview: true,
  smart: true,
  operational: true,
  approaching: true,
};
export function PushChoice({ publicKey }: { publicKey?: string | null }) {
  const [on, setOn] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [prefs, setPrefs] = useState(defaults);
  const supported =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone;
  useEffect(() => {
    if (!supported) return;
    let mounted = true;
    navigator.serviceWorker
      .getRegistration()
      .then((r) => r?.pushManager?.getSubscription())
      .then(async (sub) => {
        if (!sub) return;
        const status = await api<Preferences & { active: boolean }>(
          "/journey/push/status",
          { endpoint: sub.endpoint },
        );
        if (mounted) {
          setOn(status.active);
          if (status.active)
            setPrefs({
              privatePreview: status.privatePreview,
              smart: status.smart,
              operational: status.operational,
              approaching: status.approaching,
            });
          else
            setMessage(
              "Esta sessão ainda não tem notificações registradas neste aparelho.",
            );
        }
      })
      .catch(() => {
        if (mounted)
          setMessage(
            "Não foi possível verificar a inscrição. Atualize antes de ativar.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [supported]);
  async function register(sub: PushSubscription, p: Preferences) {
    await api("/journey/push", {
      endpoint: sub.endpoint,
      enabled: true,
      keys: sub.toJSON().keys,
      ...p,
    });
  }
  async function toggle() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg?.active)
        throw Error("Abra a versão HTTPS atualizada para ativar notificações.");
      let sub = await reg.pushManager.getSubscription();
      if (on && sub) {
        await api("/journey/push", { endpoint: sub.endpoint, enabled: false });
        await sub.unsubscribe();
        setOn(false);
        setMessage("Notificações desativadas neste aparelho.");
        return;
      }
      if ((await Notification.requestPermission()) !== "granted") {
        setMessage(
          "Permissão não concedida. Os avisos continuam disponíveis nesta tela.",
        );
        return;
      }
      // Replace orphaned subscriptions only after explicit activation.
      if (sub) await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(
          atob(publicKey!.replace(/-/g, "+").replace(/_/g, "/")),
          (c) => c.charCodeAt(0),
        ),
      });
      try {
        await register(sub, prefs);
      } catch (e) {
        await sub.unsubscribe();
        throw e;
      }
      setOn(true);
      setMessage(
        "Inscrição registrada. A entrega depende da conexão e das permissões do sistema.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function update(p: Preferences) {
    if (!on) {
      setPrefs(p);
      return;
    }
    setBusy(true);
    try {
      const sub = await (
        await navigator.serviceWorker.getRegistration()
      )?.pushManager.getSubscription();
      if (!sub) throw Error("Reative as notificações neste aparelho.");
      await register(sub, p);
      setPrefs(p);
      setMessage("Preferências salvas.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-choice">
      <p>
        <strong>
          {on
            ? "Notificações registradas neste aparelho"
            : "Notificações com a página fechada"}
        </strong>
      </p>
      <button
        className="button secondary"
        disabled={busy || !supported || !publicKey || (ios && !installed)}
        onClick={toggle}
      >
        {on
          ? "Desativar notificações neste aparelho"
          : "Ativar notificações neste aparelho"}
      </button>
      <p role="status">
        {message ||
          (ios && !installed
            ? "No iPhone, adicione o TrackBus à Tela de Início pelo menu Compartilhar do Safari e abra pelo ícone para ativar notificações."
            : !publicKey
              ? "O serviço push ainda não está configurado. Os avisos continuam nesta tela."
              : !supported
                ? "Este navegador não oferece Web Push. Consulte os avisos nesta tela."
                : Notification.permission === "denied"
                  ? "Permissão bloqueada. Você pode alterá-la nas configurações deste site."
                  : "A ativação solicita sua permissão. Sua localização não é rastreada com a página fechada.")}
      </p>
      <div className="journey-actions">
        {(
          [
            ["smart", "Recomendações de saída"],
            ["approaching", "Ônibus próximo"],
            ["operational", "Atrasos e avisos da viagem"],
            ["privatePreview", "Ocultar detalhes na tela bloqueada"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              disabled={busy}
              checked={prefs[key]}
              onChange={(e) => update({ ...prefs, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}
