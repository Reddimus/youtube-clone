# Security

Please report suspected vulnerabilities privately through GitHub's security
advisory feature rather than opening a public issue.

## Dependency audit policy

CI fails when a production dependency audit contains a high or critical
finding. As of 2026-08-06, npm reports one residual moderate advisory
(`GHSA-w5hq-g745-h8pq`) through the current `@google-cloud/storage` 7.21.0
dependency tree. The application does not call the affected UUID v3/v5/v6
buffer APIs directly.

`npm audit fix --force` proposes downgrading the direct storage client to
5.18.3. That is not an appropriate security update for this project. Keep the
latest compatible storage and Firebase SDK releases, and remove this exception
when their dependency tree contains a patched UUID release.
