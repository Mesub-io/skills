// FIXTURE ONLY: one click signs in, with no password.
export default function LoginPage() {
    return (
        <main>
            <h1>Sign in</h1>
            <form action="/api/login" method="post">
                <button name="user" value="ada">
                    Sign in as Ada
                </button>
                <button name="user" value="ben">
                    Sign in as Ben
                </button>
            </form>
        </main>
    );
}
