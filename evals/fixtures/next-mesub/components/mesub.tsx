// The widget's provider, once around the app. It holds no key: it calls the routes under /api/mesub.
import type { ReactNode } from 'react';
import { MesubProvider } from '@mesub/react';
import '@mesub/react/styles.css';

export function Mesub({ children }: { children: ReactNode }) {
    return <MesubProvider endpoint="/api/mesub">{children}</MesubProvider>;
}
