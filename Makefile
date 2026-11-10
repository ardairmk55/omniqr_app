.PHONY: run test lint css
run:
	flask --app app:create_app run
test:
	pytest
lint:
	ruff check app tests
css:
	npm run build:css
