# Query changes

See [authentication](AUTHENTICATION_QUERY_OPTIMIZATION.md) for the confirmed duplicate user reads removed and [complaints](COMPLAINTS_QUERY_OPTIMIZATION.md) for deduplicated enrichment and why further query changes need deployed plans. See [sessions](SESSION_QUERY_ROOT_CAUSE.md) for the unchanged primary-key validation lookup and new pool/command evidence.

Registration, admin student/course lists, quiz submissions and password cryptography were not speculatively refactored in this follow-up. Their historical means and low sample observations do not establish new p95 bottlenecks. Previous eligibility optimization remains covered by `registrations.performance.spec.ts` and `../PERFORMANCE-REMEDIATION-2026-10-27.md`. Compare their window p95 and total time after the four requested priorities, then choose a narrowly evidenced change.
