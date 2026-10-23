# Privacy and retention operations — activation checklist

Gabrielle's business wording and retention choices remain in Admin → Launch preparation. No retention period, deletion promise, automatic purge or legal exception has been invented or approved by the developer.

## Customer requests while the owner finalizes policy

1. Receive the request through the published business contact address. Record its receipt and the requested correction, access or deletion in a private business workflow. Do not put customer records in GitHub issues, public support channels or developer logs.
2. Verify the requester controls the relevant account or stored booking contact before sharing any record or changing identity/contact information. Knowledge of a booking ID or street address alone is insufficient. Use the existing authenticated/private-link process after access is enabled; do not create a public email lookup.
3. Gabrielle reviews the requested scope and any records that must remain under her approved retention policy. Treat media, contact details, booking history, signed agreements and payment/audit records separately. Do not erase signed snapshots or payment evidence merely because a customer profile is being corrected.
4. Until dedicated deletion controls and a published policy are activated, the developer performs an explicitly reviewed, exact-ID operation after owner authorization. Use a dry-run inventory and reviewed transaction; do not issue broad email/address-matching deletes. Retain the approved operation record without copying deleted content into it.
5. For media deletion, remove the actual Storage objects as well as the appropriate database records, and verify anonymous/expired/old private links no longer provide access after their issued lifetime. Deleting a database row alone is not verified object deletion.
6. Verify the customer no longer sees removed material, other customers' bookings remain unchanged and necessary retained records remain private. Tell the owner which portions were completed and which remain under the agreed policy; do not promise deletion from backups that have not expired.

## Technical activation after the business decisions

- Map each approved retention rule to a record class, start event, cutoff, retention hold, deletion action, backup expiry and audit result.
- Build a dry-run report first. Require owner review for destructive operations and preserve records that have a hold or an unresolved operational reason to retain them.
- Test exact-boundary cases, mixed account/guest records, signed-form history, current and historical object paths, missing objects, failed removals/retries and isolation from unrelated customers.
- Activate a scheduled purge only after the approved policy, backup retention and the tested implementation agree. Policy publication alone does not enable or implement deletion.

This procedure is prepared; automated retention/deletion is not enabled. The current customer portal has no self-service account deletion switch, and the owner dashboard's policy editor does not perform data deletion.

## Owner controls added October 23

Admin → Privacy & operations records access/correction/deletion requests against a customer selected from the private directory. Requests are owner-only and audited. The owner must verify control of the account or booking contact before inventory/export. Status changes require the current revision; completion requires recorded outcome/retained-record notes. Downloads contain that customer's booking, agreement and payment data, excluding owner/review notes. They contain sensitive data and must be reviewed before secure delivery; uploaded media bytes need a separate secure transfer.

The inventory is non-destructive. No automatic deletion button or scheduled purge is enabled. Gabrielle must approve retention/holds and the developer must execute a reviewed exact-ID removal where appropriate, including Storage objects. Marking a request complete only records the owner's action; it does not erase data or represent a legal determination. Signed agreements, financial evidence and historical backups are not silently modified.


Customer self-service deletion is now implemented separately from the manual privacy-request log. See [customer-account-deletion.md](customer-account-deletion.md) for financial holds, automatic refunds, retained evidence and restore safeguards. Admin does not approve customer account deletion.
