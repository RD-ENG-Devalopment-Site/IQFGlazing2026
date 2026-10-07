# IVQF Improvement workspace

Static HTML reports and calculation tools. The Pages entry point is lowercase
`index.html`; preserve exact filename case for Linux/GitHub Pages.

## Checks before release

With Node.js 24, run:

```sh
node --test tests/*.test.mjs tests/*.test.cjs
git diff --check
```

The workflow runs these checks but does not deploy. Unit tests use mocked DOM,
storage and fetch; passing them is not browser acceptance or a Google write
confirmation. Review the candidate in a real browser at desktop and 320/390px,
including keyboard navigation, Back/Forward, missing-report/retry states,
Scenario A/B, Apply/Save/Reload and JSON import/export.

## Calculation and data limits

- Snapshots are planning evidence, not an approved production staffing standard.
- Workspace schema 4 includes validated model data; older supported data keeps a
  backup on migration. Do not overwrite an unknown newer schema.
- New pallet Scenarios retain calculator settings. Old Scenarios without those
  settings pause auto-link and preserve saved station capacities.
- Trials 1/2/3/6 and other pending entries intentionally have no report link.
- Google `no-cors` responses are sent-but-unconfirmed. A readable acknowledgment
  must match the request and confirm the write before reporting success.
- No API secrets or private source workbooks belong in this public checkout.

## Publishing

Obtain explicit approval for the exact files and commit before pushing `main`.
Confirm case-sensitive links, final Git blob hashes and the intended Pages
configuration. After deployment, smoke-test the HTTPS page and linked reports.
This README and a passing CI run do not imply release approval.
