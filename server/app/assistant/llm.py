"""A small client for a local Ollama server (free, open-weight models; nothing leaves the machine)."""

import json

import httpx


class LLMUnavailable(Exception):
    """Ollama isn't running, the model isn't pulled, or it took too long."""


class OllamaClient:
    def __init__(
        self, url="http://127.0.0.1:11434", model="qwen2.5:3b-instruct", timeout=60.0, client=None, keep_alive="30m"
    ):
        """keep_alive: how long Ollama keeps the model in memory after a call (loading it again takes seconds, or
        minutes on a laptop short of memory)."""
        self.url, self.model, self.keep_alive = url.rstrip("/"), model, keep_alive
        self.client = client or httpx.Client(timeout=timeout)

    @property
    def version(self):
        return self.model

    def warm_up(self):
        """Loads the model without generating anything, so the first host doesn't wait for it."""
        response = self.client.post(
            f"{self.url}/api/chat", json={"model": self.model, "messages": [], "keep_alive": self.keep_alive}
        )
        response.raise_for_status()

    def chat(self, messages, schema=None, max_tokens=300):
        """One reply, deterministic (temperature 0, fixed seed). With a JSON schema, Ollama constrains the output to
        it and the parsed object comes back; otherwise the text."""
        body = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "keep_alive": self.keep_alive,
            "options": {"temperature": 0, "seed": 0, "num_ctx": 4096, "num_predict": max_tokens},
        }
        if schema is not None:
            body["format"] = schema
        try:
            response = self.client.post(f"{self.url}/api/chat", json=body)
            response.raise_for_status()
        except httpx.HTTPError as error:
            raise LLMUnavailable(f"Ollama ({self.model}) didn't answer: {error}") from error
        content = response.json()["message"]["content"]
        if schema is None:
            return content.strip()
        try:
            return json.loads(content)
        except json.JSONDecodeError as error:
            raise ValueError(f"The model's output isn't JSON: {content[:200]}") from error
