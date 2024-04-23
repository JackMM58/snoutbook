# 0004: Manual buffer minutes for Mobile availability

- Status: Accepted
- Date: 2024-04-10
- Deciders: Sam, Ana, Priya

## Context

Mobile groomers drive between appointments. Availability for salons is working hours
minus booked time; for a van that would book clients back to back across town.

Computing real drive time means geocoding every client address, calling a routing API
for each candidate slot against the stops before and after it, and paying per request.
It also changes availability from a per-day calculation into a routing problem.

## Decision

Give each van a `buffer_minutes` setting (default 15) that availability keeps clear
before and after every appointment on that van. The groomer sets it by hand based on how
spread out their area is. Booking pages for Mobile also check the client's ZIP against
the business's service-area list so far-away bookings don't come in at all.

## Consequences

- Ships with the Mobile plan without a maps vendor.
- The buffer is the same for every gap, so groomers with big service areas will over- or
  under-pad. Expect them to tune it.
- Route planning (ordering the day and using real drive times) is the follow-up. When it
  lands, the flat buffer in `computeSlots` should become drive time from the previous stop.
