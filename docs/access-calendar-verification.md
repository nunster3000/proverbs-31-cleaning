# Access and calendar verification — October 20, 2026

## Result

Passed 52 standard tests and 10 separate-session PostgreSQL scenarios. The native suite reports 11 passing tests including its parent test. The standard suite skips that optional native test when no local database URL is supplied.

No application or database-rule changes were needed. These checks use disposable local data and the application’s complete migrations, including migration 008. No production bookings, payments, or accounts were modified.

## Access and privacy

Two independent verified customer identities can read their own booking and related adjustments, payments, change requests, and walkthrough records. Direct queries using the other customer’s known IDs return no records. Foreign booking actions, price acceptance, upload removal, and uploads to a known foreign storage path are rejected.

Customers cannot read admin notes, audit events, notification outbox, calendar overrides, private blocks, or business settings. Direct customer mutations of protected records and attempts to use owner operations fail. Anonymous sessions cannot read customer information. The owner retains authorized visibility. Public availability exposes slots rather than customer details or booking IDs.

The API suite also covers verified-session requirements, forged owner roles, cross-origin mutations, disabled sign-in, and keeping service credentials out of public configuration.

## Calendar conflicts

The native suite runs actual PostgreSQL with separate client connections. A barrier holds the shared scheduling row lock until both contenders are waiting, then releases them. This verifies overlapping transactions rather than only sequential calls.

Verified scenarios:

1. Two customers competing for one block produce one reservation and one rejection.
2. An occupied block rejects stale choices; a different block remains available.
3. A two-hour block overlapping an existing three-hour visit is unavailable after an opening-pattern change. An adjacent block remains bookable.
4. A manual admin booking and a customer booking cannot both take one block.
5. An admin day block and a customer booking cannot both succeed for the same time.
6. Direct admin rescheduling and a customer booking cannot take the same destination.
7. Approving a customer reschedule request and creating a booking cannot take the same destination. A failed approval leaves the request unresolved.
8. Simultaneous retries of one request return the same reservation instead of duplicating it.
9. A later recurring conflict rolls back the entire series.
10. A separate customer session cannot access or mutate a known foreign booking.

Capacity is one in these fixtures. Higher configured capacity intentionally allows additional simultaneous visits; calendar writes still use the same serialized check.

## Repeat the checks

Standard suite:

```sh
npm --prefix cinematic-preview ci
npm --prefix cinematic-preview test
```

Native concurrency suite: provision a fresh, disposable local PostgreSQL cluster and empty database named `p31_qa_*`, then run:

```sh
P31_TEST_DATABASE_URL='<local disposable database connection URL>' node --test tests/postgres-concurrency.test.cjs
```

The native test refuses remote hosts and database names outside `p31_qa_*`. It bootstraps local auth/storage stand-ins and applies every repository migration. Its role creation requires a dedicated disposable cluster. It does not exercise hosted Supabase authentication, hosted file transfer, or live email delivery.

Before launch, repeat account-level checks through hosted Supabase sessions after email sign-in is enabled. Resend and sign-in remain disabled during this verification.
