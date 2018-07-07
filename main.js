/*
CLIC what if?
Esplora i metodi di aggiudicazione dell'offerta economicamente piu' vantaggiosa
Copyright (C) 2018 Martin Brugnara - Università degli Studi di Trento

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const {app, BrowserWindow, Menu, MenuItem, globalShortcut} = require('electron')
const fs = require('fs')

const NotImplementedError = () => {console.error('Not yet implemented')};

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let win

function createWindow () {
    buildMenuBar();

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

function buildMenuBar() {
    // Built from default_app menu:
    // https://github.com/electron/electron/blob/85ef1ee21fb665e669551a608d365239ef106196/default_app/main.js
    // NOTE: Menu.getApplicationMenu() in dev mode returns the defualt_app's menu,
    //       while when packaged returns null.
    const template = [{
        label: 'File',
        submenu: [{
            label: 'Apri...',
            accelerator: 'CmdOrCtrl+O',
            click: () => win.webContents.send('cmd', 'open'),
        }, {
            label: 'Esempi',
            accelerator: 'Shift+CmdOrCtrl+O',
            submenu: lsExamples(),
        }, {
            label: 'Nuovo',
            accelerator: 'CmdOrCtrl+N',
            click: () => win.webContents.send('cmd', 'clear'),
        }, {
            type: 'separator'
        }, {
            label: 'Salva',
            accelerator: 'CmdOrCtrl+S',
            click: () => win.webContents.send('cmd', 'save'),
            // TODO: disable when current file is RO (e.g. examples).
            // menuItem.enabled = false;
        }, {
            label: 'Salva come...',
            accelerator: 'Shift+CmdOrCtrl+S',
            click: () => win.webContents.send('cmd', 'save_as'),
        }]
    }, {
        label: 'Edit',
        submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'pasteandmatchstyle' },
            { role: 'delete' },
            { role: 'selectall' }
        ]
    }, {
        label: 'View',
        submenu: [
            { role: 'reload' },
            { role: 'forcereload' },
            { role: 'toggledevtools' },
            { type: 'separator' },
            { role: 'resetzoom' },
            { role: 'zoomin' },
            { role: 'zoomout' },
            { type: 'separator' },
            { role: 'togglefullscreen' }
        ]
    }, {
        label: 'Mode',
        // TODO: Find better names to provide meningfull accelerators.
        submenu: [{
                label: 'Design',
                accelerator: 'CmdOrCtrl+D',
                click: () => win.webContents.send('view', 'structure'),
            }, {
                label: 'Simulazione',
                accelerator: 'CmdOrCtrl+K',
                click: () => win.webContents.send('view', 'simulation'),
            }
        ]
    }, {
        role: 'window',
            submenu: [
                { role: 'minimize' },
                { role: 'close' }
            ]
    }, {
        role: 'help',
        submenu: []
    }];

    if (process.platform === 'darwin') {
        template.unshift({
            label: 'CLIC',
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services', submenu: [] },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideothers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        })
        template[2].submenu.push({ // Edit
            type: 'separator'
        }, {
            label: 'Speech',
            submenu: [
                { role: 'startspeaking' },
                { role: 'stopspeaking' }
            ]
        })
        template[5].submenu = [ // Window
            { role: 'close' },
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' }
        ]
    } else {
        template.unshift({
            label: 'File',
            submenu: [{ role: 'quit' }]
        })
    }
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
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
