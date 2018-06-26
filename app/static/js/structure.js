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


// TODO:
// 1) Manipulate tree add/remove (mod already done)
// 2) Consistency check (total weight sum, eval method, funcs param)
// 3) Riproporzionamento (riparam.) 1st and 2nd type.


let amax = (x) => {Math.max.apply(x)}
let amin = (x) => {Math.min.apply(x)}

// First one is default
// TODO: add support for "tabellare" -> [Consip: Scelte, Range]
let funcs = {
    // {name:{
    //      up:{f:, params:{name: {(opts:[]|domain:{start:, end:}}}}, // rialzo
    //      dow:{f:, params:{name:{(opts:[]|domain:{start:, end:}}}}, // ribasso
    // }

    // QUESTION: PEmax ?? (shouldn't be [0-1])?
    "lineare_semplice": {
        up: {
            f: (P, x, bando, others) => {
                // QUESTION: if soglia non specificato --> ??
                (P - x.soglia_min)*1.0/(x.soglia - x.soglia_min)
            },
            params: {
                soglia:     {domain:{start:0}, required: true}, // TODO: is this really required
                soglia_min: {domain:{start:0}, required: true},
            }
        },
        down: {
            f: (P, x, bando, others) => {
                // QUESTION: if soglia non specificato --> ??
                (bando.base_asta - P)*1.0/(bando.base_asta - x.soglia)
            },
            params: {
                soglia: {domain:{start:0}, required: true}, // TODO: is this really required
            }
        }

    },
    "concava_alla_migliore_offerta": {
        // This covers:
        // * DECRETO DEL PRESIDENTE DELLA PROVINCIA 21 ottobre 2016, n. 16- 50/Leg
        //      https://didatticaonline.unitn.it/ricerca/course/view.php?id=65
        //      alpha in (0.1, 0.2, 0.3)
        // * Concava alla migliore offerta
        //      Consip: alpha in (0.5, 0.6, 0.7)
        // * Lineare alla migliore offerta (alpha = 1)
        up: {
            f: (P, x, bando, others) => {
                Math.pow(P*1.0 / amax(others), x.alpha)
            },
            params: {alpha: {domain:{start:0}, required: true}}

        },
        down: {
            f: (P, x, bando, others) => {
                Math.pow((bando.base_asta - P) * 1.0 / amin(others), x.alpha)
            },
            params: {alpha: {domain:{start:0}, required: true}}
        }
    },

}





// -- Registering custom components.
let pad_structure = false,
    char_width = 8,
    indent = 20; // must be the same as padding-left for ul.

Vue.component('criterio', {
    template: '#tpl_criterio',
    props: {
        model: Object,
        name: String,
        depth: Number,
        werror: Boolean,
    },
    computed: {
        padding: function() {
            // TODO: cache; do not recompute.
            let mx = max_bando_depth();
            let label = ((mx * 2 - 1) * char_width);
            if (!pad_structure)
                return label + 'px';
            return (mx - this.depth - 1) * indent + label  + 'px';
        },
        funcs: function() {
            return funcs;
        },
        weightError: function() {
            if (!this.model.subcriteri)
                return false;
            return this.model.subcriteri
                .map((c) => c.peso)
                .reduce((a,v) => a + v , 0) != 100;
        }
    },
    filters: {
        undash: function(str) {
            return str.replace(/_/g, ' ');
        }
    }
});

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
