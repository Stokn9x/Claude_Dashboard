# Udvidelser til Agent-kontor

Alt det, vi har lavet, og det, der kan laves. Størrelserne er grove: **S** er under en time, **M** er nogle timer, **L** er en større omgang.

Status: ✅ lavet · 🟡 delvist · ⬜ ikke lavet · ➖ ikke længere relevant

## Det er lavet

| Version | Hvad |
|---|---|
| 0.3 | Kontoret set ovenfra med seks skriveborde, gang med skridt i alle fire retninger |
| 0.4 | Rigtige subagenter; baggrunds-subagenter bliver siddende, til de er færdige |
| 0.5 | Alle dine sessioner i samme kontor via statusfiler i `~/.claude/agent-kontor/sessions/` |
| 0.6 | Fejringer (konfetti, regnsky, balloner) og dialog (Claude siger tak, småsnak i køkkenet) |
| 0.7.0 | Kontoret tegnes i browseren af en lokal Node-server, i 60 billeder i sekundet uden hak, med en fane for hver session |
| 0.7.2 | Knappen "🏢 Åbn kontor" over chatboksen starter serveren og åbner kontoret i din browser |

## 🔧 Fejl og ting der driller

| # | Hvad | Str. | Status |
|---|---|---|---|
| 1 | **Baggrunds-subagenter går for tidligt.** De bliver nu, til subagenten selv stopper (`SubagentStop`). | M | ✅ |
| 2 | **Hånden bliver oppe efter godkendelse.** "Venter på dig" fjernes ved næste skridt og ved afvisning, men der kommer stadig ingen hændelse lige når du klikker "Tillad". | S | 🟡 |
| 3 | **Venter en subagent på godkendelse, ser det måske ud som om Claude venter.** Koden bruger `agent_id` fra godkendelses-hændelsen, men det er ikke set med en rigtig subagent. | S | ⬜ |
| 4 | **Hjælper nr. 7 og videre kommer aldrig ind.** De står ved døren og tager ikke et skrivebord, når et bliver ledigt. | S | ⬜ |
| 5 | **Genindlæses mod'en midt i en gåtur, går tidtagningen tabt,** og figuren kan hænge fast i "afleverer". Forløb, der er udløbet, bør ryddes op ved start. | S | ⬜ |
| 6 | **Tegningen blinkede og hakkede ved hver ændring.** Løst ved at flytte tegningen til browseren. | M | ✅ |
| 7 | **Kontorets bredde var et skøn** i panelet. Siden skalerer nu selv. | S | ➖ |
| 8 | **Ruterne går ind over skrivebordskanter,** og to der går, kan overlappe hinanden. | M | ⬜ |

## ✅ Det skal være på plads

| # | Hvad | Str. | Status |
|---|---|---|---|
| 9 | **Afprøv med rigtige subagenter.** | S | ✅ |
| 10 | **Alle dine sessioner i ét kontor.** Nu med faner på siden. | M | ✅ |
| 11 | **Klik på en figur for detaljer:** tid, værktøjer, linjer og hvad den sidst lavede. På canvas kan det nu laves som et lille kort ved figuren. | M | ⬜ |
| 12 | **Aktivitetslog** under kontoret, fx "10:42 Freja læste api.ts", "10:43 Oskar afleverede". | S | ⬜ |
| 13 | **Indstillinger:** lyd til/fra, gå-tempo, om knappen over chatboksen skal vises. | S | ⬜ |
| 14 | **README med GIF** af kontoret i gang. | S | ⬜ |

## 🚀 Fede udvidelser

| # | Hvad | Str. | Status |
|---|---|---|---|
| 15 | **Fejringer:** konfetti ved grønne tests, regnsky ved røde, balloner ved commit og PR. | M | ✅ |
| 16 | **Lyde:** dørklokke når en hjælper kommer, "ding" ved afleveringen, et blidt signal når Claude venter på dig. Nemt nu, hvor siden kører i browseren. | M | ⬜ |
| 17 | **Dialog mellem agenterne:** Claude siger tak ved navn, småsnak i køkkenet. | S | ✅ |
| 18 | **Udseende efter type:** Explore får forstørrelsesglas, Plan en tegnerulle. Modellen som farve på navneskiltet (Opus, Sonnet, Haiku). | M | ⬜ |
| 19 | **Liv i pauserne:** Claude går rundt, vander planter og spiller bordtennis med hjælperne. | L | ⬜ |
| 20 | **Grænser som rekvisitter:** kaffekanden tømmes, efterhånden som 5-timers-grænsen bruges, og en plante visner, når konteksten fyldes. | M | ⬜ |
| 21 | **Tavle og ur på væggen:** tavlen viser dagens linjer og pris, uret det rigtige klokkeslæt. | S | ⬜ |
| 22 | **Dag, nat og vejr:** Vinduerne skifter allerede farve efter tidspunktet; mangler mørkere lys om aftenen, tændte lamper og regn på ruderne. | M | 🟡 |
| 23 | **Kontorhund eller -kat,** der vandrer rundt og lægger sig under et skrivebord. | M | ⬜ |
| 24 | **Timelapse af dagen:** afspil sessionens forløb i 60× fart. Serveren kan gemme forløbet. | L | ⬜ |
| 25 | **Indret selv:** vælg tema og flyt rundt på møblerne. | L | ⬜ |
| 26 | **Team Chat i kontoret:** et opslag på væggen, når der kommer en chatbesked. | S | ⬜ |

## 🖥️ Nye muligheder med serveren

| # | Hvad | Str. | Status |
|---|---|---|---|
| 30 | **Notifikation i browseren,** når Claude venter på dig, også når fanen ikke er i fokus. | S | ⬜ |
| 31 | **Fuldskærm og "tv-tilstand"** til en ekstra skærm: større figurer, ingen liste. | S | ⬜ |
| 32 | **Dagsstatistik på siden:** linjer, pris og antal hjælpere i dag og i ugen, gemt af serveren. | M | ⬜ |
| 33 | **Flere kontorer:** ét rum pr. projekt, man kan gå mellem, i stedet for faner. | L | ⬜ |
| 34 | **Del kontoret med teamet igen,** fx via Supabase, nu hvor tegningen ikke længere ligger i panelet. | L | ⬜ |

## 🧹 Oprydning

| # | Hvad | Str. | Status |
|---|---|---|---|
| 27 | **Supabase:** slet tabellerne `offices`, `office_members` og `agent_status`, de gamle funktioner og de ubrugte brugere. Kræver dit OK. | S | ⬜ |
| 28 | **Omdøb repo'et** `Claude_Dashboard` til `agent-kontor` og ret README'ens kommandoer. | S | ⬜ |
| 29 | **Team Chat:** mailskabeloner og SMTP er ikke længere nødvendige, og `supabase/`-mappen på skrivebordet kan ryddes op. | S | ⬜ |
