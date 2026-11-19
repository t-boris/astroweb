---
type: plan
feature: simpler-horoscope-discovery-and-purchasing
title: Simpler Horoscope Discovery and Purchasing
issues:
  - id: I-1
    title: Introduce three-month situation and relationship forecasts
    summary: Replace Oracle and Compatibility terminology across Russian entry points, headings, actions, and help. Explain the inputs for each service, including the partner information required for «Прогноз на отношения». Preserve the situation question and relationship reading, and extend both results to describe possible developments over the next three months from the forecast date. Show the dates covered in both results.
    requirements: [REQ-001, REQ-002]
    decisions: [DEC-002]
  - id: I-2
    title: Expose daily, monthly, and yearly horoscope offers
    summary: Make all three profile-based horoscope periods discoverable under their Russian labels. Reuse the existing forecast for today and mark it as free. Present the current-calendar-month and current-calendar-year horoscopes as separate one-time purchases available without a daily subscription. Show their covered dates before purchase and distinguish the free horoscope for today from the recurring daily letters.
    requirements: [REQ-003, REQ-004]
    decisions: [DEC-001, DEC-004, DEC-009]
  - id: I-3
    title: Update daily horoscope subscription pricing and presentation
    summary: Present existing daily Personal Astrologer letters as the paid daily horoscope subscription. Identify the covered profile, included content, and daily delivery before payment. Offer new subscribers USD 30.00 monthly or USD 179.82 annually, show the same recurring terms at checkout, and display the annual total without free-month labels. Preserve contracted renewal prices and use the existing delivery and notification channels.
    requirements: [REQ-004]
    decisions: [DEC-001, DEC-005]
  - id: I-4
    title: Build direct checkout with automatic star redemption
    summary: Create a single direct checkout for all four one-time offers. Use USD 4.99 or 5 stars for the monthly horoscope and USD 19.99 or 20 stars for the yearly horoscope. Keep the situation and relationship thresholds at 1 and 2 stars, respectively. Those two services require owner approval of their new USD base prices before launch. Show the selected service, the value applied from stars, and the final USD charge before confirmation. Apply proportional redemption with cent rounding, preserve surplus stars, and keep stars available after cancellation. Enforce sign-in and profile ownership, and prevent duplicate charges and deductions, including concurrent attempts to purchase the same period horoscope.
    requirements: [REQ-003, REQ-005]
    decisions: [DEC-001, DEC-003, DEC-004, DEC-006, DEC-007, DEC-009]
  - id: I-5
    title: Fulfill purchases and preserve access to saved period horoscopes
    summary: Route successful purchases to the selected result and let users recover a failed generation under the original order without paying or spending stars again. Generate monthly and yearly horoscopes for the calendar period confirmed at checkout, include elapsed dates, and show the covered dates in the result. Save one result per profile and calendar period and let users reopen it after the period ends without checkout or any charge. While generation is pending or failed, direct returning users to the existing order and prevent a second purchase.
    requirements: [REQ-001, REQ-002, REQ-003, REQ-005]
    decisions: [DEC-001, DEC-002, DEC-006, DEC-007, DEC-009]
  - id: I-6
    title: Count star-funded orders in purchase analytics
    summary: Update the purchase-funnel implementation and its requirements to count successfully completed direct orders in the same funnel whether paid in USD, in a mix of USD and stars, or entirely in stars. Record actual USD charges as revenue and report USD 0 for fully star-funded orders. Deduplicate fully star-funded purchases by unique order ID without relying on a Stripe session, and verify that reprocessing a completed order does not inflate conversion.
    requirements: [REQ-005]
    decisions: [DEC-008]
updated: 2026-11-19
schema: 1
---

# Implementation plan — Simpler Horoscope Discovery and Purchasing

## I-1: Introduce three-month situation and relationship forecasts

Replace Oracle and Compatibility terminology across Russian entry points, headings, actions, and help. Explain the inputs for each service, including the partner information required for «Прогноз на отношения». Preserve the situation question and relationship reading, and extend both results to describe possible developments over the next three months from the forecast date. Show the dates covered in both results.

Requirements: REQ-001, REQ-002
Decisions: DEC-002

## I-2: Expose daily, monthly, and yearly horoscope offers

Make all three profile-based horoscope periods discoverable under their Russian labels. Reuse the existing forecast for today and mark it as free. Present the current-calendar-month and current-calendar-year horoscopes as separate one-time purchases available without a daily subscription. Show their covered dates before purchase and distinguish the free horoscope for today from the recurring daily letters.

Requirements: REQ-003, REQ-004
Decisions: DEC-001, DEC-004, DEC-009

## I-3: Update daily horoscope subscription pricing and presentation

Present existing daily Personal Astrologer letters as the paid daily horoscope subscription. Identify the covered profile, included content, and daily delivery before payment. Offer new subscribers USD 30.00 monthly or USD 179.82 annually, show the same recurring terms at checkout, and display the annual total without free-month labels. Preserve contracted renewal prices and use the existing delivery and notification channels.

Requirements: REQ-004
Decisions: DEC-001, DEC-005

## I-4: Build direct checkout with automatic star redemption

Create a single direct checkout for all four one-time offers. Use USD 4.99 or 5 stars for the monthly horoscope and USD 19.99 or 20 stars for the yearly horoscope. Keep the situation and relationship thresholds at 1 and 2 stars, respectively. Those two services require owner approval of their new USD base prices before launch. Show the selected service, the value applied from stars, and the final USD charge before confirmation. Apply proportional redemption with cent rounding, preserve surplus stars, and keep stars available after cancellation. Enforce sign-in and profile ownership, and prevent duplicate charges and deductions, including concurrent attempts to purchase the same period horoscope.

Requirements: REQ-003, REQ-005
Decisions: DEC-001, DEC-003, DEC-004, DEC-006, DEC-007, DEC-009

## I-5: Fulfill purchases and preserve access to saved period horoscopes

Route successful purchases to the selected result and let users recover a failed generation under the original order without paying or spending stars again. Generate monthly and yearly horoscopes for the calendar period confirmed at checkout, include elapsed dates, and show the covered dates in the result. Save one result per profile and calendar period and let users reopen it after the period ends without checkout or any charge. While generation is pending or failed, direct returning users to the existing order and prevent a second purchase.

Requirements: REQ-001, REQ-002, REQ-003, REQ-005
Decisions: DEC-001, DEC-002, DEC-006, DEC-007, DEC-009

## I-6: Count star-funded orders in purchase analytics

Update the purchase-funnel implementation and its requirements to count successfully completed direct orders in the same funnel whether paid in USD, in a mix of USD and stars, or entirely in stars. Record actual USD charges as revenue and report USD 0 for fully star-funded orders. Deduplicate fully star-funded purchases by unique order ID without relying on a Stripe session, and verify that reprocessing a completed order does not inflate conversion.

Requirements: REQ-005
Decisions: DEC-008
