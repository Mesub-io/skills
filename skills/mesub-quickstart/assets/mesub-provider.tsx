// React: wrap the app once. Render it in the root layout (Next.js) or around the root component.
// Named MesubRoot, not Mesub: that is the server client's class in @mesub/node.
// It holds no key and never talks to Mesub: it calls the routes mounted on the app's own server.
import type { ReactNode } from 'react';
import { MesubProvider } from '@mesub/react';
import '@mesub/react/styles.css';

export function MesubRoot({ children }: { children: ReactNode }) {
    // ADAPT: `endpoint` is exactly where the server mounted the routes.
    // ADAPT: `chain` is the network the wallet signs for, the one of the plans (`network` in GET <endpoint>/plans/<slug>).
    // Production plans are `mainnet-beta`: solana:mainnet. Plans of the dev environment are `devnet`: solana:devnet,
    // also the default when `chain` is left out. Never solana:mainnet-beta: no wallet knows it.
    return (
        <MesubProvider endpoint="/api/mesub" chain="solana:mainnet">
            {children}
        </MesubProvider>
    );
}
