export function Brand({ large = false }: { large?: boolean }) {
  return (
    <img
      className={`trackbus-logo${large ? " trackbus-logo-large" : ""}`}
      src="/trackbus-logo.png"
      alt="TrackBus"
      width={1254}
      height={1254}
      decoding="async"
    />
  );
}
