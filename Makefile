ZIPFILE := afesbrand-overleaf-helper.zip

SOURCES := \
	manifest.json \
	content_script.js \
	background.js \
	interceptor.js \
	popup.html \
	popup.js \
	icons/icon16.png \
	icons/icon32.png \
	icons/icon48.png \
	icons/icon128.png \
	icons/arrow-square-out-fill.svg \
	icons/box-arrow-up-fill.svg \
	icons/file-pdf-fill.svg \
	icons/file-png-fill.svg \
	icons/file-svg-fill.svg \
	icons/image-square-fill.svg \
	icons/shapes-fill.svg \
	icons/question-fill.svg

.PHONY: pack clean

pack: $(ZIPFILE)

$(ZIPFILE): $(SOURCES)
	rm -f $@
	zip $@ manifest.json content_script.js background.js interceptor.js popup.html popup.js
	zip -r $@ icons/

clean:
	rm -f $(ZIPFILE)
