from typing import Protocol


class AIProvider(Protocol):
    """Minimal backend generation boundary for Monica's provider layer."""

    def generate(self, prompt: str) -> str:
        """Generate an answer from a grounded prompt."""


class PlaceholderAIProvider:
    """
    Temporary provider used until the Gemini/platform service is connected.

    This keeps Somaya's query orchestration provider-ready without owning API
    keys, deployment, logging, or external provider error handling.
    """

    def generate(self, prompt: str) -> str:
        return "Provider not connected."
