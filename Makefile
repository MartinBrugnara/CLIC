help:
	@echo "Build releases."

BUILD_CMD=electron-packager ./ --prune=true --overwrite --out release-builds/

clean:
	rm -rf release-builds/*

release-builds:
	mkdir -p release-builds

all: bin clean linux-32 linux-64 osx windows-32 windows-64

linux-32:
	${BUILD_CMD} --platform=linux --arch=ia32 --icon=assets/icons/png/1024x1024.png

linux-64:
	${BUILD_CMD} --platform=linux --arch=x64 --icon=assets/icons/png/1024x1024.png

osx:
	${BUILD_CMD} --platform=darwin --arch=x64 --icon=assets/icons/mac/clic.icns

windows-32:
	${BUILD_CMD} --platform=win32 --arch=ia32 --icon=assets/icons/win/clic.ico \
		--version-string.CompanyName="University of Trento" \
		--version-string.FileDescription="" \
		--version-string.ProductName="CLIC what if?"

windows-64:
	${BUILD_CMD} --platform=win32 --arch=x64 --icon=assets/icons/win/clic.ico \
		--version-string.CompanyName="University of Trento" \
		--version-string.FileDescription="" \
		--version-string.ProductName="CLIC what if?"
