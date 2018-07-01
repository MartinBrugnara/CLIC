const {app, BrowserWindow, Menu, MenuItem, globalShortcut} = require('electron')
const fs = require('fs')

const NotImplementedError = () => {console.error('Not yet implemented')};

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
    extendMenuBar();

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

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    })
}

function lsExamples() {
    const examples_dir = __dirname + '/examples/';
    return fs.readdirSync(examples_dir).map((fname) => {
        return {
            label: fname.replace(/\.json$/g, ''),
            click: () => {
                const fpath = examples_dir + fname;
                win.webContents.send('load_bando', {fpath: fpath, read_only: true});
            },
        };
    });
}

function extendMenuBar() {
    let m = Menu.getApplicationMenu();

    let fileMI = new MenuItem({
        label: 'File',
        submenu: [{
            label: 'Apri...',
            accelerator: 'CmdOrCtrl+O',
            click: NotImplementedError,
        }, {
            label: 'Esempi',
            accelerator: 'Shift+CmdOrCtrl+O',
            submenu: lsExamples(),
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
    });

    console.log("MI build");

    let viewMI = new MenuItem({
        label: 'Mode',
        // TODO: Find better names to provide meningfull accelerators.
        submenu: [{
            label: 'Struttura',
            click: () => win.webContents.send('view', 'structure'),
        }, {
            label: 'Simulazione',
            click: () => win.webContents.send('view', 'simulation'),
        }]
    });

    // TODO: Check if this positions make sense on Windows & Linux
    //       or if they need to be platform specific.
    m.insert(1, fileMI);
    m.insert(4, viewMI);
    Menu.setApplicationMenu(m);
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
