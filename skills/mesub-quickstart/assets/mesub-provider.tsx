// React: wrap the app once. Render it in the root layout (Next.js) or around the root component.
// It holds no key and never talks to Mesub: it calls the routes mounted on the app's own server.
import type { ReactNode } from 'react';
import { MesubProvider } from '@mesub/react';
import '@mesub/react/styles.css';

export function Mesub({ children }: { children: ReactNode }) {
    // ADAPT: `endpoint` is exactly where the server mounted the routes.
    return <MesubProvider endpoint="/api/mesub">{children}</MesubProvider>;
}
