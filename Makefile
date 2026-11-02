SHELL=/bin/bash

dev:
	toucan generate .
	cp preview-*.html dist/

dist:
	toucan generate . --target live

serve:
	toucan serve ./dist -p 3000

watch:
	toucan watch .
