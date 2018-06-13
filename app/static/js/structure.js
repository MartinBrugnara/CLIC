const {ipcRenderer} = require('electron')
const {dialog} = require('electron').remote
const fs = require('fs')
const path = require('path')

/* NOTE: refer to this example (contains addition, deletion, ...).
 * https://vuejs.org/v2/examples/tree-view.html */

/* Remember: JavaScript is call-by-sharing.  Like by value,
 *     but for complex types you can use only pointers (thus copy its address).
 * https://stackoverflow.com/questions/518000/is-javascript-a-pass-by-reference-or-pass-by-value-language#3638034
 */

// -- Registering custom components.

Vue.component('criterio', {
  template: '#tpl_criterio',
  props: {
    model: Object
  },
})


// -- Global state.
let current = null;

/* args: {fpath, read_only} */
function loadBando(args) {
    // TODO: offer to save current first.
    console.log('Loading scenario:' + args.fpath);
    try {
        let raw_content = fs.readFileSync(args.fpath, "utf8");
        let bando_data = JSON.parse(raw_content);

        current = {
            fpath: args.fpath,
            bando: bando_data,
            modified: false,
            read_only: args.read_only || false,
        };
        refreshGUI();
    } catch(err) {
        dialog.showErrorBox('Loading error',
            'Unable to load ' + args.fpath + '\n' + JSON.stringify(err));
    }
}

// -- Global state.
function refreshGUI() {
    if (!current) {
        // No bando loaded: load empty.
        loadBando({fpath:  __dirname + '/examples/Empty.json'});
        return;
    }

    if (!window.vm_tech_lst) {
        // Init
        window.vm_tech_lst = new Vue({
            el: '#tech_lst',
            data: current.bando,
        });
    }

    // Refresh
    Object.keys(current.bando).forEach((key) => {
        Vue.set(window.vm_tech_lst, key, current.bando[key]);
    })
}


// -- Menu mappings
ipcRenderer.on('load_bando', (event , args) => {loadBando(args)});



// -- Main.
refreshGUI();
