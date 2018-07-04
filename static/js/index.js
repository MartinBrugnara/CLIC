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

const {ipcRenderer} = require('electron'),
    {dialog, app} = require('electron').remote;
    fs = require('fs'),
    path = require('path');

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
//
//
//
//  ASSUMPTION:
//  We assume that the economic feature is to be maximized.
//  We expect either to run with 'sconto' or that the applied function
//  turns the problem from minimization to maximization.


let amax = (x) => Math.max.apply(Math, x);
let amin = (x) => Math.min.apply(Math, x);
let copy = (o) => JSON.parse(JSON.stringify(o));
let rnd = (min, max) => Math.floor((Math.random() * (max - min) + min) * 100)/100;

let prefixToId = function(prefix) {
    let cf = criteriFlat(current.criteri);
    // Search boundaries to delete
    let rm = cf.map((c, i) => [c.env_name, i])
            .filter(x => x[0].indexOf(prefix) == 0)
            .map(x => x[1]);
        start = amin(rm),   // should be ordered (thus to_remove[0])
        cnt = rm.length;  // how many to remove
    return [start, cnt];
}

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
        // This covers 92.49% of Bozen runs.
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

                return Math.pow((BA - P) * 1.0 / (BA - amin(others)), x.alfa)
            },
            params: {alfa: {domain:{start:0, end:1, step:0.05}, required: true}}
        }
    },

}





// -- Registering custom components.
let pad = false,
    pad_structure = false,
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
        isLeaf: function() {
            return !(this.model.subcriteri && this.model.subcriteri.length);
        },
        padding: function() {
            // TODO: cache; do not recompute.
            if (!pad)
                return '0';
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

            // TODO: consider remove parameters unrelated to this function!
            return this.model.funzione
        },
    },
    methods: {
        remove: function() {
            // Prepare to adapt data
            let x = prefixToId(this.name),
                start = x[0],
                cnt = x[1];

            // Adapt data
            let r = current.offerte.length;
            for (let i=0; i<r; i++)                                 // bids
                for (let j=0; j<cnt; j++)                           // delete #cnt
                    Vue.delete(current.offerte[i].tecnica, start);  // actually delete

            // Finding the greates anchestor which has got
            // no other children other than us, and deleting it.
            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1),
                depth = key.length,
                ptr;
            do {
                // Search anchestor at generation `depth`.
                ptr = current.criteri; // this is already depth 1
                for (let i=0; i < depth-1; i++) {
                    // Get the `subcriteri` list that contains the one we shall delete.
                    ptr = ptr[key[i]].subcriteri;
                }

                if (ptr.length > 1)
                    break;

                // Not found, try w/the parent. Worst case we go to current.criteri.
                depth -= 1;
            } while(depth > 0); // or 1 ??

            // Actually delete sub-tree
            Vue.delete(ptr, key[depth-1]);
        },
        sub: function() {
            let x = prefixToId(this.name),
                start = x[0],
                cnt = x[1];

            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1);
            let pointer = current.criteri;
            for (let i=1; i<key.length; i++) {
                pointer = pointer[key[i-1]].subcriteri;
            }

            let raw = pointer;
            pointer = copy(pointer[key[key.length-1]]);
            pointer.subcriteri = [copy(pointer)];

            Vue.set(raw, key[key.length-1], pointer)

            // There is no need to modify the data.
            // To add a sublevel we add column (1.1) but remove (1).
            // We may then reuse info from 1 to populare 1.1.
        },
        add: function() {
            let x = prefixToId(this.name), pi = x[0] + x[1];

            // Get a pointer to subcriteri list
            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1);
            let pointer = current.criteri;
            for (let i=1; i<key.length; i++) {
                pointer = pointer[key[i-1]].subcriteri;
            }
            pointer = pointer[key[key.length - 1]].subcriteri;

            // Create a new one.
            let newc = {peso:0, tipo:'D'}
            // if doesn not work, try with set() at pointer.length
            pointer.push(newc);

            // Adapt the data.
            let r = current.offerte.length,
                default_value = 0;
            for (let i=0; i<r; i++)                                       // bids
                current.offerte[i].tecnica.splice(pi, 0, default_value);  // actually delete
        }
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
    return Math.max.apply(Math, current.criteri.map(f));
}


