const {app, BrowserWindow, Menu, globalShortcut} = require('electron')

const NotImplementedError = () => {console.error('Not yet implemented')};

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
    setMenuBar()

    // Create the browser window.
    win = new BrowserWindow({
        width: 800,
        height: 600,
        // title: 'CLIC - Contest simulator', // What would be that for?
        show: false,

    })

    // Defer show until window is fully loaded.
    win.on('ready-to-show', function() {
        win.show();
        win.focus();
    });

    // and load the index.html of the app.
    win.loadFile('index.html')

    // Open the DevTools.
    // win.webContents.openDevTools()
    // TODO: expose via menu alongside licenses.

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}

function setMenuBar() {
    console.log("platform:" + process.platform);

    let template = [{
        label: 'File',
        submenu: [{
            label: 'Apri...',
            accelerator: 'CmdOrCtrl+O',
            click: NotImplementedError,
        }, {
            label: 'Esempi',
            accelerator: 'Shift+CmdOrCtrl+O',
            click: NotImplementedError,
            // TODO: consider dinamic submenu, populated w/Cozzio samples.
        }, {
            label: 'Nuovo',
            accelerator: 'CmdOrCtrl+N',
            click: NotImplementedError,
        }, {
            type: 'separator'
        }, {
            label: 'Salva',
            accelerator: 'CmdOrCtrl+S',
            click: NotImplementedError,
            // TODO: disable when current file is RO (e.g. examples).
        }, {
            label: 'Salva come...',
            accelerator: 'Shift+CmdOrCtrl+S',
            click: NotImplementedError,
        }]
    }, {
        label: 'Vista',
        // TODO: Find better names to provide meningfull accelerators.
        submenu: [{
            label: 'Struttra',
            click: NotImplementedError,
        }, {
            label: 'Simulazione',
            click: NotImplementedError,
        }]
    }];

    // Append exit option to File if not.
    if (process.platform !== 'darwin') {
        template[0].submenu.push({type: 'separator'});
        template[0].submenu.push({
            label: 'Quit',
            accelerator: 'CmdOrCtrl+Q',
            click: () => { app.quit(); }
        });
    }

    if (process.platform === 'darwin') {
         /* structure: position -> patch
          * Position is relative to when the element is actually added.
          * Elements are added in order from first to last.
         */
        let osx_patch = {
            0: {
                // TODO: put all osx classic-useless actions.
                // about | preference (?) | services (?) | hide, hide other, show all | quit

                // On OSX this is (automagically) replaced with the App name.
                label: 'FromScratch',
                submenu: [{
                    label: 'Quit',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => { app.quit(); }
                }]
            },
            2: {
                label: 'Edit',
                submenu: [{
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    selector: 'undo:'
                }, {
                    label: 'Redo',
                    accelerator: 'Shift+CmdOrCtrl+Z',
                    selector: 'redo:'
                }, {
                    type: 'separator'
                }, {
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    selector: 'cut:'
                }, {
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    selector: 'copy:'
                }, {
                    label: 'Paste',
                    accelerator: 'CmdOrCtrl+V',
                    selector: 'paste:'
                }, {
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    selector: 'selectAll:'
                }]
            }};

        for (let i in osx_patch)
            template = template.slice(0, i)
                .concat([osx_patch[i]])
                .concat(template.slice(i));
    }

    // TODO: check if other platforms require special menu too.
    var menubar = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menubar);
}


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)


// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow()
    }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
