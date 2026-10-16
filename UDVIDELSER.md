# Udvidelser til Agent-kontor

Alt det, vi har lavet, og det, der kan laves. Størrelserne er grove: **S** er under en time, **M** er nogle timer, **L** er en større omgang.

Status: ✅ lavet · 🟡 delvist · ⬜ ikke lavet · ⏸️ parkeret · ➖ ikke længere relevant

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
| 0.12.0 | En lækrere side rundt om kontoret: topbjælke med ikon, trivsel, saldo og forbindelsesprik; kort med pixel-portræt og statuspille i listen; venteboks med "Gå til"; butik med ikoner og fremdrift; kun mørkt tema |
| 0.13.0 | Spillets fase 4: pynt og opgraderinger i butikken, 17 præstationer med belønning og notifikation, statistik i den nye fane Fremskridt |
| 0.25.1 | To, der går samme stykke vej samtidig, går side om side i stedet for gennem hinanden. Afprøvet: ingen gåtur krydser et købt skrivebord, og en subagent, der beder om lov, er den, der rækker hånden op, ikke Claude |
| 0.25.0 | Månedens medarbejder: hjælpernes navne går igen, så serveren fører en tavle pr. navn og måned (opgaver, dem der gik i stå, linjer). Fremskridt viser sidste måneds medarbejder med pokal og månedens stilling med medaljer, og den, der fører måneden, har en ⭐ på navneskiltet. Ved skrivebordene står hjælperens navn nu i taleboblen, fordi rækken bagved dækker navneskiltet |
| 0.24.0 | Sæson og vejr, uden at noget forlader computeren: vejret skifter hver tredje time ud fra uret (klart, overskyet, regn og om vinteren sne, oftest regn om efteråret) og glider ind og ud. Regn falder i streger og løber på ruderne, sne driver ned og bliver liggende en tid på græsset, grundene, hækken og væggene, og søen fryser til. Løvtræerne er grønne om sommeren, blomstrer om foråret, bliver orange og gule om efteråret og står nøgne om vinteren. I december står der et juletræ i receptionen, og der hænger lyskæder i gangen. Se et andet vejr med `?vejr=regn` (eller `sne`, `skyet`, `klart`) og en anden måned med `?maaned=12` |
| 0.23.1 | Småting: en hjælper med fri på plænen går hjem ad stien uden først at gå op til hoveddøren; skriveborde, der ikke er købt, står ikke længere i vejen for en gåtur; ekstra pladser ved bænken og på plænen står aldrig i træerne; ni hjælpere kan aflevere side om side; depotet mod nord har rækkens tykke ydervæg; Claude vander planten lidt højere oppe, så navnet ikke ligger oven i skiltet ved døren |
| 0.23.0 | Tv-tilstand (📺 eller T): fuld skærm uden panel, log og kort, og kameraet følger den, der venter på dig, en hjælper på vej ind eller med et resultat, og ellers dem, der arbejder, på skift; flytter man selv kameraet, venter det lidt. Hjælpernes type og model kan ses: Explore har et forstørrelsesglas på skrivebordet, Plan en tegningsrulle, navneskiltet har modellens farve (Opus lilla, Sonnet blå, Haiku grøn, Fable gylden), og kortet siger fx "Udforsker på Haiku" |
| 0.22.0 | Dagens opsummering: serveren husker hver opgave, hjælperne afleverer eller går i stå (en uge tilbage), og fanen Fremskridt viser dagens opgaver med tid, navn og projekt. **📋 Kopiér** giver dagen som tekst til et standup eller en note: linjer, opgaver, commits, pull requests, tests og hver opgave |
| 0.21.0 | Liv i kontoret: en kontorkat i butikken (3.500 kr, +4 trivsel), der vandrer mellem lænestolen hos Claude, receptionen, sin madskål i køkkenet, loungens sofa og plænen; den sover krøllet sammen med et "z", spiser og siger "Miav". Claude holder pause på flere måder: kaffe i køkkenet, vander planterne på sit kontor eller kalder på katten og klapper den. Koden er delt op: mod'en i seks filer, og siden har fået `rooms.js`, `sales.js`, `party.js` og `cat.js`. Alle tekstfiler har LF-linjeskift |
| 0.20.1 | Robusthed: et spil.json, der bare er låst et øjeblik (antivirus, OneDrive), prøves igen i nogle sekunder og skrives aldrig over med en ældre kopi; en ekstra server, der starter samtidig, rører ingen filer, før porten er dens; dagens kopi af spillet laves én gang om dagen og overskrives ikke ved en genstart; serveren gemmer, før den lukker; stribe og dage følger kalenderen, også når der skiftes til og fra sommertid; et gammelt lounge-id rettes ved hver start; kun et navn kan købes; og står der `cd …` først i en kommando, vises kommandoen efter den |
| 0.20.0 | Kontoret kan læses ved normal zoom: navne, talebobler og prisskilte er altid mindst 11-12 pixel høje, ned til hele kontoret i billedet, og skrumper først med kontoret, når man zoomer længere ud. Byggegrundene har fået et skilt med ikon, navn, pris og enten "Klik for at bygge" eller hvor meget der mangler, med en bjælke, og grunden er pælet ud med reb. Hvert rum har et skilt med ikon og navn på gangen ved sin dør. Gangen har fået stenfliser langs væggene, et langt tæppe under begge vognbaner, loftslamper og planter. Tæpperne under skrivebordene købes nu i butikken (Tæpper, 800 kr, +3 trivsel), ligesom planterne. Køkkenets ur hænger på bagvæggen |
| 0.19.2 | Pengene tælles rigtigt: en statusfil, der læses for sent, betaler ikke igen; en session, der genoptages efter mere end en uge, betales ikke forfra; en subagent sendt i baggrunden (Ctrl+B) og agenter, som motorens liste ikke kender (fx workflow-agenter), afleveres én gang, når de er færdige; et testord i en commit-besked gør den ikke til en testkørsel, og `npm test && git commit` tæller begge dele; delvise commits og `--amend` tæller ikke linjer dobbelt, og `git -C`, `Set-Location` og en `cd` midt i kommandoen læser det rigtige repo. Desuden: kontoret går ikke længere i stå og viser kun græs, hvis et enkelt billede fejler (fx åbnet i et vindue uden størrelse), og fanerne øverst står i fast rækkefølge i stedet for at bytte plads |
| 0.19.1 | Ingen figurer springer længere: et faseskift, der kommer lidt for sent, begynder, når siden ser det; hvem der skal til pause eller møde, ligger fast fra starten; ingen pause lige omkring et møde; hjælpere med fri tager ikke en plads, en pause bruger; og skal en figur alligevel pludselig et andet sted hen (fx Claude fra mødet til skrivebordet), går den derhen ad gangen. Længere ture i det store hus går i almindeligt tempo |
| 0.19.0 | Den nye grundplan: en bred hovedgang med alle rum på hver sin side, Claude midt i huset over receptionen, have mellem huset og vejen. Teamrum, køkken, lounge og toilet starter små og vokser i trin (teamrummene mod vest, loungen og toilettet mod øst, køkkenet og loungen ind i et depot); 22 skriveborde i alt. Hjælperne går rum for rum: ud ad døren, i højre side af gangen og ind ad den næste dør, lige gennem dørene og i lige linjer inde i rummene, i samme tempo overalt. Bordtennisbordet står i loungen. Gemte spil flyttes over uden at miste noget |
| 0.18.0 | Fase 5: teamrum 2 med seks skriveborde mere, en lounge med pool, bar, spillekonsol, dart, arkademaskine, jukebox, guitar og sofa, hvor hjælperne med fri slapper af, og en større reception foran hoveddøren, som står tom til den bliver indrettet, og hvor Bodil byder velkommen; vores egne tooltips i stedet for browserens; mødelokalets skærm hang under døren og er flyttet |
| 0.17.0 | Lyd (slås fra med 🔊), en browser-besked når nogen venter på dig og fanen er skjult (🔔), og titlen på fanen siger det; saldo, trivsel og stribe i `/kontor panel`; linjer lavet med scripts tæller ved commit |
| 0.16.1 | En server fra før 0.13.1 kender ikke `/api/quit` og blev ved med at køre efter en opdatering, så man så den gamle side; nu stopper mod'en den ud fra porten, men kun hvis det er kontorets egen `server.mjs` |
| 0.16.0 | Færdige hjælpere bliver og holder fri i nogle minutter (bordtennis, kaffe, sofaen eller en snak på græsset), går tilbage til arbejdet, hvis Claude tager fat i dem igen, og går ellers hjem; hver hjælper har et temperament, der farver replikkerne; daglig bonus og stribe; nyt kontor starter uden skriveborde; gulvsiddere beholder deres plads, og dem uden plads venter på bænken; `node --test` tæller som tests; planten foran døren er flyttet |
| 0.15.0 | Hjælperne kommer op ad stien og går ned ad den og hen ad fortovet, når de går hjem; aktivitetslog nederst; kameraet styres også med tastaturet (pile/WASD, + og −, 0); serveren gemmer en kopi af spil.json hver dag (en uge tilbage) og redder et ødelagt spil.json fra den nyeste; 28 nye tests af sidens logik og serveren; planerne er nu i ét plan, uden etager |
| 0.14.0 | Kontoret fylder hele vinduet: græs, træer, en sø, sti fra hoveddøren, hæk, fortov og en vej med biler og gadelygter rundt om; panelet svæver i venstre side og kan foldes sammen (på en telefon ligger det i bunden). Siden er delt op i små moduler i stedet for én fil på 2.800 linjer |
| 0.13.1 | Fejl 47-51: en ældre server afløses efter en opdatering, en gulvsidder går hen til sit nye skrivebord, Claude tager imod afleveringer ved skrivebordet, skilte ligger under taleboblerne, og trivslen siger hvor gulvsidderne er |

