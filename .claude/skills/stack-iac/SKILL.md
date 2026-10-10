---
name: stack-iac
description: "Infraestructura como código: Terraform/OpenTofu (módulos, estado remoto, plan/apply, políticas), Ansible (roles idempotentes, inventarios, vault, molecule) y Packer. Úsala al aprovisionar o configurar infraestructura de forma reproducible."
---

# Stack de infraestructura como código

> **Versión:** la define `STACK.lock.md`. Si no existe, ejecuta `politica-versiones/scripts/versiones.py terraform ansible-core`. Las librerías listadas aquí son **recomendaciones de ecosistema**; su versión se verifica en el registro oficial antes de fijarla.

## Terraform / OpenTofu
- **Licencia:** Terraform usa BSL desde la 1.6; **OpenTofu** es el fork bajo MPL. Se elige con un ADR según el cliente. Versión fijada en `required_version` + `.terraform-version`/`.opentofu-version`. Proveedores con versiones acotadas y `.terraform.lock.hcl` versionado.
- **Estado remoto** con bloqueo (S3 + bloqueo nativo o DynamoDB, GCS, Azure Blob, Terraform Cloud) y cifrado. Nunca estado local en equipo.
- **Estructura:**
  ```
  modules/<componente>/{main,variables,outputs,versions}.tf
  envs/{dev,staging,prod}/{main.tf,backend.tf,terraform.tfvars}
  ```
- **Flujo:** `fmt` → `validate` → `tflint` → `trivy config`/`checkov` → `plan` (guardado como artefacto y revisado en el PR) → `apply` del plan aprobado.
- **Reglas:**
  - sin secretos en `.tfvars` versionados;
  - etiquetas obligatorias (`proyecto`, `entorno`, `dueño`, `costo`);
  - `prevent_destroy` en recursos con datos.

## Ansible
- `ansible-core` en la versión del lock + colecciones fijadas en `requirements.yml`.
- **Roles idempotentes:** una segunda ejecución debe dar `changed=0`. Usa módulos nativos antes que `shell`/`command` (y, si se usan, con `creates`/`changed_when`).
- **Inventarios** por entorno, `group_vars`/`host_vars` y secretos con **ansible-vault** o un gestor externo.
- **Calidad:** `ansible-lint` + **Molecule** para probar los roles en contenedores.

## Packer
Imágenes base endurecidas (skill `linux-hardening`) y versionadas, construidas en el CI y escaneadas.
