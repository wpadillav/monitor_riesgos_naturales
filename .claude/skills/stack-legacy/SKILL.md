---
name: stack-legacy
description: "Tecnologías legacy sin skill propia: ASP clásico, VB6, VB.NET WebForms, COBOL, Delphi, ColdFusion, Visual FoxPro, PHP 4/5 y Perl CGI antiguo; cómo leerlas, aislarlas y migrarlas. Úsala junto con modernizacion-legacy al enfrentar estos sistemas."
---

# Stack legacy (tecnologías heredadas)

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py php perl`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Principios
1. **Entender antes de cambiar:** inventario, flujos y reglas de negocio documentadas (skill `modernizacion-legacy`).
2. **Congelar el comportamiento** con pruebas de caracterización a nivel de HTTP, archivos o BD (caja negra) cuando no se puede probar el código por dentro.
3. **Aislar:** proxy o capa anticorrupción delante. El sistema viejo sigue funcionando mientras se reemplaza.
4. **Seguridad inmediata**, aunque no se migre aún:
   - parchear o aislar en la red;
   - WAF delante;
   - quitar exposición pública innecesaria;
   - rotar credenciales quemadas en el código.

## Guía por tecnología
| Tecnología | Cómo leerla / ejecutarla | Destino típico |
|---|---|---|
| **ASP clásico (VBScript)** | IIS en una VM aislada. Includes `<!--#include-->`. ADO con SQL concatenado (inyección SQL casi segura) | ASP.NET Core (.NET LTS) |
| **VB6** | Requiere Windows con el runtime de VB6. Componentes COM/ActiveX y OCX de terceros | .NET LTS (WinForms/WPF o web), o reemplazo por web |
| **VB.NET / Web Forms (.NET Framework 4.x)** | Visual Studio. `ViewState`, code-behind | ASP.NET Core (asistente de actualización de .NET y migración incremental con YARP) |
| **COBOL** (mainframe o Micro Focus/GnuCOBOL) | Copybooks = estructuras de datos. JCL = orquestación. Aritmética decimal exacta | Exponer las transacciones como API primero. Reescribir por dominio con cálculos validados en paralelo |
| **Delphi** | IDE de la versión original. Componentes VCL de terceros | Delphi moderno, .NET o web, según el negocio |
| **ColdFusion** | Lucee (abierto) para ejecutarlo fuera de Adobe CF | Stack web del lock |
| **Visual FoxPro** | Tablas DBF + lógica embebida | Migración de datos a SQL + app nueva |
| **PHP 4/5, Perl CGI** | Contenedor con la versión antigua **solo para pruebas** | Ver las recetas en `modernizacion-legacy` |

## Datos legacy
Codificaciones (Windows-1252, latin1, EBCDIC en mainframe), fechas en formatos propios (AAMMDD, juliano), campos empaquetados (COMP-3), claves compuestas y la falta de integridad referencial. Todo se valida con conciliación numérica.