## 🔧 Fejl og ting der driller

| # | Hvad | Str. | Status |
|---|---|---|---|
| 1 | **Baggrunds-subagenter går for tidligt.** De bliver nu, til subagenten selv stopper (`SubagentStop`). | M | ✅ |
| 2 | **Hånden bliver oppe efter godkendelse.** Kan ikke gøres bedre: motoren giver ingen hændelse, når du trykker "Tillad" (hooks kører, før dialogen vises, og selve kørslen ligger i samme kald som dialogen). Hånden går ned ved næste skridt, ved en afvisning, og når værktøjet er færdigt; et langt `npm test` efter "Tillad" holder den altså oppe, til det er kørt. Undersøgt 16.10.2026. | S | ➖ |
| 3 | **Venter en subagent på godkendelse, ser det måske ud som om Claude venter.** Koden bruger `agent_id` fra godkendelses-hændelsen, og motorens typer siger, at den er der, når hændelsen kommer fra en subagent. Afprøvet med en test i 0.25.1. | S | ✅ |
| 4 | **Hjælper nr. 7 og videre** venter ved døren og tager det første skrivebord, der bliver ledigt. | S | ✅ |
| 5 | **Genindlæses mod'en midt i en gåtur,** regnes turen nu ud fra hvornår den begyndte, så ingen hænger fast. | S | ✅ |
| 6 | **Tegningen blinkede og hakkede ved hver ændring.** Løst ved at flytte tegningen til browseren. | M | ✅ |
| 7 | **Kontorets bredde var et skøn** i panelet. Siden skalerer nu selv. | S | ➖ |
| 36 | **Hjælpere, der fejler eller bliver stoppet, bliver siddende for evigt.** De går nu hjem, når Claudes liste over agenter siger, at de er stoppet, eller ikke længere har dem. | S | ✅ |
| 37 | **Kontoret mister forbindelsen efter dvale.** Når kontoret er åbnet, starter mod'en serveren igen inden for et minut, og siden forbinder selv igen. | S | ✅ |
| 38 | **Serveren:** fil-overvågningen kan ikke længere vælte den, faner med tabt forbindelse ryddes op, og statusfiler fra afsluttede sessioner slettes. | S | ✅ |
| 8 | **Ruterne går ind over skrivebordskanter,** og to der går, kan overlappe hinanden. Rutegitteret holder alle gåture fri af skrivebordene (målt i 0.25.1: ingen krydser et købt skrivebord), og to på samme stykke vej samtidig går nu side om side. | M | ✅ |

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
| 18 | **Udseende efter type:** Explore får forstørrelsesglas, Plan en tegnerulle. Modellen som farve på navneskiltet (Opus, Sonnet, Haiku). Lavet i 0.23.0. | M | ✅ |
| 19 | **Liv i pauserne:** hjælperne holder kaffepause, går på toilettet, spiller bordtennis og holder møde med Claude. Mangler: Claude der vander planter og går rundt. | L | 🟡 |
| 20 | **Grænser som rekvisitter:** kaffekanden tømmes, efterhånden som 5-timers-grænsen bruges, og en plante visner, når konteksten fyldes. | M | ⬜ |
| 21 | **Tavle og ur på væggen:** tavlen viser dagens linjer og pris, uret det rigtige klokkeslæt. | S | ✅ |
| 22 | **Dag, nat og vejr:** Lyset følger tidspunktet (punkt 41), og vejret kom i 0.24.0 (punkt 63). | M | ✅ |
| 23 | **Kontorhund eller -kat,** der vandrer rundt og lægger sig under et skrivebord. | M | ⬜ |
| 24 | **Timelapse af dagen:** afspil sessionens forløb i 60× fart. Serveren kan gemme forløbet. | L | ⬜ |
| 25 | **Indret selv:** vælg tema og flyt rundt på møblerne. | L | ⬜ |
| 26 | **Team Chat i kontoret:** et opslag på væggen, når der kommer en chatbesked. | S | ⬜ |

