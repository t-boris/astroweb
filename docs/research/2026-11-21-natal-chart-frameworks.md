---
type: research-map
id: 2026-11-21-natal-chart-frameworks
title: Способы расчёта натальных карт
question: Мы в данной аппликации для расчёта натальной карты используем framework ephemeris. Мне нужно исследовать, какие ещё способы расчёта бывают, какие есть, какие популярны, где взять. Может быть, стоит лучше подключить несколько способов или выбирать какие-то в каких-то зависимостях. В общем, я хочу, чтобы ты мне полностью исследовал, какие есть варианты расчёта натальных карт.
created: 2026-11-21
status: complete
web_queries:
  - Swiss Ephemeris programmer manual Moshier Swiss JPL precision dates house systems Placidus Koch Whole Sign Astrodienst license ...
  - sweph npm official Node Swiss Ephemeris node-gyp license swisseph wasm pyswisseph Kerykeion Flatlib Astrolog ...
  - https://www.astro.com/swisseph/swephprg.htm
  - https://github.com/timotejroiko/sweph
  - Kerykeion GitHub Swiss Ephemeris Flatlib GitHub Immanuel Python astrology natal chart ...
  - "'Moshier'"
  - "'worker_threads'"
  - libephemeris Kerykeion Python Skyfield JPL DE440 DE441 MIT license GitHub ...
  - "'Whole Sign houses'"
  - Astro Seek official birth chart calculator extended settings Placidus Whole Sign site:astro-seek.com ...
  - Astro-Seek Free Birth Chart Calculator Natal Chart Astro-Seek house system ...
  - https://github.com/CruiserOne/Astrolog
  - "'node-gyp'"
  - https://www.reddit.com/r/AskAstrologers/comments/1xc9gax/how_to_get_started/
  - MDN CSS perspective transform-style preserve-3d SVG radialGradient prefers-reduced-motion ...
  - https://threejs.org/docs/pages/OrthographicCamera.html
  - "'size' in https://threejs.org/docs/pages/OrthographicCamera.html"
  - "'focal point'"
  - NASA JPL celestial sphere ecliptic latitude longitude spherical coordinates ...
  - "'`fx`'"
  - https://www.w3.org/TR/css-transforms-2/#transform-rendering
---

# Способы расчёта натальных карт

## Question

Мы в данной аппликации для расчёта натальной карты используем framework ephemeris. Мне нужно исследовать, какие ещё способы расчёта бывают, какие есть, какие популярны, где взять. Может быть, стоит лучше подключить несколько способов или выбирать какие-то в каких-то зависимостях. В общем, я хочу, чтобы ты мне полностью исследовал, какие есть варианты расчёта натальных карт.

## Map

