help:
	@echo "Build releases."

BUILD_CMD=electron-packager ./ --overwrite --out ./bin/

clean:
	rm -rf bin/*

bin:
	mkdir -p bin

all: bin clean linux-32 linux-64 osx windows-32 windows-64

linux-32:
	${BUILD_CMD} --platform=linux --arch=ia32

linux-64:
	${BUILD_CMD} --platform=linux --arch=x64

osx:
	${BUILD_CMD} --platform=darwin --arch=x64

windows-32:
	${BUILD_CMD} --platform=win32 --arch=ia32

windows-64:
	${BUILD_CMD} --platform=win32 --arch=x64