## 🖥️ Nye muligheder med serveren

| # | Hvad | Str. | Status |
|---|---|---|---|
| 30 | **Notifikation i browseren,** når Claude venter på dig, også når fanen ikke er i fokus. | S | ⬜ |
| 31 | **Fuldskærm og "tv-tilstand"** til en ekstra skærm: større figurer, ingen liste. Lavet i 0.23.0 (se 67). | S | ✅ |
| 32 | **Dagsstatistik på siden:** linjer, pris og antal hjælpere i dag og i ugen, gemt af serveren. | M | ⬜ |
| 33 | **Flere kontorer:** ét rum pr. projekt, man kan gå mellem, i stedet for faner. | L | ⬜ |
| 35 | **Et større kontor:** fundamentet er klar: rum er data, ruter findes med A\*, og kameraet kan zoome og flytte. Mangler selve de nye rum (spillets fase 2 og 5). | M | 🟡 |
| 39 | **Liv i teamrummet og køkkenet:** tæpper under skrivebordene, reol, sofahjørne med lampe, bordtennisbord, bistrobord, snackautomat, damp fra kaffemaskinen i pausen. | M | ✅ |
| 40 | **Egne ting på skrivebordet:** hver hjælper har altid de samme to ting (kop, plante, papirer, badeand, høretelefoner, billede eller snack). | S | ✅ |
| 41 | **Lys og dybde:** skygger under figurer og stole, sollys fra vinduerne der følger solen, aftenmørke med lamper, loftslys og lysende skærme. Se en anden tid med `?tid=21:30` i adressen. | M | ✅ |
| 42 | **Projektrummet stod tit tomt:** det er blevet et stillerum med fire skriveborde mere; andre sessioner nås med fanerne. | M | ✅ |
| 43 | **Mere levende figurer:** lidt større, blinker hver på sit tidspunkt, ånder når de sidder, og en tænkeboble med … i stedet for "Tænker". | M | ✅ |
| 34 | **Del kontoret med teamet igen,** fx via Supabase, nu hvor tegningen ikke længere ligger i panelet. | L | ⬜ |

