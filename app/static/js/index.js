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
// 3) cleanup code: split common/structure code
//
// 4) Report errors on data and provide a way to fix it.
//    Most challanging are too many or to few entries.
//    Myabe just report and hide.
//
// 5) When saving/exporting, dump only fields related to the bando
//    not all injected shit (env_*).
//
// *) TODO: consider to not specify "economic weight" and infer it from missing
//          point from "tecnica".


let amax = (x) => Math.max.apply(Math, x);
let amin = (x) => Math.min.apply(Math, x);

// First one is default
// TODO: add support for "tabellare" -> [Consip: Scelte, Range]
// NOTE: for each property MUST always define:
//      {domain:{start:0, end:'', step:1}, required: true}
//      if a value is unknow put empty string
let funcs = {
    // {name:{
    //      up:{f:, params:{name: {(opts:[]|domain:{start:, end:}}}}, // rialzo
    //      dow:{f:, params:{name:{(opts:[]|domain:{start:, end:}}}}, // ribasso
    // }

    // TODO: consider track also: intrdependent or not to enforce some rules.
    // @see consip warning

    "lineare_semplice": {
        up: {
            f: (P, x, bando, others) => {
                // QUESTION: if soglia non specificato --> ??
                (P - x.soglia_min)*1.0/(x.soglia - x.soglia_min)
            },
            params: {
                // TODO: ain't soglia the mean?
                soglia:     {domain:{start:0, end:'', step:1}, required: true}, // TODO: is this really required
                soglia_min: {domain:{start:0, end:'', step:1}, required: true},
            }
        },
        down: {
            f: (P, x, bando, others) => {
                // QUESTION: if soglia non specificato --> ??
                (bando.base_asta - P)*1.0/(bando.base_asta - x.soglia)
            },
            params: {
                soglia: {domain:{start:0, end:'', step:1}, required: true}, // TODO: is this really required
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
                // TODO: debug!!!!
                return Math.pow(P*1.0 / amax(others), x.alfa)
            },
            params: {alfa: {domain:{start:0, end:1, step:0.05}, required: true}}

        },
        down: {
            f: (P, x, bando, others) => {
                console.log('Down args:', [P, x, bando, others]);
                let BA = bando.base_asta;

                // FIXME: only 4 debug!!
                console.warn("for debug: if not specified BA is max(offerta_economica)");
                if (!bando.base_asta)
                    BA = amax(others);

                console.log("Others:", others);
                console.log("BA: ", BA);
                console.log("P: ", P);
                console.log("Pmax: ", amin(others));
                console.log("Pmin: ", amax(others));
                console.log("alfa: ", x.alfa);

                return Math.pow((BA - P) * 1.0 / (BA - amin(others)), x.alfa).toFixed(2)
            },
            params: {alfa: {domain:{start:0, end:1, step:0.05}, required: true}}
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
                .reduce((a,v) => a + v , 0) != this.model.peso;
            // If switching back to % use the following
            //  .reduce((a,v) => a + v , 0) != 100;
        },
        safe_f: function() {
            // Returns model.funzione, after assuring that
            // each parameter defined in funcs[model.funzione].up exists.
            // Check the function is selected and exists in our repo.
            if (!this.model.funzione ||
                !funcs[this.model.funzione] || // That's bad ... TODO: log something
                !funcs[this.model.funzione].up.params)
                return;


            // Add parameter if not available.
            for (let pname in funcs[this.model.funzione].up.params) {
                let p = funcs[this.model.funzione].up.params[pname];
                if (!this.model.parametri)
                    Vue.set(this.model, "parametri", {});
                if (this.model.parametri[pname] === undefined) {
                    let v = 0;
                    if (p.domain && p.domain.start) v = p.domain.start;
                    Vue.set(this.model.parametri, pname, v);
                }
            }

            // TODO: consider remove paramteres unrelated to this function!
            return this.model.funzione
        },
    },
    filters: {
        undash: function(str) {
            return str.replace(/_/g, ' ');
        },
        csub: function(str) {
            repl = {
                "alpha": "α",
                "alfa": "α",
            }
            if (repl[str]) return repl[str];
            return str;
        },
    },
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


    // TODO: Once loaded, before rendering run "check_consistency()"
    //       if it fails add warning and enable ONLY edit mode
    //       for both structure and data.

    // Keep this value updated, maybe use "computed"?
    // and avoid try to run simulations when there are errors.

    // Display error nicely: maybe a block at the top with the full list of
    // errors returned by "check_consistency()
    // E.g ["Total number of point > 100", "Missing data for offerta XX"]


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

    // NOTE: All extra variables must be declared before init any object.
    current.env_data_mode = 'explore';
    current.env_data_orderby = 'agg_desc';

    // TODO: consider alternatively to just destroy and rebuild.


    if (!window.vm_structure) {
        // Init
        window.vm_structure = new Vue({
            el: '#structure',
            data: current,
            updated: () => {
                app_status.modified = true;
            },
            computed: {
                top_werror: function() {
                    // this.criteri.map((c) => c.peso) .reduce((a,v) => a + v , 0) != 100">
                    return this.criteri
                        .map((c) => c.peso)
                        .reduce((a,v) => a + v , 0) != (100-this.peso_economica);
                }
            }
        });
    }

    if (!window.vm_simulation) {

        // Init
        window.vm_simulation= new Vue({
            el: '#simulation',
            data: current,
            updated: () => {
                // Shall we do this here too?
                // app_status.modified = true;
            },
            computed: {
                cols: function () {
                    return criteriFlat(this.criteri);
                },
                scoreboard: function() {
                    // TODO: we should apply functions first
                    let offerte = applyFunctions(this);
                    let agg = aggregativoCompensatore(this, offerte);

                    // Offerta, Agg, Electre, Tops
                    // TODO: sort by from GUI
                    let x = this.env_data_orderby.split('_'),
                        field = x[0], order = x[1];
                    console.log(field, order);


                    return agg.sort((a,b) =>
                        (-1)**(order == 'desc') *
                        (field == 'nome' ?
                            2 * (b[field] < a[field]) - 1 :
                            b[field] - a[field]));
                }
            },
            filters: {
                prec2: function(s) {
                    return parseFloat(s).toFixed(2);
                }
            }
        });
    }

    // Refresh
    Object.keys(current).forEach((key) => {
        Vue.set(window.vm_structure, key, current[key]);
    });
    Object.keys(current).forEach((key) => {
        Vue.set(window.vm_simulation, key, current[key]);
    });
}


