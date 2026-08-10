# Step snapshots: what starting a task pins, and what it can't

Starting an occurrence writes a snapshot of the task's steps under the instance,
and from then on the occurrence renders that snapshot rather than the live
template ([occurrenceSteps.ts](../src/features/assignments/occurrenceSteps.ts)).
Editing a task therefore changes what future occurrences will look like, never
what a started one is showing.

This note records the costs of that choice and what would remove them, because
each needs the backend.

## What is frozen

| | Frozen |
|---|---|
| Step text | ✅ |
| Step order | ✅ |
| Which steps exist (adds, deletes) | ✅ |
| Step description | ❌ read live from the template |
| Step media — photo, video, audio | ❌ read live from the template |

The gap is the backend's, deliberately. From `startTaskInstance`:

```
// Step snapshots copy text/order only (NOT media — a live Task
// MediaAsset can be deleted).
```

`deleteTaskStep` really does purge the S3 objects, so a deleted step's media is
gone for everyone — no snapshot could hold it. Description simply isn't copied.
Both are joined back from the template by `stepId`, best effort: a step the
template still has keeps its media, a step the template has dropped shows its
frozen text alone.

## Three accepted costs

### 1. Corrections never reach a started occurrence

A caregiver who fixes a mistake in a step — salt where sugar was meant — does not
reach any occurrence already under way. Someone who started this morning's
occurrence keeps working from the wrong text until they finish or skip it;
tomorrow's occurrence gets the fix.

*Resolved by:* asking, on save, whether the edit should apply to already-started
occurrences, and rewriting their snapshot rows when it should. Needs a backend
mutation to update instance steps — today nothing may touch them after creation.

### 2. Old text beside new media

Because media is unfrozen, replacing a step's photo *and* its text shows the
frozen text against the new photo, while the user is working through the task.
For readers who rely on the picture to recognise the step, a mismatch can mislead
in a way that either version alone would not.

*Resolved by:* adding `description` and media (asset ids) to the snapshot rows and
exposing them on `TaskInstanceStep`. Modest change, and it would make the freeze
complete.

### 3. Unskipped work resumes on the old version

SKIPPED can be undone back to IN_PROGRESS. The occurrence stays materialized, so
it stays frozen, and the user resumes on the version they originally started
from. Self-consistent — the steps never change under them — but it is cost 1
again for a task that may have sat skipped for a while.

*Resolved by:* the same mechanism as cost 1.

## Related: why the completion flow reads the snapshot

The backend refuses `COMPLETED` while any *instance* step is unchecked, and
`deleteTaskStep` leaves instance rows untouched. Marking an occurrence done
therefore has to check off the snapshot, not the template: a step deleted from
the template otherwise leaves an unchecked row nobody writes to, and the
occurrence can never be completed again. Step counts and the "all steps done"
conditions come from the snapshot for the same reason.
