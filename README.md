# Session Dashboard

Et dashboard lige over prompten i Claude, så du altid kan se, hvor du står:

| Felt | Viser |
| --- | --- |
| **Kontekst** | Hvor fuld kontekstvinduet er (% og ring) og antal tokens |
| **5 timer / 7 dage** | Forbrugsgrænserne med % og hvornår de nulstilles (orange over 80 %, rød over 95 %) |
| **Pris** | Hvad sessionen har kostet indtil nu |
| **Kode** | Linjer tilføjet og fjernet af Claudes ændringer, og hvor mange filer |
| **Session** | Varighed, antal ture og tokens ud |

Det hele ligger i én lav række, så det ikke tager plads fra samtalen. Rækken kan foldes sammen til én linje (`▴` / `▾ Vis`), eller slås til og fra med `/dashboard`.

## Installér

### Med Claude desktop (Windows)

Åbn **PowerShell**, og indsæt hele blokken:

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { "Fandt: $claude"; & $claude plugin marketplace add Stokn9x/Claude_Dashboard; & $claude plugin install session-dashboard@session-dashboard } else { "Fandt ingen claude.exe" }
```

Start derefter en ny session i Code-fanen.

### Med Claude Code i terminalen

```
/plugin install session-dashboard --marketplace Stokn9x/Claude_Dashboard
```

### Opdatér

```powershell
$roots = @("$env:APPDATA\Claude\claude-code") + (Get-ChildItem "$env:LOCALAPPDATA\Packages" -Directory -Filter "*Claude*" -ErrorAction SilentlyContinue | ForEach-Object { "$($_.FullName)\LocalCache\Roaming\Claude\claude-code" })
$claude = $roots | Where-Object { Test-Path $_ } | ForEach-Object { Get-ChildItem $_ -Recurse -Filter claude.exe } | Sort-Object LastWriteTime -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $claude) { $claude = (Get-Command claude -ErrorAction SilentlyContinue).Source }
if ($claude) { & $claude plugin marketplace update session-dashboard; & $claude plugin update session-dashboard@session-dashboard; & $claude plugin list } else { "Fandt ingen claude.exe" }
```

## Hvor kommer tallene fra?

- Kontekst, grænser og pris er de samme tal, som Claudes egen statuslinje og `/cost` bruger. Forbrugsgrænserne vises kun med et Claude-abonnement, og først efter første svar i sessionen.
- Linjer kode tælles ud fra den diff, Claudes `Edit`- og `Write`-værktøjer returnerer. Ændringer, der fejler eller holdes til godkendelse, tælles ikke med.
- Alt bliver på din egen maskine. Intet sendes nogen steder hen.
