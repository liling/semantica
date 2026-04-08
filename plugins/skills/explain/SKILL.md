---
name: explain
description: Explain Semantica reasoning, decision logic, and graph results with traceability, causal context, and human-readable rationale.
---

# /semantica:explain

Produce explanations for decisions, rules, and graph analytics. Usage: `/semantica:explain <target> [args]`

`$ARGUMENTS` = explanation target + optional detail level.

---

## `decision <decision_id> [--detail <level>]`

Explain why a decision was reached.

```python
from semantica.explain import Explainer

explainer = Explainer()
explanation = explainer.explain_decision(decision_id=decision_id, detail=detail)
```

Output: decision factors, rule traces, confidence, and suggested next steps.

---

## `graph <node_id> [--path N]`

Explain graph relationships and why a node is connected.

```python
explanation = explainer.explain_graph_connection(node_id=node_id, depth=depth)
```

Return: cause/effect chains, supporting evidence, and relevant metadata.
