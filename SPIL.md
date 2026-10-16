# Spillet i Agent-kontor

Status: **fase 0 er lavet (0.8.0).** Beslutningerne står under [Besluttet](#besluttet).

## Idéen

Arbejdet med Claude tjener penge. For pengene køber man kontoret op: pladser til hjælperne, nye rum og ting at lave i pauserne. En hjælper uden plads sidder på gulvet med en laptop og brokker sig. Kontoret vokser altså med det, man laver, og det bliver sjovere jo mere man bruger det.

Spillet må aldrig stå i vejen for arbejdet. Det er kun pynt: intet i spillet kan stoppe eller forsinke Claude, og man kan slå det fra.

## Økonomien

### Valuta

**Kroner (kr).** Vises som en saldo øverst på siden og på tavlen i Claudes kontor.

### Hvad tjener penge

| Hændelse | Forslag | Hvorfor |
|---|---|---|
| Linje tilføjet | 1 kr | Det tydeligste mål for arbejde |
| Linje fjernet | 0,5 kr | Oprydning tæller også |
| Hjælper afleverer en opgave | 25 kr | Belønner at bruge subagenter |
| Grønne tests | 50 kr, højst én gang hvert 10. minut | Belønner at teste, uden at man kan spamme |
| Commit | 30 kr | |
| Pull request | 100 kr | |

**Loft:** en enkelt redigering tæller højst 200 linjer, så en genereret fil på 10.000 linjer ikke køber hele kontoret. En hjælper, der *gik i stå*, giver ingenting.

En typisk dag med ca. 2.400 linjer giver omkring **3.000-4.000 kr**.

### Hvad koster ting

| Ting | Pris | Effekt |
|---|---|---|
| Skrivebord nr. 1-2 | gratis | Man starter med to |
| Skrivebord nr. 3, 4, 5, 6 | 500 / 750 / 1.000 / 1.500 kr | En hjælper mindre på gulvet |
| Køkken | 2.000 kr | Claude holder pause med kaffe; hjælpere henter kaffe |
| Toilet | 1.500 kr | Hjælpere går på toilet en gang imellem (ren pynt) |
| Sofahjørne | 2.500 kr | Hjælpere, der venter, sætter sig der i stedet for at stå |
| Bordtennisbord | 3.000 kr | To ledige hjælpere spiller |
| Mødelokale | 5.000 kr | Når Claude har 3+ hjælpere i gang, holder de et kort møde |
| Teamrum 2 | 8.000 kr | Plads til seks skriveborde mere |
| Pynt (planter, lamper, billeder, tæpper) | 100-400 kr | Gør det hyggeligt; hæver trivslen |

Priserne er et første bud og skal justeres, når vi ser, hvor hurtigt pengene kommer.

## Hvordan det ser ud

- **Ledig grund:** rum, man ikke har købt, står som en tom grund med en prisskilt-figur. Klik på den for at købe.
- **Byggeri:** efter køb står der stillads i ca. 10 sekunder, og så kommer rummet frem med konfetti.
- **Gulvsiddere:** en hjælper uden skrivebord sidder på gulvet langs væggen med en laptop i skødet. Den siger ting som "Av min ryg", "Har vi ikke en stol?" og "Jeg vil også have et skrivebord". Den arbejder lige så godt som de andre; det er kun stemningen, der lider.
- **Butik:** en ny fane ved siden af listen på siden: "Hvem laver hvad" og "Butik". Butikken viser saldo, hvad man har råd til, og hvad der kommer næste gang.

## Drama og banter (fase 3)

Hjælperne skal have lidt personlighed. Når to eller flere står i kantinen, ved kaffemaskinen eller ved bordtennisbordet, snakker de sammen i små replikskifter:

- **Drillerier:** "Var det dig, der brugte 400 linjer på en README?" / "Den var nødvendig!"
- **Små konkurrencer:** hvem der har afleveret flest opgaver i dag, hvem der fik rødt i testene
- **Brok og sladder:** gulvsiddere, der brokker sig over en kollega med to skærme; nogen der har spist den sidste kage
- **Reaktioner på det, der sker:** en hjælper, der gik i stå, bliver trøstet eller drillet; grønne tests giver high-five

Replikkerne vælges ud fra rigtige hændelser (opgaver, tests, linjer, hvem der sidder på gulvet), så de passer til dagen. Hver hjælper får et lille temperament ud fra sit navn (fx kæk, tør, positiv, dramatisk), så de lyder forskelligt. Ingen sproglig model: replikkerne er skabeloner, så det koster intet og aldrig siger noget mærkeligt.

## Trivsel (fase 3)

En simpel stemningsmåler fra 0 til 100:
- går **ned**, når hjælpere sidder på gulvet, eller når der ikke er et køkken
- går **op** med planter, pynt, sofahjørne og bordtennis

Trivslen ganger indtjeningen med 0,8 til 1,2. Det giver en grund til at købe hygge og ikke kun skriveborde.

## Den tekniske plan

### 1. Serveren ejer pengene

Kun én skal skrive i pengekassen, ellers kan to sessioner overskrive hinanden. Det bliver serveren:

- Spillet gemmes i `~/.claude/agent-kontor/spil.json`: saldo, hvad man har købt, trivsel og en log.
- Hver session skriver **løbende tællere** i sin statusfil: linjer tilføjet og fjernet, afleverede opgaver, tests, commits og PR'er. Serveren krediterer forskellen siden sidst, pr. session. Kører serveren ikke, tjener man stadig: tællerne venter i filen, til serveren starter.
- Serveren krediterer en afsluttet session, før den sletter dens fil.

### 2. Køb fra siden

Serveren tager i dag kun imod GET. Køb kræver `POST /api/buy`:
- kun fra siden selv: værtsnavnet skal være 127.0.0.1 eller localhost, og `Origin` skal passe
- et engangs-token, som siden får ved indlæsning, så en anden hjemmeside ikke kan bruge dine penge
- serveren tjekker prisen og saldoen; siden bestemmer ingenting selv

### 3. Gåture med fast varighed

Mod'en tager i dag tid på hver gåtur ud fra grundplanen, så de to skal være enige om alle ruter. Når man kan købe rum og flytte skriveborde, holder det ikke. Derfor:

- Hver gåtur får en **fast varighed**, fx ind: 4 s, aflevering: 4 s, ud: 4 s. Siden tilpasser gåtempoet, så turen passer.
- Mod'en holder kun styr på faserne og tiderne. Hvor folk sidder, og hvilken vej de går, bestemmer siden ud fra det, man har købt.
- Skrivebordene fordeles af siden: de første hjælpere får de købte skriveborde, resten sætter sig på gulvet.

Det er en god oprydning i sig selv. Grundplanen skal så kun ligge ét sted, i `public/app.js`, og ikke længere også i `hooks/register.tsx`.

### 4. Grundplan som data

I dag er kontoret tegnet i kode. Med rum, man kan købe, skal grundplanen beskrives som data: grunde med position, størrelse, pris og hvilket rum der kan ligge der. Ruterne beregnes mellem dørene.

### 5. Et kontor, der kan blive markant større

Kontoret skal kunne vokse fra en håndfuld rum til mange gange sin nuværende størrelse, fx flere teamrum, en hel etage og senere flere etager. Derfor bygges det fra starten sådan:

- **Et gitter.** Hele kontoret ligger på et gitter af felter (fx 24 × 24 enheder). Rum, møbler, døre og gange fylder hele felter. Et nyt rum er en blok af felter, der sættes på ved siden af de andre. Kortet har ingen fast størrelse: det vokser i den retning, man bygger.
- **Udvidelser.** Ud over rum kan man købe **mere grund** (en ny række grunde ud mod siden), og senere en **ny etage** med elevator eller trappe. Hver etage er sit eget gitter.
- **Kamera.** Siden viser ikke længere hele kontoret på én gang, når det bliver stort:
  - træk for at flytte rundt, rul eller knib for at zoome
  - en knap viser hele kontoret
  - et lille kort i hjørnet viser, hvor man er
  - venter Claude eller en hjælper på dig, kan man med ét klik hoppe derhen, og kameraet kan selv følge med
- **Ruter med A\*.** Gåturene beregnes på gitteret med A\* gennem døre og gange og gemmes, til grundplanen ændrer sig. Da turene har fast varighed (punkt 3), betyder en lang vej bare, at man går hurtigere, og mod'en skal aldrig kende ruten.
- **Kun det synlige tegnes.** Hvert rum tegnes én gang til sit eget lille billede og genbruges. I hvert billede tegnes kun de rum og figurer, der er inden for kameraet, så 100 rum ikke er tungere end 10.
- **Plads til mange hjælpere.** Med flere teamrum fordeles hjælperne på tværs af rummene, og listen på siden grupperes efter rum.

Det betyder, at **fase 0 er større**, end den ellers ville være. Til gengæld skal fundamentet ikke bygges om igen, når kontoret vokser.

## Faser

| Fase | Indhold | Størrelse |
|---|---|---|
| **0. Fundament** | Gitter og grundplan som data, kamera med træk og zoom, ruter med A\*, gåture med fast varighed, tællere i statusfilen, `spil.json` på serveren, saldo på siden | L+ ✅ |
| **1. Pladser** | Køb skriveborde, gulvsiddere med laptop og brok, butik-fanen | M |
| **2. Rum** | Ledige grunde, køb rum, byggeri med stillads, køkken/toilet/sofa/bordtennis/mødelokale | L |
| **3. Liv** | Rummene bliver brugt: kaffe, toiletbesøg, bordtennis, møder; trivsel; **drama og banter** mellem hjælperne, når de står i kantinen | L |
| **4. Mere** | Pynt-butik, opgraderinger (bedre stole, større skærme), præstationer ("1.000 linjer på en dag"), statistik | M |
| **5. Vækst** | Mere grund, teamrum 3 og videre, nye etager med elevator, hjælpere fordelt på flere rum | L |

Hver fase kan bruges for sig og skal være færdig og testet, før den næste starter.

## Besluttet

| Spørgsmål | Svar |
|---|---|
| Start | **Et lille kontor forfra:** Claudes kontor og et lille teamrum med to skriveborde. Resten tjenes og købes. |
| Hvad tjener penge | **Linjer og bedrifter:** linjer tilføjet og fjernet, afleverede opgaver, grønne tests, commits og PR'er. |
| Trivsel | **Ja, i fase 3.** |
| Valuta | **Kroner.** |
