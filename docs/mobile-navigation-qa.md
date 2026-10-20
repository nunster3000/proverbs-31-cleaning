# Mobile navigation verification · October 20, 2026

Tested the built application in the browser at 390px and 320px iframe widths, using isolated local customer and owner sessions backed by the SQL test database. No production accounts, bookings, payments, or email messages were created.

- Owner dashboard → Website Home → Dashboard Home returns to owner Bookings.
- Customer dashboard → Website Home → Dashboard Home returns to customer Bookings.
- Dashboard Home returns from Calendar (owner) and Payments (customer) to Bookings.
- Home, Our Care, Services, Contact Us, About Me, and Plan My Care links navigate correctly. Login is visible on each public page; an existing verified fixture session returns to its role's workspace.
- Signed-out Login from each main public page opens the shared sign-in screen. Email submission remains disabled with account-access preparation messaging.
- Privacy and Booking Information retain Login and the mobile menu, including Escape dismissal and workspace return.
- Hamburger opens the modal menu; Close and Escape dismiss it and restore the menu button. No horizontal overflow on the checked pages at 320px and 390px.
- Fixed the booking-unavailable overlay hiding/blocking the header: navigation remains interactive while the planner stays unavailable. Added regression coverage for both connected and unavailable states.

Production sign-in stays disabled pending email sender setup. These are browser checks at phone viewport sizes, not physical iPhone/Android device certification or a test of live email authentication.
