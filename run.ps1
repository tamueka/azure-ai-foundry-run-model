#requires -Version 5.1
<#
.SYNOPSIS
  Ejecuta el CLI run-model pasando todos los argumentos sin interpretarlos.

.DESCRIPTION
  npm 12 valida los flags antes de reenviarlos al script, así que
  `npm run dev -- --json` falla con EUNKNOWNCONFIG. Este lanzador evita el
  problema: PowerShell pasa los argumentos tal cual a Node.

.EJEMPLOS
  .\run.ps1
  .\run.ps1 "¿Qué es Microsoft Foundry?"
  .\run.ps1 --json "¿Qué es Microsoft Foundry?"
  .\run.ps1 --verbose --effort low "explica RAG"
#>

node --env-file=.env --import tsx "$PSScriptRoot/src/infrastructure/cli/main.ts" @args
exit $LASTEXITCODE