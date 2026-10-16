# Agent-kontor 🏢

Et pixel-kontor set ovenfra, i din browser. Tryk på **🏢 Åbn kontor** over chatboksen. Claude sidder ved det store skrivebord midt i huset, og når den sender subagenter afsted, kommer de op ad stien og ind gennem receptionen, går ad gangen til teamrummet og går over til Claude med resultatet, når de er færdige.

- **Skriveborde i teamrummene og stillerummet.** Hver hjælper får et navn og sit eget udseende, og dem uden skrivebord sidder i receptionen med en laptop.
- **Talebobler med det, de laver lige nu:** "Læser api.ts", "Skriver README.md", "Kører npm test". Skærmen på skrivebordet viser det også: kode, terminal, en side tekst eller en browser.
- **Venter på dig:** figuren rækker hånden op, boblen blinker rødt, og en rød boks øverst til højre siger, hvad den venter på. Det sker kun, når en godkendelsesdialog faktisk vises for dig, ikke når Auto-tilstanden selv afgør det.
- **Hele vinduet:** kontoret ligger midt på en grund med græs, træer, en sø og en vej med biler og gadelygter, og fylder hele browservinduet. Listen, butikken og fremskridt svæver i et panel i venstre side, som kan foldes sammen med **‹**; på en telefon ligger panelet i bunden.
- **Kamera:** træk for at flytte rundt, rul eller knib for at zoome, og dobbeltklik eller tryk **Vis hele kontoret** for at komme tilbage. Når du har flyttet dig, viser et lille kort i hjørnet, hvor du er. Tryk **Gå til** i den røde "venter på dig"-boks for at hoppe hen til den, der venter. Tastaturet virker også: pile eller WASD flytter, + og − zoomer, og 0 viser hele kontoret.
- **Tv-tilstand:** tryk 📺 i topbjælken eller T, så fylder kontoret hele skærmen uden panel, og kameraet følger selv det, der sker: først den, der venter på dig, så hjælpere på vej ind eller med et resultat, og ellers dem, der arbejder. Esc slukker den.
- **Hjælpernes type og model:** en Explore-hjælper har et forstørrelsesglas på skrivebordet, en Plan-hjælper en tegningsrulle, og navneskiltet har modellens farve: Opus lilla, Sonnet blå, Haiku grøn.
- **Aktivitet:** nederst står det seneste, der er sket: hvem der kom ind, afleverede eller gik i stå, grønne tests, køb og præstationer. Tryk på boksen for at se flere. Hjælperne kommer op ad stien fra vejen og går samme vej hjem.
- **Vækst:** alle rum ligger langs en hovedgang. Teamrum, køkken, lounge og toilet starter små og vokser i trin, ud på grunden eller ind i et depot, op til 22 skriveborde. Loungen får pool, dart, bar og spil til hjælperne med fri, og receptionen bag hoveddøren kan indrettes, så Bodil byder alle velkommen. Hjælperne går i højre side af gangen og lige gennem dørene. Se [GRUNDPLAN.md](GRUNDPLAN.md).
- **Lyd og beskeder:** små melodier, når nogen kommer ind, afleverer, venter på dig eller testene bliver grønne; 🔊 i topbjælken slår dem fra. Med 🔔 får du en besked fra browseren, når nogen venter på dig og fanen er skjult, og fanens titel siger det altid.
- **Kronerne er sikre:** serveren gemmer en kopi af spillet hver dag (en uge tilbage), og går filen i stykker, fortsætter den fra den nyeste kopi.
- **Kroner og butik:** arbejdet tjener kroner, der vises øverst på siden og på Claudes tavle. Linjer, afleverede opgaver, grønne tests, commits og pull requests tæller. Kontoret starter småt: Claudes kontor og et tomt teamrum, hvor hjælperne sidder på gulvet, til du har købt det første skrivebord. Skriveborde, rum og deres trin, bordtennisbord og mødelokale købes i fanen **Butik** eller ved at klikke på skiltet på stedet, hvorefter der bygges med stillads i ti sekunder. Uden køkken holder Claude pause ved skrivebordet. Når rummene er der, bliver de brugt: hvert tredje minut er der kaffepause (og snak i køkkenet), toiletbesøg og bordtennis, og hvert tiende minut holder Claude et kort møde. Trivslen øverst på siden stiger med rum og inventar og falder med hjælpere på gulvet, og den ganger indtjeningen med 0,8 til 1,2. Andre sessioner skifter du til med fanerne øverst. Butikken sælger også pynt og opgraderinger, og fanen **Fremskridt** viser dagens tal, de sidste 14 dage og dine præstationer, der hver giver en lille belønning. Hjælpere uden skrivebord sidder på gulvet med en laptop og brokker sig, og er der ikke plads indenfor, venter de på bænken ved stien. Dagens første arbejde giver en lille bonus, der vokser med hver dag i træk. Planen for resten står i [SPIL.md](SPIL.md).
- **Dagens opsummering:** fanen **Fremskridt** viser dagens opgaver, hvem der løste dem og hvornår, og **📋 Kopiér** giver hele dagen som tekst, klar til et standup. Opgaver med 💬 har hjælperens svar: klik for at læse det. Det står også på hjælperens kort.
- **Færdig:** har Claude arbejdet i mindst to minutter og bliver færdig, mens du er et andet sted, siger fanens titel ✅ Færdig, der lyder en lille melodi, og med 🔔 slået til får du en besked.
- **Grænser som ting:** kaffekanden på Claudes skrivebord tømmes med 5-timers-grænsen, og planten visner, efterhånden som konteksten fyldes.
- **Månedens medarbejder:** hjælpernes navne går igen, så hver har sin egen tavle. Fremskridt viser sidste måneds vinder med pokal og stillingen i denne måned, og den, der fører, har en ⭐ på navneskiltet.
- **Lys efter tidspunktet:** sollys falder ind ad vinduerne om dagen, og om aftenen bliver der mørkt, så lamperne og skærmene lyser. Vil du se aftenen om dagen, så skriv `?tid=21:30` efter adressen.
- **Vejr og årstider:** vejret skifter af sig selv i løbet af dagen: sol, skyer, regn på ruderne og om vinteren sne, der bliver liggende. Træerne følger årstiden, og i december er der juletræ og lyskæder. Vil du se et andet vejr, så skriv `?vejr=sne` (eller `regn`, `skyet`, `klart`) efter adressen, og `?maaned=12` for december.
- **Pause:** Claude går ud i køkkenet med en kop kaffe, vander planterne på sit kontor eller klapper kontorkatten, når den er købt. Katten vandrer selv rundt: den sover i receptionen, spiser i køkkenet og sætter sig hos Claude.
- **Fejringer:** konfetti når testene er grønne (`npm test`, `pytest`, `jest`, `vitest`, `cargo test` …), en regnsky når de fejler, og balloner ved `git commit` og `gh pr create`.
- **Tak:** når en hjælper afleverer, siger Claude tak ved navn.
- **Fri:** en hjælper, der er færdig, bliver et par minutter og spiller bordtennis, henter kaffe, sætter sig i sofaen eller snakker med en anden på græsset. Tager Claude fat i den igen, går den tilbage til et skrivebord; ellers går den hjem. Hver hjælper har sit eget temperament (kæk, tør, dramatisk eller positiv), som man kan høre på replikkerne.
- **Alle dine sessioner** har en fane øverst på siden. Kontoret viser den, der arbejder, indtil du selv vælger en fane, og de andre sessioner sidder i projektrummet nederst.
- I panelet står linjer kode, pris og hvor meget af 5-timers-grænsen, sessionen har brugt. Skriv `/kontor panel` for at se den samme liste som tekst i et panel i Claude, med saldo, trivsel og stribe øverst.

