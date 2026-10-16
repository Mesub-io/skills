// React: wrap the app once. Render it in the root layout (Next.js) or around the root component.
// It holds no key and never talks to Mesub: it calls the routes mounted on the app's own server.
import type { ReactNode } from 'react';
import { MesubProvider } from '@mesub/react';
import '@mesub/react/styles.css';

export function Mesub({ children }: { children: ReactNode }) {
    // ADAPT: `endpoint` is exactly where the server mounted the routes.
    // ADAPT: the plan's network decides `chain`, the network the wallet signs for. Left out, it is the
    // provider's default: compare it with the `network` GET <endpoint>/plans/<slug> answers, and when they
    // differ add chain="solana:<cluster>" as Solana's wallets name that cluster. Wrong, the wallet signs for another network.
    return <MesubProvider endpoint="/api/mesub">{children}</MesubProvider>;
}