## 🎨 Siden rundt om kontoret

| # | Hvad | Str. | Status |
|---|---|---|---|
| 46 | **En lækrere side rundt om kontoret:** topbjælke med ikon, faner, trivsel, saldo og en forbindelsesprik; listen som kort med pixel-portræt, statuspille og opgave, dem der venter øverst; venteboks med "Gå til"; butik med ikoner og en bjælke mod prisen; en pæn tom tilstand; kun mørkt tema. | M | ✅ |

## 🎮 Spillet

| # | Hvad | Str. | Status |
|---|---|---|---|
| 44 | **Tjen kroner, køb kontoret:** pladser, rum, pynt, gulvsiddere der brokker sig, trivsel, og et kontor der kan blive markant større. Hele planen står i [SPIL.md](SPIL.md). | L+ | 🟡 |
| 45 | **Drama og banter:** hjælperne driller, konkurrerer og brokker sig i små replikskifter, når de står i kantinen, ud fra dagens rigtige hændelser. Se SPIL.md, fase 3. | M | ✅ |

## 🔎 Scope-runde 16.10.2026 (efter fase 4)

Fundet ved en gennemgang af koden og det, vi har set undervejs. **P1** er fejl, der ses i daglig brug, **P2** er mangler, **P3** er udvidelser. Mit forslag til rækkefølge står nederst.

