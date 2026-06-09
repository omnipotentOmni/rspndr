PORT ?= 4173

dev:
	python3 -m http.server $(PORT)

test:
	python3 -c "from pathlib import Path; [Path(p).exists() or (_ for _ in ()).throw(AssertionError(f'missing {p}')) for p in ['ui/index.html','ui/styles.css','ui/app.js','plugin/code.js','manifest.json','README.md']]; print('basic file checks: ok')"

lint:
	python3 -c "from pathlib import Path; text = Path('ui/app.js').read_text(); assert 'TODO' not in text; assert 'console.log(' not in text; print('basic lint checks: ok')"
