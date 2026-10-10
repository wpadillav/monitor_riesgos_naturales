---
name: stack-powershell
description: "PowerShell 7 (LTS) multiplataforma para automatización en entornos Windows/Microsoft: estructura de scripts y módulos, manejo de errores, PSScriptAnalyzer, Pester y seguridad. Úsala para automatizar Windows Server, Active Directory, Microsoft 365 o Azure."
---

# Stack PowerShell

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py powershell`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Base
- **PowerShell 7.x LTS** (multiplataforma). Windows PowerShell 5.1 solo cuando un módulo lo exija, y se documenta.
- **Cabecera:**
  ```powershell
  #Requires -Version 7.4
  [CmdletBinding(SupportsShouldProcess)]
  param([Parameter(Mandatory)][ValidateSet('dev','prod')][string]$Entorno)
  Set-StrictMode -Version Latest
  $ErrorActionPreference = 'Stop'
  ```
  Ajusta `-Version` a la LTS del lock.
- **Convenciones:**
  - nombres Verbo-Sustantivo con verbos aprobados (`Get-Verb`);
  - funciones avanzadas con `-WhatIf`/`-Confirm` para los cambios;
  - salida como objetos (no texto formateado);
  - módulos (`.psm1` + manifiesto `.psd1`) para el código reutilizable.
- **Errores:** `try`/`catch` con `throw` de errores con contexto. Nada de `Write-Host` para datos: usa `Write-Output`, `Write-Verbose` y `Write-Error`.

## Calidad
```powershell
Invoke-ScriptAnalyzer -Path . -Recurse -Severity Warning,Error
Invoke-Pester -Path ./tests -CI
```

## Seguridad
- Credenciales con `Get-Credential`, SecretManagement + un *vault*, o identidad administrada. Nunca en texto plano.
- Scripts firmados si la política de ejecución del cliente lo exige.
- `Invoke-Expression` prohibido con datos externos.