// -- Global state.
let current;
let app_status = {
    rpath: '',
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

        let app_base_path = app.getAppPath(),
            abp_idx = args.fpath.indexOf(app_base_path),
            rpath = "..." + args.fpath.replace(app_base_path, '');

        patch = {
            rpath: abp_idx === 0 ? rpath : args.fpath,
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
    current.env_data_mode = 'raw';
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
            methods: {
                addCriterio: function() {
                    let newc = {peso:0, tipo:'D'}
                    current.criteri.push(newc);

                    // Adapt the data.
                    let r = current.offerte.length, default_value = 0;
                    for (let i=0; i<r; i++)                              // bids
                        current.offerte[i].tecnica.push(default_value);  // actually delete
                },
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
        // TODO: consider having multiple Vue objects, one per data, one per rank.
        window.vm_simulation= new Vue({
            el: '#simulation',
            data: current,
            updated: () => {
                // Modified data
                app_status.modified = true;
            },
            methods: {
                // For DATA:
                remove: function(index) {
                    Vue.delete(this.offerte, index);
                },
                clone: function(index) {
                    let cp = copy(this.offerte[index]);
                    let nome = cp.nome;

                    if (!/ [i]+$/.test(nome))
                        nome += ' i';
                    while (this.offerte.filter(o => o.nome == nome).length)
                        nome += 'i';

                    // Maybe ask via dialog or just generate.
                    cp.nome = nome;
                    this.offerte.splice(index + 1, 0, cp);
                },
                add: function() {
                    // Mine name
                    let nome = "Nuova"
                    if (!/ [i]+$/.test(nome))
                        nome += ' i';
                    while (this.offerte.filter(o => o.nome == nome).length)
                        nome += 'i';

                    // Build
                    let c = criteriFlat(this.criteri);
                    let offerta = {
                        nome: nome,
                        // NOTE: economica must be > 0;
                        economica: [this.offerte.length < 2 ? rnd(0,1) : rnd(
                            amin(this.offerte.map(o => o.economica[0])),
                            amax(this.offerte.map(o => o.economica[0]))
                        )],
                        tecnica:  c.map((c, i) => {
                            if (c.tipo == 'T')
                                return c.voci.map(_ => rnd(0,1) >= 0.5)
                            else if (c.tipo == 'D')
                                return rnd(0,1);
                            else
                                return this.offerte.length < 2 ? rnd(0,1) : rnd(
                                    amin(this.offerte.map(o => o.tecnica[i])),
                                    amax(this.offerte.map(o => o.tecnica[i]))
                                );
                        })
                    }

                    // Add to current list
                    this.offerte.push(offerta);
                }
            },
            computed: {
                cols: function () {
                    return criteriFlat(this.criteri);
                },
                points: function () {
                    return applyFunctions(this);
                },
                scoreboard: function() {
                    // TODO: we should apply functions first
                    let offerte = applyFunctions(this);
                    let agg = aggregativoCompensatore(this, offerte);
                    let ele = electre(this, offerte);
                    let tops = topsis(this, offerte);

                    let board = {};
                    offerte.forEach((o) => board[o.nome] = {nome: o.nome});
                    agg.forEach((e) => board[e.nome].agg = e.agg);
                    ele.forEach((e) => board[e.nome].electre = e.electre);
                    tops.forEach((e) => board[e.nome].topsis = e.topsis);

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
                    bando.offerte.map(o => o.tecnica[ti]));
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
    let value = def_value !== undefined? def_value : 0,
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
    // ANAC Linee Guida 2.pdf
    // http://www.bosettiegatti.eu/info/norme/statali/2010_0207.htm#ALLEGATO_G
    //
    // From: FILE 1_ ESTRATTO 02_OEPV E METODI MULTICRITERI.pdf
    // Per definire una classifica, è necessario ripetere la procedura cancellando di volta in volta l’offerta risultata vincitrice nella tornata precedente.
    // Per le ragioni indicate il metodo Electre può risultare non adeguato quando il numero delle offerte presentate è inferiore a tre, perché causa effetti distorsivi nel processo di valutazione.

    // Prepare set of real `offerte`
    const bids = offerte.map(o => {
        return {nome:o.nome, v:[o.economica].concat(o.tecnica)};
    });
    let fc = criteriFlat(bando.criteri);
    const weights = [bando.peso_economica].concat(fc.map((c) => c.peso));

    let rank = {}, i = 1;
    while (true) {
        let iter_bids = bids.filter(o => rank[o.nome] === undefined);
        if (iter_bids.length <= 2) {
            for (let j in iter_bids)
                rank[iter_bids[j].nome] = i;
            break;
        }
        let winners = electreIteration(weights, iter_bids);
        for (let j in winners)
            rank[winners[j]] = i;
        i += winners.length;
    }

    return Object.keys(rank).map(k => {
        return {nome: k, electre: rank[k]};
    });
}

function electreIteration(w, bids) {
    /* w: weights
     * bids: flat `offerte` to be considered in this iteration.
     * returns: `nome` of the winner.
     */


    /* FIXME: due to recursion in step C, we may have less than 3 bids.
     *        The electre method performs poorly in such such conditions.
     *        What to do in this condition is undefined.
     *        We assign the same rank, i.e. both bids win.
     *        Shall better discuss this point with maths guys.
     */
    if (bids.length <= 2) {
        return bids.map(b => b.nome);
    }

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

                let ai = a(k,i),
                    aj = a(k,j),
                    delta = Math.abs(ai - aj);
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
        // Taking from gmax would be the same.
        s[si] = amax(f[si].map(js => amax(js)));
    }

    for (let i=0; i < r; i++) {
        for (let j=0; j < r; j++) {
            if (i == j)
                continue;

            let csum = 0,
                dsum = 0;
            for (let k=0; k < n; k++) {
                if (s[k] === 0)
                    continue;

                csum += f[k][i][j] * 1.0 / s[k] * w[k];
                dsum += g[k][i][j] * 1.0 / s[k] * w[k];
            }
            c[i][j] = csum;
            d[i][j] = dsum;

            if (dsum == 0) { // Then j is dominated by i. Re-run without j.
                return electreIteration(w, bids.filter((_, idx) => idx != j));
            }
        }
    }

    // Step D
    let q = nmatrix([r,r]);
    for (let i=0; i < r; i++)
        for (let j=0; j < r; j++)
            if (i != j)
                q[i][j] = c[i][j] / d[i][j];

    // Step E
    let Pa = nmatrix([r]); // Points on absolute values.
    for (let i=0; i < r; i++) {
        let asum = 0;
        for (let j=0; j < r; j++) {
            if (i == j)
                continue;
            asum += q[i][j];
        }
        Pa[i] = asum;
    }

    // Look for winner[s]
    let Pa_max = amax(Pa);
    return bids.filter((_, idx) => Pa[idx] == Pa_max).map(b => b.nome);
}


function topsis(bando, offerte) {
    // ANAC Linee Guida 2.pdf
    // https://en.wikipedia.org/wiki/TOPSIS

    // Prepare set of real `offerte`
    const bids = offerte.map(o => {
        return {nome:o.nome, v:[o.economica].concat(o.tecnica)};
    });
    let fc = criteriFlat(bando.criteri);
    const w = [bando.peso_economica].concat(fc.map((c) => c.peso));


    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    // Abstract internal structure and match paper algorithm.
    m = (i, k) => bids[i].v[k];

    // Normalization
    let x = nmatrix([r,n]);
    for (let k=0; k < n; k++) {
        // Compute geometric mean for this K
        let gm = 0;
        for (let i=0; i < r; i++) {
            gm += m(i, k) ** 2;
        }
        gm = Math.sqrt(gm);

        // Nomralize values
        if (gm == 0) // they are all 0, nothing to do
            continue
        for (let i=0; i < r; i++)
            x[i][k] = m(i,k) / gm;

    }

    // NOTE: wikipedia dictate to normalize the weight between [0-1]
    //       ANAC says nothig. Looks like nothis changes... anyway we do.
    let wtot = w.reduce((a, b) => a + b),
        wn = w.map(x => x * 1.0 / wtot);

    // Inject weights
    let v = nmatrix([r,n]);
    for (let i=0; i < r; i++)
        for (let k=0; k < n; k++)
            v[i][k] = x[i][k] * wn[k];

    // Compute reference solutions
    // NOTE: we assume higher score is better, i.e. only J+
    let v_b = nmatrix([n]),   // Best alternative v+
        v_w = nmatrix([n]);   // Worst alternative v-
    for (let k=0; k < n; k++) {
        v_b[k] = amax(v.map(i => i[k]));
        v_w[k] = amin(v.map(i => i[k]));
    }

    // Compute bid distances
    let d_b = nmatrix([r, n]), // Bid distance from best
        d_w = nmatrix([r, n]); // Bid distance from worst

    for (let i=0; i < r; i++) {
        let b = 0, w = 0;
        for (let k=0; k < n; k++) {
            b += (v[i][k] - v_b[k]) ** 2;
            w += (v[i][k] - v_w[k]) ** 2;
        }
        d_b[i] = Math.sqrt(b);
        d_w[i] = Math.sqrt(w);
    }

    // Calculate the similarity to the worst condition
    let s = nmatrix([r]);
    for (let i=0; i < r; i++)
        s[i] = d_w[i] / (d_b[i] + d_w[i]);

    // Rank the alternatives according to s (just return)
    return bids.map((o, i) => {
        return {
            nome: o.nome,
            topsis: s[i],
        }
    });
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
switchView('structure');
//switchView('simulation');
