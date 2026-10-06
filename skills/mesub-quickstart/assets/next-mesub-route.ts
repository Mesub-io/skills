// Next.js App Router: the routes the widget calls.
// Copy to app/api/mesub/[...mesub]/route.ts. The catch-all folder is required:
// one file answers every path under /api/mesub.
import { mesubRouteHandlers } from '@mesub/node/next';

// ADAPT: read the session with the app's own auth, on the server.
// Until it is replaced this throws, so nobody is let in by mistake.
async function sessionOf(_request: Request): Promise<{ userId: string } | null> {
    throw new Error('Read the session with the app\'s own auth here.');
}

export const { GET, POST } = mesubRouteHandlers({
    customer: async (request) => {
        const session = await sessionOf(request);
        return session ? { external_id: session.userId } : null;
    },
});
