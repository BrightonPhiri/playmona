# PlayMona — build verification script (run from project root)
# Usage:  pwsh -File tools/verify.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== 1. Syntax check every JS file ===" -ForegroundColor Cyan
$js = Get-ChildItem -Recurse -Filter *.js -Path (Join-Path $root 'js') | Select-Object -ExpandProperty FullName
$bad = 0
foreach ($f in $js) {
  node --check $f *> $null
  if ($LASTEXITCODE -ne 0) { Write-Host "SYNTAX FAIL: $f" -ForegroundColor Red; $bad++ }
}
if ($bad -eq 0) { Write-Host "OK: $($js.Count) JS files parse." -ForegroundColor Green } else { Write-Host "$bad files failed" -ForegroundColor Red }

Write-Host "`n=== 2. play.html references vs files on disk ===" -ForegroundColor Cyan
$html = Get-Content (Join-Path $root 'play.html') -Raw
$refs = [regex]::Matches($html, 'src="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$refs += [regex]::Matches($html, 'href="([^"]+\.(?:css|svg))"') | ForEach-Object { $_.Groups[1].Value }
$missing = @()
foreach ($r in $refs) {
  $p = Join-Path $root ($r -replace '/', '\')
  if (-not (Test-Path $p)) { $missing += $r }
}
# any JS/CSS/SVG file not referenced
$disk = Get-ChildItem -Recurse -Include *.js,*.css,*.svg -Path (Join-Path $root 'js'),(Join-Path $root 'css'),(Join-Path $root 'assets') | ForEach-Object { $_.FullName.Substring($root.Length+1) -replace '\\','/' }
$unref = $disk | Where-Object { $refs -notcontains $_ }
if ($missing.Count) { Write-Host "MISSING (referenced but not on disk):" -ForegroundColor Red; $missing | ForEach-Object { Write-Host "  $_" } } else { Write-Host "OK: all referenced files exist." -ForegroundColor Green }
if ($unref) { Write-Host "UNREFERENCED (on disk but not in play.html):" -ForegroundColor Yellow; $unref | ForEach-Object { Write-Host "  $_" } }

Write-Host "`n=== 3. Game registry ===" -ForegroundColor Cyan
$gameIds = @('letterRush','wordScramble','wordBuilder','wordChain','miniCrossword','familyQuiz','trueOrFalse','brainBattle','guessWho','pictureQuiz','memoryMatch','pictureMemory','whatsMissing','rememberSequence','quickTap','colorReaction','numberChallenge','higherOrLower','charades','visualCharades','dontSayIt','drawingChallenge','pictionary','wouldYouRather','thisOrThat','whoIsMostLikely','guessCountry','guessLandmark','guessAnimal','guessFood','guessObject','guessSport','guessVehicle','spotDifference','picturePuzzle','hiddenObject','visualRiddle','whereInWorld','mapChallenge','capitalChallenge','guessFlag','imposters')
$allGameCode = (Get-ChildItem -Recurse -Filter *.js -Path (Join-Path $root 'js\games') | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
foreach ($id in $gameIds) {
  if ($allGameCode -notmatch "id:\s*['""]$id['""]") { Write-Host "NOT REGISTERED: $id" -ForegroundColor Red }
}
Write-Host "Checked $($gameIds.Count) expected game ids."

Write-Host "`n=== 4. Data namespace ===" -ForegroundColor Cyan
$dataCode = (Get-ChildItem -Recurse -Filter *.js -Path (Join-Path $root 'js\data') | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
foreach ($prop in @('questions','trueFalse','guessWho','pictureQuiz','dictionary','scramble','categories','missingLetters','crosswords','countries','charades','dontSayIt','drawingPrompts','pictionary','wouldYouRather','thisOrThat','whoIsMostLikely','finishSentence','describeIt','animals','food','landmarks','objects','sports','vehicles','visualCharades','visualRiddles')) {
  if ($dataCode -notmatch $prop) { Write-Host "MISSING DATA: $prop" -ForegroundColor Red }
}
Write-Host "Checked data properties."

Write-Host "`n=== 5. Forbidden runtime patterns ===" -ForegroundColor Cyan
$all = (Get-ChildItem -Recurse -Include *.js -Path (Join-Path $root 'js') | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
foreach ($pat in @('import\s','export\s','require\(','fetch\(','\?\.','\?\?')) {
  $m = [regex]::Matches($all, $pat)
  if ($m.Count) { Write-Host "FOUND forbidden pattern '$pat' x$($m.Count)" -ForegroundColor Yellow }
}
Write-Host "Done."
