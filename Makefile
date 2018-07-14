
TAG := $(shell git tag -l --points-at HEAD | head -n1)
COMMIT := $(shell git rev-parse --short HEAD)
BUILD_DATE := $$(date +'%Y%m%d%H%M%S')
GIT_VERSION := $(shell echo "$(TAG)_$(BUILD_DATE)-$(COMMIT)" | sed 's@^_@@' | cut -d '_' -f 1)
DIRTY := $(shell [ -z "$$(git status --porcelain)" ] && echo '' || echo "_dirty")
VERSION := $(GIT_VERSION)$(DIRTY)

help:
	@echo "Available commands:"
	@tail -n+7 $(MAKEFILE_LIST) | grep ':' | cut -d ':' -f 1 | sort

release:
	# Be sure dir for current build exists
	mkdir -p "releases/$(VERSION)"
	# Be sure not to mix up stuff
	rm -rf "releases/$(VERSION)/"*
	# not to be used direcly
	zip -r "releases/$(VERSION)/clic-$(VERSION)-osx.zip"       "release-builds/clic-what-if-darwin-x64" -x "*.DS_Store" 
	zip -r "releases/$(VERSION)/clic-$(VERSION)-linux.zip"     "release-builds/clic-what-if-linux-ia32" -x "*.DS_Store" 
	zip -r "releases/$(VERSION)/clic-$(VERSION)-linux-x64.zip" "release-builds/clic-what-if-linux-x64"  -x "*.DS_Store" 
	zip -r "releases/$(VERSION)/clic-$(VERSION)-win.zip"       "release-builds/clic-what-if-win32-ia32" -x "*.DS_Store" 
	zip -r "releases/$(VERSION)/clic-$(VERSION)-win-x64.zip"   "release-builds/clic-what-if-win32-x64"  -x "*.DS_Store" 
	# not to be used direcly
	tar --exclude "*.DS_Store" -czf "releases/$(VERSION)/clic-$(VERSION)-osx.tar.gz"        "release-builds/clic-what-if-darwin-x64"
	tar --exclude "*.DS_Store" -czf "releases/$(VERSION)/clic-$(VERSION)-linux.tar.gz"      "release-builds/clic-what-if-linux-ia32"
	tar --exclude "*.DS_Store" -czf "releases/$(VERSION)/clic-$(VERSION)-linux-x64_.tar.gz" "release-builds/clic-what-if-linux-x64" 
	tar --exclude "*.DS_Store" -czf "releases/$(VERSION)/clic-$(VERSION)-win.tar.gz"        "release-builds/clic-what-if-win32-ia32"
	tar --exclude "*.DS_Store" -czf "releases/$(VERSION)/clic-$(VERSION)-win-x64.tar.gz"    "release-builds/clic-what-if-win32-x64" 
	# sha
	cd releases && shasum * > clic_$(VERSION).sha
	

clean-releases:
	rm -rf releases/*

all: compile osx linux-64 linux-32 win-64 win-32
	@echo "Bulding and packaging for all architectures"

all-64: compile osx linux-64 win-64
	@echo "Bulding and packaging for all x64"

clean:
	# For some strange reason shall run twice
	rm -rf release-builds/* || 1 &>/dev/null
	rm -rf release-builds/*

release-builds:
	mkdir -p release-builds

compile:
	npm run compile

osx: release-builds
	npm run package-mac

linux-64: release-builds
	npm run package-linux-64

linux-32: release-builds
	npm run package-linux-32

win-64: release-builds
	npm run package-win-64 

win-32: release-builds
	npm run package-win-32 
