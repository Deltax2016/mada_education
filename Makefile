API := apps/api
WEB := apps/web
PY  := $(API)/.venv/bin/python

.PHONY: help setup up down seed api web dev build typecheck test clean

help:
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

setup: ## Install dependencies for both apps
	cd $(API) && uv venv --python 3.12 && uv pip install -e .
	cd $(WEB) && npm install

up: ## Start local infrastructure (postgres, redis, minio, mailpit)
	docker compose -f docker/compose.dev.yaml up -d

down: ## Stop local infrastructure
	docker compose -f docker/compose.dev.yaml down

load-content: ## Add any missing course to an existing catalogue, safe on production
	cd $(API) && .venv/bin/python -m src.load_content

seed: ## Reset the database and load the bilingual demo course
	cd $(API) && .venv/bin/python -m src.seed

api: ## Run the API with reload
	cd $(API) && .venv/bin/python -m uvicorn src.main:app --reload --port 8010

web: ## Run the web app with reload
	cd $(WEB) && npm run dev

dev: ## Run api and web together
	@$(MAKE) -j2 api web

build: ## Verify the production build (writes to .next-check, leaves dev alone)
	cd $(WEB) && npm run build:check

typecheck: ## Typecheck the web app
	rm -rf $(WEB)/.next/types
	cd $(WEB) && npx tsc --noEmit

storage-check: ## Verify the R2 or MinIO credentials with a real round trip
	cd $(API) && .venv/bin/python ../../scripts/check_storage.py

test: ## Reset fixtures and smoke test the API end to end
	@$(MAKE) seed
	./scripts/smoke.sh

clean:
	rm -rf $(WEB)/.next $(WEB)/.next-check $(API)/mada.db
