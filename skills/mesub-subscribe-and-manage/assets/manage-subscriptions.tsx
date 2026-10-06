'use client';

// React: the two ready-made ways to let a customer cancel, resume or close.
// Both go under MesubProvider and need the routes mounted on the server.
import { ManageButton, ManageSubscriptions } from '@mesub/react';

// One subscription, in the Mesub window: how it stands, the next charge, the latest
// payments, and the one thing it allows now.
export function ManagePro() {
    // ADAPT: the plan's slug. Leave `plan` out to open the customer's live subscription whatever its plan.
    return <ManageButton plan="pro">Manage my subscription</ManageButton>;
}

// Every subscription of the signed-in customer, in the page. A good target for the
// provider's `manageUrl`: mount it on the account page and pass that page's path.
export function AccountSubscriptions({ onChanged }: { onChanged?: () => void }) {
    return (
        <ManageSubscriptions
            // Called once one was cancelled, resumed or closed, with the subscription as it is now.
            // ADAPT: fetch again what the server gates. A cancellation keeps access until
            // `access_until`, so do not lock anything here.
            onChanged={() => onChanged?.()}
        />
    );
}
