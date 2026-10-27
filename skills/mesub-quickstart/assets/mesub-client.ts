// Server only: the one Mesub client of the process. Copy to a server-only module (lib/mesub.ts),
// then pass `mesub` as `client` to the widget routes and to every guard: one cache, one outage fallback.
import { Mesub } from '@mesub/node';

// Reads MESUB_API_KEY. Without it, this line throws "Missing Mesub API key" when the module is
// first imported: at start under Express and NestJS, during `next build` under Next.js, which
// imports the route files to collect them. So the build needs the key too. Do not catch it.
// From @mesub/node 0.1.3 it also reads MESUB_BASE_URL, the address the key is sent to: unset means https://api.mesub.io.
// Built once, at module level: one built per request starts with an empty cache and no outage fallback.
export const mesub = new Mesub();
