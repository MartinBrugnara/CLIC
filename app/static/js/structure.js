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
let char_width = 8,
    indent = 20; // must be the same as padding-left for ul.

Vue.component('criterio', {
    template: '#tpl_criterio',
    props: {
        model: Object,
        name: String,
        depth: Number,
    },
    computed: {
        padding: function() {
            // TODO: cache; do not recompute.
            let mx = max_bando_depth()
            let label = ((mx * 2 - 1) * char_width);
            console.log([mx, label, (mx - this.depth - 1)]);
            return (mx - this.depth - 1) * indent + label  + 'px';
        }
    }
})

let max_bando_depth = function() {
    f = (b) => {
        if (!b.subcriteri) return 1;
        return Math.max.apply(Math, b.subcriteri.map(f)) + 1;
    }
    return Math.max.apply(Math, current.criteri.map(f)) + 1;
}


// -- Global state.
let current;
let app_status = {
    fpath: '',
    modified: false,
    read_only: false,
}
window.vm_app_status = new Vue({
    el: '#app_status',
    data: app_status,
})

/* args: {fpath, read_only} */
function loadBando(args) {
    // TODO: offer to save current first.
    console.log('Loading scenario:' + args.fpath);
    try {
        let raw_content = fs.readFileSync(args.fpath, "utf8");
        let bando_data = JSON.parse(raw_content);

        patch = {
            fpath: args.fpath,
            modified: false,
            read_only: args.read_only || false,
        };

        Object.keys(patch).forEach((key) => {
            Vue.set(app_status, key, patch[key]);
        });

        current = bando_data,
        refreshGUI(bando_data);
    } catch(err) {
        dialog.showErrorBox('Loading error',
            'Unable to load ' + args.fpath + '\n' + JSON.stringify(err));
    }
}

// -- Global state.
function refreshGUI() {
    if (!current) {
        // No bando loaded: load empty.
        loadBando({fpath:  __dirname + '/examples/Empty.json', read_only:true});
        return;
    }

    if (!window.vm_tech_lst) {
        // Init
        window.vm_tech_lst = new Vue({
            el: '#tech_lst',
            data: current,
            updated: () => {
                app_status.modified = true;
            }
        });
    }

    // Refresh
    Object.keys(current).forEach((key) => {
        Vue.set(window.vm_tech_lst, key, current[key]);
    });

}


// -- Menu mappings
ipcRenderer.on('load_bando', (event , args) => {loadBando(args)});



// -- Main.
refreshGUI();
