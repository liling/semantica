"""
Backward-compatible import shim for temporal reasoning.

Canonical implementation lives in ``semantica.reasoning.temporal_reasoning``.
"""

from ..reasoning.temporal_reasoning import IntervalRelation, TemporalInterval, TemporalReasoningEngine

__all__ = ["TemporalInterval", "IntervalRelation", "TemporalReasoningEngine"]