## Sådan hænger det sammen

Hver session skriver en lille statusfil i `~/.claude/agent-kontor/sessions/`. Første gang du trykker på **🏢 Åbn kontor**, starter en lille server på `http://127.0.0.1:4747`, som læser filerne og sender ændringer live til siden. Siden tegner og animerer alt selv i 60 billeder i sekundet, så intet blinker eller hakker. Serveren lukker selv, når ingen har brugt den i 30 minutter.

Kontoret er kun dit: intet login, serveren svarer kun din egen computer, og intet forlader den. Statusfilerne indeholder projektnavnet, hvad Claude og hjælperne laver lige nu (fx `Læser api.ts`), hjælpernes opgavetitler og begyndelsen af deres svar og sessionens tal. En kommando vises med programmet (`Kører npm test`), aldrig med argumenter eller miljøvariabler.

Alle udvidelser, lavet og planlagt, står i [UDVIDELSER.md](UDVIDELSER.md).

## Se det fyldt

Skriv `/kontor demo`, så kommer seks hjælpere ind, arbejder et stykke tid og afleverer én efter én.

## Installér

Kræver [Node.js](https://nodejs.org) 18 eller nyere til kontorets lille server.

### Med Claude desktop

1. Åbn **Plugins**-fanen i Claude desktop.
2. Indsæt adressen på dette repo, og installér:

   ```
   https://github.com/Stokn9x/Claude_Dashboard
   ```

3. Start en ny session i Code-fanen. Knappen **🏢 Åbn kontor** står over chatboksen.

Opdateringer hentes samme sted, i Plugins-fanen.

### Med Claude Code i terminalen

```
/plugin install agent-kontor --marketplace Stokn9x/Claude_Dashboard
```

<details>
<summary>Virker Plugins-fanen ikke? Installér og opdatér med PowerShell (Windows)</summary>

Installér:

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { "Fandt: $claude"; & $claude plugin marketplace add Stokn9x/Claude_Dashboard; & $claude plugin install agent-kontor@agent-kontor } else { "Fandt ingen claude.exe" }
```

Opdatér:

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { & $claude plugin marketplace update agent-kontor; & $claude plugin update agent-kontor@agent-kontor; & $claude plugin list } else { "Fandt ingen claude.exe" }
```

</details>

## Kommandoer

| Kommando | Gør |
| --- | --- |
| `/kontor` | Starter serveren og åbner kontoret i din browser, ligesom knappen over chatboksen |
| `/kontor panel` | Viser hvem der laver hvad som tekst i et panel |
| `/kontor demo` | Fylder kontoret med seks hjælpere, så du kan se det i gang |

Fejler kontoret, mærker Claude intet: alt det kører ved siden af og kan aldrig stoppe et værktøjskald.
