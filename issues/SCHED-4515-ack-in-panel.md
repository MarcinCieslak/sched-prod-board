---
id: SCHED-4515
title: Ack moves from the row into an incident panel
status: done
plan: R1, R2 (changed)
---

Found while proving SCHED-4511 (recording rec-step1b, 00:09): on-call rested the pointer on the Ack of
INC-2558, INC-2660 landed at the top, the rows shifted, and the click acked INC-2660.

Product's decision: "New incidents stay live at the top. Ack leaves the row: a row opens its incident
panel, and Ack lives there."

- R1 unchanged: new incidents stay live at the top.
- A row opens its incident panel (`data-testid="incident-panel"`, `data-id`, the id as its title).
- Ack lives only in the panel (`data-testid="panel-ack"`) and acks the incident the panel names.
- The row Ack button (`data-testid="ack"`) is removed; the row keeps its acked mark (`data-testid="acked"`).

Acceptance: with the panel open on an incident, new incidents landing at the top do not change which
incident the panel's Ack acks.
