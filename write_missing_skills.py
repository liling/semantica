import os

base = r'c:\Users\Mohd Kaif\semantica\plugins\skills'

SKILLS = {}

SKILLS['causal'] = """---
name: causal
description: Causal chain analysis on Semantica decision graphs — upstream traces, downstream impact, root causes, impact scoring, network analysis, loop detection, precedent chains, and temporal causal queries. Uses CausalChainAnalyzer, ContextGraph, and AgentContext.
---

# /semantica:causal

Causal chain analysis. Usage: `/semantica:causal <sub-command> <decision_id> [options]`

---

## `trace <decision_id> [--direction upstream|downstream] [--depth N]`

Walk the causal chain upstream (what caused this?) or downstream (what did this cause?).

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)

chain = analyzer.get_causal_chain(
    decision_id=decision_id,
    direction=direction or "upstream",
    max_depth=int(depth) if depth else 10,
)
```

Output as Mermaid `graph TD` + table: `| Step | ID | Category | Outcome | Confidence | Depth |`

---

## `impact <decision_id> [--depth N] [--indirect]`

Full downstream impact — direct and indirect influenced decisions.

```python
from semantica.context import ContextGraph
from semantica.context.causal_analyzer import CausalChainAnalyzer

graph = ContextGraph(advanced_analytics=True)
analyzer = CausalChainAnalyzer(graph_store=graph)

impact = graph.analyze_decision_impact(decision_id, include_indirect="--indirect" in args)
influence = graph.analyze_decision_influence(decision_id, max_depth=int(depth) if depth else 3, include_indirect=True)
influenced = analyzer.get_influenced_decisions(decision_id, max_depth=int(depth) if depth else 10)
score = analyzer.get_causal_impact_score(decision_id)
```

Output: Impact score (0-1) + direct/indirect counts + Mermaid downstream tree.

---

## `roots <decision_id> [--depth N]`

Find root cause decisions at the origin of a causal chain.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
roots = analyzer.find_root_causes(decision_id, max_depth=int(depth) if depth else 10)
```

Output: Root list + Mermaid path from root to target.

---

## `score <decision_id>`

Causal impact score + centrality breakdown.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import ContextGraph, AgentContext

ctx = AgentContext(decision_tracking=True, kg_algorithms=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
graph = ContextGraph()

score = analyzer.get_causal_impact_score(decision_id)
centrality = graph.get_node_centrality(decision_id)
importance = graph.get_node_importance(decision_id)
```

Output: Score (0=isolated, 1=max) + degree/betweenness/closeness/eigenvector + interpretation.

---

## `network [<id1> <id2> ...]`

Analyze the full causal network structure.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True, advanced_analytics=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
network = analyzer.analyze_causal_network(decision_ids=decision_ids or None)
```

Output: Network stats (edges, density, longest chain) + Mermaid of top-15 by impact.

---

## `loops [--depth N]`

Detect circular causal dependencies.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
loops = analyzer.find_causal_loops(max_depth=int(depth) if depth else 10)
```

Output: Each loop as `A -> B -> C -> A` chain + risk warning.

---

## `precedent-chain <decision_id> [--depth N]`

Walk the full precedent chain (what decisions was this derived from?).

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
chain = analyzer.get_precedent_chain(decision_id, max_depth=int(depth) if depth else 10)
```

Return: `| Step | ID | Scenario | Outcome | Confidence | Date |`

---

## `at-time <decision_id> <ISO-date> [--direction upstream|downstream]`

Trace causal chain as it existed at a specific point in time.

```python
from semantica.context.causal_analyzer import CausalChainAnalyzer
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
analyzer = CausalChainAnalyzer(graph_store=ctx.graph_store)
historical = analyzer.trace_at_time(
    event_id=decision_id, at_time=at_time,
    direction=direction or "upstream", max_depth=10,
)
```

Output: Historical chain at `<date>` + diff vs. current (added/removed decisions since then).
"""

