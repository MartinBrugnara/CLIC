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
//
// Extra) Calcolo anamolia (solo Agg. Comp)
// Extra)  Aggiungere funzione IDENTITA' che puo' essere usata solo con electre
//  (non richiede scalare tra 0-1)


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
    //
    "identita": {
        // This shall be used only with the ELECTRE method,
        // when the user whant to use the raw values instead of the scaled one.
        up: {
            f: (P, x, bando, others) => P,
            params: {}
        },
        down: {
            f: (P, x, bando, others) => P,
            params: {}
        }
    },
    "proporzionalita_inversa": {
        up: {
            f: (P, x, bando, others) => amax(others) * 1.0 / P,
            params: {}
        },
        down: {
            f: (P, x, bando, others) => amin(others) * 1.0 / P,
            params: {}
        }
    },
    "lineare_semplice": {
        up: {
            f: (P, x, bando, others) => {
                // QUESTION: if soglia non specificato --> ??
                return (P - x.soglia_min)*1.0/(x.soglia - x.soglia_min)
            },
            params: {
                // FIXME: ain't soglia the mean?
                // TODO: is this really required?
                soglia:     {domain:{start:0, end:'', step:1}, required: true},
                soglia_min: {domain:{start:0, end:'', step:1}, required: true},
            }
        },
        down: {
            f: (P, x, bando, others) => {
                // FIXME: if soglia non specificato --> ??
                return (bando.base_asta - P)*1.0/(bando.base_asta - x.soglia)
            },
            params: {
                // TODO: is this really required
                soglia: {domain:{start:0, end:'', step:1}, required: true},
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
                return Math.pow(P*1.0 / amax(others), x.alfa)
            },
            params: {alfa: {domain:{start:0, end:1, step:0.05}, required: true}}

        },
        down: {
            f: (P, x, bando, others) => {
                let BA = bando.base_asta;

                // FIXME: only 4 debug!!
                console.warn("for debug: if not specified BA is max(offerta_economica)");
                if (!bando.base_asta)
                    BA = amax(others);

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
                    let ele = electre(this, offerte);

                    let board = {};
                    offerte.forEach((o) => board[o.nome] = {nome: o.nome});
                    agg.forEach((e) => board[e.nome].agg = e.agg);
                    ele.forEach((e) => {
                        board[e.nome].electre = e.electre;
//                        board[e.nome].electre100 = e.electre100;
                    });

                    // Offerta, Agg, Electre, Electre100 Tops
                    let x = this.env_data_orderby.split('_'),
                        field = x[0], order = x[1];

                    return Object.values(board).sort((a,b) =>
                        (-1)**(order == 'desc') *
                        (field == 'nome' ?
                            2 * (a[field] > b[field]) - 1 :
                            a[field] - b[field]));
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
                    bando.offerte.map((o) => o.tecnica[ti])).toFixed(2);
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

    return offerte.map((o) => {
        return {
            nome: o.nome,
            agg: [o.economica].concat(o.tecnica)
                .map((v, vi) => weights[vi] * v)
                .reduce((a, b) => a + b)
        };
    });
};

function nmatrix(dim, def_value) {
    /* Build ndimensional matrix and assign a def_value.
     * dim: list with dimensions
     * def_value: default value (0).
     */
    let copy = (o) => JSON.parse(JSON.stringify(o)),
        value = def_value !== undefined? def_value : 0,
        base = new Array(dim[dim.length-1]).fill(value);
    for (let i = dim.length-2; i >= 0; i--) {
        let next = [];
        for (let j = 0; j < dim[i]; j++)
            next.push(copy(base));
        base = next;
    }
    return base
}


function electre(bando, offerte) {
    // http://www.bosettiegatti.eu/info/norme/statali/2010_0207.htm#ALLEGATO_G
    //
    // Prepare set of real `offerte`
    const bids = offerte.map(o => {
        return {nome:o.nome, v:[o.economica].concat(o.tecnica)};
    });
    let fc = criteriFlat(bando.criteri);
    const weights = [bando.peso_economica].concat(fc.map((c) => c.peso));

    // TODO: This only find the "FIRST" run multiple time to define complete rank
    // TODO: handle esclude bcause subclassed

    let rank = {}, i = 1;
    while (true) {
        let iter_bids = bids.filter(o => rank[o.nome] === undefined);
        // TODO: instead of -1 shall we do -2 (does not work < of 3)
        if (iter_bids.length <= 1) {
            rank[iter_bids[0].nome] = i;
            break;
        }
        let winner = electreIteration(weights, iter_bids);
        rank[winner] = i;
        i++;
    }

    return Object.keys(rank).map(k => {
        return {nome: k, electre: rank[k]};
    });
}

function electreIteration(w, bids) {
    /* w: weights
     * bids: flat `offerte` to be considered in this iteration.
     *
     * returns: `nome` of the winner.
     */


    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    // Step B
    let f = nmatrix([n,r,r]);
    let g = nmatrix([n,r,r]);

    // Abstract internal structure and match paper algorithm.
    a = (k, i) => bids[i].v[k];

    for (let k=0; k < n; k++) {
        for (let i=0; i < r; i++) {
            for (let j=0; j < r; j++) {
                if (i == j) // NOTE: we could remove, would still be 0.
                    continue;

                let ai = a(k,i), aj = a(k,j);
                let delta = Math.abs(ai - aj);
                if (ai > aj)
                    f[k][i][j] = delta;
                else
                    g[k][i][j] = delta;
            }
        }
    }

    // Step C
    let c = nmatrix([r,r]);
    let d = nmatrix([r,r]);
    let s = nmatrix([n]);

    for (let si=0; si < n; si++) {
        // NOTE: taking from fmax is the same as from gmax.
        s[si] = Math.max.apply(null, f[si].map((js) => Math.max.apply(null, js)));
    }

    for (let i=0; i < r; i++) {
        for (let j=0; j < r; j++) {
            if (i == j)
                continue;

            let csum = 0,
                dsum = 0;
            for (let k=0; k < n; k++) {
                if (s[k] === 0) {
                    // TODO: I assume this is the behevior.
                    //       Ratio: if max_delta == 0, delta is 0.
                    // FIXME: remove this log once discussed with others.
                    // console.log("skipping criteria", k-1, "becouse 0");
                    continue;
                }

                csum += f[k][i][j] * 1.0 / s[k] * w[k];
                dsum += g[k][i][j] * 1.0 / s[k] * w[k];
            }
            c[i][j] = csum;
            d[i][j] = dsum;

            if (dsum == 0) {
                // TODO: implement offer elimination with d == 0!!!
                console.warn("We should eliminate offer " + j + ", but it is not implemented");
            }
        }
    }

    // Step D
    let q = nmatrix([r,r]);

    for (let i=0; i < r; i++)
        for (let j=0; j < r; j++)
            if (i != j)
                q[i][j] = c[i][j] / d[i][j];

    let qx = nmatrix([r,r]),
        q_max = Math.max.apply(null, q.map((js) => Math.max.apply(null, js)));

    for (let i=0; i < r; i++)
        for (let j=0; j < r; j++)
            if (i != j)
                qx[i][j] = 1 + (q[i][j] / q_max) * 99

    // Step E
    let Pa = nmatrix([r]); // Points on absolute values.
//        Pn = nmatrix([r]); // Points normalized from 1 to 100.
//        TODO: maybe expose as "different algorithm" to see if anythis change.
//              only if make sense.

    for (let i=0; i < r; i++) {
        let asum = 0;
//            nsum = 0; // NOT supporting 0-100 based one
        for (let j=0; j < r; j++) {
            if (i == j) continue;
            asum += q[i][j];
//            nsum += qx[i][j];
        }
        Pa[i] = asum.toFixed(2);
//        Pn[i] = nsum.toFixed(2);
    }

    // Look for winner
    let Pa_max = 0, Pa_max_id = -1;     // Electre is >= 1
    for (let i in Pa) {
        if (Pa[i] > Pa_max) {
            Pa_max = Pa[i];
            Pa_max_id = i;
        }
    }

    return bids[Pa_max_id].nome;
}

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
