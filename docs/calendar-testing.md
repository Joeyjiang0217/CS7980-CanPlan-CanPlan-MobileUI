# CanPlan · Calendar testing notes

## 1. Create a task and schedule it
1. Open **Calendar**.
2. Tap **＋** in the top right. Two ways in:
   - pick something that already exists from **All Tasks**, or
   - **create a new task** (it is added to All Tasks automatically).
3. Set the **start date, time, and repeat (Daily / Weekly / …)**.
4. The task then appears on the matching day in the Calendar.

## 2. Materialized vs unmaterialized, and the colour rule (the core of it)
- **Materialized (instance)** = the real, actionable row. **Unmaterialized (assignment, virtual)** =
  a future placeholder projected from the repeat rule.
- Tasks are always scheduled in the future, so a freshly created one is always **To Do**. Within one
  series, **only the frontier row is materialized (full colour)** at any moment; everything after it
  is **unmaterialized (grey)**.
- **How the frontier advances** — the same in both cases: as soon as the frontier row leaves To Do,
  the next one turns from an assignment into an instance, grey → full colour.
  - **Case A (by hand):** after its time, tap Done or Skipped → that row leaves To Do → the next
    day's row materializes on its own. Do the same to the next day and the third day materializes.
    At that point **the first two days can only delete themselves**, while **the third day (now the
    active one) can delete itself or itself and everything after it**.
  - **Case B (overdue):** the first day passes its scheduled time and becomes **Overdue** → the next
    day materializes the same way.
- In one line: **active (earliest unfinished, full colour) = delete this one or all future ones;
  already Done / Skipped / Overdue (full colour) = delete this one only; grey (unmaterialized) =
  no actions**. Tapping a grey card explains this and points at the day to act on instead (the
  nearest materialized date).

## 3. Month-view thumbnails (the month picker behind 👁 in the top right)
- Each day shows a collage of that day's task covers: **materialized in full colour,
  unmaterialized in grey**, so real work and future placeholders are distinguishable at a glance.

## 4. Working through a To Do
- Open a To Do occurrence: scroll to the bottom to **Skip**, or check every step off — the Skip
  button then becomes **confirm completion**, and confirming moves the occurrence **To Do → Done**.
- Completing a step happens in the step detail player, not in the list, so the time spent on it is
  recorded. The list offers undo on steps already done.

## 5. Status transition rules
- **Done cannot become Skipped.**
- **Overdue** can become Done or Skipped (and is marked as having been overdue).
- **Skipped can be undone**: it returns to To Do, or to Overdue if its time has passed. The backend
  allows this one transition out of a terminal state specifically.

## 6. Steps are frozen once an occurrence starts
- Starting an occurrence snapshots the task's steps. Editing the template afterwards does **not**
  change what a started or finished occurrence shows — that is deliberate, so work under way and
  records of work done are not rewritten.
- Only the step text and their order are frozen. Photos, audio, and descriptions are still read live
  from the template, because deleting a step also deletes its media. See
  [step-snapshots.md](step-snapshots.md) for what that costs and what would fix it.
- So when testing template edits, expect: a step added later does not appear in an already-started
  occurrence; a step deleted later still appears there, with its text but no photo.

## Open backend gap
**Deleting a Done occurrence** is not possible. Deleting a single occurrence goes through
`cancelTaskInstance`, which is a status change, and the backend freezes terminal instances and
offers no hard delete for an instance.

→ Needs either permission to act on terminal instances, or a new `deleteTaskInstance`.