SKILLS['policy'] = """---
name: policy
description: Decision policy governance in Semantica — check compliance, find applicable policies, add/update/version policies, enforce rules against decision data, analyze change impact, track affected decisions, and record exceptions. Uses PolicyEngine, ContextGraph, and DecisionQuery.
---

# /semantica:policy

Policy governance. Usage: `/semantica:policy <sub-command> [args]`

---

## `check <decision_id> <policy_id>`

Check whether a decision complies with a policy.

```python
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
engine = ctx.get_policy_engine()
decision = ctx.query_decisions(query=decision_id, max_hops=1)[0]
compliant = engine.check_compliance(decision=decision, policy_id=policy_id)
```

Output: `COMPLIANT ✓ | NON-COMPLIANT ✗` + violated rules with details.

---

## `applicable <category> [--entities <id1,id2>]`

Find all policies applicable to a decision category and entity set.

```python
engine = ctx.get_policy_engine()
policies = engine.get_applicable_policies(
    category=category,
    entities=entities.split(",") if entities else None,
)
```

Return: `| Policy ID | Name | Version | Rules Count | Active Since |`

---

## `add <policy_id> "<name>" --rules '<json-rules>'`

Register a new policy.

```python
from semantica.context.decision_models import Policy
import json

engine = ctx.get_policy_engine()
policy = Policy(policy_id=policy_id, name=name, rules=json.loads(rules_json))
registered_id = engine.add_policy(policy)
```

---

## `update <policy_id> --rules '<json-rules>' --reason "<reason>" [--version <ver>]`

Update policy rules with versioning and audit trail.

```python
new_version = engine.update_policy(
    policy_id=policy_id,
    rules=json.loads(rules_json),
    change_reason=reason,
    new_version=version or None,
)
```

---

## `enforce <decision_data_json> [--rules '<json>']`

Apply policy enforcement against decision data and report violations.

```python
from semantica.context import ContextGraph
import json

graph = ContextGraph(advanced_analytics=True)
result = graph.enforce_decision_policy(
    decision_data=json.loads(decision_data_json),
    policy_rules=json.loads(rules_json) if rules_json else None,
)
rule_check = graph.check_decision_rules(
    decision_data=json.loads(decision_data_json),
    rules=json.loads(rules_json) if rules_json else None,
)
```

Output: Actions applied, violations list, ENFORCED/BLOCKED status.

---

## `history <policy_id>`

Show version history of a policy.

```python
history = engine.get_policy_history(policy_id)
```

Return: `| Version | Changed At | Reason | Rules Delta |`

---

## `impact <policy_id> --rules '<proposed-json>'`

Analyze the effect of proposed policy changes on existing decisions.

```python
import json
impact = engine.analyze_policy_impact(
    policy_id=policy_id,
    proposed_rules=json.loads(proposed_rules_json),
)
```

Output: Count compliant -> non-compliant (risk) and non-compliant -> compliant (gain).

---

## `affected <policy_id> <from_version> <to_version>`

List all decisions affected by a policy version change.

```python
affected = engine.get_affected_decisions(policy_id, from_version, to_version)
```

Return: `| Decision ID | Category | Was Compliant | Now Compliant |`

---

## `exception <decision_id> <policy_id> "<reason>" --approver <name>`

Record a formal policy exception.

```python
exception_id = engine.record_exception(
    decision_id=decision_id, policy_id=policy_id,
    reason=reason, approver=approver, justification=reason,
)
from semantica.context.decision_query import DecisionQuery
dq = DecisionQuery(graph_store=ctx.graph_store)
similar = dq.find_similar_exceptions(exception_reason=reason, limit=5)
```

Output: `Exception <exception_id> recorded` + similar past exceptions for audit.
"""

