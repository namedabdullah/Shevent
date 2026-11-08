# Shevent model server. Build from the repo root: the server needs ml/ (code, configs and trained artifacts), the
# reference data and the demo vendors.
#   docker build -f server/Dockerfile -t shevent-server .
#   docker run -p 8000:8000 -e SUPABASE_URL=... -e SUPABASE_KEY=... shevent-server
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
# LightGBM needs OpenMP.
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 && rm -rf /var/lib/apt/lists/*

# Free hosts (Hugging Face Spaces) run containers as uid 1000.
RUN useradd --create-home --uid 1000 app
WORKDIR /srv

# CPU-only PyTorch for #1: the default wheel bundles CUDA and is several GB.
RUN pip install --index-url https://download.pytorch.org/whl/cpu "torch>=2.3"

# Editable installs: shevent_ml finds configs, reference data and artifacts relative to the repo layout.
COPY ml/pyproject.toml ml/pyproject.toml
COPY ml/shevent_ml ml/shevent_ml
COPY server/pyproject.toml server/pyproject.toml
COPY server/app server/app
RUN pip install -e ./ml -e ./server

COPY ml/configs ml/configs
COPY ml/artifacts ml/artifacts
COPY data/reference data/reference
COPY packages/core/fixtures/vendors.json packages/core/fixtures/vendors.json
RUN mkdir -p data/feedback && chown app data/feedback

USER app
ENV FEEDBACK_PATH=/srv/data/feedback/feedback.jsonl PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --app-dir server --host 0.0.0.0 --port ${PORT}"]