### Fejl (P1)

| # | Hvad | Str. | Status |
|---|---|---|---|
| 47 | **En gammel server bliver ved med at køre efter en opdatering.** Mod'en ser, at der svarer en server, men ikke at den er en ældre version, så ny serverkode først kommer i brug, når den gamle lukker. Mod'en bør sammenligne `/health`-versionen med sin egen og bede den gamle lukke (et beskyttet `/api/quit`). | S | ✅ |
| 48 | **En gulvsidder teleporterer til sit nye skrivebord**, når det bliver købt, i stedet for at rejse sig og gå derhen. | S | ✅ |
| 49 | **Aflevering til en tom stol:** holder Claude pause i køkkenet, afleverer hjælperen alligevel ved skrivebordet og siger "Tak" til ingen. Den bør gå til køkkenet, eller Claude bør gå tilbage. | S | ✅ |
| 50 | **Skilte og bobler overlapper:** prisskiltet over en ledig plads tegnes oven i gulvsiddernes og ventendes bobler. | S | ✅ |
| 51 | **Trivslen og kontoret kan være uenige:** serveren tæller gulvsiddere i den session, der har flest, mens siden viser den valgte session. Med to sessioner kan trivslen falde uden at nogen ses på gulvet. | S | ✅ |

### Mangler (P2)

| # | Hvad | Str. | Status |
|---|---|---|---|
| 52 | **Brede skærme udnyttes ikke:** kontoret er bundet af højden, og panelet er smalt, så der er tomt på begge sider (set på 2000 px). Løst i 0.14.0: kontoret fylder hele vinduet med græs omkring, og panelet svæver ovenpå. | M | ✅ |
| 53 | **Ingen backup af spil.json.** Én dårlig skrivning eller fejl kan koste alle kroner. Serveren bør gemme en daglig kopi (de sidste 7). Lavet i 0.15.0, og et ødelagt spil.json redder sig selv fra den nyeste kopi. | S | ✅ |
| 54 | **`/kontor panel` i Claude kender ikke spillet:** ingen saldo, trivsel eller præstationer i tekstpanelet. Lavet i 0.17.0: saldo, trivsel, stribe og præstationer står øverst i panelet, når kontoret er åbent. | S | ✅ |
| 55 | **Siden har ingen automatiske tests.** Ruterne tjekkes kun med `kontorCheckRoutes()` i hånden; et lille script, der kører siden uden browser (eller i preview), ville fange fx akvariet, der lukkede døren. Lavet i 0.15.0: `tests/page.test.mjs` kører plan, ruter, pauser, træer og loggen i Node; `tests/server.test.mjs` tester filer, adgang og backup. Selve tegningen testes stadig kun i preview. | M | 🟡 |
| 56 | **Statistikken starter først nu** (0.13.0); dagene før findes ikke. Intet at gøre ved det, men værd at vide. | – | ➖ |
| 57 | **Ingen lyd** (punkt 16): dørklokke, aflevering, venter på dig, med en knap til at slå fra. Lavet i 0.17.0: små melodier lavet med Web Audio, og 🔊 i topbjælken slår dem fra. | M | ✅ |
| 58 | **Ingen browser-notifikation**, når Claude venter på dig og fanen er skjult (punkt 30). Lavet i 0.17.0: 🔔 i topbjælken; fanens titel siger det altid. | S | ✅ |