SKILLS['query'] = """---
name: query
description: Query the Semantica ContextGraph and AgentContext using natural language, multi-hop traversal, LLM reasoning, and direct graph queries. Sub-commands: retrieve, decisions, multi-hop, expand, reasoning, similar, graph.
---

# /semantica:query

Query the context graph. Usage: `/semantica:query <sub-command> "<question>" [options]`

---

## `retrieve "<question>" [--max N] [--graph] [--entities] [--expand]`

Hybrid vector + graph retrieval.

```python
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True, graph_expansion=True, advanced_analytics=True)

results = ctx.retrieve(
    query=question,
    max_results=int(max_n) if max_n else 5,
    use_graph="--graph" in args,
    include_entities="--entities" in args,
    include_relationships=True,
    expand_graph="--expand" in args,
    deduplicate=True,
)
```

Return: `| Rank | Content | Type | Score | Source | Timestamp |`

---

## `decisions "<question>" [--hops N] [--hybrid]`

Query decisions with multi-hop graph reasoning.

```python
ctx = AgentContext(decision_tracking=True, advanced_analytics=True)
decisions = ctx.query_decisions(
    query=question,
    max_hops=int(hops) if hops else 3,
    include_context=True,
    use_hybrid_search="--hybrid" in args,
)
```

Return: `| ID | Category | Scenario | Outcome | Confidence | Hops | Timestamp |`

---

## `multi-hop <start_entity> "<question>" [--hops N]`

Multi-hop graph traversal from a known entity.

```python
ctx = AgentContext(decision_tracking=True, graph_expansion=True, advanced_analytics=True)
result = ctx.multi_hop_context_query(
    start_entity=start_entity,
    query=question,
    max_hops=int(hops) if hops else 3,
)
```

Output: Traversal path + ranked results + Mermaid hop graph.

---

## `expand "<question>" [--hops N]`

Expand a query through the graph to find adjacent context.

```python
ctx = AgentContext(graph_expansion=True)
expanded = ctx.expand_query(query=question, max_hops=int(hops) if hops else 2)
```

Shows which expansion hops added what context.

---

## `reasoning "<question>" [--max N] [--hops N]`

LLM-powered reasoning over retrieved graph context.

```python
ctx = AgentContext(decision_tracking=True, graph_expansion=True, advanced_analytics=True)
result = ctx.query_with_reasoning(
    query=question,
    llm_provider=None,
    max_results=int(max_n) if max_n else 10,
    max_hops=int(hops) if hops else 2,
)
```

Output: LLM-synthesized answer + supporting evidence nodes + reasoning chain.

---

## `similar "<content>" [--max N]`

Find memories and nodes semantically similar to content.

```python
ctx = AgentContext()
results = ctx.find_similar(content=content, limit=int(max_n) if max_n else 5)
```

---

## `graph "<query>" [--skip N] [--limit N]`

Direct query via ContextGraph.query().

```python
from semantica.context import ContextGraph

graph = ContextGraph()
results = graph.query(
    query=query_str,
    skip=int(skip) if skip else 0,
    limit=int(limit) if limit else 50,
)
```

Return: `| Node ID | Type | Properties | Neighbors |` + Mermaid pie of type distribution.
"""

