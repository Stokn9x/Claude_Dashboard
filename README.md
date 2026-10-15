# Agent-kontor 🏢

Et pixel-kontor i et panel ved siden af Claude, hvor hele teamets Claude-agenter arbejder live. Hver session sidder ved sit eget skrivebord, og man kan se med det samme, hvad den laver:

| | Figuren | Skærmen |
| --- | --- | --- |
| ⌨️ **Skriver kode** | taster | kode, der ruller |
| 📖 **Læser** | sidder ved skrivebordet | en side tekst |
| ⏳ **Kører** en kommando | venter | terminal med blinkende markør |
| 🌐 **På nettet** | sidder ved skrivebordet | en browser |
| ❗ **Venter på dig** | rækker hånden op, boblen blinker | et rødt spørgsmålstegn |
| ☕ **Pause** | går ud i køkkenet med en kop kaffe | zZ |

Subagenter står som små grå figurer ved siden af skrivebordet, med deres eget ikon over hovedet. Vinduerne følger tiden på dagen. Under kontoret står en liste med alle agenter, dem der venter først, med linjer kode, pris og forbrugsgrænse.

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

## Kom i gang

1. Panelet **🏢 Kontor** åbner af sig selv (ellers skriv `/kontor`).
2. Skriv dit navn.
3. **Opret et kontor**, og send koden med **🔗 Inviter → Kopiér invitation**, eller **forbind** til et kontor med en kode, du har fået.

Fra da af flytter alle dine Claude-sessioner ind i kontoret, mens de kører.

| Kommando | Gør |
| --- | --- |
| `/kontor` | Åbner kontoret |
| `/kontor TEAM-2026` eller `/kontor forbind TEAM-2026` | Forbinder til et kontor |
| `/kontor nyt Copenhagen Data` | Opretter et kontor |
| `/kontor kode` | Viser kontorets kode |
| `/kontor navn Casper` | Skifter dit navn |
| `/kontor forlad` | Forlader kontoret |

## Hvad deles?

Kun status, aldrig samtalen:

- hvad agenten laver, og et filnavn (`Skriver register.tsx`), eller programmet i en kommando uden argumenter (`Kører npm test`, aldrig `--token=…` eller miljøvariabler),
- projektmappens navn, modellen, linjer kode, pris og forbrugsgrænse i procent.

Kun medlemmer af kontoret kan se det, og kun med kontorets kode bliver man medlem (Row Level Security i Supabase). En agent, der ikke har meldt sig i 10 minutter, forsvinder fra kontoret, og alt slettes efter et døgn.

Fejler kontoret, mærker Claude intet: rapporteringen kører i baggrunden og kan aldrig stoppe et værktøjskald.

## Backend

Bygger på samme Supabase-projekt som [Team Chat](https://github.com/Stokn9x/Claude_Chat) (anonyme logins og koder). Kontorets tabeller og funktioner ligger i [`supabase/schema.sql`](supabase/schema.sql).
