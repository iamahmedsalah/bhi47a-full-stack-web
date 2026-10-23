# Authentication email subjects, language and copying

Authentication emails use the request's `Accept-Language` header. The web API
client already sends the current `/ar` or `/en` locale. Arabic is the fallback;
weighted browser headers and regional tags are supported. The admin student
password-reset endpoint now forwards this header as well.

`email-content.ts` centralizes Google-link, password-reset and generic verification
subjects, preview text, plain text and HTML. Add future OTP purposes to its copy
registry. Existing OTP generation, verification and 15-minute expiry are retained.

Bare sender addresses receive the display name `BHI47A Student Portal`, preserving
the configured verified mailbox. Existing named senders are retained. Set
`EMAIL_FROM_NAME` to explicitly override the display name for all outgoing emails.
This does not change provider verification requirements or sender domains.

The HTML uses a table layout with inline styles, a solid-color gradient fallback,
Arabic RTL or English LTR, escaped names and contiguous, selectable OTP digits.
The language-specific subject is separate from the HTML document title.

Gmail and Outlook do not reliably allow email clipboard scripts. The email's
**Open code copier** button therefore opens `/email-code.html`, where a user click
copies the code. Manual selection remains available in the email and on the page
when clipboard permission is denied. The page is a standalone static asset with
no app providers, analytics or API requests. It does not verify a code or log in.

`CLIENT_URL` (or legacy `APP_URL`) must be the trusted, single HTTPS portal origin.
An unsafe/missing origin omits the copy link; local HTTP loopback is supported for
development. The OTP travels in the URL fragment, not a query string; the page
immediately clears that fragment from the address bar. Nothing is written to
browser storage. Only six ASCII digits are accepted and leading zeros survive.
The page blocks outbound connections through its CSP, uses a no-referrer policy,
disallows indexing and clears the displayed code on page exit. It cannot determine
whether a code has expired; the existing verification endpoint remains authoritative.

Regression checks cover localized template content and actual email delivery
arguments for Google linking, recovery and admin resets. Run
`node --test scripts/email-code.test.cjs` for copy success, permission denial,
fragment removal and invalid-link behavior. No real emails are sent by these tests.

Sample HTML previews with fictional names and codes are generated locally in
`outputs/email-previews/`. A browser preview is not a Gmail/Outlook inbox rendering
test; check both real inboxes after deployment. No live email was sent in this work.

Redis metrics retain the provider-aware changes from the performance review:
configured endpoint classification, connection status and cache-command attempts
since API startup. This is not daily account quota or BullMQ command usage. The
running VPS endpoint and connectivity still need a live check after deployment.

Validation: workspace lint (zero errors; 248 existing web warnings), typecheck,
production build, 41 API suites / 222 tests, and 3 copy-page tests passed.
After the mobile layout adjustment, the API build and 10 focused template tests
passed again. Chrome checks at an emulated 390 px viewport confirmed no horizontal
overflow in Arabic, English or the copy page; the copy page also removed its
fragment and preserved the fictional leading-zero code. Full application E2E and
live Gmail/Outlook delivery remain unverified.
