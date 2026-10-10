---
name: seguridad-owasp
description: "Seguridad de aplicaciones: OWASP Top 10, ASVS, MASVS, OWASP LLM Top 10, autenticación, gestión de secretos, cadena de suministro y lista de revisión por lenguaje. Úsala al diseñar, implementar o revisar cualquier código expuesto a usuarios o datos."
---

# Seguridad de aplicaciones

## OWASP Top 10: control mínimo
| Riesgo | Control obligatorio |
|---|---|
| Control de acceso roto | Autorización en el servidor, en cada petición y por recurso (dueño o rol). Denegar por defecto. Pruebas de IDOR. |
| Fallas criptográficas | TLS 1.2+ (preferible 1.3). Contraseñas con Argon2id o bcrypt (coste ≥ 12). Sin algoritmos propios. Cifrado en reposo para datos sensibles. |
| Inyección | Consultas parametrizadas u ORM. Sin concatenar SQL, shell ni LDAP. Escapado por contexto en las plantillas. |
| Diseño inseguro | Modelo de amenazas STRIDE. Límites de negocio (montos, intentos). |
| Mala configuración | Sin debug en producción. Cabeceras: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors`. CORS explícito. |
| Componentes vulnerables | Auditoría de dependencias en el CI. SBOM. Versiones del STACK.lock con soporte. |
| Fallas de autenticación | MFA para administradores. Bloqueo progresivo. Sesiones con cookies `HttpOnly`, `Secure`, `SameSite`. Rotación del ID de sesión al iniciar sesión. |
| Integridad de software y datos | Firmas, lockfiles, CI con permisos mínimos. Nunca deserializar datos no confiables (`unserialize`, `pickle`, `Storable`, `BinaryFormatter`). |
| Logging insuficiente | Auditoría de inicios de sesión, cambios de permisos y operaciones de dinero, sin datos sensibles. |
| SSRF | Lista blanca de destinos. Bloquear IPs internas y metadatos de la nube. Sin seguir redirecciones a ciegas. |

## Subida de archivos
Validar tipo por contenido (*magic bytes*), limitar el tamaño, renombrar, guardar fuera del webroot o en almacenamiento de objetos, y escanear con antivirus si aplica.

## Secretos
- Variables de entorno, gestor de secretos o SOPS.
- `gitleaks` en pre-commit y en el CI.
- Si un secreto se filtra: **rotarlo primero** y limpiar el historial después.

## Auditoría de dependencias por ecosistema
`composer audit` · `npm audit --omit=dev` / `pnpm audit` · `pip-audit` · `govulncheck ./...` · `cargo audit` · `bundle exec bundler-audit` · `dotnet list package --vulnerable` · `mvn org.owasp:dependency-check-maven:check` · `cpan-audit` (Perl) · `trivy fs .` (universal).

## Análisis estático de seguridad (SAST)
Semgrep (multilenguaje). Por ecosistema: Psalm con taint analysis (PHP), Bandit (Python), gosec (Go), Brakeman (Rails), SpotBugs + FindSecBugs (Java), analizadores de seguridad de .NET.

## Móvil (MASVS) y LLM (OWASP LLM Top 10)
- **Móvil:** almacenamiento seguro (Keychain/Keystore), sin secretos en el binario, TLS con pinning opcional, ofuscación según el riesgo.
- **LLM:**
  - tratar la salida del modelo como entrada no confiable;
  - aislar las instrucciones de los datos;
  - herramientas con permisos mínimos;
  - confirmación humana en acciones irreversibles;
  - filtrar datos personales.

## Cumplimiento
- **Datos personales:** finalidad, consentimiento, minimización, derechos del titular y registro de bases de datos según la ley aplicable (p. ej. Ley 1581 de 2012 en Colombia, GDPR en la UE).
- **Pagos:** usar una pasarela que tokenice la tarjeta para reducir el alcance de PCI-DSS.
