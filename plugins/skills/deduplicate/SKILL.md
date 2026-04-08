---
name: deduplicate
description: Identify and merge duplicate entities, relations, and graph objects in Semantica using fuzzy matching, schema heuristics, and graph similarity.
---

# /semantica:deduplicate

Remove duplicates from the knowledge graph. Usage: `/semantica:deduplicate <strategy> [args]`

`$ARGUMENTS` = deduplication strategy + optional entity or threshold.

---

## `entities [--threshold <score>] [--field <name>]`

Find and merge duplicate entities.

```python
from semantica.deduplication import DuplicateDetector

finder = DuplicateDetector()
merged = finder.merge_duplicates(entity_type=entity_type, threshold=threshold)
```

Output: merged entity IDs, discarded duplicates, and merge confidence.

---

## `relations [--similarity <score>]`

Detect duplicate relationships and normalize edges.

```python
relations = finder.find_duplicate_relations(similarity=similarity)
```

Result: relation clusters, normalized relation set, and cleanup summary.
