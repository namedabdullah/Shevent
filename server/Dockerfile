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

# Only the libraries the server loads (ml/pyproject.toml and server/pyproject.toml, same version limits). The rest of
# ml's dependencies (MLflow, OpenCLIP, image and workbook tools) are for training and data work, and roughly double
# the download; server/tests/test_api.py checks the server never imports them. #7 (/v1/portfolio/check) needs the
# photo index, open-clip-torch and its weights, none of which are in this image, so there it answers 503.
RUN pip install "numpy>=1.26" "pandas>=2.2" "pyarrow>=15" "pydantic>=2.7" "pyyaml>=6.0" "hijridate>=2.5" \
    "lightgbm>=4.3" "ortools>=9.10,<9.13" "scikit-learn>=1.4" "fastapi>=0.115,<1" "uvicorn>=0.30" "httpx>=0.27" \
    "python-dotenv>=1.0" "python-multipart>=0.0.9"

# Editable installs: shevent_ml finds configs, reference data and artifacts relative to the repo layout.
COPY ml/pyproject.toml ml/pyproject.toml
COPY ml/shevent_ml ml/shevent_ml
COPY server/pyproject.toml server/pyproject.toml
COPY server/app server/app
RUN pip install --no-deps -e ./ml -e ./server

COPY ml/configs ml/configs
COPY ml/artifacts ml/artifacts
COPY data/reference data/reference
COPY packages/core/fixtures/vendors.json packages/core/fixtures/vendors.json
RUN mkdir -p data/feedback && chown app data/feedback

USER app
ENV FEEDBACK_PATH=/srv/data/feedback/feedback.jsonl PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --app-dir server --host 0.0.0.0 --port ${PORT}"]
