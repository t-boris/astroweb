# Discussion — Product analytics, purchase funnel and SEO foundation

### Boris Tsekinovsky · 2026-10-12

Что бы ты вообще предложил для этой фичи? Может быть действительно Google Analytics или что-нибудь другого похожее на этот функционал?

### AI · 2026-10-12

**Моя рекомендация: GA4 через Firebase Analytics, плюс собственные KPI в /admin.** Это два слоя, и каждый отвечает на свои вопросы.

### Почему GA4
Факты проекта:
- Стек целиком на Firebase.
- В `web/src/lib/firebase.ts` уже есть инициализация.
- Аналитики сейчас нет никакой.

Из этого мой вывод: GA4 подключается почти бесплатно по усилиям и сразу закрывает ваши вопросы:
- **сколько и откуда** приходят пользователи: каналы, источники, страны, устройства;
- **что делают**: события по шагам воронки (профиль → карта → paywall → checkout → оплата);
- **как долго**: engagement time и сессии;
- **воронка**: отчёт Funnel exploration по нашим событиям;
- **SEO**: связка с Search Console.

### Почему ещё вкладка «Business» в /admin
Оценка, не факт: GA4 обычно показывает на 10–30% меньше реального трафика. Причины — блокировщики рекламы и отказ от cookie. Поэтому **деньги** (выручка, ARPPU, подписки, звёзды по фичам) считаем из Firestore и Stripe. Это источник истины. Данные для них уже есть в `purchases` и `subscriptions`.

### Альтернативы
| Инструмент | Плюсы | Минусы |
|---|---|---|
| **GA4 (Firebase)** | бесплатно, вписывается в стек, Search Console, BigQuery | сложный интерфейс, нужен cookie-баннер, данные выборочные |
| **PostHog** | удобные воронки, записи сессий, можно хостить у себя | ещё один вендор вне экосистемы Google, платный при росте |
| **Plausible / Umami** | простые, без cookie-баннера | нет полноценных воронок и user_id, слабо подходят для покупок |
| **Yandex.Metrica** | бесплатный Webvisor (записи сессий), сильна для RU-аудитории | ещё один трекер под тем же согласием |

Записи сессий (Clarity или Metrica) предлагаю добавить позже, отдельным шагом.

### Что нужно решить вам
1. **GA4 как основной инструмент — подходит?** Или важны записи сессий уже сейчас?
2. **Аудитория в основном русскоязычная или международная?** Это влияет на SEO (Q-003) и на то, нужна ли Metrica.
3. **Q-001 и Q-002 про согласие на cookie.** Я рекомендую вариант A. Подтвердите или поправьте.

Решение фиксировать пока рано: жду ваш выбор инструмента.

### Answer to Q-001 · 2026-10-12

Отправлять ли серверное событие `purchase` (и события подписки) в GA4 из Stripe webhook, если пользователь отклонил cookie-баннер?

B. Отправлять всегда, но без client_id и user_id, если согласия нет (анонимная транзакция)

### Answer to Q-003 · 2026-10-12

Под какой язык оптимизировать SEO лендинга? Сейчас язык определяется на клиенте (localStorage/navigator), отдельных URL для языков нет, поэт

C. Два публичных URL лендинга (/ и /ru) с hreflang, у каждого свои мета-теги

### Answer to Q-002 · 2026-10-12

Какой режим Google Consent Mode v2 использовать до того, как пользователь согласился?

A. Basic: до согласия GA не загружается совсем

### Answer to Q-004 · 2026-10-12

На что должен ссылаться cookie-баннер? В проекте нет страницы политики конфиденциальности (поиск по web/src не находит privacy/cookie).

A. Добавить короткую публичную страницу /privacy (EN/RU) с описанием GA4, cookie и серверных покупок

### Answer to Q-005 · 2026-10-12

Кого указать на странице /privacy как оператора сайта и какой контакт для вопросов о данных? В коде нет ни футера, ни контактного e-mail.

astroweb@mobilemindai.com

### Answer to Q-006 · 2026-10-12

