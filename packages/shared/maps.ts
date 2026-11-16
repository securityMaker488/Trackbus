export type MapsConfig =
  | { provider: "maplibre"; googlePending: boolean }
  | { provider: "google"; browserKey: string; mapId: string; demo?: boolean };
export type MapsEnv = {
  MAP_PROVIDER?: string;
  GOOGLE_MAPS_BROWSER_KEY?: string;
  GOOGLE_MAPS_MAP_ID?: string;
  GOOGLE_ROUTES_KEY?: string;
  GOOGLE_MAPS_DEMO_KEY?: string;
  GOOGLE_MAPS_MODE?: string;
  APP_ENV?: string;
};
/** No SDK or billable request is made unless all activation settings exist. */
export function mapsConfig(env: MapsEnv): MapsConfig {
  if (env.GOOGLE_MAPS_MODE === "demo") {
    const permitted = ["development", "evaluation"].includes(env.APP_ENV || "");
    if (env.MAP_PROVIDER === "google" && permitted && env.GOOGLE_MAPS_DEMO_KEY)
      return {
        provider: "google",
        browserKey: env.GOOGLE_MAPS_DEMO_KEY,
        mapId: env.GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
        demo: true,
      };
    return {
      provider: "maplibre",
      googlePending: env.MAP_PROVIDER === "google",
    };
  }
  if (
    env.MAP_PROVIDER === "google" &&
    env.GOOGLE_MAPS_BROWSER_KEY &&
    env.GOOGLE_MAPS_MAP_ID
  )
    return {
      provider: "google",
      browserKey: env.GOOGLE_MAPS_BROWSER_KEY,
      mapId: env.GOOGLE_MAPS_MAP_ID,
    };
  return { provider: "maplibre", googlePending: env.MAP_PROVIDER === "google" };
}
/** Demo credentials are never reused in an unspecified/production environment. */
export function googleRoutesKey(env: MapsEnv) {
  if (mapsConfig(env).provider !== "google") return undefined;
  return env.GOOGLE_MAPS_MODE === "demo"
    ? env.GOOGLE_MAPS_DEMO_KEY
    : env.GOOGLE_ROUTES_KEY;
}