### Udvidelser (P3)

| # | Hvad | Str. | Status |
|---|---|---|---|
| 59 | **Personlighed i dialogen:** hver hjælper får et temperament ud fra navnet (kæk, tør, dramatisk, positiv), så replikkerne lyder forskelligt (rest fra fase 3). Lavet i 0.16.0, og temperamentet står på hjælperens kort. | S | ✅ |
| 60 | **Claude laver noget i pauserne:** kaffe i køkkenet, vander planterne på sit kontor eller klapper katten (0.21.0). Mangler: en tur udenfor og bordtennis med en hjælper. | M | 🟡 |
| 61 | **Fase 5, vækst i ét plan:** teamrum 2 (seks skriveborde mere), en lounge og en reception. Lavet i 0.18.0. | L | ✅ |
| 73 | **Et anneks til de andre sessioner:** en bygning på grunden, hvor dine andre sessioner sidder, så man kan klikke sig over til dem. Parkeret efter dit ønske. | M | ⏸️ |
| 62 | **Daglig bonus og stribe:** en lille bonus for første arbejde på dagen og for dage i træk. Lavet i 0.16.0: 25 kr plus 10 kr pr. dag i træk, højst en uge; vises i Fremskridt og i loggen. | S | ✅ |
| 63 | **Sæson og vejr:** jul i december, regn på ruderne, sne om vinteren. Lavet i 0.24.0 (rest af punkt 22). | M | ✅ |
| 64 | **Kontorhund eller -kat** (punkt 23), evt. købt i butikken. Lavet i 0.21.0: en rød kontorkat i butikken. | M | ✅ |
| 65 | **Indret selv:** flyt pynt og inventar rundt med træk og slip (punkt 25). | L | ⬜ |
| 66 | **Månedens medarbejder:** hjælpernes navne går igen, så de kan få deres egen statistik og en pokal. Lavet i 0.25.0. | M | ✅ |
| 67 | **Tv-tilstand** til en ekstra skærm: fuld skærm, ingen panel, kameraet følger det, der sker (punkt 31). Lavet i 0.23.0: 📺 eller T. | S | ✅ |

| 69 | **Aktivitetslog:** en lille liste nederst over det seneste, der er sket (ny opgave, aflevering, grønne tests), med tid og hvem. Lavet i 0.15.0. | S | ✅ |
| 70 | **Liv udenfor:** hjælpere kommer gående op ad stien fra fortovet og går samme vej hjem; en hjælper uden plads venter på bænken. De går op ad det sidste stykke sti og hele vejen hjem i 0.15.0; bænken kom i 0.16.0. | M | ✅ |
| 68 | **Gulvsidderne bytter plads, når et skrivebord købes,** fordi pladserne på gulvet tælles fra det første ledige skrivebord. De går pænt, men det ligner stoleleg. Hver gulvsidder bør beholde sin plads. Lavet i 0.16.0: hver plads følger af hjælperens nummer, så et nyt skrivebord flytter kun den, det er til. | S | ✅ |
| 71 | **Færdige hjælpere hænger ud:** efter afleveringen holder de fri i tre minutter (bordtennis to og to, kaffe, sofaen eller en snak på græsset ved stien), går tilbage til et skrivebord, hvis Claude kalder på dem igen, og går ellers hjem. Lavet i 0.16.0. | M | ✅ |
| 72 | **Linjer skrevet gennem shell-scripts tæller ikke.** Kun Edit og Write giver kroner; `sed`, Python-scripts og lignende kan mod'en ikke tælle sikkert. Måske ud fra `git diff --stat` ved commit. Lavet i 0.17.0: efter `git commit` tæller mod'en de linjer i committen, som Edit og Write ikke allerede har talt, højst 400 hver vej pr. commit. | S | ✅ |