function criteriFlat(criteri) {
    rec_list = (prefix, clst) => {
        return clst.map((c, i) => {
            let name = prefix + (i + 1);
            if (!(c.subcriteri && c.subcriteri.length)) {
                c.env_name = name; // Inject computed name
                return [c];
            }
            return [].concat(...rec_list(name + '.', c.subcriteri));
        });
    };
    return [].concat(...rec_list('', criteri));
}



// TODO: consider to transform and apply function before actually going to algorithm;
function applyFunctions(bando) {
    /* Given a bando, applies functions to the bids values and, if required,
        * scales the results. Produces a list of bids to be used with ranking
        * algorithms.
        */

    /* {nome, economica (0-1), tecnica [(0-1),...]} */

    // TODO: Implement riproporzionamento


    let fc = criteriFlat(bando.criteri);

    return bando.offerte.map((o, oi) => {
        // Compute economic bid.
        let res = {nome:o.nome};

        let eco_mode = bando.mod_economica === 'prezzo' ? 'down' : 'up',
            eco_f = funcs[bando.funzione_economica][eco_mode];
        res.economica = eco_f.f(
            o.economica[0],             // Economic bid
            bando.parametri_economica,  // Economic function parameters
            bando,                      // Bando for global var (i.e. base_asta)
            // All economic bids for interdependent functions
            bando.offerte.map((o) => o.economica[0]));

        res.tecnica = o.tecnica.map((t, ti) => {
            if (fc[ti].tipo === 'T') {          // Is tabular -> bool to int
                return fc[ti].voci
                    .map((v, vi) => v * t[vi])
                    .reduce((a,b) => a + b, 0);
            } else if (fc[ti].tipo === 'Q') {
                return funcs[fc[ti].funzione].up.f(
                    t,                          // Current bid
                    fc[ti].parametri,           // Parameters
                    bando,                      // Bando for global param
                    bando.offerte.map((o) => o.tecnica[ti]));
            } else {
                return t;
            }
        });

        return res;
    });
}

function aggregativoCompensatore(bando, offerte) {
    // TODO: WE SHOULD ACCOUNT ALSO FOR RIPARAMETRAZIONE
    //  or only in "Apply func" ????

    let fc = criteriFlat(bando.criteri);
    let weights = [bando.peso_economica].concat(fc.map((c) => c.peso));

    console.log("AGG params: ", offerte);

    return offerte.map((o) => {
        console.log(o);
        return {
            nome: o.nome,
            agg: [o.economica].concat(o.tecnica)
                .map((v, vi) => weights[vi] * v)
                .reduce((a, b) => a + b)
                .toFixed(2)
        };
    });
};



function switchView(view) {
    // TODO: maybe add some cool effect like tile 3d rotation.
    let structure  = document.getElementById('structure'),
        simulation = document.getElementById('simulation');

    if (view === 'structure') {
        simulation.style.display = 'none';
        structure.style.display = 'block';
    } else if (view === 'simulation') {
        structure.style.display = 'none';
        simulation.style.display = 'block';
    }
}

/* ========================================================================== */
/* Simulation                                                                 */
/* ========================================================================== */


/* ========================================================================== */
/* Menu mappings                                                              */
/* ========================================================================== */
ipcRenderer.on('load_bando', (event , args) => {loadBando(args)});
ipcRenderer.on('view', (event , args) => {switchView(args)});



/* ========================================================================== */
/* Main                                                                       */
/* ========================================================================== */
refreshGUI();
// switchView('structure');
switchView('simulation');
