# 0002: One-way SMS reminders for launch

- Status: Accepted
- Date: 2023-09-05
- Deciders: Marcus, Sam, Priya

## Context

Reminders are the main thing beta groomers asked for. The obvious next step is letting
clients reply to confirm or cancel. Doing that well means:

- A separate A2P 10DLC campaign type for conversational messaging, which takes longer to
  get approved and costs more per month than an account-notifications campaign.
- Parsing free-text replies ("can we do 3 instead?", "C", "yes but Max is sick") and
  deciding what to do with the ones we can't parse. Someone has to read those.
- Inbound message costs and per-business numbers, or routing replies on a shared pool.
- More TCPA and carrier rules to get right before we have a lawyer on retainer.

## Decision

Ship reminders as one-way texts from a single shared Twilio messaging service. The only
inbound message we act on is the standard opt-out (STOP and the other carrier keywords),
which we're required to honour. Reminder copy tells the client to call the business to
change their appointment.

## Consequences

- Faster approval, lower cost, much less to build before the beta.
- Groomers still have to call clients who don't show. We expect to hear about this.
- Revisit after launch once we know reminder volume and whether confirmations are
  what customers want most.