- [Способы расчёта натальных карт](#n1)
  - [Текущий расчёт приложения](#n2)
    - [Swiss Ephemeris в режиме Moshier](#n8)
    - [Время, координаты и релокация](#n9)
    - [Koch, Placidus и Whole Sign](#n10)
    - [Кэш, тесты и зависимые расчёты](#n11)
  - [Движки и модели эфемерид](#n3)
    - [Полуаналитическая модель Moshier](#n12)
    - [Swiss Ephemeris с файлами](#n13)
    - [Численные эфемериды JPL](#n14)
    - [Astronomy Engine для JavaScript](#n15)
    - [Таблицы и собственные формулы](#n16)
  - [Правила построения карты](#n4)
    - [Геометрия домов и углов](#n17)
      - [Крайние широты и подмена домов](#n18)
    - [Тропический и сидерический зодиак](#n19)
    - [Система координат и поправки](#n20)
    - [Историческое и неизвестное время](#n21)
    - [Точки, аспекты и орбисы](#n22)
  - [Поставщики и способы интеграции](#n5)
    - [Node.js, WebAssembly и браузер](#n23)
      - [Исходники и установка WebAssembly](#n29)
    - [Python и готовая структура карты](#n24)
    - [Готовые облачные API](#n25)
      - [JPL Horizons для контрольных расчётов](#n26)
    - [Калькуляторы, программы и таблицы](#n27)
    - [Наблюдаемая распространённость методов](#n28)
      - [Правила сообщества Astro-Seek](#n30)
  - [Выбор для приложения](#n6)
    - [Один основной расчёт](#n31)
      - [Проверка лицензии перед выбором](#n32)
    - [Сверка на независимых примерах](#n33)
      - [Контрольные случаи и допуски](#n34)
    - [Выбор системы домов и зодиака](#n35)
    - [Когда переключать источник координат](#n36)
    - [Версия расчёта и миграция кэша](#n37)
  - [Границы исследования и запросы](#n7)
    - [Что проверено и что осталось](#n38)
    - [Запросы об эфемеридах и библиотеках](#n39)
    - [Запросы о пакетах и API](#n40)
    - [Запросы о калькуляторах и домах](#n41)
  - [3D representation of natal chart](#n42)
    - [Рельефное SVG-колесо](#n43)
      - [Глубина и подсветка аспектов](#n50)
    - [Наклон и параллакс на CSS](#n44)
      - [Слои и границы наклона](#n51)
    - [Проекция объёмных слоёв в SVG](#n45)
      - [Подписи после проекции](#n52)
    - [Объёмное колесо с камерой WebGL](#n46)
      - [Камера и возврат к колесу](#n53)
      - [Контурный свет и локальные ореолы](#n54)
      - [Отрисовка по запросу и возврат](#n55)
    - [Небесная сфера с поясом зодиака](#n47)
      - [Проекции светил на пояс](#n56)
    - [Согласованность плоского и объёмного видов](#n48)
      - [Доступные режимы движения](#n57)
    - [Порядок проверки вариантов](#n49)
      - [Проверки читаемости и совпадения видов](#n58)
    - [Поисковые запросы по 3D-эффектам](#n59)

## Nodes

### Способы расчёта натальных карт {#n1}

- tags: эфемериды, натальная карта

Для приложения стоит отдельно сравнить источники координат небесных тел и правила построения карты. Рабочая гипотеза — сохранить один основной движок, подключить независимую сверку и дать пользователю выбор астрологических настроек там, где он меняет результат осознанно.

#### Evidence

- [AI inference] Координаты планет, правила домов и выбор зодиака можно оценивать отдельно.

### Текущий расчёт приложения {#n2}

- tags: проект

Как сервер получает координаты, строит дома и сохраняет результаты.

### Swiss Ephemeris в режиме Moshier {#n8}

- tags: Node.js, Moshier

На сервере Node.js 22 пакет `sweph` вызывает `calc_ut` с флагами `SEFLG_MOSEPH | SEFLG_SPEED`. Координаты вычисляются локально без файлов эфемерид. Натальная карта сохраняет долготы десяти тел, от Солнца и Луны до Плутона.

#### Evidence

- [Project fact] В зависимостях указан sweph ^2.10.3-b-1, версия Node.js задана как 22. — `functions/package.json:11`
- [Project fact] Обёртка задаёт пустой путь к файлам и вызывает calc_ut с CALC_FLAGS. — `functions/src/astro/ephemeris.ts:1`
- [Project fact] Флаги явно включают Moshier и расчёт скорости. — `functions/src/astro/constants.ts:45`
- [Project fact] В карту входят долготы десяти тел, перечисленных в BODIES. — `functions/src/astro/chart.ts:55`

### Время, координаты и релокация {#n9}

- tags: UTC, релокация

`geo-tz` определяет зону по координатам при создании профиля без явной зоны, Luxon переводит местное время рождения в UTC, а `julday` использует григорианский календарь. При релокации меняются координаты для расчёта домов, а время по-прежнему переводится из зоны рождения. При неизвестном времени используется местный полдень, ASC, MC и номера домов планет отсутствуют, а сами куспиды в результате остаются.

#### Evidence

- [Project fact] Зона определяется на сервере, если она не передана при создании профиля. — `functions/src/api/createProfile.ts:19`
- [Project fact] Из geo-tz берётся первый результат либо UTC при пустом результате. — `functions/src/utils/timezone.ts:7`
- [Project fact] Григорианский календарь передаётся в julday. — `functions/src/astro/ephemeris.ts:37`
- [Project fact] getChart передаёт координаты релокации и исходную зону профиля. — `functions/src/api/getChart.ts:80`
- [Project fact] Для неизвестного времени используется полдень, углы скрываются и планеты не распределяются по домам, массив куспидов сохраняется. — `functions/src/astro/chart.ts:30`

### Koch, Placidus и Whole Sign {#n10}

- tags: дома, зодиак

API принимает три системы домов, страница профиля запрашивает `koch`. Зодиак всегда тропический. При ошибке расчёта домов выполняется повторный расчёт с `whole-sign`, а метаданные содержат фактически применённую систему.

#### Evidence

- [Project fact] Сервер принимает placidus, koch и whole-sign. — `functions/src/api/getChart.ts:20`
- [Project fact] Страница профиля явно передаёт koch. — `web/src/pages/ProfileDetail.tsx:295`
- [Project fact] При исключении от calculateHouses выполняется расчёт с whole-sign. — `functions/src/astro/chart.ts:68`
- [Project fact] Метаданные содержат houses.system и фиксированный tropical. — `functions/src/astro/chart.ts:106`

### Кэш, тесты и зависимые расчёты {#n11}

- tags: кэш, регрессии

Ключ кэша учитывает входные данные рождения и запрошенную систему домов. Версия расчёта в ключе и метаданных отсутствует. Тест карты Эйнштейна даёт проверку знаков и структуры, для смены движка нужна сверка градусов. Транзиты и генерация прогнозов также используют этот расчёт.

#### Evidence

- [Project fact] SHA-256 строится из даты, времени, координат, зоны и системы домов. — `functions/src/services/chart.ts:25`
- [Project fact] ChartMeta содержит систему домов, зодиак, время и зону. — `functions/src/types/index.ts:68`
- [Project fact] Тест карты Эйнштейна сравнивает знаки, а долготы проверяет на диапазон. — `functions/src/__tests__/chart.test.ts:87`
- [Project fact] Транзитный расчёт вызывает ту же computeNatalChart. — `functions/src/services/transits.ts:41`
- [Project fact] Серверный резолвер возвращает результат из кэша либо вычисляет и сохраняет новый. — `functions/src/services/chartResolver.ts:69`

### Движки и модели эфемерид {#n3}

- tags: библиотеки

Локальные библиотеки и астрономические модели, которые можно использовать для расчёта или сверки.

### Полуаналитическая модель Moshier {#n12}

- tags: автономно, DE404

Текущий режим использует встроенное приближение JPL DE404. Astrodienst указывает диапазон примерно от 3000 г. до н. э. до 3000 г. н. э. с оговорками для древних дат, расхождение с базовой моделью для планет менее угловой секунды и для Луны порядка нескольких секунд. Оригинальные материалы доступны у Steve Moshier.

#### Evidence

- [External fact] Astrodienst описывает диапазон, точность относительно JPL и отсутствие файлов в режиме Moshier. — <https://www.astro.com/swisseph-download/doc/swisseph.pdf>
- [External fact] Автор публикует исходники и документацию астрономических программ. — <https://www.moshier.net/>

### Swiss Ephemeris с файлами {#n13}

- tags: Swiss Ephemeris, данные

Режим `SEFLG_SWIEPH` использует сжатые файлы `.se1` Astrodienst. Есть и `SEFLG_JPLEPH` для поддерживаемых библиотекой оригинальных файлов JPL. Файловый режим позволяет оставить расчёт домов и API прежними. При внедрении стоит проверять возвращённые флаги, поскольку библиотека может использовать Moshier при отсутствии данных.

#### Evidence

- [External fact] Документация описывает режимы SWIEPH, JPLEPH, MOSEPH, возврат фактически применённых флагов и переход при недоступности файлов. — <https://www.astro.com/swisseph/swephprg.htm>
- [External fact] Astrodienst публикует исходники и файлы эфемерид в официальном репозитории. — <https://github.com/aloistr/swisseph>
- [AI inference] Замена источника планетных координат внутри той же обёртки позволяет сохранить формулы домов и контракт карты.

### Численные эфемериды JPL {#n14}

- tags: JPL, SPICE, Skyfield

JPL публикует интегрированные орбиты в виде файлов, по которым интерполируют положения и скорости. Для современных дат доступны `de440s.bsp` примерно на 1850–2150 годы и `de440.bsp` на 1550–2650 годы, для длинного исторического диапазона есть более объёмный DE441. Локально файлы читают через NAIF SPICE или Python Skyfield. Для полной карты поверх координат нужны формулы домов и аспекты.

#### Evidence

- [External fact] NASA JPL публикует планетные и лунные эфемериды и указывает форматы их распространения. — <https://ssd.jpl.nasa.gov/planets/eph_export.html>
- [External fact] Документация Skyfield приводит диапазоны и размеры файлов DE440 и DE441 и показывает загрузку BSP. — <https://rhodesmill.org/skyfield/planets.html>
- [External fact] NASA NAIF публикует планетные SPK kernels. — <https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/>
- [AI inference] Астрономический результат нужно преобразовать к правилам натальной карты отдельным слоем.

### Astronomy Engine для JavaScript {#n15}

- tags: JavaScript, MIT, VSOP87

`astronomy-engine` под MIT подходит для автономной сверки долгот в Node.js и браузере. Автор заявляет точность порядка одной угловой минуты и тесты против NOVAS и JPL Horizons. Библиотека покрывает все десять тел текущей карты. Для её использования как основного движка понадобятся совместимые расчёты домов и проверка у границ знаков, домов и орбисов.

#### Evidence

- [External fact] Документация Astronomy Engine описывает модели, точность, покрытие тел, тесты и лицензию. — <https://github.com/cosinekitty/astronomy>
- [Project fact] В натальной карте используется набор из десяти тел. — `functions/src/astro/constants.ts:9`
- [AI inference] Около границ классификации даже небольшое расхождение долготы может изменить видимый результат.

### Таблицы и собственные формулы {#n16}

- tags: таблицы, интерполяция
- position: -543, -46

Исторический вариант — взять табличные долготы на соседние даты, интерполировать на момент рождения и рассчитать дома отдельно. Для реализации с нуля JPL публикует приближённые кеплеровы элементы, а VSOP87 даёт аналитические ряды для планет. Луна, Плутон, преобразования координат и дома требуют собственного покрытия. Подход полезен для обучения и контрольных примеров, а для выпуска продукта потребует больше всего самостоятельной валидации.

#### Evidence

- [External fact] NASA публикует формулы и номинальные погрешности приближённого расчёта по орбитальным элементам. — <https://ssd.jpl.nasa.gov/planets/approx_pos.html>
- [External fact] Каталог первичных решений Bretagnon и Francou публикует ряды VSOP87. — <https://cdsarc.cds.unistra.fr/viz-bin/cat/VI/81>
- [AI inference] Для ручной интерполяции нужно учитывать переход 360°/0°, а построение полной карты требует больше данных и правил, чем формулы для планет.

### Правила построения карты {#n4}

- tags: методика

Параметры, от которых зависят знаки, дома, углы и аспекты даже при согласованных координатах.

### Геометрия домов и углов {#n17}

- tags: Placidus, Whole Sign, Equal House

Placidus и Koch делят карту по разным правилам, связанным с суточным движением. Whole Sign начинает первый дом с начала восходящего знака, Equal House — с градуса ASC, Porphyry делит каждый квадрант на три равные части. Regiomontanus и Campanus используют разные опорные круги. Эти настройки меняют куспиды и распределение по домам при тех же долготах планет.

#### Evidence

- [External fact] Astrodienst описывает определения Placidus, Koch, Regiomontanus, Campanus, Equal House, Whole Sign и Porphyry. — <https://www.astro.com/swisseph-download/doc/swisseph.pdf>
- [Project fact] Приложение определяет дом по интервалу между куспидами, учитывая переход 360°/0°. — `functions/src/astro/houses.ts:30`

### Крайние широты и подмена домов {#n18}

- tags: широта, fallback

На высоких широтах Placidus и Koch могут дать ошибку. Swiss Ephemeris возвращает Porphyry вместе с кодом ошибки, а приложение отбрасывает этот результат и пересчитывает Whole Sign. При сравнении нужно фиксировать и запрошенную, и применённую систему. Отдельно следует согласовать способ назначения дома по долготе или по долготе и широте тела.

#### Evidence

- [External fact] Справочник описывает переход к Porphyry с ERR и функцию swe_house_pos, которая принимает долготу и широту тела. — <https://www.astro.com/swisseph/swephprg.htm>
- [Project fact] Обёртка выбрасывает исключение при отрицательном флаге houses. — `functions/src/astro/ephemeris.ts:72`
- [Project fact] При исключении карта пересчитывает куспиды в whole-sign, а дома планет определяются по долготе. — `functions/src/astro/chart.ts:68`

### Тропический и сидерический зодиак {#n19}

- tags: зодиак, аянамша, Jyotish

Тропический зодиак отсчитывает долготы от точки весеннего равноденствия даты. В сидерическом режиме нужно выбрать аянамшу, например Lahiri или Fagan–Bradley. Её выбор может менять знак и сетку Whole Sign. Для отдельного режима Jyotish стоит определить состав функций, например узлы, накшатры и варги.

#### Evidence

- [External fact] Astrodienst описывает тропическую и сидерическую привязки, а также разные определения аянамши. — <https://www.astro.com/swisseph-download/doc/swisseph.pdf>
- [Project fact] Приложение делит долготу на равные сектора по 30° и фиксирует tropical в метаданных. — `functions/src/astro/zodiac.ts:13`
- [AI inference] Полнота режима Jyotish зависит от того, какие специфические правила и выходные данные нужны аудитории.

### Система координат и поправки {#n20}

- tags: геоцентр, топоцентр, J2000

Перед сравнением нужно согласовать центр наблюдения, эклиптику даты или J2000, видимые или геометрические позиции, а также шкалу времени. Топоцентрический режим учитывает точку наблюдения и особенно важен при сравнении координат Луны. Для воспроизводимости сохраняйте эти параметры вместе с версией модели.

#### Evidence

- [External fact] Документация Swiss Ephemeris описывает стандартные видимые позиции и флаги для геометрических, топоцентрических и других координат. — <https://www.astro.com/swisseph/swephprg.htm>
- [External fact] Horizons различает системы координат, центр наблюдения, шкалы времени и типы поправок. — <https://ssd.jpl.nasa.gov/horizons/manual.html>
- [Project fact] В текущих флагах нет топоцентрического режима. — `functions/src/astro/constants.ts:45`

### Историческое и неизвестное время {#n21}

- tags: DST, IANA, неопределённость

Время рождения нужно нормализовать до сравнения движков. Для осеннего перевода часов одно местное время может соответствовать двум моментам, при весеннем переводе время может отсутствовать, а историческая зона до 1970 года требует проверки по месту и дате. При неизвестном времени полезно показывать диапазон положения Луны за локальные сутки и помечать знаки и аспекты, которые могли измениться. Полуденные куспиды стоит убрать с колеса карты без времени.

#### Evidence

- [External fact] IANA описывает ограниченную историческую полноту базы часовых зон до 1970 года. — <https://data.iana.org/time-zones/tzdb/theory.html>
- [Project fact] Расчёт конвертирует время через Luxon и использует местный полдень при timeUnknown. — `functions/src/astro/chart.ts:30`
- [Project fact] Колесо передаёт куспиды компоненту HouseCusps независимо от отсутствия ASC и MC. — `web/src/components/chart/NatalChart.tsx:100`
- [AI inference] Интервал по локальному дню лучше передаёт неопределённость, чем одна полуденная позиция.

### Точки, аспекты и орбисы {#n22}

- tags: аспекты, орбисы, узлы

Сравнивать карты нужно для одинакового состава объектов и правил. В проекте есть пять мажорных аспектов с орбисом 6°, при известном времени участвуют ASC и MC. Узлы, Лилит, Хирон, звёзды и определение ретроградности требуют отдельных настроек, включая выбор истинного или среднего узла и определение Лилит.

#### Evidence

- [Project fact] Для пяти мажорных аспектов заданы углы 0°, 60°, 90°, 120°, 180° и орбис 6°. — `functions/src/astro/constants.ts:29`
- [Project fact] ASC и MC добавляются в список точек аспектов только при известном времени и наличии углов. — `functions/src/astro/chart.ts:93`
- [External fact] Astrodienst документирует разные определения лунных узлов и апогея, связанного с Лилит. — <https://www.astro.com/swisseph-download/doc/swisseph.pdf>

### Поставщики и способы интеграции {#n5}

- tags: интеграция, источники
- position: -580, 203

Пакеты, готовые API и настольные программы для внедрения и ручной проверки. Распространённость оценивается по наблюдаемому использованию.

### Node.js, WebAssembly и браузер {#n23}

- tags: npm, WebAssembly, браузер

Для Node.js есть нативный `sweph` через npm. Для работы в браузере доступны `@kuntay/swisseph` на WebAssembly и `astronomy-engine` на JavaScript. WebAssembly переносит Swiss Ephemeris в другую среду исполнения, а Astronomy Engine даёт другую модель планетных координат.

#### Evidence

- [External fact] README sweph описывает нативный Node.js N-API, готовые бинарники для поддерживаемых платформ и способ установки. — <https://github.com/timotejroiko/sweph>
- [External fact] Проект @kuntay/swisseph документирует запуск Swiss Ephemeris в браузере и загрузку файлов эфемерид. — <https://github.com/kuntayerkus/swisseph>
- [External fact] Astronomy Engine документирует JavaScript для Node.js и браузера. — <https://github.com/cosinekitty/astronomy>

### Исходники и установка WebAssembly {#n29}

- tags: WebAssembly

Пакет `@kuntay/swisseph` опубликован проектом `kuntayerkus/swisseph-wasm`. Для проверки установки и примеров используйте этот репозиторий.

#### Evidence

- [External fact] Действующий репозиторий содержит инструкции для браузера и Node.js. — <https://github.com/kuntayerkus/swisseph-wasm>

### Python и готовая структура карты {#n24}

- tags: Python, Kerykeion, LibEphemeris

`pyswisseph` предоставляет прямой доступ к Swiss Ephemeris. Immanuel и Flatlib дают более высокий уровень для астрологических карт. Kerykeion v6 предлагает полные карты и SVG, по умолчанию использует `libephemeris` на данных JPL и опционально подключает Swiss Ephemeris. `libephemeris` доступен отдельно через pip и рассчитывает дома, сидерические позиции и лунные точки. Для текущего Node.js-сервера это кандидат на отдельный сервис или инструмент сравнения.

#### Evidence

- [External fact] pyswisseph является Python-расширением Swiss Ephemeris. — <https://github.com/astrorigin/pyswisseph>
- [External fact] Immanuel формирует данные карт на базе Swiss Ephemeris. — <https://github.com/theriftlab/immanuel-python>
- [External fact] Flatlib предоставляет API традиционной астрологии. — <https://github.com/flatangle/flatlib>
- [External fact] Документация Kerykeion v6 указывает libephemeris по умолчанию и Swiss Ephemeris как дополнительный backend. — <https://kerykeion.net/python-library/docs/v6/ephemeris_backend>
- [External fact] LibEphemeris публикует установку через pip, поддержку домов, аянамш и лунных точек, а также лицензию AGPL-3.0. — <https://github.com/g-battaglia/libephemeris>

### Готовые облачные API {#n25}

- tags: API, SaaS

Prokerala, FreeAstroAPI и Asterwise публикуют интерфейсы для натальных карт. FreeAstroAPI явно документирует систему домов, зодиак, аянамшу и режим неизвестного времени. Такие сервисы подходят для быстрого прототипа или отдельного функционала. Для основного расчёта нужно подтвердить, какие данные рождения передаются, версию модели и настройки, ограничения, стоимость и условия обработки данных.

#### Evidence

- [External fact] Prokerala показывает демо Natal Chart с выбором системы домов и публикует условия и ограничения API. — <https://client-api.prokerala.com/demo/natal-chart.php>
- [External fact] Условия Prokerala описывают лимиты и условия коммерческого использования. — <https://api.prokerala.com/tos>
- [External fact] FreeAstroAPI документирует параметры house_system, zodiac_type, аянамшу и время рождения. — <https://www.freeastroapi.com/docs/western/natal>
- [External fact] Asterwise документирует западную карту с тропическими долготами, выбором домов и дополнительными точками. — <https://docs.asterwise.com/reference/western-astrology/foundations/western-natal-chart/>

### JPL Horizons для контрольных расчётов {#n26}

- tags: NASA, контроль

Для разовой сверки можно взять видимую геоцентрическую эклиптическую долготу даты через `OBSERVER`, центр `500@399` и величину `31`, учитывая отличия системы отсчёта от Swiss Ephemeris. Для регулярной проверки удобнее локальный BSP. JPL ограничивает встраивание API в сайты и предоставляет доступ по мере возможностей.

#### Evidence

- [External fact] Руководство Horizons описывает OBSERVER и величину 31 для эклиптических координат даты. — <https://ssd.jpl.nasa.gov/horizons/manual.html>
- [External fact] Пример в API-документации показывает геоцентрический центр 500@399 и параметры запроса. — <https://ssd-api.jpl.nasa.gov/doc/horizons.html>
- [External fact] Правила JPL предписывают избегать лишних запросов, ограничивают встраивание и не гарантируют доступность API. — <https://ssd-api.jpl.nasa.gov/>

### Калькуляторы, программы и таблицы {#n27}

- tags: Astrodienst, Astrolog, Solar Fire

Для ручной сверки доступны Astrodienst Extended Chart Selection, открытый Astrolog и Solar Fire 9. У Astrodienst есть также печатные эфемериды с планетами, узлами и Хироном. Solar Fire 9 и таблицы Astrodienst используют Swiss Ephemeris, поэтому полезны для сравнения настроек и воспроизводимости внутри одного семейства.

#### Evidence

- [External fact] Astrodienst предоставляет Extended Chart Selection. — <https://www.astro.com/cgi/genchart.cgi>
- [External fact] Astrolog публикует исходники и ссылку на загрузку программы. — <https://github.com/CruiserOne/Astrolog>
- [External fact] Руководство Solar Fire 9 указывает Swiss Ephemeris для расчёта позиций планет. — <https://www.esotech.com.au/wp-content/uploads/2015/11/Solar-Fire-9.pdf>
- [External fact] Печатные эфемериды Astrodienst содержат планеты и дополнительные точки и построены на Swiss Ephemeris. — <https://www.astro.com/swisseph/swepha_e.htm>

### Наблюдаемая распространённость методов {#n28}

- tags: распространённость, дома

Swiss Ephemeris — распространённый ориентир для астрологических программ, о чём говорит его использование в Solar Fire и наличие обёрток на нескольких языках. В выборке сохранённых настроек Astrodienst за август 2020 года было 8 162 явных выбора Placidus, 7 356 Whole Sign и 2 762 Koch, плюс 17 024 выбора системы по умолчанию, обычно Placidus. В правилах сообщества r/AskAstrologers встречается явное требование строить карту на Astro-Seek в Whole Sign. Эти данные описывают разные аудитории и периоды.

#### Evidence

- [External fact] Представитель Astrodienst опубликовал прямую выгрузку сохранённых предпочтений и объяснил значение default. — <https://www.astro.com/forarch/pdf/1593087729.pdf>
- [External fact] Модератор r/AskAstrologers указал Astro-Seek и Whole Sign в правилах публикации карт. — <https://www.reddit.com/r/AskAstrologers/comments/1xc9gax/how_to_get_started/>
- [External fact] Solar Fire 9 документирует использование Swiss Ephemeris. — <https://www.esotech.com.au/wp-content/uploads/2015/11/Solar-Fire-9.pdf>
- [AI inference] Поддержка в продуктах служит сигналом распространённости, а настройки одной платформы ограничивают вывод о предпочтениях всей аудитории.

### Правила сообщества Astro-Seek {#n30}

- tags: Astro-Seek, Whole Sign

В обсуждении Need Help Using Astro Seek модератор даёт инструкции по выбору Whole Sign. Это прямое свидетельство практики конкретного сообщества.

#### Evidence

- [External fact] Инструкции опубликованы модератором в обсуждении Need Help Using Astro Seek. — <https://www.reddit.com/r/AskAstrologers/comments/1xc9gax/need_help_using_astro_seek/>

### Выбор для приложения {#n6}

- tags: решение

Роли основного движка, контрольного расчёта и пользовательских настроек, а также условия миграции.

### Один основной расчёт {#n31}

- tags: рекомендация, движок
- number: 1

Сохранить `sweph` с Moshier как базовый режим для имеющихся десяти тел и обычных дат рождения, если применимый лицензионный режим подтверждён. Рассматривать файлы Swiss Ephemeris как ближайшее обновление при измеримом выигрыше в точности, скорости или покрытии объектов. Вариант с независимым JPL через локальный BSP или LibEphemeris имеет смысл при требовании к независимой реализации, расширенному диапазону или известной версии данных.

#### Evidence

- [Project fact] Текущий вызов выбирает Moshier и возвращает долготу, широту, расстояние и скорость движка. — `functions/src/astro/ephemeris.ts:20`
- [External fact] Astrodienst документирует погрешность Moshier относительно JPL и режимы с файлами. — <https://www.astro.com/swisseph-download/doc/swisseph.pdf>
- [AI inference] Для текущего набора объектов смену стоит обосновать конкретным выигрышем и результатами сверки.

### Проверка лицензии перед выбором {#n32}

- tags: AGPL, лицензия, MIT

Для Swiss Ephemeris Astrodienst предлагает AGPL или Professional License. Опубликованный договор от 9 ноября 2026 года указывает 700 CHF, срок шесть лет и отдельный пункт про предоставление API сторонним компаниям. Подтвердите, какой договор или режим применяется к развёртыванию проекта и точной версии `sweph`. При необходимости разрешительной лицензии Astronomy Engine под MIT даёт координаты, а совместимые дома и остальные правила потребуют отдельной реализации.

#### Evidence

- [External fact] Официальный договор описывает цену, срок, использование собственного сервера и условия API для третьих лиц. — <https://www.astro.com/swisseph/secont_e_2609.pdf?nhor=30229768>
- [External fact] README sweph указывает AGPL для новых версий и возможность применения LGPL для обёртки при наличии профессиональной лицензии Swiss Ephemeris. — <https://github.com/timotejroiko/sweph>
- [External fact] Astronomy Engine распространяется под MIT. — <https://github.com/cosinekitty/astronomy>
- [Open assumption] Режим лицензирования фактически развёрнутой зависимости и наличие подписанного договора не подтверждены исследованными материалами.

### Сверка на независимых примерах {#n33}

- tags: валидация, метрики
- number: 2

Сравнить Moshier, Swiss с `.se1` и независимый JPL DE440s или Horizons для синтетических дат с известным UTC, одинаковым центром и согласованными поправками. Отдельно сравнить ASC, MC, куспиды и номера домов с Astrodienst или LibEphemeris при тех же правилах. Измерять круговую разницу долгот, ошибки по каждому телу, изменение знаков, домов и аспектов, а также задержку и холодный старт в среде Node.js 22.

#### Evidence

- [Project fact] Текущий тест сравнивает знаки и допустимые диапазоны координат. — `functions/src/__tests__/chart.test.ts:87`
- [External fact] Опубликованное сравнение Kerykeion показывает типичные отклонения между Swiss Ephemeris и LibEphemeris для долгот, углов и куспидов. — <https://kerykeion.net/python-library/docs/v6/backend_precision_comparison>
- [AI inference] Сверка астрономических координат и проверка правил карты требуют разных эталонов, а типичные отклонения внешнего проекта дают только ориентир для выбора порогов.

### Контрольные случаи и допуски {#n34}

- tags: граничные случаи, допуски

Включить экваториальные, средние и высокие широты обоих полушарий, даты возле границ файлов, смену дня и DST, неизвестное время, переход через 0° и случаи рядом с куспидами и пределами орбисов. Для углов сравнивать меньшую дугу между значениями. Пороги задать по телам и углам, а смену дискретной классификации отслеживать отдельно даже при малом отклонении.

#### Evidence

- [Project fact] Проект уже считает меньшую дугу для аспектов и обрабатывает переход через 0° при распределении по домам. — `functions/src/astro/aspects.ts:4`
- [External fact] Документация Swiss Ephemeris описывает особые случаи Placidus и Koch за полярным кругом. — <https://www.astro.com/swisseph/swephprg.htm>
- [AI inference] Допуски для миграции следует привязать к точности интерфейса и частоте заметных изменений результата.

### Выбор системы домов и зодиака {#n35}

- tags: настройки, совместимость
- number: 3

Первый полезный выбор на экране карты — Koch, Placidus и Whole Sign: все три уже поддерживает сервер. Для существующих карт сохранить `koch` как начальное значение, а Placidus предлагать для совместимости с распространёнными западными калькуляторами. На высоких широтах явно показывать применённую замену домов. Сидерический режим добавлять, если есть спрос, с явным выбором аянамши и едиными настройками в карте, прогнозах и PDF.

#### Evidence

- [Project fact] Клиентский экран карты явно передаёт koch, сервер принимает три перечисленные системы. — `web/src/pages/ProfileDetail.tsx:295`
- [External fact] В опубликованной выборке Astrodienst Placidus, Whole Sign и Koch входят в наиболее частые явные настройки. — <https://www.astro.com/forarch/pdf/1593087729.pdf>
- [Open assumption] Спрос аудитории приложения на сидерические карты и предпочтительная аянамша ещё не установлены.

### Когда переключать источник координат {#n36}

- tags: fallback, воспроизводимость
- number: 4

Второй движок сначала полезнее подключить для фоновой сверки. Автоматически выбирать источник стоит только по заранее определённому условию, например диапазону дат, доступности нужного объекта или обязательному автономному режиму. Резервный расчёт допустим при заранее проверенной эквивалентности для конкретного случая. Сохраняйте фактический источник и причину переключения на уровне карты, а при разных источниках внутри карты — и на уровне тела.

#### Evidence

- [External fact] Swiss Ephemeris может вернуть флаг другого источника при отсутствии запрошенных данных. — <https://www.astro.com/swisseph/swephprg.htm>
- [External fact] В sweph изменения set_ephe_path и set_sid_mode действуют на весь процесс, включая worker_threads. — <https://github.com/timotejroiko/sweph>
- [AI inference] Для одновременной работы с разными глобальными настройками движка нужны изолированные процессы или гарантированная последовательность вызовов. Усреднение результатов лишает карту определённого источника.

### Версия расчёта и миграция кэша {#n37}

- tags: миграция, кэш, метаданные
- number: 5

До смены движка зафиксировать версию алгоритма и данных, фактический режим, настройки зодиака, запрошенные и применённые дома и нормализованное время. Версию расчёта включить в ключи карты и зависимых результатов, сохранить возможность открыть старые карты и сравнить новые вычисления до переключения. Проверить единообразие карты, транзитов, партнёрских расчётов, писем, прогнозов и PDF.

#### Evidence

- [Project fact] Ключ кэша карт сейчас не содержит версию расчёта. — `functions/src/services/chart.ts:25`
- [Project fact] Прогноз имеет собственный ключ кэша, в который карта или её версия не входят. — `functions/src/api/getForecast.ts:30`
- [Project fact] Партнёрский прогноз строит обе карты с Koch, PDF и письма используют серверный резолвер карты. — `functions/src/services/forecastGeneration.ts:234`
- [Project fact] Генератор PDF получает карту из серверного резолвера. — `functions/src/api/processPdfJob.ts:68`
- [Project fact] Подготовка письма получает карту из резолвера и вычисляет по ней транзиты. — `functions/src/services/letterEngine.ts:173`
- [AI inference] Версионирование зависимых результатов помогает избежать выдачи старой интерпретации после пересчёта карты.

### Границы исследования и запросы {#n7}

- tags: проверяемость
- position: -450, 513

Проверяемость сравнения и журнал поисковых запросов.

### Что проверено и что осталось {#n38}

- tags: методика, ограничения

Сравнение основано на коде серверного расчёта, клиентском вызове и открытых документах разработчиков. Замеры на развёрнутом приложении и численная сверка его карт не проводились. Решение о переходе зависит от поддерживаемых дат и объектов, допустимых расхождений, лицензии и предпочтений аудитории. Рабочие адреса для двух ошибочных ссылок приведены в дочерних узлах «Исходники и установка WebAssembly» и «Правила сообщества Astro-Seek».

#### Evidence

- [Open assumption] Продуктовые требования к точности, диапазону, дополнительным точкам и предпочтениям аудитории ещё предстоит подтвердить.
- [AI inference] Публичные сравнения и выборки позволяют отобрать варианты для проверки на приложении.

### Запросы об эфемеридах и библиотеках {#n39}

- tags: поиск

- `Swiss Ephemeris programmer manual Moshier Swiss JPL precision dates house systems Placidus Koch Whole Sign Astrodienst license`
- `NASA JPL Horizons API DE440 DE441 NAIF SPICE ephemeris documentation Skyfield`
- `Astronomy Engine cosinekitty JavaScript accuracy npm Moshier ephemeris VSOP87 ELP2000 Meeus planet positions`
- `sweph npm official Node Swiss Ephemeris node-gyp license swisseph wasm pyswisseph Kerykeion Flatlib Astrolog`
- `IMCCE VSOP87 ELP Moshier Astronomical Algorithms Meeus IAU SOFA IANA tz database historical 1970`
- `IMCCE VSOP87 Bretagnon Francou VizieR VI/81 ELP2000 Chapront NASA approximation planet positions`
- `Moshier aa ephemeris official moshier.net Swiss Ephemeris 3000 BC 3000 AD precision`
- `NASA JPL approximate positions planets Keplerian elements IAU SOFA Swiss Ephemeris printed ephemeris Astrodienst`

### Запросы о пакетах и API {#n40}

- tags: поиск

- `astrology natal chart API birth chart house sidereal Prokerala AstrologyAPI FreeAstrologyAPI official documentation`
- `Kerykeion GitHub Swiss Ephemeris Flatlib GitHub Immanuel Python astrology natal chart`
- `libephemeris Kerykeion Python Skyfield JPL DE440 DE441 MIT license GitHub`
- `Prokerala Western natal chart API house_system tropical documentation AstrologyAPI western natal chart FreeAstrologyAPI western chart`
- `Prokerala western natal chart API documentation OAuth site:api.prokerala.com`

### Запросы о калькуляторах и домах {#n41}

- tags: поиск

- `Astrodienst default Placidus house system whole sign Astro Seek documentation Astrolog Swiss Ephemeris chart`
- `Astrolog Walter Pullen Swiss Ephemeris download Astrodienst Astro Seek birth chart calculator house system Placidus`
- `Astro Seek birth chart calculator official Astrodienst extended chart selection default Placidus Solar Fire Swiss Ephemeris Astrolog`
- `Astro Seek official birth chart calculator extended settings Placidus Whole Sign site:astro-seek.com`
- `Solar Fire official Esoteric Technologies Swiss Ephemeris Astrolog Walter Pullen download Swiss Ephemeris`
- `Astro-Seek Free Birth Chart Calculator Natal Chart Astro-Seek house system`
- `CruiserOne Astrolog GitHub Swiss Ephemeris placalc calculation Astrolog command line`
- `Astrodienst Placidus default house system official FAQ Placidus`

### 3D representation of natal chart {#n42}

- position: 22, 834

Ideas for implementation of 3D representation of natal chart

### Рельефное SVG-колесо {#n43}

- tags: SVG, 2.5D

Добавить обод со скошенной кромкой, объёмные диски планет и локальное свечение выбранного объекта. Это самый короткий путь к эффекту глубины. Карта остаётся фронтальной, и градусы читаются как сейчас.

#### Evidence

- [Project fact] Колесо уже рисует градиентный фон и задаёт фильтры свечения. — `web/src/components/chart/NatalChart.tsx:65`
- [Project fact] Маркеры планет уже отрисованы как диски с отдельными глифами и подписями градусов. — `web/src/components/chart/PlanetMarkers.tsx:171`
- [External fact] В SVG положение фокуса radialGradient можно задать атрибутами fx и fy. — <https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/radialGradient>
- [AI inference] Смещённый световой блик и контур кромки дадут ощущение материала без смены геометрии колеса.

### Глубина и подсветка аспектов {#n50}

- tags: аспекты, свечение

Оставить чёткую тонкую хорду на базовом слое. При выборе планеты добавить мягкий ореол только связанным линиям. Орбис и тип аспекта доступны в подписи, а декоративное свечение помогает проследить связь.

#### Evidence

- [Project fact] SVG вычисляет концы хорд по долготам и использует цвет типа аспекта, а точность влияет на толщину и непрозрачность. — `web/src/components/chart/AspectLines.tsx:25`
- [Project fact] При фокусе AspectLines усиливает линии, связанные с выбранной планетой, и приглушает остальные. — `web/src/components/chart/AspectLines.tsx:67`
- [AI inference] Свечение на выбранных связях добавит глубину при меньшем наложении ореолов в центре колеса.

### Наклон и параллакс на CSS {#n44}

- tags: CSS, параллакс

Слегка наклонять колесо и смещать декоративный фон на другую величину. HTML-обёртка с `perspective` позволит сохранить SVG, но наклон сжимает подписи и усложняет привязку всплывающих подсказок.

#### Evidence

- [Project fact] В проекте есть декоративное звёздное поле, которое не перехватывает события указателя. — `web/src/components/Cosmos.tsx:12`
- [Project fact] Подсказка вычисляет позицию по матрице SVG и границам текущего SVG-элемента. — `web/src/components/chart/ChartTooltip.tsx:25`
- [External fact] CSS Transforms Level 2 определяет перспективу и размещение плоскостей на разной глубине в контексте preserve-3d. — <https://www.w3.org/TR/css-transforms-2/#transform-rendering>
- [AI inference] Ограниченный наклон по явному действию даёт эффект без отдельного 3D-рендерера. Привязку подсказок следует проверить при наклоне и изменении размеров.

### Слои и границы наклона {#n51}

- tags: CSS, слои

Дать фону, ободу и верхнему слою небольшие разные смещения по `Z`. Оставить фильтры и обрезку на визуальных элементах, сохранив общий контейнер сцены пригодным для `preserve-3d`. Сравнить вид и попадание по маркерам в Safari, Chrome и Firefox.

#### Evidence

- [External fact] На элементе с preserve-3d фильтры, opacity ниже 1 и некоторые значения overflow принудительно сводят потомков в плоскость. — <https://www.w3.org/TR/css-transforms-2/#grouping-property-values>
- [Project fact] Компонент Mandala уже совмещает отдельные SVG-кольца и HTML-слой глифов. — `web/src/components/Cosmos.tsx:87`
- [AI inference] Для небольшого наклона можно использовать отдельный декоративный фон. Подсказку и зону нажатия следует проверять относительно видимой позиции маркера.

### Проекция объёмных слоёв в SVG {#n45}

- tags: SVG, проекция

Разместить кольца, маркеры и связи на заданных уровнях глубины, затем проецировать их в SVG при смене ракурса. Ортографический вид убирает зависимость масштаба от глубины и позволяет держать подписи горизонтальными. Порядок перекрытий и разведение подписей придётся рассчитывать вручную.

#### Evidence

- [Project fact] Преобразование долготы и полярных координат уже выделено в независимые от React функции. — `packages/chart-core/src/chartMath.ts:1`
- [Project fact] Разведение маркеров сейчас использует разницу углов и радиальное смещение. — `web/src/components/chart/PlanetMarkers.tsx:26`
- [External fact] При ортографической проекции размер объекта на экране не зависит от расстояния до камеры. — <https://threejs.org/docs/pages/OrthographicCamera.html>
- [AI inference] Для ограниченного набора ракурсов можно оставить SVG и вычислять проекцию только при изменении вида. Для пересекающихся полупрозрачных поверхностей простого порядка SVG-элементов может быть недостаточно.

### Подписи после проекции {#n52}

- tags: подписи, перекрытия

Проецировать точку на кольце, затем разводить видимые глифы и подписи в экранных координатах. Для плотной группы показать выноски и дать приоритет выбранной планете. Привязать подсказку к экранной позиции маркера и обновлять её при движении камеры и изменении размера.

#### Evidence

- [Project fact] PlanetMarkers разводит близкие объекты радиальным смещением и рисует выноску к исходной позиции. — `web/src/components/chart/PlanetMarkers.tsx:45`
- [Project fact] ChartTooltip независимо рассчитывает точку от общего planetRadius, поэтому смещение маркера при разведении в этой формуле отсутствует. — `web/src/components/chart/ChartTooltip.tsx:29`
- [AI inference] Общие экранные координаты для видимого маркера, его области нажатия и подсказки устранят расхождение этих элементов при смене ракурса.

### Объёмное колесо с камерой WebGL {#n46}

- tags: Three.js, WebGL 2, камера

Построить зодиак как кольцо с толщиной, дома как секторы, планеты как небольшие сферы и связи как тонкие светящиеся линии. Камера позволит осмотреть колесо под разными углами. Цена этого варианта — новая зависимость, отдельная обработка выбора объектов и поддержка устройств с WebGL 2.

#### Evidence

- [Project fact] Веб-интерфейс использует React 19. В списке зависимостей нет three и @react-three/fiber. — `web/package.json:13`
- [Project fact] Текущее колесо получает кольцо, дома, линии и маркеры из одного ChartResult. — `web/src/components/chart/NatalChart.tsx:94`
- [External fact] WebGLRenderer в Three.js использует WebGL 2. — <https://threejs.org/docs/pages/WebGLRenderer>
- [External fact] React Three Fiber — рендерер Three.js для React. Документация связывает @react-three/fiber@9 с React 19. — <https://r3f.docs.pmnd.rs/getting-started/introduction>

### Камера и возврат к колесу {#n53}

- tags: камера, касание

Открывать сцену во фронтальном ортографическом ракурсе с ASC слева, если он известен. Добавить ограниченный наклон, масштаб и кнопку «Вид сверху». На телефоне разделить касание для выбора и движение для вращения, чтобы смена ракурса случайно не открывала планету.

#### Evidence

- [Project fact] Преобразование долготы в текущем колесе ставит ASC на позицию 9 часов. — `packages/chart-core/src/chartMath.ts:5`
- [External fact] OrbitControls поддерживает вращение, масштабирование, панорамирование и ограничения орбиты камеры. — <https://threejs.org/docs/pages/OrbitControls.html>
- [AI inference] Знакомый начальный ракурс и явный сброс помогают вернуться к чтению углов после осмотра сцены.

### Контурный свет и локальные ореолы {#n54}

- tags: свет, bloom

Осветить кромку кольца мягким боковым светом и подчеркнуть выбранную планету контуром. Для её связей использовать локальный ореол. Проверить эффект на плотной карте, где сплошное свечение затруднит различение линий.

#### Evidence

- [External fact] UnrealBloomPass позволяет задать силу, радиус и порог яркости свечения. — <https://threejs.org/docs/pages/UnrealBloomPass>
- [External fact] Документация Three.js описывает UnrealBloomPass как более ресурсоёмкий вариант по сравнению с BloomPass. — <https://threejs.org/docs/pages/BloomPass>
- [AI inference] Выборочная подсветка даёт понятную обратную связь. На слабых устройствах достаточно контура и яркого материала без отдельного прохода постобработки.

### Отрисовка по запросу и возврат {#n55}

- tags: производительность, WebGL

Загружать WebGL-сцену при первом выборе 3D и рисовать кадры во время изменения вида, карты или выделения. При ошибке инициализации или потере контекста возвращать SVG с текущим выбором. Измерить время первого открытия, плавность наклона и потребление ресурсов в покое на телефоне.

#### Evidence

- [External fact] React Three Fiber поддерживает frameloop="demand". При прямом изменении камеры кадр можно запросить через invalidate(). — <https://r3f.docs.pmnd.rs/advanced/scaling-performance>
- [External fact] Canvas отправляет webglcontextlost при потере буфера рисования WebGL. — <https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event>
- [AI inference] Откладывание загрузки сцены уменьшит работу при обычном открытии карты. Проверка на целевых телефонах определит допустимый размер сцены и эффектов.

### Небесная сфера с поясом зодиака {#n47}

- tags: сфера, эклиптика

Показать эклиптику как пояс на прозрачной сфере, а положение светил относительно пояса — по эклиптической широте. Этот вид объясняет пространственное положение светил, но требует расширить данные интерфейса и усложняет чтение карты с обратной стороны. Сфера единичного радиуса подходит для показа направлений.

#### Evidence

- [Project fact] Серверная обёртка возвращает longitude, latitude и distance для каждого рассчитанного объекта. — `functions/src/astro/ephemeris.ts:20`
- [Project fact] При сборке ChartPoint передаются долгота, знак, градус и дом, а эклиптическая широта и дистанция остаются на сервере. — `functions/src/astro/chart.ts:55`
- [AI inference] Унитарная сфера позволяет отобразить направление по долготе и широте. Для сохранения понятной связи с колесом каждому светилу можно показать проекцию на пояс эклиптики.
- [Open assumption] Пользователям нужен исследовательский вид, в котором положение светила относительно эклиптики имеет самостоятельную ценность.

### Проекции светил на пояс {#n56}

- tags: широта, эклиптика

Провести от выбранного светила короткую дугу вдоль его эклиптического меридиана до пояса. Она покажет, в какую сторону и насколько светило отстоит от эклиптики. Разместить подпись градуса и концы линий аспектов на поясе, чтобы их можно было сопоставить с плоским колесом.

#### Evidence

- [External fact] Пересечение эклиптической плоскости с небесной сферой образует большой круг. — <https://science.nasa.gov/learn/basics-of-space-flight/chapter2-2/#the-celestial-sphere>
- [Project fact] Положение конечных точек аспектов на текущем колесе определяется эклиптическими долготами. — `web/src/components/chart/AspectLines.tsx:25`
- [AI inference] Если концы аспектов лежат на поясе при той же долготе, их можно сопоставить с текущей картой, даже когда светила подняты над плоскостью или опущены под неё.

### Согласованность плоского и объёмного видов {#n48}

- tags: взаимодействие, данные

Разместить переключатель «2D / 3D» рядом с колесом. Использовать тот же `ChartResult` для обоих представлений и сохранять выбранный объект и фильтры при переключении. Поворот камеры меняет ракурс, а текущая натальная или релокационная карта определяется состоянием профиля.

#### Evidence

- [Project fact] ProfileDetail отдельно получает ChartResult и передаёт chartData в карточку колеса. — `web/src/pages/ProfileDetail.tsx:295`
- [Project fact] Состояния выбора планеты и фильтров сейчас принадлежат компоненту NatalChart. — `web/src/components/chart/NatalChart.tsx:15`
- [AI inference] Общее состояние в компоненте-переключателе позволит сравнивать один и тот же объект в двух видах.

### Доступные режимы движения {#n57}

- tags: доступность, движение

При `prefers-reduced-motion` показывать статичный вид с осознанным переключением между ракурсами. Дать кнопки наклона, масштаба и сброса, доступные касанием и клавиатурой, а также доступный с клавиатуры выбор планет. Оставить градусы и аспекты в HTML-таблицах.

#### Evidence

- [Project fact] В CSS настройка reduced motion уже отключает анимацию звёзд и метеоров. — `web/src/index.css:194`
- [Project fact] Планеты и аспекты выводятся отдельными таблицами из chartData. — `web/src/pages/ProfileDetail.tsx:701`
- [External fact] Медиавыражение prefers-reduced-motion сообщает о системной настройке снижения движения. — <https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion>
- [External fact] WCAG предусматривает альтернативу перетаскиванию одним указателем, когда перетаскивание несущественно, и отдельно описывает управление с клавиатуры. — <https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements>
- [External fact] Критерий 2.1.1 описывает управление функциями через клавиатуру. — <https://www.w3.org/WAI/WCAG22/Understanding/keyboard>

### Порядок проверки вариантов {#n49}

- tags: прототип, выбор

Начать с рельефного SVG и проверить, читаются ли градусы, дома и связи на небольшом экране. Затем попробовать один управляемый наклон. Если смена ракурса помогает исследовать карту, сравнить SVG-проекцию с WebGL на тех же картах и устройствах.

#### Evidence

- [Project fact] Колесо уже занимает отдельную адаптивную карточку во вкладке карты. — `web/src/pages/ProfileDetail.tsx:602`
- [AI inference] Прототип на текущем SVG позволит проверить эффект глубины до подключения библиотеки или расширения API.
- [Open assumption] Потребность в свободном вращении и производительность вариантов на целевых телефонах ещё предстоит проверить.

### Проверки читаемости и совпадения видов {#n58}

- tags: проверка, читаемость

Сравнить один и тот же `ChartResult` в фас и при наклоне. Взять карту со скоплением планет у стыка 0°/360°, плотную сетку аспектов, неизвестное время и релокационный вариант. Проверить, что подписи и области нажатия совпадают, отсутствующие ASC и MC не появляются, а выбор и фильтры сохраняются между режимами.

#### Evidence

- [Project fact] Сервер обнуляет ASC и MC при неизвестном времени, а при известном может включить их в список аспектов. — `functions/src/astro/chart.ts:82`
- [Project fact] SVG-линии сейчас пропускают аспекты, для которых одна из сторон отсутствует в chart.points, тогда как таблица использует список аспектов целиком. — `web/src/components/chart/AspectLines.tsx:25`
- [Project fact] Таблица сортирует и выводит все переданные аспекты. — `web/src/components/chart/AspectsTable.tsx:15`
- [AI inference] Набор проверок выявит расхождения между визуальными режимами и покажет, где при наклоне теряется читаемость.

### Поисковые запросы по 3D-эффектам {#n59}

- tags: поиск

- `MDN CSS perspective transform-style preserve-3d SVG radialGradient prefers-reduced-motion`
- `Three.js OrthographicCamera OrbitControls CSS2DRenderer WebGLRenderer documentation`
- `React Three Fiber scaling performance frameloop demand dpr documentation`
- `W3C WCAG dragging movements keyboard animation interactions canvas accessibility`
- `NASA JPL celestial sphere ecliptic latitude longitude spherical coordinates`
- `Three.js UnrealBloomPass selective bloom transparency manual`