| 74 | **Ny grundplan med gange og rum, der vokser i trin:** en hovedgang, to rækker rum, receptionen midt på forsiden, have mod vejen, og teamrum, køkken, lounge og toilet, der starter små og udvides i trin; gåturene laves om, så hjælperne går på gangen med fast fart. Planen og tegningen står i [GRUNDPLAN.md](GRUNDPLAN.md). Lavet i 0.19.0. | L | ✅ |

### Forslag til rækkefølge

1. **63 sæson og vejr** og **64 kontorkatten**, lavet i 0.24.0 og 0.21.0.
2. **66 månedens medarbejder** og **67 tv-tilstand**, lavet i 0.25.0 og 0.23.0.
3. **65 indret selv**: flyt pynt og inventar med træk og slip.

## 🧪 Testgennemgang 16.10.2026 (0.19.0)

En samlet gennemgang før nye ting: koden læst igennem (mod, server og side), alle automatiske tests kørt, bevægelserne målt billede for billede i et testkontor med alle faser, pauser og møder, placeringerne tjekket i fire udbygninger, og rigtige subagenter fulgt i det rigtige kontor.

**Det holder:** forbindelsen fra Claude til kontoret (statusfil, server, side), ingen ruter gennem vægge eller depoter i fem udbygninger, gangens vognbaner, møder og pauser, ingen pladser i vægge eller oven i hinanden, ingen møbler foran døre, køb og afslutning er beskyttet, migreringen, kapaciteten af skriveborde og alle 111 automatiske tests.

### Penge og tællere

| # | Hvad | Str. | Status |
|---|---|---|---|
| 75 | **En tæller, der går ned, krediteres igen fuldt ud.** En forsinket statusfil med lidt lavere tal (to skrivninger, der overhaler hinanden) tolkes som "startet forfra", så hele tælleren betales igen: ved 5.000 linjer ca. 1.250 kr for meget. Rettelse: kreditér kun det, der ligger over det højeste set. | S | ✅ |
| 76 | **En subagent, der sendes i baggrunden undervejs (Ctrl+B), afleveres to gange:** én gang når kaldet vender tilbage, og igen når den er færdig. | S | ✅ |
| 77 | **Agenter, som motorens liste aldrig viser** (workflow-agenter, motorens egne forks), "afleveres" efter et minut, mens de stadig arbejder, og igen og igen, cirka hvert 70. sekund. | S | ✅ |
| 78 | **Et testord i en commit-besked** (fx "Fix jest config" eller "node --test") tæller som en testkørsel og ikke som en commit, så commit-kronerne og -linjerne udebliver. | S | ✅ |
| 79 | **Commit-linjer tælles dobbelt** ved delvise commits og `git commit --amend`, og `git -C` eller `Set-Location` får mod'en til at læse det forkerte repo. | S | ✅ |
| 80 | **Krediterede sessioner glemmes efter 7 dage**, så en session, der genoptages senere, kan blive krediteret forfra. | S | ✅ |

### Bevægelser og hvor folk står