SKILLS['explain'] = """---
name: explain
description: Generate natural-language explanations for decisions, reasoning paths, inferences, node paths, and policy compliance. Uses ExplanationGenerator.generate_explanation, show_reasoning_path, justify_conclusion, AgentContext.trace_decision_explainability, and ContextGraph.trace_decision_chain.
---

# /semantica:explain

Generate explanations. Usage: `/semantica:explain <sub-command> <target>`

---

## `decision <decision_id>`

Full explainability trace for a decision.

```python
from semantica.context import AgentContext, ContextGraph

ctx = AgentContext(decision_tracking=True, advanced_analytics=True)
explainability = ctx.trace_decision_explainability(decision_id)

graph = ContextGraph(advanced_analytics=True)
chain = graph.trace_decision_chain(decision_id, max_steps=5)
causality = graph.trace_decision_causality(decision_id, max_depth=5)
influence = ctx.analyze_decision_influence(decision_id, max_depth=3)
```

Output: Reasoning steps, causal antecedents, evidence items, policy compliance per policy.

---

## `reasoning <reasoning_text_or_object>`

Explain any reasoning object — generates natural-language summary and step trace.

```python
from semantica.reasoning.explanation_generator import ExplanationGenerator

gen = ExplanationGenerator()
explanation = gen.generate_explanation(reasoning=reasoning_input)
# explanation.summary, .confidence, .evidence

path = gen.show_reasoning_path(reasoning=reasoning_input)
# path.steps: [Step(type, description, confidence)]
# path.conclusion
```

Output: Summary + step-by-step path + confidence score.

---

## `inference <conclusion> "<reasoning_context>"`

Justify a conclusion against its reasoning context.

```python
from semantica.reasoning.explanation_generator import ExplanationGenerator

gen = ExplanationGenerator()
path = gen.show_reasoning_path(reasoning=reasoning_context)
justification = gen.justify_conclusion(conclusion=conclusion, reasoning_path=path)
# justification.is_justified, .confidence, .supporting_steps, .opposing_factors
```

Output: `JUSTIFIED ✓ | NOT JUSTIFIED ✗ | PARTIAL ⚠` + supporting steps + opposing factors.

---

## `path <n1> <n2>`

Explain the semantic relationship between two nodes.

```python
from semantica.kg.path_finder import PathFinder
from semantica.context import ContextGraph
from semantica.reasoning.explanation_generator import ExplanationGenerator

graph = ContextGraph(advanced_analytics=True)
finder = PathFinder()

paths = finder.find_k_shortest_paths(graph, source=n1, target=n2, k=3)
lengths = [finder.path_length(graph, p) for p in paths]

gen = ExplanationGenerator()
explanation = gen.generate_explanation(reasoning={"paths": paths, "source": n1, "target": n2})
```

Output: Top-3 paths + prose summary + Mermaid sequenceDiagram.

---

## `compliance <decision_id>`

Explain policy compliance status of a decision.

```python
from semantica.context import AgentContext

ctx = AgentContext(decision_tracking=True)
engine = ctx.get_policy_engine()
decision = ctx.query_decisions(query=decision_id, max_hops=1)[0]
applicable = engine.get_applicable_policies(
    category=decision.category,
    entities=decision.metadata.get("entities", []),
)
results = [
    {"policy": p, "compliant": engine.check_compliance(decision, p.policy_id)}
    for p in applicable
]
```

Output: Per-policy COMPLIANT/NON-COMPLIANT + violated rules + remediation suggestions.
"""

SKILLS['change'] = """---
name: change
description: Track, review, and version Semantica knowledge graph changes. Sub-commands: log, diff, rollback, tag. Uses ChangeLog and OntologyVersionManager.
---

# /semantica:change

Track graph versions and changes. Usage: `/semantica:change <sub-command> [args]`

---

## `log [n]`

Show last N change log entries (default: 20).

```python
from semantica.change_management import ChangeLog

log = ChangeLog()
entries = log.get_recent(n=int(args) if args else 20)
```

Return: `| # | Timestamp | Operation | Target | Actor | Version |`

---

## `diff <v1> <v2>`

Structural diff between two versions.

```python
from semantica.change_management import OntologyVersionManager

manager = OntologyVersionManager()
diff = manager.diff(v1, v2)
```

Output: Added/removed/modified classes, properties, and nodes.

---

## `rollback <version>`

> **CONFIRMATION REQUIRED** before proceeding.

Revert graph to a prior version snapshot.

```python
manager.rollback(version)
```

---

## `tag <label>`

Create a named version snapshot.

```python
snapshot_id = manager.create_snapshot(label=label)
```

Output: `Snapshot "<label>" created: <snapshot_id>`
"""

SKILLS['deduplicate'] = """---
name: deduplicate
description: Detect and merge duplicate entities in the Semantica graph. Uses DuplicateDetector.detect_duplicates(entities, threshold=) DIRECTLY — never via methods.py which has infinite recursion bug. Sub-commands: detect, merge, cluster.
---

# /semantica:deduplicate

Detect and merge duplicates. Usage: `/semantica:deduplicate <sub-command> [args]`

> **IMPORTANT**: Always use `DuplicateDetector.detect_duplicates(entities, threshold=)` directly.
> Do NOT use `semantica/deduplication/methods.py detect_duplicates()` — known infinite recursion bug.

---

## `detect [threshold]`

Find duplicate clusters with similarity scores.

```python
from semantica.deduplication import DuplicateDetector
from semantica.context import ContextGraph

graph = ContextGraph()
entities = graph.get_all_entities()
threshold = float(args) if args else 0.85

detector = DuplicateDetector()
clusters = detector.detect_duplicates(entities, threshold=threshold)
```

Output: Cluster list with similarity scores. Suggest `/semantica:deduplicate merge` to resolve.

---

## `merge <entity1> <entity2>`

Merge two entities.

```python
from semantica.deduplication import EntityMerger, MergeStrategy

merger = EntityMerger(strategy=MergeStrategy.KEEP_HIGHEST_CONFIDENCE)
merged = merger.merge(entity1, entity2, graph)
```

Output: `Merged "<e1>" + "<e2>" -> "<merged>" (kept N attributes, resolved M conflicts)`

---

## `cluster`

Group all near-duplicate entity sets.

```python
from semantica.deduplication import ClusterBuilder

builder = ClusterBuilder()
clusters = builder.build_clusters(entities, threshold=0.85)
```

Return: `| Cluster ID | Size | Representative | Members | Avg Similarity |`
"""

