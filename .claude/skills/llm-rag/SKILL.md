---
name: llm-rag
description: "Integración de modelos de lenguaje en productos: llamadas a API, salida estructurada, RAG con búsqueda híbrida, agentes con herramientas, evaluación, costos y seguridad (OWASP LLM). Úsala para cualquier funcionalidad basada en LLMs o embeddings."
---

# LLMs y RAG

## Integración básica
- Cliente oficial del proveedor (SDK) con timeout, reintentos exponenciales ante 429/5xx y presupuesto de tokens por solicitud.
- **Prompts versionados** en archivos (no en literales dispersos por el código), con variables y pruebas.
- **Salida estructurada:** JSON Schema o *tool use*, validada con el esquema (Pydantic, Zod, JSON Schema). Si no valida, reintentar con el error o degradar.
- Caché de respuestas deterministas y uso de *prompt caching* del proveedor para contextos largos repetidos.
- Registrar tokens, latencia, costo y versión del prompt y del modelo, **sin** datos personales.

## RAG
1. **Ingesta:** extraer el texto (PDF, DOCX, HTML), limpiarlo y conservar los metadatos (fuente, sección, fecha, permisos).
2. **Fragmentación:** por estructura (títulos, párrafos), de 300 a 800 tokens con un solapamiento del 10-15 %, sin partir tablas.
3. **Embeddings:** un único modelo por índice; re-indexar si cambia.
4. **Almacenamiento:** pgvector si ya hay PostgreSQL (índice HNSW). Alternativas: OpenSearch o Elasticsearch (ya tienen BM25), Qdrant o Weaviate si la escala lo justifica.
5. **Recuperación híbrida:** BM25 + vectores, fusión RRF y *re-ranking*. Filtrar por permisos del usuario **antes** de enviar al modelo.
6. **Generación:** instrucciones de responder solo con el contexto, citar las fuentes y decir "no lo sé" si falta información.

## Agentes y herramientas
- Herramientas pequeñas, con esquema estricto y descripciones claras.
- Permisos mínimos: lectura por defecto.
- Las acciones irreversibles (pagar, borrar, enviar) requieren confirmación humana.
- Límite de pasos y de costo por tarea. Registro de cada llamada a herramienta.

## Evaluación (obligatoria antes de producción)
- **Conjunto de evaluación:** de 50 a 200 casos reales + adversarios + fuera de alcance.
- **Métricas:**
  - exactitud o tasa de acierto;
  - fidelidad al contexto (*groundedness*);
  - recuperación (recall@k del fragmento correcto);
  - formato válido;
  - latencia p95 y costo por solicitud.
- **LLM-como-juez** con una rúbrica, calibrado contra etiquetas humanas en una muestra.
- Se ejecuta en el CI cuando cambian el prompt, el modelo o los datos. Una regresión bloquea el merge.

## Seguridad (OWASP Top 10 para aplicaciones LLM)
- **Inyección de prompts** (directa o desde documentos): separar las instrucciones de los datos y nunca dar al modelo permisos que el usuario no tenga.
- **Salida no confiable:** escapar antes de mostrarla en HTML y nunca ejecutar código, SQL o shell generados sin validar y sin un sandbox.
- **Fuga de datos:** filtrar datos personales y secretos antes de enviarlos. Revisar los términos del proveedor (retención y entrenamiento) y registrar un ADR.
- **Denegación por costo:** límites por usuario y por tenant.
