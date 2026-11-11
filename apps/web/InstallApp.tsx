import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
type InstallPrompt = Event & {
  prompt(): Promise<{ outcome: "accepted" | "dismissed" }>;
};
/** Offer the browser's installation flow only when it actually supports it. */
export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () =>
      setInstalled(
        standalone.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const ready = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    update();
    standalone.addEventListener("change", update);
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => {
      standalone.removeEventListener("change", update);
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed) return null;
  return (
    <details className="install-app">
      <summary>
        <Download size={15} /> TrackBus na tela inicial
      </summary>
      {prompt ? (
        <button
          className="button secondary"
          onClick={async () => {
            try {
              await prompt.prompt();
            } catch {
              toast.error(
                "Não foi possível abrir a instalação. Tente pelo menu do navegador.",
              );
            } finally {
              setPrompt(null);
            }
          }}
        >
          Instalar TrackBus
        </button>
      ) : (
        <p>
          No celular, abra o menu do navegador e procure “Instalar aplicativo”
          ou “Adicionar à tela inicial”. No iPhone, use Compartilhar no Safari.
        </p>
      )}
      <small>
        Disponível em navegadores compatíveis. Acompanhar viagens exige
        internet.
      </small>
    </details>
  );
}
