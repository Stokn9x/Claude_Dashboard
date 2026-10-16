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
| 0.7.3 | Kontoret fylder vinduet i både bredde og højde, er skarpt på alle skærme, og listen står ved siden af |
| 0.7.4 | Hjælpere, der fejler eller stoppes, går hjem; serveren startes igen efter dvale; serveren er gjort mere robust |
| 0.7.5 | Ventende hjælpere får et skrivebord, ingen hænger fast efter en genindlæsning, tavle med dagens tal og vægur |
| 0.7.6 | Klik på en figur for at se detaljer om den |
| 0.7.7 | Hyggeligere kontor: tæpper, reol, sofahjørne og bordtennis i teamrummet, bistrobord og snackautomat i køkkenet, lænestol hos Claude, egne ting på hver hjælpers skrivebord |
| 0.7.8 | Lys og dybde: skygger under figurerne, sollys fra vinduerne efter tidspunktet, mørke aftener med lamper og lysende skærme |
| 0.7.9 | Mere levende figurer: lidt større, blinker, ånder, og en tænkeboble med … i stedet for "Tænker" |
| 0.8.0 | Spillets fase 0: grundplanen som data, ruter med A\*, kamera med træk, zoom og minikort, gåture med fast varighed, kroner tjent ved arbejdet og vist på siden |
| 0.9.0 | Spillets fase 1: køb skriveborde for kroner i butikken eller ved at klikke på skiltet; hjælpere uden skrivebord sidder på gulvet med en laptop og brokker sig |
| 0.10.0 | Spillets fase 2: køb køkken, toilet, sofahjørne, bordtennisbord og mødelokale; ledige grunde med skilte, byggeri med stillads og konfetti; toilet og mødelokale er nye rum under projektrummet |
| 0.11.0 | Spillets fase 3: kaffepauser, toiletbesøg, bordtennis og møder hos Claude; drama og banter i køkkenet ud fra dagens rigtige tal; trivsel der ganger indtjeningen; projektrummet er blevet et stillerum med fire skriveborde mere; CLAUDE.md |
| 0.11.1 | Fejlrettelser: ingen går gennem væggene (døre forbinder rummene i rutegitteret, og der er fri vej ud af Claudes kontor), nyt toilet med døren ud til et frit område, ingen fliser i væggene; langsommere indtjening og højere priser, så kontoret bygges over uger |

## 🔧 Fejl og ting der driller

| # | Hvad | Str. | Status |
|---|---|---|---|
| 1 | **Baggrunds-subagenter går for tidligt.** De bliver nu, til subagenten selv stopper (`SubagentStop`). | M | ✅ |
| 2 | **Hånden bliver oppe efter godkendelse.** "Venter på dig" fjernes ved næste skridt og ved afvisning, men der kommer stadig ingen hændelse lige når du klikker "Tillad". | S | 🟡 |
| 3 | **Venter en subagent på godkendelse, ser det måske ud som om Claude venter.** Koden bruger `agent_id` fra godkendelses-hændelsen, men det er ikke set med en rigtig subagent. | S | ⬜ |
| 4 | **Hjælper nr. 7 og videre** venter ved døren og tager det første skrivebord, der bliver ledigt. | S | ✅ |
| 5 | **Genindlæses mod'en midt i en gåtur,** regnes turen nu ud fra hvornår den begyndte, så ingen hænger fast. | S | ✅ |
| 6 | **Tegningen blinkede og hakkede ved hver ændring.** Løst ved at flytte tegningen til browseren. | M | ✅ |
| 7 | **Kontorets bredde var et skøn** i panelet. Siden skalerer nu selv. | S | ➖ |
| 36 | **Hjælpere, der fejler eller bliver stoppet, bliver siddende for evigt.** De går nu hjem, når Claudes liste over agenter siger, at de er stoppet, eller ikke længere har dem. | S | ✅ |
| 37 | **Kontoret mister forbindelsen efter dvale.** Når kontoret er åbnet, starter mod'en serveren igen inden for et minut, og siden forbinder selv igen. | S | ✅ |
| 38 | **Serveren:** fil-overvågningen kan ikke længere vælte den, faner med tabt forbindelse ryddes op, og statusfiler fra afsluttede sessioner slettes. | S | ✅ |
| 8 | **Ruterne går ind over skrivebordskanter,** og to der går, kan overlappe hinanden. | M | ⬜ |

## ✅ Det skal være på plads

