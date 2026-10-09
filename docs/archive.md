# Archive and retention

Use Archive on candidate intake, resumes, recipient accounts, templates, workflows, workflow runs, submissions and AI analysis history. The central Archive screen offers a record overview, grouped restoration and eligible permanent deletion after typed confirmation.

Archiving an intake also archives its CV, and vice versa. Original PDFs and candidate history remain stored. Active CV workflows are paused; archiving a workflow stops new runs while existing runs continue. Accounts lose login access and sessions while their forms remain stored. Templates stop accepting unassigned public links; existing assignments and submissions remain available. Processing AI analyses cannot be archived until they finish; queued/failed jobs are cancelled.

Restoring does not run a workflow, resend an invitation or spend AI credits. Restored workflows stay paused, and interrupted runs require an explicit retry. Account ban state is restored without clearing a later independent ban.

Permanent deletion is available only from Archive and checks its current revision and related records atomically. Completed submissions are immutable. Accounts with candidate/form links, templates with assignment/submission history, workflows with runs, and runs with account/delivery history must retain that evidence. Eligible deletion queues stored-file cleanup in the same transaction and retains the audit log.

The Archive list groups linked CV and intake records into one expandable row. Can delete and Protected history badges show eligibility and concrete reasons before opening deletion confirmation. Deletion still rechecks current related records atomically. Simple archives offer a 12-second Undo archive action using the exact archive revision. Account access changes and interrupted workflows retain their warnings and require restoration through Archive.

Interview processes protect their original CV, approval snapshot, account, preparation run and accepted document links. Archive remains available; eligible permanent deletion explains interview-history blockers and rechecks foreign keys atomically. See [Interview Progress](interview-progress.md).
