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
var path = require('path')
const openAboutWindow = require('about-window').default;
var i18n = new(require('./i18n'))
i18n.set_locale('it');

const NotImplementedError = () => {console.error('Not yet implemented')};
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let wins = [],
    last_focused,
    get_focused = () => {
        let fs = wins.filter(w => w.isFocused());
        if (fs.length === 0) {
            if (last_focused) {
                last_focused.focus();
                return last_focused;
            }
            return undefined;
        }
        return fs[0];
    };

function createWindow () {
    buildMenuBar();

    // Create the browser window.
    let win = new BrowserWindow({
        width: 1280, // TODO: consider 1280x768 (check if it looks good =))
        height: 720,
        // title: 'CLIC - Contest simulator', // What would be that for?
        show: false,
        icon: path.join(__dirname, 'assets/icons/png/64x64.png'),
    })

    // Defer show until window is fully loaded.
    win.on('ready-to-show', function() {
        win.show();
        win.focus();
    });

    // win.toggleDevTools();

    // and load the index.html of the app.
    win.loadFile(path.join(__dirname, 'index.html'));

    // Emitted when the window is closed.
    win.on('closed', () => {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        wins = wins.filter(w => w !== win);
        win = null
    })

    win.on('focus', () => last_focused = win);

    wins.push(win);
}


var helpWindow = null;
function openHelpWindow() {
    if (helpWindow) {
        helpWindow.focus();
        return;
    }

    helpWindow= new BrowserWindow({
        width: 800,
        height: 600,
        resizable: true,
        title: i18n.__("Help"),
        minimizable: true,
        fullscreenable: false,
    });

    helpWindow.loadFile(path.join(__dirname, 'help.html'));
    helpWindow.on('closed', function () {
        helpWindow = null;
    });
}

function lsExamples() {
    const examples_dir = path.join(__dirname, 'assets/examples');
    return fs.readdirSync(examples_dir).map((fname) => {
        return {
            label: fname.replace(/\.json$/g, ''),
            click: () => {
                const fpath = path.join(examples_dir, fname);
                let w = get_focused();
                if (w) w.webContents.send('load_bando', {fpath: fpath});
            },
        };
    });
}

