# Lance api-gateway (8080), auth-service (8081), candidat-service (8082), concours-service (8083),
# lieux-service (8084), repartition-service (8085) et convocation-service (8086) dans des fenetres
# PowerShell separees.
# Necessite un JDK 17+ : soit JAVA_HOME pointe vers le JDK, soit java est dans le PATH.
#
# convocation-service envoie les convocations par e-mail (SMTP Gmail). Pour activer l'envoi, definir
# AVANT de lancer ce script (les fenetres filles heritent de l'environnement) :
#   $env:MAIL_USERNAME = "mon.adresse@gmail.com"
#   $env:MAIL_PASSWORD = "mot de passe d'application Gmail (16 caracteres)"
# Sans ces variables, tous les services demarrent quand meme ; seul l'envoi renvoie un 503 explicite.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$localEnvPath = Join-Path (Split-Path $PSScriptRoot -Parent) "local-env.ps1"
if (Test-Path $localEnvPath) {
    . $localEnvPath
    Write-Host "Loaded local-env.ps1" -ForegroundColor DarkGray
}

$mvnwCmd = Join-Path $PSScriptRoot "mvnw.cmd"
if (Test-Path $mvnwCmd) {
    $maven = $mvnwCmd
} elseif (Get-Command mvn -ErrorAction SilentlyContinue) {
    $maven = "mvn"
} else {
    Write-Host "Maven Wrapper (mvnw.cmd) absent et Maven (mvn) introuvable sur le PATH." -ForegroundColor Red
    exit 1
}

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $javaCmd = Get-Command java -ErrorAction SilentlyContinue
    if ($javaCmd) {
        $props = & java -XshowSettings:properties -version 2>&1 | Out-String
        if ($props -match "java\.home = (.+)") {
            $env:JAVA_HOME = $Matches[1].Trim()
        }
    }
}

if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    Write-Host "JAVA_HOME n'est pas defini ou invalide." -ForegroundColor Red
    Write-Host "Installez un JDK 17 (ex. Eclipse Temurin), puis soit :" -ForegroundColor Yellow
    Write-Host '  [Environment]::SetEnvironmentVariable("JAVA_HOME","C:\Program Files\Eclipse Adoptium\jdk-17...","User")' -ForegroundColor Gray
    Write-Host "  soit dans cette session : `$env:JAVA_HOME = '...chemin vers le JDK...'" -ForegroundColor Gray
    exit 1
}

Write-Host "JAVA_HOME=$env:JAVA_HOME" -ForegroundColor DarkGray

$javaHomeEsc = $env:JAVA_HOME.Replace("'", "''")
$rootEsc = $PSScriptRoot.Replace("'", "''")

if (Test-Path $mvnwCmd) {
    $runGateway = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl api-gateway spring-boot:run"
    $runAuth = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl auth-service spring-boot:run"
    $runCandidat = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl candidat-service spring-boot:run"
    $runConcours = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl concours-service spring-boot:run"
    $runLieux = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl lieux-service spring-boot:run"
    $runRepartition = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl repartition-service spring-boot:run"
    $runConvocation = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; .\mvnw.cmd -pl convocation-service spring-boot:run"
} else {
    $runGateway = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl api-gateway spring-boot:run"
    $runAuth = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl auth-service spring-boot:run"
    $runCandidat = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl candidat-service spring-boot:run"
    $runConcours = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl concours-service spring-boot:run"
    $runLieux = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl lieux-service spring-boot:run"
    $runRepartition = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl repartition-service spring-boot:run"
    $runConvocation = "`$env:JAVA_HOME='$javaHomeEsc'; Set-Location -LiteralPath '$rootEsc'; mvn -pl convocation-service spring-boot:run"
}

$gatewayPort = if ($env:GATEWAY_PORT) { $env:GATEWAY_PORT } else { "8080" }

Write-Host "Demarrage api-gateway sur http://localhost:$gatewayPort (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runGateway
)

Write-Host "Demarrage auth-service sur http://localhost:8081 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runAuth
)

Write-Host "Demarrage candidat-service sur http://localhost:8082 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runCandidat
)

Write-Host "Demarrage concours-service sur http://localhost:8083 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runConcours
)

Write-Host "Demarrage lieux-service sur http://localhost:8084 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runLieux
)

Write-Host "Demarrage repartition-service sur http://localhost:8085 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runRepartition
)

if (-not $env:MAIL_USERNAME -or -not $env:MAIL_PASSWORD) {
    Write-Host "Astuce : MAIL_USERNAME / MAIL_PASSWORD non definis -> l'envoi de convocations renverra un 503." -ForegroundColor Yellow
    Write-Host "         Definissez-les avant de relancer ce script pour activer l'envoi e-mail." -ForegroundColor Yellow
}

Write-Host "Demarrage convocation-service sur http://localhost:8086 (nouvelle fenetre)..." -ForegroundColor Cyan
Start-Process powershell.exe -WorkingDirectory $PSScriptRoot -ArgumentList @(
    "-NoExit",
    "-NoLogo",
    "-Command",
    $runConvocation
)

Write-Host "La gateway et les six services demarrent. Fermez chaque fenetre pour arreter le service correspondant." -ForegroundColor Green
