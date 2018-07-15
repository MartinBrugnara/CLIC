# VERSION TAG support variables
TAG := $(shell git tag -l --points-at HEAD | head -n1)
COMMIT := $(shell git rev-parse --short HEAD)
BUILD_DATE := $$(date +'%Y%m%d%H%M%S')
GIT_VERSION := $(shell echo "$(TAG)_$(BUILD_DATE)-$(COMMIT)" | sed 's@^_@@' | cut -d '_' -f 1)
DIRTY := $(shell [ -z "$$(git status --porcelain)" ] && echo '' || echo "_dirty")
VERSION := $(GIT_VERSION)$(DIRTY)

# Bulding options
PACKAGE_OPT = electron-packager . --prune=true --ignore=extra --ignore=builds --ignore=releases --overwrite --out builds/
WIN_OPT = --icon=src/assets/icons/win/clic.ico --version-string.CompanyName="University of Trento" --version-string.FileDescription="" --version-string.ProductName="CLIC what if?"

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

# ----------------------------------------------------------------------------- 
# Cleaning 
clean: ## Remove all builds
	# For some strange reason, it must be executed twice.
	rm -rf builds &>/dev/null || 1
	rm -rf builds

purge-releases: ## Remove all releases
	# For some strange reason, it must be executed twice.
	rm -rf releases &> /dev/null || 1
	rm -rf releases

# ----------------------------------------------------------------------------- 
# Bulding targets
build: osx linux-64 linux-32 win-64 win-32 apply-license ## Build for all os/arch
	@echo "Done building; artifacts available in ./builds/"

builds:
	mkdir -p builds

compile: ## Compile typescript and run webpack
	npm run compile

osx: builds compile
	$(PACKAGE_OPT) --platform=darwin --arch=x64 --icon=src/assets/icons/mac/clic.icns

linux-64: builds compile
	$(PACKAGE_OPT) --platform=linux  --arch=x64  --icon=src/assets/icons/png/1024x1024.png

linux-32: builds compile
	$(PACKAGE_OPT) --platform=linux  --arch=ia32 --icon=src/assets/icons/png/1024x1024.png

win-64: builds compile
	$(PACKAGE_OPT) $(WIN_OPT) --platform=win32  --arch=x64

win-32: builds compile
	$(PACKAGE_OPT) $(WIN_OPT) --platform=win32  --arch=ia32

apply-license:
	for b in builds/*; do \
		[ -f $$b/LICENSE.electron ] || mv $$b/LICENSE{,.electron}; \
		[ -f $$b/version.electron ] || mv $$b/version{,.electron}; \
		cp -v LICENSE COPYRIGHT.md $$b; \
	done 


# ----------------------------------------------------------------------------- 
# Releasing 
release: ## Release packages for all built os/arch
	@echo "Release completed. Archives at ./releases/$(VERSION)/"
	mkdir -p releases/$(VERSION)
	# Should never happen ... but, better no mixing up.
	rm -rf releases/$(VERSION)/*
	# Creating archives for each existing build.
	cd builds && \
	for b in *; do \
		dist=$$(echo "$$b" | cut -d"-" -f 2-); \
		zip -q -X -r ../releases/$(VERSION)/clic-$(VERSION)-$$dist.zip $$b -x "*.DS_Store" -x "__MACOSX"; \
		tar --exclude "*.DS_Store" --exclude "__MACOSX" \
				-czf ../releases/$(VERSION)/clic-$(VERSION)-$$dist.tar.gz $$b; \
	done
	cd releases/$(VERSION) && shasum * > clic-$(VERSION).sha
