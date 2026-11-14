# Instala las herramientas necesarias y las dependencias del proyecto.
$ErrorActionPreference = 'Stop'

winget install -e --id Microsoft.AzureCLI
winget install microsoft.azd
azd ext install microsoft.foundry

npm install
