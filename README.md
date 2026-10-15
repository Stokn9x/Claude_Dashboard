# Agent-kontor 🏢

Et pixel-kontor set ovenfra i et panel ved siden af Claude. Claude sidder ved det store skrivebord i hjørnekontoret, og når den sender subagenter afsted, kommer de ind ad døren, sætter sig i teamrummet og går over til Claude med resultatet, når de er færdige.

- **Seks skriveborde i teamrummet.** Hver hjælper får et navn og sit eget udseende, og flere end seks venter ved døren.
- **Talebobler med det, de laver lige nu:** "Læser api.ts", "Skriver README.md", "Kører npm test". Skærmen på skrivebordet viser det også: kode, terminal, en side tekst eller en browser.
- **Venter på dig:** figuren rækker hånden op, boblen blinker rødt, og en stribe under kontoret siger hvad den venter på. Det sker kun, når en godkendelsesdialog faktisk vises for dig, ikke når Auto-tilstanden selv afgør det.
- **Pause:** Claude går ud i køkkenet med en kop kaffe, der damper.
- **Dine andre sessioner** sidder i projektrummet nederst, med projektnavn, hvad de laver og hvor mange hjælpere de har. Hver session skriver en lille statusfil i `~/.claude/agent-kontor/sessions/` og læser de andres.
- Under kontoret står linjer kode, pris og hvor meget af 5-timers-grænsen, sessionen har brugt.

Kontoret er kun dit: intet login, ingen server, og intet forlader din computer. Statusfilerne indeholder kun projektnavn, hvad Claude laver lige nu og antal hjælpere. En kommando vises med programmet (`Kører npm test`), aldrig med argumenter eller miljøvariabler.

## Se det fyldt

Skriv `/kontor demo`, så kommer seks hjælpere ind, arbejder et stykke tid og afleverer én efter én.

## Installér

### Med Claude desktop (Windows)

Åbn **PowerShell**, og indsæt hele blokken:

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { "Fandt: $claude"; & $claude plugin marketplace add Stokn9x/Claude_Dashboard; & $claude plugin install agent-kontor@agent-kontor } else { "Fandt ingen claude.exe" }
```

Start derefter en ny session i Code-fanen.

### Med Claude Code i terminalen

```
/plugin install agent-kontor --marketplace Stokn9x/Claude_Dashboard
```

### Opdatér

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { & $claude plugin marketplace update agent-kontor; & $claude plugin update agent-kontor@agent-kontor; & $claude plugin list } else { "Fandt ingen claude.exe" }
```

| Kommando | Gør |
| --- | --- |
| `/kontor` | Åbner kontoret |
| `/kontor demo` | Fylder kontoret med seks hjælpere, så du kan se det i gang |

Fejler kontoret, mærker Claude intet: alt det kører ved siden af og kan aldrig stoppe et værktøjskald.
