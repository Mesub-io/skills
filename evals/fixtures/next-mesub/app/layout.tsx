import type { ReactNode } from 'react';
import { MesubRoot } from '@/components/mesub';

export const metadata = { title: 'Reports' };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <MesubRoot>{children}</MesubRoot>
            </body>
        </html>
    );
}
