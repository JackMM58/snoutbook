# 0003: Deposits through Stripe Checkout, no saved cards

- Status: Accepted
- Date: 2024-02-20
- Deciders: Sam, Marcus

## Context

Salon customers asked for a way to make clients commit to a booking. Two options:

1. Take a fixed deposit at booking with a one-time Stripe Checkout payment.
2. Save the client's card at booking (SetupIntent) and let the business charge it later,
   for the balance or a no-show fee.

Option 2 is more flexible but means storing payment methods for future off-session
charges. That brings consent copy we'd need reviewed, disputes when a client doesn't
remember agreeing to a fee, handling for expired and declined cards, and support load
when a groomer charges the wrong amount.

## Decision

Option 1. The booking page sends the client to Stripe Checkout (`mode: payment`) on the
business's connected account for the fixed deposit amount. The deposit is recorded
against the appointment and taken off the bill at checkout. We don't create Stripe
customers for clients or save their cards.

## Consequences

- Card details never touch our servers and we stay at the simplest PCI level.
- Unpaid Checkout sessions expire after 30 minutes and the booking is released.
- There is no way to charge a no-show or late-cancel fee; the deposit is all the business
  keeps. Marking an appointment as a no-show only changes its status.
- If customers ask for no-show fees we'll need to revisit this and take on saved cards.
