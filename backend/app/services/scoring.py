import math
from typing import List, Dict, Any
from app.core.config import get_settings
from app.core.logging import logger
from app.schemas.schemas import PostCandidate

settings = get_settings()


class WeightedScorer:
    """Compute weighted score from action predictions."""

    def __init__(self, weights: Dict[str, float] = None):
        self.weights = weights or settings.DEFAULT_WEIGHTS

    def update_weights(self, weights: Dict[str, float]):
        """Update scoring weights dynamically."""
        self.weights = weights

    def score(self, predictions: Dict[str, float]) -> float:
        """
        Compute weighted score from action predictions.

        Formula: Σ(weight_i × P(action_i))
        """
        score = 0.0
        for action, prob in predictions.items():
            weight = self.weights.get(action, 0.0)
            score += weight * prob
        return score

    def score_candidates(
        self, candidates: List[PostCandidate], predictions: List[Dict[str, float]]
    ) -> List[tuple[PostCandidate, float]]:
        """Score all candidates and return sorted list."""
        scored = []
        for candidate, pred in zip(candidates, predictions):
            score = self.score(pred)
            scored.append((candidate, score))

        # Sort by score descending
        scored.sort(key=lambda x: x[1], reverse=True)
        return scored


class AuthorDiversityScorer:
    """Apply diversity penalty so one author doesn't dominate the feed.

    Formula: multiplier = (1.0 - floor) * decay^position + floor
    where `position` is how many times this author has already appeared
    in the ranked list above the current post.
    """

    def __init__(
        self,
        decay_factor: float = 0.7,
        floor: float = 0.3,
    ):
        self.decay_factor = decay_factor
        self.floor = floor

    def apply(
        self, scored_candidates: List[tuple[PostCandidate, float]]
    ) -> List[tuple[PostCandidate, float]]:
        """Re-score candidates with author diversity penalty."""
        author_counts: Dict[str, int] = {}
        result: List[tuple[PostCandidate, float]] = []

        for candidate, score in scored_candidates:
            author_key = str(candidate.author_id)
            position = author_counts.get(author_key, 0)

            multiplier = (1.0 - self.floor) * (self.decay_factor ** position) + self.floor
            adjusted_score = score * multiplier

            author_counts[author_key] = position + 1
            result.append((candidate, adjusted_score))

        # Re-sort after adjustment
        result.sort(key=lambda x: x[1], reverse=True)
        return result


class OONScorer:
    """Apply a weight factor to out-of-network posts.

    In-network posts keep their score; OON posts are scaled by
    `weight_factor` (< 1.0 means slight preference for in-network).
    """

    def __init__(self, weight_factor: float = 0.8):
        self.weight_factor = weight_factor

    def apply(
        self, scored_candidates: List[tuple[PostCandidate, float]]
    ) -> List[tuple[PostCandidate, float]]:
        result = []
        for candidate, score in scored_candidates:
            if not candidate.is_in_network:
                score *= self.weight_factor
            result.append((candidate, score))

        result.sort(key=lambda x: x[1], reverse=True)
        return result


class ScorerPipeline:
    """Pipeline for scoring candidates through multiple scoring stages."""

    def __init__(self, weights: Dict[str, float] = None):
        self.weighted_scorer = WeightedScorer(weights)
        self.author_diversity = AuthorDiversityScorer()
        self.oon_scorer = OONScorer()

    def score(
        self, candidates: List[PostCandidate], predictions: List[Dict[str, float]]
    ) -> List[tuple[PostCandidate, float]]:
        """Run full scoring pipeline: weighted → diversity → OON."""
        # Stage 1: Weighted scoring from action predictions
        scored = self.weighted_scorer.score_candidates(candidates, predictions)

        # Stage 2: Author diversity penalty
        scored = self.author_diversity.apply(scored)

        # Stage 3: Out-of-network weight adjustment
        scored = self.oon_scorer.apply(scored)

        return scored
