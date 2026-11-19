---
type: feature
id: simpler-horoscope-discovery-and-purchasing
title: Simpler Horoscope Discovery and Purchasing
status: implementing
owner: Boris Tsekinovsky
created: 2026-11-19
provenance: Created from the feature intake
understanding:
  Problem: known
  Target Users: known
  Primary Workflow: known
  Permissions: known
  Failure Scenarios: known
  Data Model: known
  Notifications: known
  Security: known
  Analytics: known
  Dependencies: known
  Acceptance Criteria: known
schema: 1
understanding_notes:
  Problem: По отзыву названия услуг и пересчёт звёзд затрудняют покупку. Масштаб проблемы неизвестен.
  Target Users: Упрощение рассчитано на людей без знаний астрологии. Исходный отзыв получен от женщин 30–55 лет со средним специальным образованием.
  Primary Workflow: Согласованы бесплатный гороскоп на сегодня, отдельные покупки на календарный месяц и год, автоматический зачёт звёзд и подписка на ежедневные письма за $30 в месяц или $179,82 в год для новых покупателей.
  Permissions: Для платных действий применяются действующие требования входа и проверки доступа к профилю.
  Failure Scenarios: REQ-005 покрывает отмену оплаты, повтор без двойного списания и восстановление оплаченного результата после сбоя генерации.
  Data Model: Есть профили, кошелёк и подписки. Для разовых гороскопов определены профиль, календарный период и пороги полного зачёта звёзд.
  Notifications: Ежедневная подписка использует существующие письма в приложении, email и поддерживаемые push-уведомления.
  Security: Код подписки рассчитывает цену на сервере и проверяет владельца профиля. REQ-005 предусматривает защиту от повторных списаний.
  Analytics: В проекте описаны события покупки и подписки. Целевой прирост конверсии для этой функции не задан.
  Dependencies: Используются Stripe, существующий кошелёк, прогноз на сегодня и ежедневные письма. Для гороскопов на месяц и год нужна генерация за соответствующий период.
  Acceptance Criteria: REQ-004 проверяет совпадение цены и периода оплаты на витрине и в Stripe Checkout. Сохранение договорных цен действующих подписок — рабочее допущение из формулировки Q-011 о новых покупателях.
questions_left: 0
issue: "#16"
---

# Simpler Horoscope Discovery and Purchasing

## Idea

Make forecasts easier to discover and purchase for people unfamiliar with astrology: replace specialist service names with familiar forecast or horoscope wording, expose daily, monthly and yearly horoscopes, clarify the daily subscription offer, and remove the need for users to calculate money-to-star conversions. New daily horoscope subscribers can choose USD 30 per month or USD 179.82 per year.

## Problem

The requester reports that women aged 30–55 with secondary vocational education find the site interesting but cannot understand its services or calculate purchases through stars. Existing terminology and the separate purchase-and-spend flow create barriers. This is reported qualitative feedback; its prevalence and impact on conversion have not been measured.

## Scope

IN: simpler Russian terminology and explanations for situation and relationship services; discoverable daily, monthly and yearly horoscope offerings; clarification of the daily subscription; direct purchasing with automatic star redemption for the current-calendar-month horoscope (initial price USD 4.99, 5 stars for full redemption) and the current-calendar-year horoscope (initial price USD 19.99, 20 stars for full redemption), each available as a separate one-time purchase without a daily horoscope subscription, the situation forecast (1 star for full redemption), and the relationship forecast (2 stars for full redemption). Reuse existing profile-based capabilities where appropriate. Pending owner decisions: remaining offer details, forecast depth, access and new USD prices for the situation and relationship forecasts. OUT: a general redesign of chart tools, unrelated astrology features, new delivery channels and changes to birth-profile management. The referenced photo was not available for inspection in the supplied context or located in the workspace; no visual requirements are inferred from it.

## Existing behaviour

- The profile screen already contains Oracle, Compatibility, Transits, Personal Astrologer and Premium tabs. Russian labels include «Оракул», «Совместимость» and «Транзиты». (`web/src/pages/ProfileDetail.tsx; web/public/locales/ru/translation.json`)
- A free, profile-specific forecast for today already exists under Transits and is cached per profile, date and language. Its default prompt uses the natal chart and today's date, without computed transits. It does not charge stars. (`web/src/components/chart/ForecastView.tsx; functions/src/api/getForecast.ts; functions/src/services/ai/defaultPrompts.ts`)
- Oracle answers a user's question using their natal chart and optional dossier, costing one star. Compatibility compares two natal charts, costing two stars per reading. Default prompts exclude transits; Compatibility currently provides a relationship reading rather than a forecast for a specified period. Both paid actions require sign-in. (`functions/src/api/askOracle.ts; functions/src/api/askRelationship.ts; functions/src/services/ai/defaultPrompts.ts`)
- Personal Astrologer subscriptions already support daily, every-two-days, every-five-days, weekly and fortnightly letters, with monthly or annual billing per profile. Current code prices daily delivery at $19.98/month or $179.82/year. Subscription checkout requires sign-in. (`web/src/components/AstrologerPanel.tsx; web/src/api/astrologer.ts; functions/src/api/subscribeAstrologer.ts; functions/src/services/pricing.ts`)
- Scheduled letters are available in the app, with email delivery and web-push notifications supported. Each successful scheduled letter also credits one star to the user's wallet. (`functions/src/api/processLetterJob.ts; functions/src/services/letterNotify.ts; web/src/components/LettersInbox.tsx`)
- The store already presents outcome-based packs with USD prices: question $0.99, relationship reading $1.99, full reading $3.99 with a $1.99 first-reading offer, and larger bundles. Purchases credit stars; users subsequently spend them on actions. Showing dollar prices therefore already exists, while purchasing and consuming a service remain separate steps. (`functions/src/services/starPacks.ts; functions/src/api/createCheckoutSession.ts; web/src/pages/ProfileDetail.tsx; web/src/lib/tokens.ts`)
- Contextual help for terminology, tabs and paid controls is already implemented. This feature extends an existing effort to help users without astrology knowledge. (`web/src/components/HelpBubble.tsx; web/public/locales/ru/translation.json; docs/features/contextual-help-tooltips-across-the-ui/overview.md`)
- The inspected forecast task, endpoint and view support today's forecast only. They do not expose monthly or yearly horoscope products. (`functions/src/services/ai/tasks.ts; functions/src/api/getForecast.ts; web/src/components/chart/ForecastView.tsx`)
- The older Personal Astrologer draft lists daily letters at $45/month and annual billing at ten monthly payments. Current code instead calculates $19.98/month and nine monthly payments for annual billing. The draft is not reliable evidence of current pricing. (`tasks/personal-astrologer-spec.md; functions/src/services/pricing.ts`)