Какое имя оператора сайта указать на странице /privacy рядом с адресом astroweb@mobilemindai.com: компанию (например, MobileMind AI — это мо

MobileMind AI

### AI updated the requirements · 2026-10-12

DEC-001, DEC-002, DEC-003, DEC-004 written into REQ-004, the overview.

### AI updated the requirements · 2026-10-12

DEC-005 written into REQ-002, REQ-004, the overview.

### AI updated the requirements · 2026-10-12

DEC-006 written into the overview.

### AI updated the requirements · 2026-10-12

DEC-007 written into REQ-002, REQ-004, the overview.

### Boris Tsekinovsky · 2026-10-12

Где ты предлагаешь показывать всю эту статистику об использовании?

### AI · 2026-10-12

Статистика будет в трёх местах. У каждого своя задача, и всё это уже записано в спецификации (DEC-006, пункты 5–7 Scope).

### 1. Вкладка «Business» в `/admin`: деньги и ежедневный обзор
Это ваша основная панель. Данные берутся из Firestore, а это источник истины по оплатам.
- выручка по дням, неделям и месяцам, отдельно по каждой валюте;
- число покупок, платящих пользователей, ARPPU;
- подписки астролога: активные, отменённые, с просроченной оплатой (past_due);
- новые профили за период;
- сколько звёзд потрачено на каждую фичу.

Здесь будут **точные** цифры: блокировщики рекламы и отказ от cookie на них не влияют.

### 2. Google Analytics 4 (analytics.google.com): поведение и воронка
- сколько посетителей и откуда они приходят: каналы, страны, устройства;
- что делают на сайте и сколько времени проводят;
- **воронка покупки**: профиль → карта → paywall → checkout → оплата. Это отчёт Funnel exploration, его настройку мы опишем в чек-листе;
- какие каналы приводят платящих пользователей.

Моя оценка: GA4 покажет на 10–30% меньше реальных цифр, потому что часть людей откажется от cookie или стоит блокировщик. Для трендов и поиска узких мест воронки этого хватает.

### 3. Google Search Console: SEO
Показы и клики в Google, поисковые запросы, индексация `/` и `/ru`. Её можно связать с GA4, тогда эти данные будут видны и там.

### Почему не всё в одном месте
Перенести отчёты GA4 в `/admin` — по сути, построить собственную аналитику, а в спецификации это вынесено за рамки (OUT). Если захочется один экран, дешёвый вариант на потом — дашборд в Looker Studio (бесплатный) поверх GA4 и экспорта в BigQuery.

**Вопрос к вам:** такое разделение подходит? Или нужен единый дашборд уже в этой фиче? Тогда я предложу добавить Looker Studio в чек-лист как документацию, без кода.

### AI · 2026-10-12

Implementation started. Before coding I checked the specification against the code and asked four things. The answers are recorded as decisions.

- SEO tags in the served HTML (overview Acceptance Criteria #9 against plan I-4): static per-route HTML shells generated at build time, no SSR. DEC-008, REQ-008.
- Source for "stars spent per feature": a `starSpends` ledger written with every spend and refund. DEC-009, REQ-009.
- Who sets up GA4, the Measurement Protocol secret and Search Console: Claude, through the MarkView browser, with the secret kept only in Secret Manager. DEC-010.
- Plan defaults approved: Stripe identifiers for renewal and cancel pseudo client_ids and the GA4 event names (DEC-011), Business-tab counting rules for legacy purchases, payers and subscription revenue (DEC-012), PR-check workflow, manual deploy and minor version bump (DEC-013).

F-004 asked for three requirements that did not exist; they are now REQ-005 (event taxonomy), REQ-006 (Business tab and adminStats) and REQ-007 (Search Console). REQ-008 to REQ-010 cover DEC-008, DEC-009 and the checklist.

The last question in this discussion, whether one dashboard is needed in this feature, was not answered. The split in DEC-006 and the OUT list stands: Business tab for money, GA4 for behaviour, Search Console for SEO, and Looker Studio only as an optional line in the checklist.

### Boris Tsekinovsky · 2026-10-12

Answers to the four implementation questions: static per-route shells; add the starSpends ledger; Claude sets up Google-side pieces via the MarkView browser; approve the plan and defaults (renewal and cancel identifiers, legacy livemode from the session-id prefix, payer chain, subscription charges outside revenue, PR-check workflow, manual deploy).

### AI · 2026-10-12

Released as 2.20.1 on natalmystic.com. Verified live: no cookie or request before consent, funnel events with the documented parameters in the live dataLayer and in GA4 Realtime, a live checkout session created without payment, Search Console ownership verified, GA4 funnel exploration 'Purchase funnel' created. Fixed on the way: Cloud Build npm crash (DEC-017), CI `.env` secret overlap (DEC-018), `adminStats` missing public invoker, `paywall_viewed` dedupe collision.

Open: the submitted sitemap shows 'Couldn't fetch' with an empty 'Last read' (the file is valid and Google's live URL test says it is available), the funnel exploration has no data yet, and the Business tab success path was not checked live because Google sign-in does not complete in the MarkView browser.

### Boris Tsekinovsky · 2026-10-12

Checked it (sign-in works in Chrome). The feature can be closed.

### AI · 2026-10-12

Recorded as DEC-019. The remaining owner steps are in `docs/ga4-setup-checklist.md` section 10.
