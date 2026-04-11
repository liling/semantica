"""
OWL/RDF Generation Module

This module provides OWL and RDF generation capabilities using rdflib for ontology
serialization. It supports multiple RDF formats and provides fallback string-based
generation when rdflib is not available.

Key Features:
    - OWL ontology generation using rdflib
    - RDF serialization in multiple formats (Turtle, RDF/XML, JSON-LD, N3)
    - Namespace management and prefix handling
    - Ontology validation and consistency checking
    - Export to various RDF formats
    - Performance optimization for large ontologies
    - Fallback string-based generation without rdflib

Main Classes:
    - OWLGenerator: Generator for OWL/RDF serialization

Example Usage:
    >>> from semantica.ontology import OWLGenerator
    >>> generator = OWLGenerator()
    >>> turtle = generator.generate_owl(ontology, format="turtle")
    >>> generator.export_owl(ontology, "ontology.ttl", format="turtle")

Author: Semantica Contributors
License: MIT
"""

from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from ..utils.exceptions import ProcessingError, ValidationError
from ..utils.helpers import ensure_directory
from ..utils.logging import get_logger
from ..utils.progress_tracker import get_progress_tracker
from .namespace_manager import NamespaceManager

# Optional rdflib import
try:
    from rdflib import OWL, RDF, RDFS, XSD, Graph, Literal, Namespace, URIRef
    from rdflib.namespace import NamespaceManager as RDFNamespaceManager

    HAS_RDFLIB = True
except (ImportError, OSError):
    HAS_RDFLIB = False
    Graph = None
    RDF = None
    RDFS = None
    OWL = None


