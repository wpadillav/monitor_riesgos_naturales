---
name: linux-hardening
description: "Endurecimiento y administración segura de servidores Linux (Ubuntu LTS, Debian, RHEL/Alma/Rocky): SSH, firewall, actualizaciones, usuarios, systemd, auditoría, TLS y respaldos. Úsala al aprovisionar, auditar o mantener servidores."
---

# Hardening Linux

## Lista base (referencia: CIS Benchmark nivel 1)
1. **Sistema:** versión LTS o estable vigente del STACK.lock. Instalación mínima. Zona horaria UTC. NTP con chrony o systemd-timesyncd.
2. **Actualizaciones automáticas de seguridad:**
   - Ubuntu/Debian: `unattended-upgrades`;
   - RHEL y derivados: `dnf-automatic`.
3. **Usuarios:** sin login de root. Usuarios nominales con `sudo`. Contraseñas bloqueadas y acceso por llave. Expirar las cuentas que no se usan.
4. **SSH** (`/etc/ssh/sshd_config.d/99-fabrica.conf`):
   ```
   PermitRootLogin no
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   PubkeyAuthentication yes
   AllowGroups ssh-users
   MaxAuthTries 3
   X11Forwarding no
   ```
   Validar con `sshd -t` **antes** de recargar, manteniendo abierta otra sesión de respaldo.
5. **Firewall:**
   - denegar todo el tráfico entrante por defecto;
   - abrir 22 (restringido por IP si es posible), 80 y 443;
   - herramienta: `ufw` (Ubuntu), `firewalld` (RHEL) o `nftables` directo.
6. **fail2ban** o CrowdSec para SSH y web.
7. **MAC:** AppArmor (Ubuntu/Debian) o SELinux en modo enforcing (RHEL). No desactivarlos: crear políticas.
8. **Auditoría:** `auditd` con reglas para `/etc/passwd`, `sudoers` y binarios críticos. Logs centralizados.
9. **Kernel** (sysctl): `net.ipv4.tcp_syncookies=1`, `kernel.kptr_restrict=2`, `fs.protected_symlinks=1`, sin forwarding salvo en routers.
10. **Servicios systemd con sandboxing:**
    ```ini
    [Service]
    User=app
    NoNewPrivileges=true
    ProtectSystem=strict
    ProtectHome=true
    PrivateTmp=true
    ReadWritePaths=/var/lib/app
    CapabilityBoundingSet=
    ```
11. **TLS:** certbot o acme.sh con renovación automática. Configuración "intermediate" de Mozilla. Probar con `testssl.sh`.
12. **Respaldos 3-2-1:** 3 copias, 2 medios, 1 fuera del sitio. Con restic o borg cifrado y **restauración probada cada mes**.
13. **Auditoría periódica:** `lynis audit system` y revisión de los puertos abiertos (`ss -tulpn`).

## Diagnóstico rápido
`uptime; free -h; df -h; ss -tulpn; systemctl --failed; journalctl -p err -b; dmesg -T | tail; top -o %MEM`

## Automatización
Todo lo anterior queda en un rol de Ansible idempotente, versionado en el repositorio de infraestructura.
