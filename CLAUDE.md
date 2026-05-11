# OpenWork (Ege's fork)

Personal fork of [different-ai/openwork](https://github.com/different-ai/openwork) at https://github.com/ekarga/openwork.

## Working in this repo

- Default branch is `feat/vault-sidebar` — Ege's customized OpenWork.
- `dev` branch tracks upstream and is auto-merged daily by `.github/workflows/sync-upstream.yml`.
- Custom features live in `apps/app/src/react-app/domains/{vault,projects,todos}/` and `apps/desktop/electron/{vault,todos}.mjs`.

## Test your changes — don't ask the user

After ANY change to `apps/app/src/` or `apps/desktop/electron/`, use the
`test-openwork` skill to drive the running OpenWork Dev Electron via CDP.
Standard loop: navigate → wait → screenshot → eval → errors. Read the screenshot
back so the user can see what you saw. Only report DONE after this loop passes.

Skill location: `.claude/skills/test-openwork/SKILL.md`. Driver: `.claude/skills/test-openwork/cdp-driver.mjs`. Zero deps, just Node 22.

## Hot vs cold reloads

- Renderer change (`apps/app/src/`): Vite HMR picks it up. Just navigate or reload.
- Main-process change (`apps/desktop/electron/`): the Electron main process must
  restart. **Ask Ege before killing it** — that closes whatever session he is in.

## Don't touch the production app

`/Applications/OpenWork.app` is the user's installed copy. It does not expose
CDP and is not yours to test against. Always work against the dev instance
(launched via `pnpm dev` from this repo).

## Skill routing

- New UI feature, want to verify it → invoke `test-openwork`
- Need to brainstorm a feature before building → invoke `office-hours`
- Need a code review on the diff → invoke `review`
- Want to ship a PR → invoke `ship`
