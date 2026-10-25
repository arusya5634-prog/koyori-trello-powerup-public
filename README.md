# Trello Power-Up — public runtime only

This repository intentionally hosts ONLY generic static assets required to run
a Trello Power-Up. No actual task cards, board content, people, organizational
plans, internal documents, test fixtures, authorization tokens or earlier
repository history are included.

## Hosting
- GitHub Pages publishes from `main` at `/`.
- Iframe Connector URL: `https://<owner>.github.io/<repository>/index.html`.
- Change the Iframe Connector URL of the **existing Trello Power-Up app**,
  keeping its identity and Trello-managed card-shared priority data.
- Do NOT uninstall/recreate the Power-Up when migrating its hosting.
- Verify priority persistence, daily focus, full-board review, card summaries,
  checklist dates and settings in Trello before privatizing the former repo.

## Release policy
Development, full regression tests and security checks live in the separate
development repository, which must be made private after successful cutover.
This runtime-only repository does not contain `npm test` or test fixtures.
Every public update requires a reviewed, strict static-file allowlist export
from the tested development version; never import prior Git history.

This site uses the Trello browser SDK. User and task data remain within Trello
under its existing access and Power-Up storage rules.

## Safeguards
- No real-world data in source, commit message, PR body, or documentation.
- No new paid services, scheduled Actions, or OAuth rollout.
- The code served to a browser is observable even when underlying Git history
  is private; never embed confidential data in JavaScript.
