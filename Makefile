.PHONY: help install smoke import embeddings stats patterns build-data dev replay clean

# Use the project venv's python if it exists, otherwise system python3.
PY ?= $(shell [ -x .venv/bin/python ] && echo .venv/bin/python || echo python3)

help:
	@echo "ShotSense Scout - common tasks"
	@echo ""
	@echo "  make install       Install Python agent deps (pymongo, dotenv, gemini)"
	@echo "  make smoke         Smoke-test the Atlas connection (NO writes)"
	@echo "  make import        Import shots + players from frontend/lib/data/ JSON"
	@echo "  make embeddings    Generate Gemini embeddings for shots.summary"
	@echo "  make dev           Run the Next.js dev server (frontend)"
	@echo "  make replay        Open the replay-mode demo URL in default browser"
	@echo ""
	@echo "Order of operations for first-time setup:"
	@echo "  1. Fill in .env (cp .env.example .env)"
	@echo "  2. make install"
	@echo "  3. make smoke"
	@echo "  4. make import"
	@echo "  5. Create the Atlas Vector Search index (see README)"
	@echo "  6. make embeddings"
	@echo "  7. make smoke    (confirm 100% embedded)"

install:
	@if [ ! -d .venv ]; then python3 -m venv .venv; fi
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r requirements-agent.txt

smoke:
	$(PY) scripts/smoke_mongodb.py

import:
	$(PY) scripts/import_to_mongodb.py

embeddings:
	$(PY) scripts/build_embeddings.py

stats:
	$(PY) scripts/build_stats.py

patterns:
	$(PY) scripts/detect_patterns.py

build-data: stats patterns

dev:
	cd frontend && npm run dev

replay:
	@echo "Make sure 'make dev' is running in another terminal."
	@open "http://localhost:3000/?replay=brunson-toughest" 2>/dev/null \
	  || xdg-open "http://localhost:3000/?replay=brunson-toughest" 2>/dev/null \
	  || echo "Open this URL manually: http://localhost:3000/?replay=brunson-toughest"

clean:
	@rm -f scripts/.embedding-checkpoint.json
	@echo "Cleaned embedding checkpoint. (.venv left intact)"
