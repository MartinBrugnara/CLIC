
// Built from default_app menu:
// https://github.com/electron/electron/blob/85ef1ee21fb665e669551a608d365239ef106196/default_app/main.js
// NOTE: Menu.getApplicationMenu() in dev mode returns the defualt_app's menu,
//		 while when packaged returns null.
  const template = [
    {
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
    },
    {
      label: 'Edit',
      submenu: [
        {
          role: 'undo'
        },
        {
          role: 'redo'
        },
        {
          type: 'separator'
        },
        {
          role: 'cut'
        },
        {
          role: 'copy'
        },
        {
          role: 'paste'
        },
        {
          role: 'pasteandmatchstyle'
        },
        {
          role: 'delete'
        },
        {
          role: 'selectall'
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          role: 'reload'
        },
        {
          role: 'forcereload'
        },
        {
          role: 'toggledevtools'
        },
        {
          type: 'separator'
        },
        {
          role: 'resetzoom'
        },
        {
          role: 'zoomin'
        },
        {
          role: 'zoomout'
        },
        {
          type: 'separator'
        },
        {
          role: 'togglefullscreen'
        }
      ]
    },
    {
        label: 'Mode',
        // TODO: Find better names to provide meningfull accelerators.
        submenu: [{
            label: 'Struttura',
            click: () => win.webContents.send('view', 'structure'),
        }, {
            label: 'Simulazione',
            click: () => win.webContents.send('view', 'simulation'),
        }]
    }
    {
      role: 'window',
      submenu: [
        {
          role: 'minimize'
        },
        {
          role: 'close'
        }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click () {
            shell.openExternal('https://electron.atom.io')
          }
        },
        {
          label: 'Documentation',
          click () {
            shell.openExternal(
              `https://github.com/electron/electron/tree/v${process.versions.electron}/docs#readme`
            )
          }
        },
        {
          label: 'Community Discussions',
          click () {
            shell.openExternal('https://discuss.atom.io/c/electron')
          }
        },
        {
          label: 'Search Issues',
          click () {
            shell.openExternal('https://github.com/electron/electron/issues')
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: 'Electron',
      submenu: [
        {
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          role: 'hide'
        },
        {
          role: 'hideothers'
        },
        {
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
        }
      ]
    })
    template[1].submenu.push({
      type: 'separator'
    }, {
      label: 'Speech',
      submenu: [
        {
          role: 'startspeaking'
        },
        {
          role: 'stopspeaking'
        }
      ]
    })
    template[3].submenu = [
      {
        role: 'close'
      },
      {
        role: 'minimize'
      },
      {
        role: 'zoom'
      },
      {
        type: 'separator'
      },
      {
        role: 'front'
      }
    ]
  } else {
    template.unshift({
      label: 'File',
      submenu: [{
        role: 'quit'
      }]
    })
  }
