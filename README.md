# Agent-kontor 🏢

Et pixel-kontor set ovenfra, i din browser. Tryk på **🏢 Åbn kontor** over chatboksen. Claude sidder ved det store skrivebord i hjørnekontoret, og når den sender subagenter afsted, kommer de ind ad døren, sætter sig i teamrummet og går over til Claude med resultatet, når de er færdige.

- **Seks skriveborde i teamrummet.** Hver hjælper får et navn og sit eget udseende, og flere end seks venter ved døren.
- **Talebobler med det, de laver lige nu:** "Læser api.ts", "Skriver README.md", "Kører npm test". Skærmen på skrivebordet viser det også: kode, terminal, en side tekst eller en browser.
- **Venter på dig:** figuren rækker hånden op, boblen blinker rødt, og en stribe under kontoret siger hvad den venter på. Det sker kun, når en godkendelsesdialog faktisk vises for dig, ikke når Auto-tilstanden selv afgør det.
- **Kamera:** træk for at flytte rundt, rul eller knib for at zoome, og dobbeltklik eller tryk **Vis hele** for hele kontoret. Når du har zoomet ind, viser et lille kort i hjørnet, hvor du er. Klik på den røde "venter på dig"-linje under kontoret for at hoppe hen til den, der venter.
- **Kroner og butik:** arbejdet tjener kroner, der vises øverst på siden og på Claudes tavle. Linjer, afleverede opgaver, grønne tests, commits og pull requests tæller. Kontoret starter småt: Claudes kontor og et teamrum med to skriveborde. Flere skriveborde, køkken, toilet, sofahjørne, bordtennisbord og mødelokale købes i fanen **Butik** eller ved at klikke på skiltet på stedet, hvorefter der bygges med stillads i ti sekunder. Uden køkken holder Claude pause ved skrivebordet. Hjælpere uden skrivebord sidder på gulvet med en laptop og brokker sig. Planen for resten står i [SPIL.md](SPIL.md).
- **Lys efter tidspunktet:** sollys falder ind ad vinduerne om dagen, og om aftenen bliver der mørkt, så lamperne og skærmene lyser. Vil du se aftenen om dagen, så skriv `?tid=21:30` efter adressen.
- **Pause:** Claude går ud i køkkenet med en kop kaffe, der damper, og småsnakker.
- **Fejringer:** konfetti når testene er grønne (`npm test`, `pytest`, `jest`, `vitest`, `cargo test` …), en regnsky når de fejler, og balloner ved `git commit` og `gh pr create`.
- **Tak:** når en hjælper afleverer, siger Claude tak ved navn.
- **Alle dine sessioner** har en fane øverst på siden. Kontoret viser den, der arbejder, indtil du selv vælger en fane, og de andre sessioner sidder i projektrummet nederst.
- Under kontoret står linjer kode, pris og hvor meget af 5-timers-grænsen, sessionen har brugt. Skriv `/kontor panel` for at se den samme liste som tekst i et panel i Claude.

## Sådan hænger det sammen

Hver session skriver en lille statusfil i `~/.claude/agent-kontor/sessions/`. Første gang du trykker på **🏢 Åbn kontor**, starter en lille server på `http://127.0.0.1:4747`, som læser filerne og sender ændringer live til siden. Siden tegner og animerer alt selv i 60 billeder i sekundet, så intet blinker eller hakker. Serveren lukker selv, når ingen har brugt den i 30 minutter.

Kontoret er kun dit: intet login, serveren svarer kun din egen computer, og intet forlader den. Statusfilerne indeholder projektnavnet, hvad Claude og hjælperne laver lige nu (fx `Læser api.ts`), hjælpernes opgavetitler og sessionens tal. En kommando vises med programmet (`Kører npm test`), aldrig med argumenter eller miljøvariabler.

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
