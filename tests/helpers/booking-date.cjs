// Booking dates are civil dates in Atlanta, independent of the test runner's timezone.
function bookingDate(days, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  const date = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + days));
  while (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
module.exports = { bookingDate };
