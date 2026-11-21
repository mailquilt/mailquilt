# Reviewing code

A review with an open brief always finds more, because each one looks harder than the last, and fixing everything it finds at once brings in new bugs. This page keeps every review to one question, with a bar and an end.

## Name the question first

A review answers one question. If the request doesn't say which, ask.

- **What's wrong with this change?** Review the diff and the code it touches, nothing else. This is the review that runs on every pull request.
- **Is it ready to ship?** Report only findings at the release bar. Start with "ready" or "not ready".
- **How well is it written?** One reviewer reads the whole of a package or app as a design. Score each area out of 10, give the reason for every point lost, then the three to five changes that would raise the score most.

A broad review of the whole codebase runs only at the checkpoints in `ROADMAP.md`, or when the maintainer asks for one.

## Review each change before it merges

- Read the diff and the code it touches. For a refactor, compare what the old code did with what the new code does.
- Check each sentence the pull request adds to the docs, the API descriptions or a changeset against the code, by running it or by a test.
- Check the change against `docs/agents/decisions.md` and `docs/adr/`. A change that goes against one of them says so and updates it.
- For a change to the dashboard, also run the checklist in `docs/agents/design.md`.
- A change to the public API contract, a stored format, or a migration that isn't expand-then-contract is a breaking change, and the pull request says "Breaking".
- Wait for every check to pass before merging. Nobody merges around a failed or unfinished check, admins included.

## The release bar

A finding blocks a merge or a release only if it:

- sends email to someone who must not get it: no subscribed Subscription, an Opt-out, a Suppression, or a second copy of the same Campaign
- loses or damages an Organization's data: Contacts, Subscriptions, Templates, Campaigns, delivery events or settings
- lets data cross between Organizations
- opens a security hole, as described in `docs/security.md`
- stops keyboard or screen reader users from doing something
- makes the code do something other than what the docs, the API contract or the UI promises
- breaks an upgrade: a self-hoster can't move to the new version without losing data or downtime the release notes didn't announce

A red `main` blocks a release too, whatever made it red, a flaky test or a broken workflow included.

Anything else goes in one backlog issue, unless the maintainer asks for it.

## Briefing reviewers

- Don't limit how many findings to report, and don't say "look harder". "Nothing found" is a good answer.
- Give each reviewer the release bar, `docs/agents/decisions.md` and the ADRs.
- Split the work by package only to look for bugs. Judging design needs one reviewer who sees the whole package, because problems like Organization scoping or token handling cross files.
- Ask for each finding's severity against the bar, not only whether it's true.

## Reporting

- Start with the verdict: ready or not, and the score if one was asked for.
- Then the findings at the bar. Then everything else in one short list, headed "Not for this release".
- "Safe to ship" and "well written" are separate answers. Don't give one as the other.
- A finding being true doesn't make it worth doing. Say which ones are.

## Fixing what a review found

- **A bug:** the smallest fix at its root cause, with a test that fails without it.
- **A design problem:** one change per theme, with a short ADR in `docs/adr/`. Not a patch at every place it shows.
- **One fix per pull request,** each reviewed before the next one merges in the same area. Twenty fixes merged in a day add bugs of their own.
- A pull request that reverses anything in `docs/agents/decisions.md` says so, with the reason, and updates that page.
- Change a test only when the code it checks changes, or when the test is wrong.

## Stopping

Stop when a review finds nothing at the bar. Don't start another broad review because of what the last one found below it.
