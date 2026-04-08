---
name: causal
description: Analyze cause-and-effect relationships in the Semantica knowledge graph — causal chains, interventions, counterfactuals, and causal influence scores.
---

# /semantica:causal

Analyze causal relationships and infer impacts. Usage: `/semantica:causal <task> [args]`

`$ARGUMENTS` = task + optional target entity, filter, or intervention.

---

## `chain [--subject <node>] [--depth N]`

Build and inspect causal chains for a subject or category.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import ContextGraph

graph = ContextGraph(advanced_analytics=True)
analyzer = CausalChainAnalyzer(graph=graph)

chain = analyzer.build_causal_chain(subject=subject, depth=depth)
metrics = analyzer.compute_causal_metrics(chain)
```

Output: chain steps, cause strength, effect reach, and summary graph.

---

## `intervene <node> <action> [--scenario <json>]`

Simulate an intervention on a node and measure downstream effects.

```python
result = analyzer.simulate_intervention(node=node, action=action, scenario=scenario)
``` 

Return: effect magnitudes, changed outcomes, and intervention recommendations.

---

## `counterfactual <fact> [--weight N]`

Generate counterfactual explanations and alternate outcomes.

```python
counterfactuals = analyzer.generate_counterfactuals(fact=fact)
```

Output: alternate causal paths, likelihood change, and decision impact.
