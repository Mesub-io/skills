// Server only: the one Mesub client, and who is asking.
import { Mesub } from '@mesub/node';
import { getSession } from './session';

// Reads MESUB_API_KEY from the server's environment. Built once, at module level.
export const mesub = new Mesub();

// Who is asking: the user of the session cookie the app signed (lib/session.ts).
export async function customer() {
    const session = await getSession();
    return session ? { external_id: session.userId } : null;
}