SKILLS['export'] = """---
name: export
description: Export the Semantica knowledge graph to multiple formats — rdf (ttl/nt/xml/json-ld), owl, csv, json, parquet, arrow, vector, yaml, report, arango, lpg. RDFExporter.export_to_rdf() returns a string (no output_path param).
---

# /semantica:export

Export the graph. Usage: `/semantica:export <format> [options]`

---

## `rdf [ttl|nt|xml|json-ld]`

```python
from semantica.export import RDFExporter
from semantica.context import ContextGraph

graph = ContextGraph()
exporter = RDFExporter(graph)
# export_to_rdf() RETURNS A STRING — no output_path parameter
# Aliases: "ttl" -> "turtle", "nt", "xml", "json-ld"
rdf_string = exporter.export_to_rdf(data=graph.to_dict(), format=rdf_format or "turtle")
```

Display first 50 lines. If output path provided, write to file.

---

## `owl`

```python
from semantica.export import OWLExporter
owl_str = OWLExporter(graph).export()
```

---

## `csv [node-type]`

```python
from semantica.export import CSVExporter
csv_data = CSVExporter(graph).export(node_type=node_type_filter)
```

---

## `json`

```python
from semantica.export import JSONExporter
json_str = JSONExporter(graph).export()
```

---

## `parquet`

```python
from semantica.export import ParquetExporter
ParquetExporter(graph).export(output_path=path)
```

---

## `arrow`

```python
from semantica.export import ArrowExporter
table = ArrowExporter(graph).export()
```

---

## `vector`

```python
from semantica.export import VectorExporter
VectorExporter(graph).export(output_path=path)
```

---

## `yaml`

```python
from semantica.export import YAMLSchemaExporter
yaml_str = YAMLSchemaExporter(graph).export()
```

---

## `report`

```python
from semantica.export import ReportGenerator
ReportGenerator(graph).generate(output_path=path or "graph_report.html")
```

---

## `arango`

```python
from semantica.export import ArangoAQLExporter
ArangoAQLExporter(graph).export(output_path=path)
```

---

## `lpg`

```python
from semantica.export import LPGExporter
LPGExporter(graph).export(output_path=path)
```

For all formats: report `N nodes, M edges exported` and confirm output location.
"""

SKILLS['ingest'] = """---
name: ingest
description: Ingest documents or structured data into the Semantica graph store. Supports plain text, JSON, CSV, code files. Reports node/edge counts added and any conflicts.
---

# /semantica:ingest

Ingest data into the graph. Usage: `/semantica:ingest <file_path_or_content> [--store <name>]`

---

## Steps

1. Parse `$ARGUMENTS` for `--store <name>` flag (optional).
2. Detect format from file extension (`.txt`, `.md`, `.json`, `.csv`, `.py`).
3. Run ingest pipeline:

```python
from semantica.ingest import DocumentIngestor

ingestor = DocumentIngestor(graph_store=store)
result = ingestor.ingest(content, format=detected_format, source=file_path)
```

4. Report:
```
Ingestion complete:
  Nodes added:   N
  Edges added:   M
  Conflicts:     K
  Source:        <file>
  Graph store:   <store>
```

5. If conflicts detected, list conflicting labels and suggest `/semantica:deduplicate detect`.
"""

