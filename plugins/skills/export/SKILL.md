---
name: export
description: Export Semantica graphs, results, and provenance to JSON, RDF, Parquet, CSV, GraphML, and other formats.
---

# /semantica:export

Export knowledge graph data. Usage: `/semantica:export <format> [args]`

`$ARGUMENTS` = format + optional target or destination.

---

## `json [--output <path>] [--filter <query>]`

Export graph data as JSON.

```python
from semantica.export import GraphExporter

exporter = GraphExporter()
exporter.export_json(output_path=output, filter_query=filter_query)
```

Output: JSON file or inline JSON payload.

---

## `rdf [--format turtle|xml|ntriples] [--output <path>]`

Export the graph in RDF serialization.

```python
exporter.export_rdf(format='turtle', output_path=output)
```

Return: RDF text or file path.

---

## `parquet [--output <path>]`

Export nodes and edges to Parquet for analytics.

```python
exporter.export_parquet(output_path=output)
```

Output: Parquet dataset ready for downstream processing.
