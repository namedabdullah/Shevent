-- Runs once, when the postgres volume is first created (docker-compose.yml).
-- pgvector stores CLIP image embeddings for #7 Verified Portfolios.
CREATE EXTENSION IF NOT EXISTS vector;
