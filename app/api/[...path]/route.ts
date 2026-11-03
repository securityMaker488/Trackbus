import { env } from "cloudflare:workers";
import api, { type Bindings } from "../../../apps/api";
export const dynamic = "force-dynamic";
const handle = (request: Request) =>
  api.fetch(request, env as unknown as Bindings);
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
