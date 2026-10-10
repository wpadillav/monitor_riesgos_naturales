---
name: stack-servidores-web
description: "Servidores web, proxies y servidores de aplicación: Nginx, Apache httpd, Caddy, HAProxy, PHP-FPM, PSGI/Starman, Gunicorn/Uvicorn, Tomcat; TLS, cabeceras de seguridad, caché, compresión y proxy inverso. Úsala al configurar cómo se sirve una aplicación."
---

# Stack de servidores web y de aplicación

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py nginx apache-http-server`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Elección
| Rol | Opción por defecto | Alternativas |
|---|---|---|
| Proxy inverso / TLS / estáticos | **Nginx** | Caddy (TLS automático), Apache httpd (legacy, `.htaccess`), HAProxy (balanceo L4/L7) |
| PHP | **PHP-FPM** detrás de Nginx | FrankenPHP, mod_php (solo legacy) |
| Perl | **Starman/Gazelle (PSGI)** detrás de Nginx | Hypnotoad (Mojolicious), mod_perl/CGI (legacy) |
| Python | **Uvicorn** (ASGI) / **Gunicorn** (WSGI) | Granian |
| Node | proceso Node detrás de Nginx | — |
| Java | Tomcat o servidor embebido de Spring Boot | Jetty, Undertow |
| .NET | Kestrel detrás de Nginx o IIS | — |

## Nginx: bloque base de proxy inverso
```nginx
server {
  listen 443 ssl; http2 on;
  server_name app.cliente.com;
  ssl_certificate     /etc/letsencrypt/live/app.cliente.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/app.cliente.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;

  add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy strict-origin-when-cross-origin always;
  add_header Content-Security-Policy "default-src 'self'; frame-ancestors 'none'" always;
  server_tokens off;
  client_max_body_size 20m;

  location /assets/ { root /srv/app/public; expires 1y; add_header Cache-Control "public, immutable"; }
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 60s;
  }
}
server { listen 80; server_name app.cliente.com; return 301 https://$host$request_uri; }
```
Para PHP-FPM: `location ~ \.php$ { fastcgi_pass unix:/run/php/php<ver>-fpm.sock; include fastcgi_params; fastcgi_param SCRIPT_FILENAME $realpath_root$fastcgi_script_name; }` y solo `public/` como `root`.

## Verificación
`nginx -t` (o `apachectl configtest`) antes de recargar. Revisión de TLS con `testssl.sh` o SSL Labs y de cabeceras con securityheaders.com.

## PHP-FPM: tuning básico
`pm = dynamic` o `ondemand`, con `pm.max_children` ≈ (RAM disponible para PHP) / (memoria promedio por proceso). `request_terminate_timeout`, `pm.max_requests` para reciclar procesos y *slowlog* activado.