| # | Hvad | Str. | Status |
|---|---|---|---|
| 81 | **Faseskift når frem op til et sekund for sent, så figuren springer.** Siden regner gåturen fra faseskiftets tidspunkt, men skiftet går gennem mod'ens oprydning, statusfilen og serveren først (målt 978 ms i dit kontor, op til ca. 80 enheder). Rettelse: siden starter en ny fase, når den ser den. | M | ✅ |
| 82 | **Pauser og møder regnes om hvert billede ud fra, hvem der er ledig lige nu.** Bliver én færdig midt i en pause, forsvinder dens ærinde, de andre bytter pladser, og nogle dukker op midt i en tur. Mødet forsvinder helt, hvis der bliver under tre. Rettelse: lås holdet, når pausen eller mødet begynder. | M | ✅ |
| 83 | **Møde og pause overlapper hvert 30. minut**, så hjælpere hopper fra køkkenet til skrivebordet og går derfra til mødet. | S | ✅ |
| 84 | **Hjælpere med fri og hjælpere på pause bruger de samme pladser** ved kaffen og bordtennisbordet, så to står på én plads, og med fire ved bordet er der ingen bold. | S | ✅ |
| 85 | **En hjælper, der afleverer, før den er nået ind** (fx fejler inden for 12 sekunder), eller som kaldes tilbage fra fri og bliver hurtigt færdig, springer til sit skrivebord. | S | ✅ |
| 86 | **Skifter siden session, går den forrige sessions hjælpere hjem ud ad hoveddøren** i det nye kontor, og en hjælper, der kaldes tilbage, kan starte fra plænen. | S | ✅ |
| 87 | **Claude hopper fra mødet eller køkkenet til skrivebordet**, når en hjælper kommer med et resultat, i stedet for at gå. | S | ✅ |
| 88 | **Lange ærinder går for hurtigt**, fx fra teamrum 1 til toilettet: loftet på 8 sekunder er for kort til det store hus. | S | ✅ |
| 89 | **Småting:** hjælpere på plænen går op til hoveddøren og ned igen, når de går hjem; skriveborde, der ikke er købt, spærrer stadig for gåture; listen over ruter vokser hele dagen; ekstra pladser på plænen og ved bænken kan stå i træerne; afleveringspladserne går igen for hver sjette hjælper; depotet mod nord mangler den tykke ydervæg. | S | ✅ |

### Serveren og mod'en

| # | Hvad | Str. | Status |
|---|---|---|---|
| 90 | **Enhver læsefejl tolkes som et ødelagt spil.json.** Er filen bare låst et øjeblik (antivirus, OneDrive), hentes en kopi op til et døgn gammel og skrives over det gode spil. | S | ✅ |
| 91 | **En ekstra server, der starter samtidig med en anden, skriver filer**, før den opdager, at porten er optaget. Rettelse: lyt først, læs bagefter. | S | ✅ |
| 92 | **En gammel 0.18-server kan stadig sælge gamle ting** (`hobby`, sofahjørnet) efter migreringen. Rettelse: oversæt gamle id'er ved hver indlæsning. | S | ✅ |
| 93 | **Småting på serveren:** dagens kopi af spil.json overskrives ved hver start (også lige efter en migrering); serveren gemmer ikke, før den lukker; sommertid giver forkert "i går" for striben; et køb med et id, der ikke er tekst, går igennem (kræver dog token). | S | ✅ |
| 94 | **"Kører cd"** står i stedet for den rigtige kommando, når en kommando begynder med `cd …`. | S | ✅ |

### Forslag til rækkefølge

1. **Bevægelserne:** 81-88, lavet i 0.19.1.
2. **Pengene:** 75-80, så ingen tjener for meget eller for lidt. Lavet i 0.19.2.
3. **Robusthed:** 90-93. Lavet i 0.20.1.
4. **Småting:** 89 og 94, lavet i 0.23.1 og 0.20.1.

## 🧹 Oprydning

| # | Hvad | Str. | Status |
|---|---|---|---|
| 27 | **Supabase:** slet tabellerne `offices`, `office_members` og `agent_status`, de gamle funktioner og de ubrugte brugere. Kræver dit OK. | S | ⬜ |
| 28 | **Omdøb repo'et** `Claude_Dashboard` til `agent-kontor` og ret README'ens kommandoer. | S | ⬜ |
| 29 | **Team Chat:** mailskabeloner og SMTP er ikke længere nødvendige, og `supabase/`-mappen på skrivebordet kan ryddes op. | S | ⬜ |
