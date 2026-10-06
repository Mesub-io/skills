import Link from 'next/link';

export default function HomePage() {
    return (
        <main>
            <h1>Reports</h1>
            <p>
                <Link href="/login">Sign in</Link> to read <Link href="/reports">your reports</Link>, or see{' '}
                <Link href="/pricing">the Pro plan</Link>.
            </p>
        </main>
    );
}
