"""A minimal client for a local Ollama server (https://ollama.com): chat with a JSON schema, nothing else.

Uses only the standard library, so the pipeline needs no extra package. Install Ollama and pull the model once:
    ollama pull qwen2.5:7b-instruct
"""

import json
import urllib.error
import urllib.request


class OllamaError(RuntimeError):
    pass


def _request(url, payload=None, timeout=30):
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (local server URL from config)
            return json.loads(response.read())
    except urllib.error.URLError as error:
        raise OllamaError(f"Ollama isn't answering at {url}: {error}. Is the Ollama app running?") from error


def check_model(settings):
    """Raises OllamaError with what to do if the server is down or the model hasn't been pulled."""
    models = [m["name"] for m in _request(f"{settings['url']}/api/tags").get("models", [])]
    wanted = settings["model"]
    if wanted not in models and f"{wanted}:latest" not in models:
        raise OllamaError(f"Model {wanted} isn't pulled yet. Run: ollama pull {wanted}")


def chat_json(messages, schema, settings):
    """Sends the chat and returns the reply parsed as JSON. The schema constrains the reply (structured outputs).

    Temperature 0 and a fixed seed, so the same review gets the same draft.
    """
    reply = _request(
        f"{settings['url']}/api/chat",
        {
            "model": settings["model"],
            "messages": messages,
            "format": schema,
            "stream": False,
            "options": {"temperature": 0, "seed": 42},
        },
        timeout=settings["timeout_seconds"],
    )
    content = reply.get("message", {}).get("content", "")
    try:
        return json.loads(content)
    except json.JSONDecodeError as error:
        raise OllamaError(f"The model's reply wasn't JSON: {content[:200]!r}") from error