function buildMenuBar() {
    // Built from default_app menu:
    // https://github.com/electron/electron/blob/85ef1ee21fb665e669551a608d365239ef106196/default_app/main.js
    // NOTE: Menu.getApplicationMenu() in dev mode returns the defualt_app's menu,
    //       while when packaged returns null.

    let aboutConfig = {
        product_name: 'CLIC what if?',
        icon_path: path.join(__dirname, 'assets/icons/png/1024x1024.png'),
        use_inner_html: true,
        copyright: fs.readFileSync(path.join(__dirname, '../COPYRIGHT.html'), "utf8"),
        css_path: path.join(__dirname, 'assets/about.css'),
        use_version_info: false,
        open_devtools: false,
        adjust_window_size: false,
    }


    const template = [{
        label: 'File',
        submenu: [{
            label: i18n.__('Open...'),
            accelerator: 'CmdOrCtrl+O',
            click: () => {
                let w = get_focused();
                if (w) w.webContents.send('cmd', 'open');
            }
        }, {
            label: i18n.__('Examples'),
            accelerator: 'Shift+CmdOrCtrl+O',
            submenu: lsExamples(),
        }, {
            label: i18n.__('New'),
            accelerator: 'CmdOrCtrl+N',
            click: () => {
                let w = get_focused();
                if (w) w.webContents.send('cmd', 'clear');
            }
        }, {
            label: i18n.__('New window'),
            click: createWindow,
        }, {
            type: 'separator'
        }, {
            label: i18n.__('Save'),
            accelerator: 'CmdOrCtrl+S',
            click: () => {
                let w = get_focused();
                if (w) w.webContents.send('cmd', 'save');
            }
        }, {
            label: i18n.__('Save as...'),
            accelerator: 'Shift+CmdOrCtrl+S',
            click: () => {
                let w = get_focused();
                if (w) w.webContents.send('cmd', 'save_as');
            }
        }]
    }, {
        label: i18n.__('Edit'),
        submenu: [
            { role: 'undo', label: i18n.__('Undo')},
            { role: 'redo', label: i18n.__('Redo') },
            { type: 'separator' },
            { role: 'cut', label: i18n.__('Cut') },
            { role: 'copy', label: i18n.__('Copy') },
            { role: 'paste', label: i18n.__('Paste') },
            { role: 'delete', label: i18n.__('Delete') },
            { role: 'selectall', label: i18n.__('Select all') }
        ]
    }, {
        label: i18n.__('View'),
        submenu: [
            { role: 'reload', label: i18n.__('Reload') },
            { role: 'forcereload', label: i18n.__('Force reload') },
            // TODO: hide on production
            { role: 'toggledevtools', label: i18n.__('Toggle devtools') },
            { type: 'separator' },
            { role: 'resetzoom', label: i18n.__('Reset font size') },
            { role: 'zoomin', label: i18n.__('Bigger font size') },
            { role: 'zoomout', label: i18n.__('Smaller font size') },
            { type: 'separator' },
            { role: 'togglefullscreen', label: i18n.__('Toggle fullscreen') }
        ]
    }, {
        label: i18n.__('Mode'),
        // TODO: Find better names to provide meaningful accelerators.
        submenu: [{
                label: i18n.__('Design'),
                accelerator: 'CmdOrCtrl+D',
                click: () => {
                    let w = get_focused();
                    if (w) w.webContents.send('view', 'structure');
                }
            }, {
                label: i18n.__('Simulazione'),
                accelerator: 'CmdOrCtrl+K',
                click: () => {
                    let w = get_focused();
                    if (w) w.webContents.send('view', 'simulation');
                }
            }
        ]
    }, {
        role: 'window',
        label: i18n.__('Window'),
        submenu: [
            { role: 'minimize', label: i18n.__('Minimize') },
            { role: 'close', label: i18n.__('Close') }
        ]
    }, {
        role: 'help',
        label: i18n.__('Help'),
        submenu: [{ label: i18n.__('Help'), click: openHelpWindow}],
    }];

    if (process.platform === 'darwin') {
        template.unshift({
            label: 'CLIC',
            submenu: [
                // { role: 'about', label: i18n.__('About') + ' CLIC' },
                {
                    label: i18n.__('About') + ' CLIC',
                    click: () => openAboutWindow(aboutConfig),
                },
                { type: 'separator' },
                { role: 'services', label: i18n.__('Services'), submenu: [] },
                { type: 'separator' },
                { role: 'hide', label: i18n.__('Hide') },
                { role: 'hideothers', label: i18n.__('Hide others') },
                { role: 'unhide', label: i18n.__('Unhide') },
                { type: 'separator' },
                { role: 'quit', label: i18n.__('Quit') }
            ]
        })
        template[2].submenu.push({ // Edit
            type: 'separator'
        }, {
            label: i18n.__('Speech'),
            submenu: [
                { role: 'startspeaking', label: i18n.__('Start speaking') },
                { role: 'stopspeaking', label: i18n.__('Stop speaking') }
            ]
        })

        template[5].submenu = [ // Window
            { role: 'close', label: i18n.__('Close') },
            { role: 'minimize', label: i18n.__('Minimize') },
            { role: 'zoom', label: i18n.__('Zoom') },
            { type: 'separator' },
            { role: 'front', label: i18n.__('Front') }
        ]
    } else {
        // Add "exit" option to File
        template[0].submenu.push({
            type: 'separator',
        }, {
            label: i18n.__('About') + ' CLIC',
            click: () => openAboutWindow(aboutConfig),
        }, {
            role: 'quit', label: i18n.__('Quit'),
        });
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
    if (wins.length === 0) {
        createWindow()
    } else {
        let w = get_focused();
        if (w) w.focus();
    }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
