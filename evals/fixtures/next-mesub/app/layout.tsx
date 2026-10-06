import type { ReactNode } from 'react';
import { Mesub } from '@/components/mesub';

export const metadata = { title: 'Reports' };

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Mesub>{children}</Mesub>
            </body>
        </html>
    );
}
