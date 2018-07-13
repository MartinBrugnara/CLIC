# @grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

help:
	@echo "Available commands:"
	@tail -n+7 $(MAKEFILE_LIST) | grep ':' | cut -d ':' -f 1 | sort

all: compile osx linux-64 linux-32 win-64 win-32
	@echo "Bulding and packaging for all architectures"

all-64: compile osx linux-64 win-64
	@echo "Bulding and packaging for all x64"

clean:
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
