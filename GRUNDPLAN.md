# Ny grundplan for kontoret

Status: **bygget i 0.19.0.** Tegningen er forslag 4 fra vores snak den 16. oktober 2026; svarene på de åbne spørgsmål står under [Besluttet](#besluttet), og det, der blev anderledes under byggeriet, under [Sådan blev det](#sådan-blev-det).

![Ny grundplan](docs/grundplan.svg)

## Hvorfor

Det nuværende kontor er vokset rum for rum, og det kan ses:

- **Ingen gange.** Man går gennem rummene for at komme rundt, fx gennem teamrummet for at nå køkkenet, så hjælperne går mellem skrivebordene.
- **For tæt på vejen.** Toilettet og mødelokalet ligger helt ned til hækken, så intet kan vokse mod syd. Det var her, ønsket om et større toilet gik i stå.
- **Tingene ligger tilfældigt.** Receptionen stikker ud på siden, pauserne er spredt, og Claude sidder i et hjørne langt fra den nye halvdel af huset.

## Idéen

- **En hovedgang** på tværs af huset. Alle rum har dør ud til gangen, så hjælperne går på gangen og ikke gennem rummene.
- **To rækker rum.** Mod nord: teamrum 2, Claude, mødelokalet og loungen. Mod syd: teamrum 1, receptionen, stillerummet, køkkenet og toilettet.
- **Receptionen midt på forsiden** med stien lige ned til vejen. Claude sidder lige over den, midt i huset, så hjælperne har kort vej med deres resultater, og mødelokalet ligger ved siden af Claude.
- **Have mellem huset og vejen.** Hele bygningen rykker væk fra vejen, så der er plads til bænken, plænen og søen foran.
- **Rum, der vokser.** Fem rum starter små og kan udvides i trin: teamrummene mod vest, én hel kolonne pr. trin, så rummet altid er firkantet; loungen og toilettet mod øst; køkkenet inde i bygningen.
- **Depoter i stedet for huller.** Køkkenets og loungens trin 2 ligger inde i huset. Indtil de er købt, står der et depot med lukket dør og hylder, så huset aldrig har et tomt felt. Depotet rives ned, når trinnet købes.
- **Alt i ét plan.** Ingen etager; kontoret vokser kun ud over grunden.

## Rummene og deres trin

| Rum | Trin 1 | Trin 2 | Trin 3 |
|---|---|---|---|
| **Teamrum 1** | Plads til 3 skriveborde | 6 skriveborde, en kolonne mod vest | 9 skriveborde, endnu en kolonne mod vest |
| **Teamrum 2** | Plads til 3 skriveborde | 6 skriveborde, en kolonne mod vest | 9 skriveborde, endnu en kolonne mod vest |
| **Køkken** | Kaffemaskine og et lille bord, 2 pladser | Stort bord, køleskab og snackautomat, 5 pladser (i depotet mod øst) | (ingen trin 3) |
| **Lounge** | Sofa og spillekonsol | Pool-bord og dartskive (i depotet mod øst) | Ud på grunden mod øst: bar, jukebox og arkademaskine |
| **Toilet** | Én bås | To båse og en håndvask | Tre båse, ud på grunden mod øst |

Uden trin: Claudes kontor, mødelokalet, receptionen (står altid; købet indretter den) og stillerummet med 4 borde, som bliver det rolige rum med akvariet.

Skrivebordene købes stadig ét ad gangen; et teamrums trin giver pladsen til dem. Med alt udbygget er der 9 + 9 + 4 = 22 skriveborde mod 16 i dag. Hvert trin hæver trivslen lidt.

### Priser

Hvert trin koster det dobbelte af det forrige:

| Rum | Trin 1 | Trin 2 | Trin 3 |
|---|---|---|---|
| Teamrum 1 | står fra start | 4.000 kr | 8.000 kr |
| Teamrum 2 | 10.000 kr | 20.000 kr | 40.000 kr |
| Køkken | 3.000 kr | 6.000 kr | |
| Lounge | 4.000 kr | 8.000 kr | 16.000 kr |
| Toilet | 2.500 kr | 5.000 kr | 10.000 kr |

Skrivebord 17-22 koster 16.000, 17.000, 18.000, 19.000, 20.000 og 21.000 kr, så de seneste borde følger rækken fra i dag.

## Hvordan hjælperne går

Den nye plan duede ikke med gåturene fra før 0.19.0. Ruterne (`public/js/routes.js`) fandt den korteste vej på et gitter af felter med A\*, og hver tur tog fast tid, uanset hvor langt der var (`WALKS` i mod'en: ind 4 s, aflevering 3,5 s, ud 4 s). I et større hus giver det to problemer: de skærer gennem rummene, og på en lang tur suser de afsted. Derfor laves gåturene om sammen med grundplanen:

- **Gangen er vejen.** En gåtur går rum for rum: ud ad døren, hen ad gangen og ind ad den næste dør. Alle rum har kun dør til gangen, så man går aldrig gennem et andet rum. Man går kun ind i et rum, hvis det er dér, man skal hen.
- **Gennem døren, lige på.** Ruten går gennem midten af døren og et skridt lige ind i rummet, før den drejer, så ingen går skråt gennem karmen.
- **Bløde ruter.** Inde i rummene findes vejen rundt om møblerne med A\*, og ruten rettes ud bagefter: overflødige knæk fjernes, hvor der er fri bane, så de går i lige linjer og ikke i trapper.
- **Højre side af gangen.** Man holder til højre i gangretningen, så to, der mødes, går forbi hinanden og ikke igennem hinanden.
- **Fast fart i stedet for fast tid.** Siden går med samme tempo overalt. Mod'ens tider bliver et loft: er ruten kort, når hjælperen frem før tid og sætter sig; kun en rute, der er længere end loftet, går hurtigere. Lofterne i `WALKS` hæves, så de passer til den længste rute i et fuldt udbygget hus.
- **Depoter og trin, der ikke er købt, er lukkede.** Et depot har en lukket dør og er ikke en del af gitteret, og et trin har kun gulv, når det er købt.
- **Testes i alle kombinationer.** `tests/page.test.mjs` kører hver rute (ind, aflevering, ud, pauser, fri) for hver kombination af købte trin og tjekker, at ingen rute går gennem en væg, et depot eller et møbel, og at den bruger gangen, når den kan.

## Når den bygges

- **Ingen mister noget.** Et gemt spil flyttes over til den nye plan: købt køkken bliver køkken trin 1, toilet bliver toilet trin 1, loungen bliver lounge trin 1, teamrum 2 bliver teamrum 2 trin 2 (det havde 6 borde), og teamrum 1 starter på trin 2, fordi det allerede har plads til 6. Købte skriveborde og pynt beholdes.
- **Sofahjørnet og bordtennisbordet** stod i teamrummet. Sofaen er nu en del af loungens trin 1, og bordtennisbordet står i loungen og kan købes, når loungen er bygget.
- **Navnene ryddes op.** I dag har loungen id'et `hobby`, mens `lounge` er sofahjørnet i teamrummet. I den nye plan hedder loungen `lounge`, og de gamle id'er flyttes over, når et gemt spil læses.
- **Grundplanen ligger kun i `public/js/plan.js`** (`ROOM_TYPES`, `PLAN`, `GROUNDS`). Trinene bliver nye ting i serverens priser, og rummenes størrelse følger af det købte trin.
- **Ruterne skal tjekkes** i hver kombination af trin, med `kontorCheckRoutes()` og `tests/page.test.mjs` (se [Hvordan hjælperne går](#hvordan-hjælperne-går)).

## Sådan blev det

Bygget i 0.19.0, med disse ændringer i forhold til tegningen:

- **Gangen er bredere**, 64 enheder i stedet for 40, så der er plads til to vognbaner.
- **Toilettet er lavere** end de andre rum i sydrækken (150 i stedet for 250), så tre båse ikke bliver et langt, tomt rum. Haven fortsætter under det.
- **Bordtennisbordet står i loungen** og kan købes, når loungen er bygget. Et gemt spil med bordet, men uden lounge, får loungen med.
- **Skrivebordene fyldes i fast rækkefølge:** teamrum 1's tre første, stillerummets fire, så tre for hvert trin. Teamrummenes trin er én kæde (teamrum 1 trin 2 og 3, så teamrum 2 trin 1-3), så et nyt trin altid tilføjer borde til sidst, og ingen hjælper bytter plads.
- **Gå-tiderne er lofter:** ind 12 s, aflevering 8 s, ud 9 s. Siden går med 80 enheder i sekundet. Med et resultat bliver hjælperen siddende, til den skal gå, og når frem til Claude præcis, når afleveringen begynder.
- **Hjælpere uden skrivebord** sidder langs væggene i receptionen og ikke i teamrummet.

## Besluttet

| Spørgsmål | Svar |
|---|---|
| Er 3, 6 og 9 skriveborde pr. trin rigtigt? | **Ja.** Hvert trin er en hel kolonne mod vest, så rummet altid er firkantet. |
| Skal køkken og lounge byttes, så pauserne er samlet? | **Nej.** De står skråt over for hinanden over gangen i østenden, så pauserne er allerede samlet. |
| Skal stillerummet kunne udvides? | **Nej.** Det har 4 borde fast; teamrummene står for væksten. |
| Hvad skal trinene koste? | **Det dobbelte af forrige trin**, se [Priser](#priser). |