| # | Hvad | Str. | Status |
|---|---|---|---|
| 9 | **Afprøv med rigtige subagenter.** | S | ✅ |
| 10 | **Alle dine sessioner i ét kontor.** Nu med faner på siden. | M | ✅ |
| 11 | **Klik på en figur for detaljer:** et kort med opgaven, hvad den laver nu, hvor længe den har været i gang, antal værktøjer, linjer og de seneste skridt. Klik på en anden session i projektrummet skifter til den. | M | ✅ |
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
| 19 | **Liv i pauserne:** hjælperne holder kaffepause, går på toilettet, spiller bordtennis og holder møde med Claude. Mangler: Claude der vander planter og går rundt. | L | 🟡 |
| 20 | **Grænser som rekvisitter:** kaffekanden tømmes, efterhånden som 5-timers-grænsen bruges, og en plante visner, når konteksten fyldes. | M | ⬜ |
| 21 | **Tavle og ur på væggen:** tavlen viser dagens linjer og pris, uret det rigtige klokkeslæt. | S | ✅ |
| 22 | **Dag, nat og vejr:** Lyset følger nu tidspunktet (se punkt 41); mangler regn på ruderne og vejr. | M | 🟡 |
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
| 35 | **Et større kontor:** fundamentet er klar: rum er data, ruter findes med A\*, og kameraet kan zoome og flytte. Mangler selve de nye rum (spillets fase 2 og 5). | M | 🟡 |
| 39 | **Liv i teamrummet og køkkenet:** tæpper under skrivebordene, reol, sofahjørne med lampe, bordtennisbord, bistrobord, snackautomat, damp fra kaffemaskinen i pausen. | M | ✅ |
| 40 | **Egne ting på skrivebordet:** hver hjælper har altid de samme to ting (kop, plante, papirer, badeand, høretelefoner, billede eller snack). | S | ✅ |
| 41 | **Lys og dybde:** skygger under figurer og stole, sollys fra vinduerne der følger solen, aftenmørke med lamper, loftslys og lysende skærme. Se en anden tid med `?tid=21:30` i adressen. | M | ✅ |
| 42 | **Projektrummet står tit tomt:** bliv til mødelokale eller skrump, når der ikke er andre sessioner. | M | ⬜ |
| 43 | **Mere levende figurer:** lidt større, blinker hver på sit tidspunkt, ånder når de sidder, og en tænkeboble med … i stedet for "Tænker". | M | ✅ |
| 34 | **Del kontoret med teamet igen,** fx via Supabase, nu hvor tegningen ikke længere ligger i panelet. | L | ⬜ |

## 🎨 Siden rundt om kontoret

| # | Hvad | Str. | Status |
|---|---|---|---|
| 46 | **En lækrere side rundt om kontoret.** I dag er det en rå overskrift og en tekstliste på mørk baggrund. Idéer: en topbjælke med navn, saldo som et rigtigt mærke og forbindelsesstatus som en lille prik; listen over hvem der laver hvad som kort med pixel-portræt, navn, opgave og en farvet statuspille; en ramme om kontoret, der passer til pixel-stilen; en pænere tom tilstand, når ingen sessioner kører; bedre lyst og mørkt tema; og de knapper, spillet får brug for (butik, vis hele). | M | ⬜ |

## 🎮 Spillet

| # | Hvad | Str. | Status |
|---|---|---|---|
| 44 | **Tjen kroner, køb kontoret:** pladser, rum, pynt, gulvsiddere der brokker sig, trivsel, og et kontor der kan blive markant større. Hele planen står i [SPIL.md](SPIL.md). | L+ | 🟡 |
| 45 | **Drama og banter:** hjælperne driller, konkurrerer og brokker sig i små replikskifter, når de står i kantinen, ud fra dagens rigtige hændelser. Se SPIL.md, fase 3. | M | ✅ |

## 🧹 Oprydning

| # | Hvad | Str. | Status |
|---|---|---|---|
| 27 | **Supabase:** slet tabellerne `offices`, `office_members` og `agent_status`, de gamle funktioner og de ubrugte brugere. Kræver dit OK. | S | ⬜ |
| 28 | **Omdøb repo'et** `Claude_Dashboard` til `agent-kontor` og ret README'ens kommandoer. | S | ⬜ |
| 29 | **Team Chat:** mailskabeloner og SMTP er ikke længere nødvendige, og `supabase/`-mappen på skrivebordet kan ryddes op. | S | ⬜ |
