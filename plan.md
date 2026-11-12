# sched-prod incident board — plan

The on-call board for sched-prod. One page, one list: tonight's incidents, newest first, so on-call sees
what just broke and takes it.

## Flows

| flow | who | what happens |
|------|-----|--------------|
| `open-board` | on-call | opens the board; sees tonight's incidents |
| `ack-incident` | on-call | picks an incident on the board, which opens its incident panel, and acks it there — "I've got this one" |
| `watch-board` | on-call | keeps the board open; it stays current without a reload |

## Requirements

- **R1** New incidents appear live at the top of the list, newest first.
- **R2** ~~Each incident row has an **Ack** button.~~ *Changed 2026-11-12 by product decision (SCHED-4515):*
  picking a row (click, or Enter/Space) opens its **incident panel**, which names the incident id and holds
  the only **Ack** button. Ack in the panel sends the ack for the incident the panel names (`api.ack(id)`),
  shows it acked in the panel, and marks the row acked. Rows have no Ack button. The panel sits beside the
  list, so incidents landing at the top (R1) never move it.
- **R3** Show a loader until incidents load.
- **R4** The board refreshes itself every 2 seconds while open.
- **R5** Times show in the viewer's local time; day before month for EU locales (dd/mm).
- **R6** The page names its build: `<meta name="build" content="<git sha>">` in the head and the same sha in the footer.

## Hooks (pinned — tests and the replay rely on them)

| `data-testid` | element |
|---------------|---------|
| `board` | the board's main area |
| `loader` | the loader (gone once incidents load) |
| `empty` | what shows when there are no incidents |
| `incident-list` | the list |
| `incident-row` | one incident row, with `data-id="<incident id>"` |
| ~~`ack`~~ | ~~the Ack button in a row~~ — removed by SCHED-4515 (Ack left the row) |
| `incident-panel` | the incident panel, with `data-id="<incident id>"` and the id as its title (SCHED-4515) |
| `panel-ack` | the Ack button in the incident panel (SCHED-4515) |
| `acked` | the acked mark in a row |
| `build-sha` | the sha in the footer |

## Done

Every issue in `issues/` delivered, deployed to a public https address, and shown working.
