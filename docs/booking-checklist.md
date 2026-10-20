# Customer booking checklist

Each customer booking card shows seven backend-derived requirements: starting-price deposit, verified walkthrough, Gabrielle’s walkthrough approval, approval of the current reviewed price, home-access authorization, completed visit, and final payment. Rows distinguish Completed, Action needed, Waiting, and Not required for cancelled bookings. Recorded completion remains visible on cancellation, with no action buttons or automatic fees.

Buttons open the selected booking directly at its walkthrough, pricing, authorization, visit progress, or payment guidance. Form signing and quote acceptance still require the existing explicit customer acknowledgements; checklist clicks never submit either action. Payments remain external: guidance links to Contact in a separate tab and waits for Gabrielle to record money received. Starting estimates and a zero provisional balance are not treated as settled final invoices.

Poll updates replace checklist state from refreshed booking records while preserving focused checklist actions and existing dirty detail forms. There are no client-side completion checkboxes or flags.

Verified with unit cases across incomplete/verified uploads, external walkthrough review, deposit thresholds, price reapproval, authorization invalidation, visit completion, unpaid/paid final balances and cancellation. Browser checks at 390px verified all seven destinations, keyboard focus and no horizontal overflow using isolated local test bookings. Email sign-in remains disabled in production.
