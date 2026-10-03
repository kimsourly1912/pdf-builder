# Decision log

These accepted decisions describe the current product and technical contracts as of 2026-10-03. This is a maintained summary, not a reconstruction of when each decision was originally made. Change a decision explicitly when requirements change and update the affected implementation and feature guide.

| ID | Accepted decision | Reason and consequence |
| --- | --- | --- |
| D01 | Deploy the application from `codex/pdf-studio-self-host` through GitHub Actions. | This is the existing production source. A push deploys production; `main` and local Wrangler emulation are not staging targets. |
| D02 | Keep management authorization scoped to the configured owner. | Current services support one management owner. Multi-HR routing and permissions require an explicit design rather than client-side filters. |
| D03 | Store Telegram candidate data without creating a login or extracting the CV with AI. | Intake should be inexpensive and reusable. An intake/candidate record is not an authentication account. |
| D04 | Make paid CV extraction optional and explicit in the Resume Editor. | HR can manually enter and approve data when AI credits are unavailable. Bot and workflow operations cannot incur extraction cost automatically. |
| D05 | Separate draft saving from explicit CV approval. | HR can save incomplete work safely. Approval requires current candidate/CV proof and can trigger a published approval workflow. Changed data needs fresh approval. |
| D06 | Make workflow purpose explicit through starting events and presets. | Telegram review, preparation after approval, and manual preparation serve different goals. Review-only completion must not imply account/forms are ready. |
| D07 | Guard account creation/reuse and snapshot preparation inputs. | Email matching alone does not authorize reuse. Current review proof, confirmed reuse, pinned template versions, revisions, and leases protect candidate identity and history. |
| D08 | Use activation links for new Telegram accounts and sign-in links for existing accounts. | Candidates set their own passwords. Telegram workflows never send temporary passwords. Existing staff-managed account flows retain their separate credential handling. |
| D09 | Track Telegram sent, failed, deferred, and uncertain states honestly. | Sending is not reading. Uncertain delivery requires an explicit check before resend; retries preserve accounts and assignments. |
| D10 | Group multiple CVs under the same candidate and retain explicit CV selection. | New uploads must not silently change the approved CV used by an existing preparation. Replacement identifies and archives the unreviewed CV. |
| D11 | Archive before eligible permanent deletion. | HR can restore records while protected account/form/workflow evidence remains retained. Permanent deletion rechecks eligibility and queues file cleanup atomically. |
| D12 | Offer Kanban and List views over one progress model. | HR can choose a working view. Forward moves require actual approval/preparation/submission evidence; backward overrides require a reason and audit history. Ready for HR is not hiring acceptance. |
| D13 | Derive waiting time from stage events, not general activity. | Retries and metadata changes must not reset waiting time. Unknown legacy timestamps remain explicitly unknown. |
| D14 | Use a short agent guide with task-specific linked documentation. | Agents receive essential safety and setup context without loading every feature guide. Standards and architecture stay maintainable outside the root guide. |
| D15 | Permit the requested eight-character test-admin password through secure deployment secrets. | Authentication minimum and sign-in validation are eight characters; recipient activation retains its own stronger validation. Never commit the actual credential. |

Details: [Telegram](telegram-candidate-intake.md), [Workflows](candidate-workflows.md), [Progress](candidate-progress.md), [Archive](archive.md), and [Architecture](architecture.md).

For a new decision, add a stable ID, explain the tradeoff and resulting constraint, and link relevant behavior documentation. If superseded, retain the ID and mark it superseded with a link to the replacement rather than erasing the history. Do not record secrets or conversational transcripts here.
