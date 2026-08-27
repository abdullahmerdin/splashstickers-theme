# Credential exposure remediation

Treat every database password, Shopify client secret, access token, or API credential that has appeared in tracked files, build logs, chat, tickets, or Notion as compromised. Use variable names, file paths, rule names, and commit IDs in evidence; never copy a credential into a command, ticket, log, or task record.

## 1. Rotate the database credentials first

1. In the Supabase Dashboard, open the project and choose **Database → Settings → Reset database password**. See the [Supabase password reset guide](https://supabase.com/docs/guides/troubleshooting/how-do-i-reset-my-supabase-database-password-oTs5sB).
2. In **Connect**, obtain the current connection details after the reset. Put the session-pooler connection in `DATABASE_URL` for the persistent Render service and the direct PostgreSQL connection in `DIRECT_URL` for Prisma migrations. The [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) explains the connection modes.
3. Update those two variables in Render's service environment and in the team's local secret store. Do not put them in `.env.example`, a committed `.env` file, Dockerfile text, or a shell command that can be saved in history.
4. Save the Render changes and redeploy/restart the service. The `setup` script validates the environment before running Prisma generation or migrations.
5. Confirm `/healthz`, authentication, one read path, and one write path. If any check fails, fix the secret-manager value or network configuration without printing the value.

## 2. Rotate Shopify credentials

If a Shopify client secret or token was exposed, follow Shopify's [client credential rotation guidance](https://shopify.dev/docs/apps/build/authentication-authorization/manage-credentials):

1. Open the Shopify Dev Dashboard, select the app, open **Settings → Credentials**, choose **Rotate** next to the client secret, and generate the new secret.
2. Update `SHOPIFY_API_SECRET` in Render and the local secret store. Keep the old secret active during rollout unless active misuse requires immediate revocation.
3. Redeploy and verify OAuth, an installed-store request, and webhook delivery. Refresh or reauthorize every stored store token as required by the rotation flow before revoking the old secret.
4. After all stores use credentials minted under the new secret, revoke the old secret in the Dev Dashboard.
5. If another API credential appears in the scan, revoke it at its issuing provider, replace it in the secret manager, and redeploy. `SHOPIFY_API_KEY` is the app client ID; do not treat its public visibility as permission to commit secret values beside it.

## 3. Remove current-tree copies

The sanitized example file contains empty credential fields. Local values belong only in ignored environment files or the deployment secret manager.

```text
npm run check:secrets
npm run check:production
git diff --check
```

The secret scan checks tracked files, non-ignored worktree files, and known generated build directories. It prints only finding rules, paths, and line numbers. Do not replace it with `git grep`, `printenv`, `set`, `env`, shell tracing, or an unredacted diff. Keep `.env` and `.env.*` ignored; keep only `.env.example` tracked, with empty credential fields.

## 4. Remove old Git history

Rotate or revoke first. A new commit that blanks a value does not remove the value from earlier commits.

1. Create a fresh mirror clone and install `git-filter-repo` version 2.47 or later.
2. In the mirror, remove the known exposed file from every ref:

```text
git filter-repo --sensitive-data-removal --invert-paths --path apps/splash-stickers-app/.env.example
```

3. If secret scanning identifies another path or a renamed copy, repeat the filter with each affected path. For a partial-file leak, use the documented ``--replace-text`` flow with a local-only replacement file; never commit, print, or upload that file.
4. Force-push the cleaned refs only after reviewing the path-only filter report:

```text
git push --force --mirror origin
```

5. Restore the sanitized `.env.example`, commit it, and push it to `origin/master`. Ask collaborators to discard or rebase tainted clones rather than merging old history. Follow GitHub's [sensitive-data removal guidance](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository) for cached views, pull requests, forks, and support requests.
6. Enable GitHub Secret Protection, secret scanning, and push protection for the repository.

History rewriting is intentionally not performed by the application change because it invalidates clones and refs outside this checkout.

## 5. Clean operational records

Remove credential values from Render logs, CI artifacts, issue comments, chat, and Notion pages. Keep the existing task record limited to the affected variable names, sanitized paths, validation results, and the final commit link. Do not paste scan output that contains a matched line.

## 6. Acceptance checks

The change is ready to close when:

- `npm run check:secrets` passes on tracked source and tracked build/static outputs.
- Production startup rejects missing, placeholder, insecure, malformed, or local-only values with variable names and no values.
- Render starts with secret-manager values, migrations complete, and the health/auth/read/write smoke checks pass.
- The old database password and Shopify secret are revoked/invalidated.
- Current refs and the GitHub secret-scanning alert are clean, with any required history purge and collaborator coordination complete.
