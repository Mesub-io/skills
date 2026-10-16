// React: wrap the app once. Render it in the root layout (Next.js) or around the root component.
// Named MesubRoot, not Mesub: that is the server client's class in @mesub/node.
// It holds no key and never talks to Mesub: it calls the routes mounted on the app's own server.
import type { ReactNode } from 'react';
import { MesubProvider } from '@mesub/react';
import '@mesub/react/styles.css';

export function MesubRoot({ children }: { children: ReactNode }) {
    // ADAPT: `endpoint` is exactly where the server mounted the routes.
    // ADAPT: `chain` is the network the wallet signs for. Left out, it is the test network: set it to the
    // network of the plans, the `network` GET <endpoint>/plans/<slug> answers, as chain="solana:<cluster>"
    // the way Solana's wallets name that cluster. Wrong, the wallet signs for another network.
    return <MesubProvider endpoint="/api/mesub">{children}</MesubProvider>;
}
