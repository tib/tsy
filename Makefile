SHELL=/bin/bash

dev:
	toucan generate .
	mkdir -p dist/animations
	cp animations/*.html dist/animations/

dist:
	toucan generate . --target live

serve:
	toucan serve ./dist -p 3000

watch:
	toucan watch .
