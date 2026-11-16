/// <reference types="google.maps" />
let loading: Promise<void> | undefined;
export function loadGoogleMaps(key: string) {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const timer = setTimeout(
      () => reject(Error("Google Maps indisponível")),
      15000,
    );
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    // Callback is required by asynchronous loading; no key is persisted locally.
    const scope = window as Window & {
      trackbusGoogleReady?: () => void;
      gm_authFailure?: () => void;
    };
    scope.trackbusGoogleReady = done;
    scope.gm_authFailure = () => {
      window.dispatchEvent(new Event("trackbus-google-error"));
      clearTimeout(timer);
      reject(Error("Configuração Google Maps inválida"));
    };
    script.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({
        key,
        v: "quarterly",
        loading: "async",
        callback: "trackbusGoogleReady",
        language: "pt-BR",
        region: "BR",
        auth_referrer_policy: "origin",
      });
    script.async = true;
    script.onerror = () => {
      clearTimeout(timer);
      reject(Error("Não foi possível carregar Google Maps"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
