-- Clarified business policy: update the owner's draft only.
-- Published policies and accepted/signed booking snapshots stay unchanged.
begin;
update private.launch_preparation
set draft=draft||$policy${"cancellation_notice":"To receive a deposit refund, cancel at least 72 hours before your scheduled appointment start time. Cancellations received less than 72 hours before the scheduled start time are not eligible for a deposit refund. For rescheduling requests or an emergency affecting an existing appointment, contact Proverbs 31 Cleaning Co. as soon as possible. Deposit handling for a rescheduled appointment is subject to Gabrielle’s review.","deposit_handling":"Your deposit will be refunded if you cancel at least 72 hours before your scheduled appointment start time. If you cancel less than 72 hours before the scheduled start time, Proverbs 31 Cleaning Co. will retain your deposit. Deposits secure your appointment and reserve your scheduled time."}$policy$::jsonb,
    revision=revision+1,updated_at=now()
where id=true;
commit;