class OWLGenerator:
    """
    OWL/RDF generation engine.

    • OWL ontology generation using rdflib
    • RDF serialization in multiple formats
    • Namespace management and prefix handling
    • Ontology validation and consistency checking
    • Export to various RDF formats
    • Performance optimization for large ontologies
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None, **kwargs):
        """
        Initialize OWL generator.

        Args:
            config: Configuration dictionary
            **kwargs: Additional configuration options:
                - namespace_manager: Namespace manager instance
                - format: Default output format (default: 'turtle')
        """
        self.logger = get_logger("owl_generator")
        self.config = config or {}
        self.config.update(kwargs)

        # Initialize progress tracker
        self.progress_tracker = get_progress_tracker()
        # Ensure progress tracker is enabled
        if not self.progress_tracker.enabled:
            self.progress_tracker.enabled = True

        self.namespace_manager = self.config.get(
            "namespace_manager"
        ) or NamespaceManager(**self.config)
        self.default_format = self.config.get("format", "turtle")

        if not HAS_RDFLIB:
            self.logger.warning(
                "rdflib not installed. OWL generation will use basic string formatting."
            )

    def generate_owl(
        self, ontology: Dict[str, Any], format: Optional[str] = None, **options
    ) -> Union[str, Graph]:
        """
        Generate OWL from ontology dictionary.

        Converts an ontology dictionary to OWL/RDF format. Uses rdflib if available,
        otherwise falls back to basic string formatting.

        Args:
            ontology: Ontology dictionary containing:
                - uri: Ontology URI
                - name: Ontology name
                - version: Version string
                - classes: List of class definitions
                - properties: List of property definitions
            format: Output format ('turtle', 'rdfxml', 'json-ld', 'n3', default: 'turtle')
            **options: Additional options (currently unused)

        Returns:
            OWL serialization string (if rdflib not available or format specified)
            or rdflib Graph object (if rdflib available and no format specified)

        Example:
            ```python
            turtle = generator.generate_owl(ontology, format="turtle")
            graph = generator.generate_owl(ontology)  # Returns Graph if rdflib available
            ```
        """
        tracking_id = self.progress_tracker.start_tracking(
            module="ontology",
            submodule="OWLGenerator",
            message=f"Generating OWL in {format or self.default_format} format",
        )

        try:
            output_format = format or self.default_format

            if HAS_RDFLIB:
                self.progress_tracker.update_tracking(
                    tracking_id, message="Generating OWL with rdflib..."
                )
                result = self._generate_with_rdflib(
                    ontology, format=output_format, **options
                )
            else:
                self.progress_tracker.update_tracking(
                    tracking_id, message="Generating OWL with basic formatting..."
                )
                result = self._generate_basic(ontology, format=output_format, **options)

            self.progress_tracker.stop_tracking(
                tracking_id,
                status="completed",
                message=f"Generated OWL with {len(ontology.get('classes', []))} classes, {len(ontology.get('properties', []))} properties",
            )
            return result

        except Exception as e:
            self.progress_tracker.stop_tracking(
                tracking_id, status="failed", message=str(e)
            )
            raise

    @staticmethod
    def _as_list(value: Any) -> List[Any]:
        """Normalize scalar-or-list ontology values to a list."""
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]

    @staticmethod
    def _is_datatype_property(prop_type: Any) -> bool:
        """Return True for supported datatype property aliases."""
        return str(prop_type or "").strip().lower() in {
            "datatype",
            "data",
            "datatypeproperty",
        }

    def _generate_with_rdflib(
        self, ontology: Dict[str, Any], format: str = "turtle", **options
    ) -> Union[str, Graph]:
        """Generate OWL using rdflib."""
        g = Graph()

        # Set up namespaces
        ns_manager = RDFNamespaceManager(g)

        # Register standard namespaces
        for prefix, uri in self.namespace_manager.get_all_namespaces().items():
            ns = Namespace(uri)
            ns_manager.bind(prefix, ns)
            g.bind(prefix, ns)

        # Register ontology namespace
        base_uri = ontology.get("uri") or self.namespace_manager.get_base_uri()
        ont_ns = Namespace(base_uri)
        g.bind("", ont_ns)

        # Create ontology resource
        ont_uri = URIRef(base_uri)
        g.add((ont_uri, RDF.type, OWL.Ontology))

        # Add ontology metadata
        if ontology.get("name"):
            g.add((ont_uri, RDFS.label, Literal(ontology["name"])))
        if ontology.get("version"):
            g.add((ont_uri, OWL.versionInfo, Literal(ontology["version"])))

        # Add classes
        classes = ontology.get("classes", [])
        for cls in classes:
            class_name = cls.get("name") or cls.get("label")
            class_uri = URIRef(
                cls.get("uri")
                or self.namespace_manager.generate_class_iri(class_name)
            )
            g.add((class_uri, RDF.type, OWL.Class))

            class_label = cls.get("label") or cls.get("name")
            if class_label:
                g.add((class_uri, RDFS.label, Literal(class_label)))
            if cls.get("comment"):
                g.add((class_uri, RDFS.comment, Literal(cls["comment"])))

            # Add subclass relationships
            subclass_of = cls.get("subClassOf") or cls.get("subclassOf")
            if subclass_of:
                parent_uri = URIRef(subclass_of)
                g.add((class_uri, RDFS.subClassOf, parent_uri))

        # Add object properties
        properties = ontology.get("properties", [])
        for prop in properties:
            if prop.get("type") == "object":
                prop_uri = URIRef(
                    prop.get("uri")
                    or self.namespace_manager.generate_property_iri(
                        prop.get("name") or prop.get("label")
                    )
                )
                g.add((prop_uri, RDF.type, OWL.ObjectProperty))

                prop_label = prop.get("label") or prop.get("name")
                if prop_label:
                    g.add((prop_uri, RDFS.label, Literal(prop_label)))

                # Add domain
                domains = self._as_list(prop.get("domain", []))
                for domain in domains:
                    domain_uri = URIRef(
                        domain
                        if domain.startswith("http")
                        else self.namespace_manager.generate_class_iri(domain)
                    )
                    g.add((prop_uri, RDFS.domain, domain_uri))

                # Add range
                ranges = self._as_list(prop.get("range", []))
                for range_val in ranges:
                    range_uri = URIRef(
                        range_val
                        if range_val.startswith("http")
                        else self.namespace_manager.generate_class_iri(range_val)
                    )
                    g.add((prop_uri, RDFS.range, range_uri))

            elif self._is_datatype_property(prop.get("type")):
                prop_uri = URIRef(
                    prop.get("uri")
                    or self.namespace_manager.generate_property_iri(
                        prop.get("name") or prop.get("label")
                    )
                )
                g.add((prop_uri, RDF.type, OWL.DatatypeProperty))

                prop_label = prop.get("label") or prop.get("name")
                if prop_label:
                    g.add((prop_uri, RDFS.label, Literal(prop_label)))

                # Add domain
                domains = self._as_list(prop.get("domain", []))
                for domain in domains:
                    domain_uri = URIRef(
                        domain
                        if domain.startswith("http")
                        else self.namespace_manager.generate_class_iri(domain)
                    )
                    g.add((prop_uri, RDFS.domain, domain_uri))

                # Add range
                range_type = prop.get("range", "xsd:string")
                if range_type.startswith("xsd:"):
                    range_uri = XSD[range_type.replace("xsd:", "")]
                else:
                    range_uri = URIRef(range_type)
                g.add((prop_uri, RDFS.range, range_uri))

        # Serialize
        if format == "turtle":
            return g.serialize(format="turtle")
        elif format == "rdfxml":
            return g.serialize(format="xml")
        elif format == "json-ld":
            return g.serialize(format="json-ld")
        elif format == "n3":
            return g.serialize(format="n3")
        else:
            return g.serialize(format=format)

    def _generate_basic(
        self, ontology: Dict[str, Any], format: str = "turtle", **options
    ) -> str:
        """Generate OWL using basic string formatting (fallback)."""
        lines = []

        # Namespace declarations
        base_uri = ontology.get("uri") or self.namespace_manager.get_base_uri()
        lines.append(f"@prefix : <{base_uri}> .")
        lines.append("@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .")
        lines.append("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")
        lines.append("@prefix owl: <http://www.w3.org/2002/07/owl#> .")
        lines.append("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .")
        lines.append("")

        # Ontology declaration
        lines.append(f"<{base_uri}> a owl:Ontology ;")
        if ontology.get("name"):
            lines.append(f'    rdfs:label "{ontology["name"]}" ;')
        if ontology.get("version"):
            lines.append(f'    owl:versionInfo "{ontology["version"]}" .')
        lines.append("")

        # Classes
        classes = ontology.get("classes", [])
        for cls in classes:
            class_name = cls.get("name") or cls.get("label")
            class_uri = cls.get("uri") or self.namespace_manager.generate_class_iri(
                class_name
            )
            lines.append(f"<{class_uri}> a owl:Class ;")
            class_label = cls.get("label") or cls.get("name")
            if class_label:
                lines.append(f'    rdfs:label "{class_label}" ;')
            if cls.get("comment"):
                lines.append(f'    rdfs:comment "{cls["comment"]}" ;')
            subclass_of = cls.get("subClassOf") or cls.get("subclassOf")
            if subclass_of:
                parent_uri = subclass_of
                lines.append(f"    rdfs:subClassOf <{parent_uri}> .")
            else:
                lines[-1] = lines[-1].rstrip(" ;") + " ."
            lines.append("")

        # Properties
        properties = ontology.get("properties", [])
        for prop in properties:
            prop_uri = prop.get("uri") or self.namespace_manager.generate_property_iri(
                prop.get("name") or prop.get("label")
            )
            prop_type = (
                "owl:ObjectProperty"
                if prop.get("type") == "object"
                else "owl:DatatypeProperty"
            )
            lines.append(f"<{prop_uri}> a {prop_type} ;")
            prop_label = prop.get("label") or prop.get("name")
            if prop_label:
                lines.append(f'    rdfs:label "{prop_label}" ;')

            # Domain
            domains = self._as_list(prop.get("domain", []))
            for domain in domains:
                domain_uri = (
                    domain
                    if domain.startswith("http")
                    else self.namespace_manager.generate_class_iri(domain)
                )
                lines.append(f"    rdfs:domain <{domain_uri}> ;")

            # Range
            ranges = self._as_list(prop.get("range", []))
            for range_val in ranges:
                if self._is_datatype_property(prop.get("type")) and range_val.startswith(
                    "xsd:"
                ):
                    lines.append(
                        f"    rdfs:range {range_val.replace('xsd:', 'xsd:')} ;"
                    )
                else:
                    range_uri = (
                        range_val
                        if range_val.startswith("http")
                        else self.namespace_manager.generate_class_iri(range_val)
                    )
                    lines.append(f"    rdfs:range <{range_uri}> ;")

            lines[-1] = lines[-1].rstrip(" ;") + " ."
            lines.append("")

        return "\n".join(lines)

    def export_owl(
        self,
        ontology: Dict[str, Any],
        file_path: Union[str, Path],
        format: Optional[str] = None,
        **options,
    ) -> None:
        """
        Export ontology to OWL file.

        Args:
            ontology: Ontology dictionary
            file_path: Output file path
            format: Output format
            **options: Additional options
        """
        tracking_id = self.progress_tracker.start_tracking(
            module="ontology",
            submodule="OWLGenerator",
            message=f"Exporting OWL to {file_path}",
        )

        try:
            file_path = Path(file_path)
            ensure_directory(file_path.parent)

            self.progress_tracker.update_tracking(
                tracking_id, message="Generating OWL content..."
            )
            owl_content = self.generate_owl(ontology, format=format, **options)

            self.progress_tracker.update_tracking(
                tracking_id, message="Writing to file..."
            )
            if isinstance(owl_content, str):
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(owl_content)
            else:
                # Graph object
                output_format = format or self.default_format
                owl_content.serialize(destination=str(file_path), format=output_format)

            self.logger.info(f"Exported OWL to: {file_path}")
            self.progress_tracker.stop_tracking(
                tracking_id, status="completed", message=f"Exported OWL to {file_path}"
            )

        except Exception as e:
            self.progress_tracker.stop_tracking(
                tracking_id, status="failed", message=str(e)
            )
            raise