SKILLS['ontology'] = """---
name: ontology
description: Generate, validate, evolve, and document Semantica ontologies. Sub-commands: generate, validate, evolve, document, owl, namespace. Uses OntologyGenerator, OntologyValidator, OntologyVersionManager, OWLGenerator, NamespaceManager.
---

# /semantica:ontology

Manage ontologies. Usage: `/semantica:ontology <sub-command> [args]`

---

## `generate <domain>`

Scaffold a domain ontology using LLM-assisted generation.

```python
from semantica.ontology import OntologyGenerator
from semantica.ontology.llm_generator import LLMGenerator

llm_gen = LLMGenerator()
generator = OntologyGenerator(llm=llm_gen)
ontology = generator.generate(domain=domain)
```

Output: Mermaid `classDiagram` + class/property summary. Auto-run `validate` afterward.

---

## `validate`

Validate ontology consistency and competency questions.

```python
from semantica.ontology import OntologyValidator

validator = OntologyValidator()
result = validator.validate()
cq_results = validator.evaluate_competency_questions()
```

Output: Consistency status, unsatisfiable classes, failed competency questions.

---

## `evolve <change-description>`

Apply incremental changes with versioning.

```python
from semantica.ontology import OntologyVersionManager

manager = OntologyVersionManager()
new_version = manager.apply_change(change_description)
```

Output: Diff — classes/properties added, removed, modified.

---

## `document`

Generate human-readable class/property documentation.

```python
from semantica.ontology import OntologyDocumentation

docs = OntologyDocumentation()
output = docs.generate()
```

---

## `owl <output-path>`

Export current ontology to OWL/XML.

```python
from semantica.ontology import OWLGenerator

generator = OWLGenerator()
owl_xml = generator.export()
```

---

## `namespace`

List and resolve all active namespaces.

```python
from semantica.export import NamespaceManager

manager = NamespaceManager()
namespaces = manager.list_namespaces()
```

Return: `| Prefix | URI | Source |`
"""

SKILLS['provenance'] = """---
name: provenance
description: Trace, query, and audit provenance chains across the Semantica graph. Uses GraphBuilderWithProvenance, ContextManagerWithProvenance, ReasoningEngineWithProvenance, NERExtractorWithProvenance. Sub-commands: trace, audit, integrity.
---

# /semantica:provenance

Trace and audit provenance. Usage: `/semantica:provenance <sub-command> [args]`

---

## `trace <node-or-edge>`

Full lineage: what created this node/edge, from what source, via which pipeline step.

```python
from semantica.kg.kg_provenance import GraphBuilderWithProvenance
from semantica.context.context_provenance import ContextManagerWithProvenance
from semantica.semantic_extract.semantic_extract_provenance import NERExtractorWithProvenance
from semantica.reasoning.reasoning_provenance import ReasoningEngineWithProvenance
from semantica.context import ContextGraph

graph = ContextGraph()
kg_prov = GraphBuilderWithProvenance()
ctx_prov = ContextManagerWithProvenance()
```

Output as Markdown timeline:
```
Provenance for "<target>":
  2024-01-15  [NERExtractorWithProvenance]  Extracted from "document.txt"
  2024-03-02  [GraphBuilderWithProvenance]  Added via ingest pipeline
  2024-05-20  [ReasoningEngineWithProvenance]  Enriched by deductive rule
```

---

## `audit <time-range>`

List all graph mutations in a time window.

Parse "YYYY-MM-DD to YYYY-MM-DD" or relative expressions like "last 7 days".

```python
from semantica.kg.kg_provenance import GraphBuilderWithProvenance

prov = GraphBuilderWithProvenance()
summary = prov.get_provenance_summary()
```

Return: `| Timestamp | Operation | Target | Actor | Method | Confidence |`

---

## `integrity`

Check for provenance gaps — nodes/edges without provenance records.

```python
from semantica.provenance import integrity

result = integrity.check()
gaps = result.gaps
```

Output:
```
Provenance Integrity:
  Total nodes:       N
  Covered:           M (X%)
  Gaps:              K
```

Flag as WARNING if gap rate > 5%.
"""

for skill_name, content in SKILLS.items():
    path = os.path.join(base, skill_name, 'SKILL.md')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(content)
    print(f'written: {skill_name}')

print("All done.")
