# 16 — Operationalize exit codes as App Server fatal-error triggers

**What to build:** The Application Server's existing exit-code handling (which already maps Hyper Agent exit codes to fatal-error logs and follows with `Environment.Exit`) is formalized: each Hyper Agent exit code from ticket 05 has a documented App Server action (which log line, which exit code to propagate). A new contributor reading the App Server's lifecycle code can answer "Hyper Agent exited with code N, what happens next?" from one table.

**Blocked by:** 05 (exit codes are constants)

**Status:** ready-for-agent

- [ ] App Server's spawn-watch loop carries a `switch` on the Hyper Agent's exit code with a documented action per code (73 → port conflict fatal, 77 → Corestore fatal, 78 → DI fatal, 79 → drive-index fatal, 80 → main-mount fatal, others → generic fatal with code in log)
- [ ] Each branch logs `FATAL: hyper-agent exit <code>: <reason>` and propagates a mapped exit code (76 for version mismatch is unchanged)
- [ ] A unit test stubs the Hyper Agent exit code to each documented value and asserts the App Server's log line and exit code match the table
- [ ] No behaviour change for the 5-second shutdown grace period or the SIGKILL escalation (those remain per ADR 0055)
