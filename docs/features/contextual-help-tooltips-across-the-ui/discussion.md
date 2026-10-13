# Discussion — Contextual help tooltips across the UI

### Answer to Q-001 · 2026-10-13

Насколько подробным должно быть одно облачко?

B. Короткое определение + 1–2 предложения «зачем это / что это значит для вас».

### Answer to Q-002 · 2026-10-13

Как подсказки должны открываться на телефонах и планшетах, где нет наведения мыши?

C. Гибрид: на десктопе — наведение на сам элемент; на тач-устройствах — иконка «?» только там, где тап уже занят действием.

### Answer to Q-003 · 2026-10-13

Что входит в первую итерацию по охвату экранов?

B. Профиль + все пользовательские экраны (создание профиля, главная, аккаунт, Premium/кошелёк, письма, совместимость).

### Answer to Q-004 · 2026-10-13

Объяснения должны быть общими или привязанными к карте пользователя?

A. Только общие определения терминов, одинаковые для всех.

### Answer to Q-005 · 2026-10-13

Нужна ли пользователю возможность отключить подсказки (например, для опытных)?

A. Подсказки всегда включены.

### Answer to Q-006 · 2026-10-13

Отслеживать ли в аналитике, какие подсказки открывают пользователи?

A. Не отслеживать.

### AI updated the requirements · 2026-10-13

DEC-001, DEC-002, DEC-003, DEC-004, DEC-005, DEC-006 written into REQ-001, the overview.

### Answer to Q-007 · 2026-10-13

What should the house-system help be, given the app has no house-system toggle?

A. No toggle is added. Show the house system the chart actually uses as a small read-only label with a help bubble in the Houses tab (Koch by default, Whole Sign when the server falls back). Write help texts for all three systems (Placidus, Koch, Whole Sign).

### Answer to Q-008 · 2026-10-13

Should AstrologerNotes, an end-user page, get help bubbles?

A. Treat AstrologerNotes as an end-user screen and cover it. The 'no help' check applies to Admin only.

### AI updated the requirements · 2026-10-13

DEC-007 written into REQ-001, REQ-003 and plan I-3 (house-system label instead of a toggle); DEC-008 written into REQ-003 and plan I-6 (AstrologerNotes is covered, the no-help check is Admin only).

### Answer to Q-009 · 2026-10-13

What should the Oracle model help be, given no model label is shown in the UI?

A. Keep the UI as it is (no model name). The Oracle indicators are the Oracle title, its star-cost label and the stars balance pill; their help says the answer is written by an AI from your chart and costs one star.

### AI updated the requirements · 2026-10-13

DEC-011 written into REQ-003 and plan I-5 (Oracle indicators instead of a model label).
