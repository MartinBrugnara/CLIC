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


/* Remember: JavaScript is call-by-sharing.  Like by value,
 *     but for complex types you can use only pointers (thus copy its address).
 * https://stackoverflow.com/questions/518000/is-javascript-a-pass-by-reference-or-pass-by-value-language#3638034
 */


//const electron = require('electron')
import {ipcRenderer} from 'electron'
const {dialog, app} = require('electron').remote;
const fs = require('fs')
const path = require('path')
import * as $ from 'jquery'
import 'bootstrap'
import Vue from 'vue'
import * as deepEqual from 'deep-equal'

import functions from './functions.ts'

const EXAMPLES_DIR = path.join(app.getAppPath(), 'src/assets/examples'),
      F_EMPTY_BANDO = path.join(EXAMPLES_DIR, 'Nuovo.json');

let vm_app_status,
    vm_lab,
    vm_structure,
    vm_data,
    vm_rank,
    vm_errors;


// ============================================================================
// Configuration

// Criterion component
let pad = false,
    pad_structure = false,
    char_width = 8,
    indent = 20; // must be the same as padding-left for ul.

// ============================================================================
// Global objects

// TODO: consider re-init all vm_* everytime a new file is loaded
//      instead of reassigning the keys.

let current,            // Reference to the `bando` currently dislpayed.
    current_org;        // Reference to a copy of the bando as parsed from JSON.

let app_status = {      // Applicatin status, used for info and save().
    fpath: '',
    data: current,
    org: {},
}

vm_app_status = new Vue({
    el: '#app_status',
    data: app_status,
    computed: {
        rpath () {
            let abp_idx = this.fpath.indexOf(EXAMPLES_DIR),
                rp      = this.fpath.replace(EXAMPLES_DIR + '/', '');
            return abp_idx === 0 ? rp : this.fpath;
        },
        read_only () {
            // TODO: consider also to check if can actually write there.
            return this.fpath.indexOf(EXAMPLES_DIR) === 0;
        },
        modified () {
            return !deepEqual(clean_bando(this.data), this.org);
        }
    }
});




// ============================================================================
// Common support structures
const common_filters = {
    undash: function(str) {
        return str.replace(/_/g, ' ');
    },
    capitalize: function(str) {
        return str.replace(/(?:^|\s)\S/g, (a) => a.toUpperCase());
    },
    csub: function(str) {
        let repl = {
            "alpha": "α",
            "alfa": "α",
        }
        if (repl[str])
            return repl[str];
        return str;
    },
    prec_up_1: function(num) {
        if (num === undefined || typeof num !== 'number')
            return '';
        return num.toFixed(1).replace('.0','');
    },
    precn: function(num, n) {
        if (typeof num !== 'number') {
            console.log("wat? precn invoked with", num, n);
            return '';
        }
        return num.toFixed(n || 2);
    },
    npadded: function(n, tot) {
        let ns = n.toString(),
            ts = tot.toString();
        let prefix: string[] = new Array(ts.length - ns.length)
            .fill(' ').reduce(concat, '');
        return prefix + ns;
    },
}

// ============================================================================
// Support functions
let amax = (x:number[]):number => Math.max.apply(Math, x);
let amin = (x:number[]):number => Math.min.apply(Math, x);
let sum = (a:number, b:number):number => a + b;
let concat = (a:string, b:string): string => a + b;
let copy = (o) => JSON.parse(JSON.stringify(o));
let rnd = (min:number, max:number): number => Math.floor((Math.random() * (max - min) + min) * 100)/100;

let eco_mode = (bando) => bando.mod_economica === 'prezzo' ? 'down' : 'up';

let prefix_2_ids = function(prefix) {
    let p = '' + prefix;
    let ll = leafs_lst(current.criteri);
    // Search boundaries to delete
    return ll.map((c, i) => [c.env_name, i])
            .filter(x => (x[0].indexOf(p + '.') === 0) ||
                         (x[0].indexOf(p) === 0 && p.length === x[0].length))
            .map(x => x[1])
            // Should be already sorted. But better safe than sorry.
            // Btw, if not function is supplied id uses alphabetical asc order.
            .sort((a,b) => a-b);
}

let max_bando_depth = function(bando) {
    let f = (b) => {
        if (!b.subcriteri) return 1;
        return Math.max.apply(Math, b.subcriteri.map(f)) + 1;
    }
    return Math.max.apply(Math, bando.criteri.map(f));
}

let criterion_weight = function(c) {
    if (c.subcriteri && c.subcriteri.length)
        return c.subcriteri.map(criterion_weight).reduce(sum, 0);
    if (c.tipo === 'T')
        return c.voci.reduce(sum, 0);
    return c.peso;
}

let economic_weight = function(bando) {
    return 100 - bando.criteri.map(criterion_weight).reduce(sum, 0);
}

let leafs_lst = function(criteri) {
    let rec_list = (prefix, clst) => {
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

let tech_weights = function(ll) {
    return ll.map(criterion_weight);
}

let nmatrix = function (dim: number[], def_value?: any) {
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

// ============================================================================
// Components


Vue.component('criterion', {
    template: '#tpl_criterion',
    props: {
        model: Object,  // The actual criterion data.
        name: String,   // The computed name, in the form '1.3.2'.
        depth: Number,  // Depth in three of this criterion (use for padding).
    },
    beforeUpdate: function() {
        if (!this.is_leaf) return;
        // This guarantee consistency with data.
        // NOTE: since`current` (this) is double linked,
        //      this method is invoked even if the data is modified
        //      by other components
        // NOTE: invokation from @change is required to prevent rendering errors.
        //      See "#tpl_criterio select"
        this.function_change();
    },
    computed: {
        funcs () {
            // Just a proxy for constant global objecet
            return functions;
        },
        funcs_lst () {
            return Object.keys(functions).map(fname => {
                return {
                    fname: fname,
                    o: functions[fname],
                }
            }).sort();
        },
        isWeightEditable () {
            return this.is_leaf && this.model.tipo !== 'T';
        },
        is_leaf () {
            return !(this.model.subcriteri && this.model.subcriteri.length);
        },
        padding () {
            if (!pad)
                return '0';
            if (!current.env_depth)
                current.env_depth = max_bando_depth(current);

            let mx = current.env_depth,
                label = ((mx * 2 - 1) * char_width);
            if (!pad_structure)
                return label + 'px';
            return (mx - this.depth - 1) * indent + label  + 'px';
        },
        weight () {
            // Weight computed on the children.
            return criterion_weight(this.model);
        }
    },
    methods: {
        amin: amin,
        amax: amax,
        function_change () {
            // Structure
            if (this.model.tipo === 'Q') {
                // Be sure at least one is selected and parameters are initialized
                if (this.model.funzione === undefined)
                    Vue.set(this.model, 'funzione', 'identita');

                // Be sure parameters are populated.
                for (let pname in functions[this.model.funzione].up.params) {
                    let p = functions[this.model.funzione].up.params[pname];
                    if (!this.model.parametri)
                        Vue.set(this.model, "parametri", {});
                    if (this.model.parametri[pname] === undefined) {
                        let v = 0;
                        if (p.domain && p.domain.start) v = p.domain.start;
                        Vue.set(this.model.parametri, pname, v);
                    }
                }
            } else if (this.model.tipo  === 'T') {
                if (this.model.voci === undefined)
                    Vue.set(this.model, 'voci', [this.model.peso]);
            }

            // Avoid messing with the data if the kind of function is not changed.
            let old_type = this.env_last_tipo;
            if (this.env_last_tipo && this.env_last_tipo === this.model.tipo)
                return
            this.env_last_tipo = this.model.tipo;

            // Data
            let r = current.offerte.length,
                pi = prefix_2_ids(this.name)[0];
            if (r >0) {
                let y = current.offerte[0].tecnica[pi];
                if (this.model.tipo === 'T') {
                    // Ensure [].
                    // Must also guarantee # of entry. Scenario T2 -> Q -> T.
                    // It's enought to check the first.
                    if (!Array.isArray(y)) {
                        let base = this.model.voci.map(_ => false);
                        for (let i=0; i<current.offerte.length; i++)
                            Vue.set(current.offerte[i].tecnica, pi, copy(base));
                    }
                } else {
                    if (Array.isArray(y)) {
                        for (let i=0; i<current.offerte.length; i++)
                            Vue.set(current.offerte[i].tecnica, pi, rnd(0,1));
                    }
                }
            }

            // Update lab
            if (old_type === 'Q')
                vm_lab.release_by_prefix(this.name);
        },
        remove () {
            // Prepare to adapt data
            let x = prefix_2_ids(this.name),
                start = x[0],
                cnt = x.length;

            // Adapt data
            let r = current.offerte.length;
            for (let i=0; i<r; i++)                                 // bids
                for (let j=0; j<cnt; j++)                           // delete #cnt
                    Vue.delete(current.offerte[i].tecnica, start);  // actually delete

            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1),
                ptr = current.criteri;

            // Visiting children
            let ptrs = [];
            for (let i=0; i < key.length; i++) {
                ptrs.push(ptr);
                ptr = ptr[key[i]].subcriteri;
            }

            // Finding the greates anchestor which has got
            // no other children other than us, and deleting it.
            let k;
            for (k=ptrs.length-1; k > 0 && ptrs[k].length === 1; k--);

            // Actually delete sub-tree
            Vue.delete(ptrs[k], key[k]);

            // Update stats abouth depth
            current.env_depth = max_bando_depth(current);

            // Clean up lab
            vm_lab.release_by_prefix(this.name);
        },
        sub () {
            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1);
            let pointer = current.criteri;
            for (let i=1; i<key.length; i++) {
                pointer = pointer[key[i-1]].subcriteri;
            }

            let raw = pointer;
            pointer = copy(pointer[key[key.length-1]]);
            pointer.subcriteri = [copy(pointer)];
            pointer.peso = undefined;
            pointer.soglia = undefined;
            pointer.mod_soglia = undefined;


            Vue.set(raw, key[key.length-1], pointer)

            // There is no need to modify the data.
            // To add a sublevel we add column (1.1) but remove (1).
            // We may then reuse info from 1 to populare 1.1.

            // Update stats abouth depth
            current.env_depth = max_bando_depth(current);

            // Update lab
            if (pointer.subcriteri[0].tipo === 'Q')
                vm_lab.update_name(this.name, this.name + '.1');

            Vue.nextTick(refresh_popover);
        },
        add () {
            let x = prefix_2_ids(this.name),
                pi = x[0] + x.length;

            // Get a pointer to subcriteri list
            let key = this.name.toString().split('.').map(i => parseInt(''+i)-1);
            let pointer = current.criteri;
            for (let i=1; i<key.length; i++) {
                pointer = pointer[key[i-1]].subcriteri;
            }
            pointer = pointer[key[key.length - 1]].subcriteri;

            // Create a new one.
            let newc = {peso:0, tipo:'D', soglia:0, mod_soglia:'punti', nome:''}
            // if doesn not work, try with set() at pointer.length
            pointer.push(newc);

            // Adapt the data.
            let r = current.offerte.length,
                default_value = 0;
            for (let i=0; i<r; i++)                                       // bids
                current.offerte[i].tecnica.splice(pi, 0, default_value);  // actually delete

            // Update stats abouth depth
            current.env_depth = max_bando_depth(current);
            Vue.nextTick(refresh_popover);

            // Since we appending by the end, no need to update lab
        },
        add_voce () {
            // Add to the tree and add default entry in data (false)
            this.model.voci.push(0);

            // Update data
            let pi = prefix_2_ids(this.name)[0];
            for (let i=0; i<current.offerte.length; i++)
                current.offerte[i].tecnica[pi].push(false);
        },
        remove_voce (vi) {
            // Add to the tree and delete proper value
            this.model.voci.splice(vi, 1);

            // Update data
            let pi = prefix_2_ids(this.name)[0];
            for (let i=0; i<current.offerte.length; i++)
                current.offerte[i].tecnica[pi].splice(vi, 1);
        },
    },
    filters: common_filters,
});


// ============================================================================
// Generic functions

/* args: {fpath, read_only} */
function load_bando(args) {
    console.log('Loading scenario:' + args.fpath);

    try {
        let raw_content = fs.readFileSync(args.fpath, "utf8");
        let bando_data = JSON.parse(raw_content);

        // TODO: add here check if the bando can not be loaded,
        // if it is not fixable in the app raise exception.

        current_org = clean_bando(bando_data);
        current = copy(current_org);
        let patch = {
            fpath: args.fpath,
            data: current,
            org: current_org,
        };

        // NOTE: we may also avoid the use of Vue.set
        Object.keys(patch).forEach((key) => {
            Vue.set(vm_app_status, key, patch[key]);
        });

        refresh_gui();
    } catch(err) {
        // TODO: improve how we display this error message.
        // & this should be only Fatal.
        console.error(err);
        dialog.showErrorBox('Errore di caricamento',
            'Si e\' verificatio un errore caricando ' + args.fpath + ' .\n' +
            err.name + ': ' + err.message + '.');

        if (args.fpath !== F_EMPTY_BANDO)
            import_export.clear(true);
    }
}

// -- Global state.
function refresh_gui() {
    if (!current) {
        // No bando loaded: load empty.
        load_bando({fpath: F_EMPTY_BANDO});
        return;
    }


    if (!vm_structure) {
        // Init
        vm_structure = new Vue({
            el: '#structure',
            data: {
                bando: current,
            },
            methods: {
                amin: amin,
                amax: amax,
                add_root_criterion () {
                    let newc = {peso:0, tipo:'D', soglia:0, mod_soglia:'punti', nome:''}
                    current.criteri.push(newc);

                    // Adapt the data.
                    let r = current.offerte.length, default_value = 0;
                    for (let i=0; i<r; i++)                              // bids
                        current.offerte[i].tecnica.push(default_value);  // actually delete

                    Vue.nextTick(refresh_popover);
                },
            },
            computed: {
                economic_weight () {
                    return economic_weight(this.bando);
                },
                base_required () {
                    return this.funcs[this.bando.funzione_economica][this.eco_mode].base_asta === true;
                },
                funcs () {
                    // Just a proxy for constant global objecet
                    return functions;
                },
                funcs_lst () {
                    return Object.keys(functions).map(fname => {
                        return {
                            fname: fname,
                            o: functions[fname],
                        }
                    }).sort();
                },
                eco_mode () {
                    return eco_mode(this.bando);
                },
                eco_got_param: function() {
                    let m = eco_mode(this.bando),
                        o = functions[this.bando.funzione_economica][m];
                    return o.params && Object.keys(o.params).length;
                }
            },
            filters: common_filters,
        });
    }

    // Uset to init and refresh
    const vm_data_defaults = {
        env_data_mode: 'raw',
        env_name_show: 'hide',
        env_frozen: {},
    };
    if (!vm_data) {
        vm_data = new Vue({
            el: '#data-container',
            data: {
                env_data_mode: vm_data_defaults.env_data_mode,
                env_name_show: vm_data_defaults.env_name_show,
                env_frozen: copy(vm_data_defaults.env_frozen),
                bando: current,
            },
            methods: {
                amin: amin,
                amax: amax,
                // For DATA:
                remove (index) {
                    Vue.delete(this.bando.offerte, index);

                    // Update frozen
                    for (let c in this.env_frozen)
                        Vue.delete(this.env_frozen[c], index);
                },
                clone (index) {
                    let cp = copy(this.bando.offerte[index]);
                    let nome = cp.nome;

                    if (!/ [i]+$/.test(nome))
                        nome += ' i';
                    while (this.bando.offerte.filter(o => o.nome == nome).length)
                        nome += 'i';

                    // Maybe ask via dialog or just generate.
                    cp.nome = nome;
                    this.bando.offerte.splice(index + 1, 0, cp);

                    // Update frozen
                    for (let c in this.env_frozen)
                        this.env_frozen[c].splice(index+1,0,{did_not_exists:true});
                },
                add () {
                    // Mine name
                    let nome = "Nuova"
                    if (!/ [i]+$/.test(nome))
                        nome += ' i';
                    while (this.bando.offerte.filter(o => o.nome == nome).length)
                        nome += 'i';

                    // Build
                    let c = leafs_lst(this.bando.criteri);
                    let offerta = {
                        nome: nome,
                        // NOTE: economica must be > 0;
                        economica: this.bando.offerte.length < 2 ? rnd(0,1) : rnd(
                            amin(this.bando.offerte.map(o => o.economica)),
                            amax(this.bando.offerte.map(o => o.economica))
                        ),
                        tecnica:  c.map((c, i) => {
                            if (c.tipo === 'T')
                                return c.voci.map(_ => rnd(0,1) >= 0.5)
                            else if (c.tipo == 'D')
                                return rnd(0,1);
                            else
                                return this.bando.offerte.length < 2 ? rnd(0,1) : rnd(
                                    amin(this.bando.offerte.map(o => o.tecnica[i])),
                                    amax(this.bando.offerte.map(o => o.tecnica[i]))
                                );
                        })
                    }

                    // Add to current list
                    this.bando.offerte.push(offerta);

                    // Update freeze list
                    for (let c in this.env_frozen)
                        this.env_frozen[c].push({did_not_exists: true})
                },
                freeze (c_env_name) {
                    let col_id = this.cols
                        .map((c, i) => ({i: i, c: c})).
                        filter(x => {
                            return x.c.env_name === c_env_name;
                        })[0].i;

                    let frozen_col = this.bando.offerte.map((o, i) => ({
                        was_issue: this.points[i].excluded_for[col_id],
                        points: this.points[i].tecnica[col_id],
                        raw: this.bando.offerte[i].tecnica[col_id],
                    }));

                    Vue.set(this.env_frozen, c_env_name, frozen_col);
                },
                unfreeze (c_env_name) {
                    Vue.delete(this.env_frozen, c_env_name);
                },
                freeze_eco () {
                    let frozen_col = this.bando.offerte.map((o, i) => ({
                        points: this.points[i].economica,
                        raw: this.bando.offerte[i].economica,
                    }));

                    Vue.set(this.env_frozen, 'eco', frozen_col);
                },
                unfreeze_eco () {
                    Vue.delete(this.env_frozen, 'eco');
                },
                update_frozen_name(old, actual) {
                    Vue.set(this.env_frozen, actual, this.env_frozen[old]);
                    Vue.delete(this.env_frozen, old);
                }
            },
            computed: {
                economic_weight () {
                    return economic_weight(this.bando);
                },
                fatal_errors () {
                    // FIXME: should return true, only when the errors are fatal,
                    // i.e. when we can not compute the ranks.
                    // Now, it returns true if there is any error.
                    return check_bando(this.bando)[1].length > 0;
                },
                enable_names () {
                    return this.env_name_show === 'show' &&
                        this.bando.criteri.concat(leafs_lst(this.bando.criteri))
                        .map(c => c.nome || '')
                        .filter(n => n.length)
                        .length > 0;
                },
                fst_lvl_names () {
                    let ll = leafs_lst(this.bando.criteri);
                    return this.bando.criteri.map((c, i) => {
                        let y = prefix_2_ids((i + 1) + '')
                            .map(i =>
                                (ll[i].tipo === 'T' && this.env_data_mode !== 'points' ?
                                    ll[i].voci.length : 1) *
                                (this.env_frozen[ll[i].env_name] ? 2 : 1))
                            .reduce(sum, 0);

                        return {
                            nome: c.nome,
                            size: y,
                        };
                    })
                },
                weights () {
                    return tech_weights(leafs_lst(this.bando.criteri));
                },
                cols () {
                    return leafs_lst(this.bando.criteri);
                },
                points () {
                    let offerte = apply_functions(this.bando)
                    if (this.bando.riparametrizzazione1)
                        offerte = apply_scale(this.bando, offerte);
                    return apply_thresholds(this.bando, this.bando.offerte, offerte);
                },
            },
            filters: common_filters,
        });
    }


    const vm_rank_defaults = {env_data_orderby: 'agg_desc'}
    if (!vm_rank) {
        vm_rank = new Vue({
            el: '#rank',
            data: {
                env_data_orderby: vm_rank_defaults.env_data_orderby,
                bando: current,
            },
            computed: {
                fatal_errors () {
                    // FIXME: should return true, only when the errors are fatal,
                    // i.e. when we can not compute the ranks.
                    // Now, it returns true if there is any error.
                    return check_bando(this.bando)[1].length > 0;
                },
                scoreboard () {
                    if (this.fatalErrors)
                        return [];

                    let offerte = apply_functions(this.bando);
                    offerte = apply_thresholds(this.bando, this.bando.offerte, offerte);
                    const excluded = offerte.filter(o => o.excluded).map(o => o.nome).join(', ');
                    offerte = offerte.filter(o => !o.excluded);

                    let agg = aggregativo_compensatore(this.bando, offerte)
                        .sort((a, b) => b.agg - a.agg);
                    let ele = electre(this.bando, offerte);
                    let tops = topsis(this.bando, offerte)
                        .sort((a, b) => b.topsis - a.topsis);

                    let board = {};
                    offerte.forEach((o) => board[o.nome] = {nome: o.nome});
                    agg.forEach((e, r) => {
                        board[e.nome].agg = e.agg;
                        board[e.nome].agg_rank = r + 1;
                    });
                    ele.forEach((e) => board[e.nome].electre = e.electre);
                    tops.forEach((e, r) => {
                        board[e.nome].topsis = e.topsis;
                        board[e.nome].topsis_rank = r + 1;
                    });

                    // Offerta, Agg, Electre, Electre100 Tops
                    let x = this.env_data_orderby.split('_'),
                        field = x[0], order = x[1];

                    return {
                        rank: Object.values(board).sort((a, b) =>
                            (-1)**(+(order === 'desc')) *    // asc - desc
                            (+(field === 'nome' ?
                                2 * (+(a[field] > b[field])) - 1 : // stringhe
                                a[field] - b[field]))),  // num
                        excluded: excluded,
                    }
                }
            },
            filters: common_filters,
        });
    }


    if (!vm_errors) {
        vm_errors = new Vue({
            el: '#errors',
            data: {
                bando: current,
            },
            computed: {
                errors: function() {
                    return check_bando(this.bando)[1];
                }
            },
        });
    }


    let vm_lab_defaults = {
        env_frozen: {},
        env_selected_criteria: [],
        env_new_criteria: '-1',
        env_show_eco: false,
    };
    if (!vm_lab) {
        // Init
        vm_lab = new Vue({
            el: '#lab',
            data: {
                env_frozen: copy(vm_lab_defaults.env_frozen),
                env_selected_criteria: copy(vm_lab_defaults.env_selected_criteria),
                env_new_criteria: vm_lab_defaults.env_new_criteria,
                env_show_eco: vm_lab_defaults.env_show_eco,
                bando: current,
            },
            computed: {
                criteria () {
                    return leafs_lst(this.bando.criteri)
                        .filter(c => c.tipo === 'Q')
                        .filter(c => this.env_selected_criteria
                            .filter(s => s.env_name === c.env_name)
                            .length === 0);
                },
                eco_mode () {
                    return eco_mode(this.bando);
                },
                funcs_lst () {
                    return Object.keys(functions).map(fname => {
                        return {
                            fname: fname,
                            o: functions[fname],
                        }
                    }).sort();
                },
                funcs () {
                    return functions;
                },
                padding () {
                    if (!pad)
                        return '0';
                    if (!current.env_depth)
                        current.env_depth = max_bando_depth(current);
                    let mx = current.env_depth,
                        label = ((mx * 2 - 1) * char_width);
                    if (!pad_structure)
                        return label + 'px';
                    return (mx - this.depth - 1) * indent + label  + 'px';
                },
            },
            methods: {
                amin: amin,
                amax: amax,
                done (i) {
                    if (i === -1) {
                        if (this.env_frozen['eco'])
                            this.toggle_eco_freeze();
                        this.env_show_eco = false;
                    } else {
                        this.unfreeze(this.env_selected_criteria[i].env_name);
                        Vue.delete(this.env_selected_criteria, i);
                    }
                },
                manage () {
                    if (this.env_new_criteria === "-1") {
                        this.env_show_eco = true;
                    } else {
                        if (!this.criteria[this.env_new_criteria])
                            return;
                        this.env_selected_criteria.push(this.criteria[this.env_new_criteria]);
                    }
                    Vue.nextTick(refresh_popover);
                },
                function_change (i) {
                    let model = this.env_selected_criteria[i];

                    // Be sure parameters are populated.
                    for (let pname in functions[model.funzione].up.params) {
                        let p = functions[model.funzione].up.params[pname];
                        if (!model.parametri)
                            Vue.set(model, "parametri", {});
                        if (model.parametri[pname] === undefined) {
                            let v = 0;
                            if (p.domain && p.domain.start) v = p.domain.start;
                            Vue.set(model.parametri, pname, v);
                        }
                    }
                },
                toggle_freeze (i) {
                    let model = this.env_selected_criteria[i];
                    if (this.env_frozen[model.env_name]) this.unfreeze(model.env_name);
                    else this.freeze(model);
                },
                freeze (c) {
                    vm_data.freeze(c.env_name);

                    // Build str
                    let str = [];
                    str.push(common_filters.capitalize(common_filters.undash(c.funzione)));
                    str.push('con');

                    for (let pname in this.funcs[c.funzione].up.params) {
                        const pname_clean =  common_filters.csub(common_filters.undash(pname));
                        str.push(pname_clean + '=' + c.parametri[pname]);
                        str.push('e');
                    }
                    str.pop();
                    str.push(str.pop() + '.');

                    if (c.soglia) {
                        str = str.concat(['Con soglia impostata a', c.mod_soglia, c.soglia + '.'])
                    }

                    Vue.set(this.env_frozen, c.env_name, str.join(' '));
                },
                unfreeze (name) {
                    vm_data.unfreeze(name);
                    Vue.delete(this.env_frozen, name);
                },
                release_by_prefix (prefix) {
                    Object.keys(this.env_frozen)
                        .map((k, i) => ({k:k, i:i}))
                        .filter(x => x.k === prefix ||
                                x.k.indexOf(prefix + '.') === 0)
                        .forEach(x => this.done(x.i));
                },
                update_name (old, actual) {
                    // === Substitue current element with new one from ll in env_selected,

                    // Find index of old
                    let match = Object.keys(this.env_frozen)
                        .map((k, i) => ({k:k, i:i}))
                        .filter(x => x.k === old)

                    if (match.length !== 1) {
                        console.error(old, "matched wrong # of records (1)", match);
                    }

                    let old_id = match[0].i;



                    // Replace reference
                    Vue.set(this.env_selected_criteria, old_id,
                        this.criteria.filter(x => x.env_name === actual)[0]);

                    // === update name in env_freezed (no data)
                    if (!this.env_frozen[old])
                        return;

                    Vue.set(this.env_frozen, actual, this.env_frozen[old])
                    Vue.delete(this.env_frozen, old);
                    vm_data.update_frozen_name(old, actual);
                },
                toggle_eco_freeze () {
                    if (!this.env_frozen['eco']) {
                        vm_data.freeze_eco();

                        let str = [];
                        str.push(common_filters.capitalize(common_filters.undash(this.bando.funzione_economica)));
                        str.push('con');

                        let params = this.funcs[this.bando.funzione_economica][eco_mode(this.bando)].params;
                        for (let pname in params) {
                            const pname_clean =  common_filters.csub(common_filters.undash(pname));
                            str.push(pname_clean + '=' + this.bando.parametri_economica[pname]);
                            str.push('e');
                        }
                        str.pop();
                        str.push(str.pop() + '.');

                        Vue.set(this.env_frozen, 'eco', str.join(' '));
                    } else {
                        vm_data.unfreeze_eco();
                        Vue.delete(this.env_frozen, 'eco');
                    }
                }
            },
            filters: common_filters,
        });
    }

    // Refresh
    Vue.set(vm_structure, 'bando', current);
    Vue.set(vm_data, 'bando', current);
    Vue.set(vm_rank, 'bando', current);
    Vue.set(vm_errors, 'bando', current);
    Vue.set(vm_lab, 'bando', current);

    // Reset defaults
    // data, lab, rank
    for (let k in vm_data_defaults)
        Vue.set(vm_data, k, copy(vm_data_defaults[k]));
    for (let k in vm_rank_defaults)
        Vue.set(vm_rank, k, copy(vm_rank_defaults[k]));
    for (let k in vm_lab_defaults)
        Vue.set(vm_lab, k, copy(vm_lab_defaults[k]));

    Vue.nextTick(refresh_popover);
}



// ============================================================================
// SIMULATION functions

function apply_functions(bando) {
    /* Given a bando, applies functions to the bids values and, if required,
        * scales the results. Produces a list of bids to be used with ranking
        * algorithms.
        */

    /* {nome, economica (0-1), tecnica [(0-1),...]} */

    let ll = leafs_lst(bando.criteri);

    return bando.offerte.map((o, oi) => {
        // Compute economic bid.
        let res = {
            nome: o.nome,
            economica: 0,
            tecnica: <number[]>[]
        }

        let eco_f = functions[bando.funzione_economica][eco_mode(bando)]
        res.economica = eco_f.f(
            o.economica,             // Economic bid
            bando.parametri_economica,  // Economic function parameters
            bando,                      // Bando for global var (i.e. base_asta)
            // All economic bids for interdependent functions
            bando.offerte.map((o) => o.economica));

        res.tecnica = o.tecnica.map((t, ti) => {
            if (ll[ti].tipo === 'T') {          // Is tabular -> bool to int
                return ll[ti].voci
                    .map((v, vi) => v * t[vi])
                    // NOTE: Dive by amax instead to guarantee 0-1 range cover.
                    .reduce(sum, 0) / ll[ti].voci.reduce(sum, 0);
            } else if (ll[ti].tipo === 'Q') {
                return functions[ll[ti].funzione].up.f(
                    t,                          // Current bid
                    ll[ti].parametri,           // Parameters
                    bando,                      // Bando for global param
                    bando.offerte.map(o => o.tecnica[ti]));
            } else {
                return t;
            }
        });

        return res;
    });
}

function apply_thresholds(bando, raw, points) {
    let ll   = leafs_lst(bando.criteri);
    return points.map((o, i) => {
        let issues = {};
        raw[i].tecnica
            .map((t, ti) => {
                if (ll[ti].mod_soglia !== 'valore')
                    return '';
                if (ll[ti].tipo === 'T')
                    t = t.reduce(sum, 0);
                return t < ll[ti].soglia ? ti : '';
            }).concat(o.tecnica
                .map((t, ti) => {
                    if (ll[ti].mod_soglia !== 'punti')
                        return '';
                    return t < ll[ti].soglia ? ti : '';
                })
            ).filter(x => typeof x === 'number')
            .forEach(x => issues[x] = true);

        return {
            nome: o.nome,
            economica: o.economica,
            tecnica: o.tecnica,
            excluded_for: issues,
            excluded: Object.keys(issues).length > 0,
        }
    });
}

function apply_scale(bando, offerte) {
    // RIPARAMETRAZIONE 1

    // Scale each leaf
    let ll   = leafs_lst(bando.criteri),
        maxs = ll.map((_, i) => amax(offerte.map(o => o.tecnica[i])));

    return  offerte.map(o => {
        return {
            nome: o.nome,
            economica: o.economica / amax(offerte.map(o => o.economica)),
            tecnica: o.tecnica
                // this guarnatees [0-1]
                .map((t, i) => maxs[i] ? t/maxs[i] : 0),
        }
    });
}


function aggregativo_compensatore(bando, offerte) {
   let ll       = leafs_lst(bando.criteri),
       w_techs = tech_weights(ll),
       w_eco  = economic_weight(bando);

    if (bando.riparametrizzazione1)
        offerte = apply_scale(bando, offerte);

    if (bando.riparametrizzazione2) {
        // Rescale tecnica and economica to give 1 to the best.
        let tech = offerte.map(o =>
            o.tecnica
                .map((v, vi) => w_techs[vi] * v)
                .reduce(sum, 0)
        );

        let mtech = amax(tech),
            meco  = amax(offerte.map(o => o.economica));
        return offerte.map((o, i) => {
            return {
                nome: o.nome,
                agg: o.economica / meco * w_eco + tech[i] / mtech * (100-w_eco) ,
            }
        })
    }

    let weights = [w_eco].concat(w_techs);
    return offerte.map(o => {
        return {
            nome: o.nome,
            agg: [o.economica].concat(o.tecnica)
                .map((v, vi) => weights[vi] * v)
                .reduce(sum, 0)
        };
    });
};

function electre(bando, offerte) {
    // ANAC Linee Guida 2.pdf
    // http://www.bosettiegatti.eu/info/norme/statali/2010_0207.htm#ALLEGATO_G
    //
    // From: FILE 1_ ESTRATTO 02_OEPV E METODI MULTICRITERI.pdf
    // Per definire una classifica, è necessario ripetere la procedura cancellando di volta in volta l’offerta risultata vincitrice nella tornata precedente.

    // Prepare set of real `offerte`
    const bids = offerte.map(o => {
        return {nome:o.nome, v:[o.economica].concat(o.tecnica)};
    });
    let ll = leafs_lst(bando.criteri);
    const weights = [economic_weight(bando)].concat(tech_weights(ll));

    let rank = {}, i = 1;
    while (i <= bids.length) {
        let iter_bids = bids.filter(o => rank[o.nome] === undefined);
        let winners = electre_iteration(weights, iter_bids);
        for (let j in winners)
            rank[winners[j]] = i;
        i += winners.length;
    }

    return Object.keys(rank).map(k => {
        return {nome: k, electre: rank[k]};
    });
}

function electre_iteration(w, bids) {
    /* w: weights
     * bids: flat `offerte` to be considered in this iteration.
     * returns: `nome` of the winner.
     */

    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    if (r === 1)
        return [bids[0].nome];

    // Step B
    let f = nmatrix([n,r,r]),
        g = nmatrix([n,r,r]);

    // Abstract internal structure and match paper algorithm.
    const a = (k, i) => bids[i].v[k];

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
                let rec = electre_iteration(w, bids.filter((_, idx) => idx != j));
                if (csum === 0) // was tied -> assign same score.
                    rec = rec.concat([bids[j].nome]);
                return rec;
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
    let ll = leafs_lst(bando.criteri);
    const w = [economic_weight(bando)].concat(tech_weights(ll));


    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    // Abstract internal structure and match paper algorithm.
    const m = (i, k) => bids[i].v[k];

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
    let wtot = w.reduce(sum, 0),
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



// ============================================================================
// Consistency checks & export functions

function clean_criterion(c) {
    let name:string = c.nome !== undefined? c.nome : '';
    if (c.subcriteri !== undefined && c.subcriteri.length > 0) {
        return {
            nome: name,
            subcriteri: c.subcriteri.map(clean_criterion),
        };
    }

    let n = {
        tipo:       <string>c.tipo,
        funzione:   <string>c.funzione,
        soglia:     <number>c.soglia || 0,
        mod_soglia: <string>c.mod_soglia || 'punti',
    };

    if (n.tipo === 'Q') {
        n['parametri'] = {};
        Object.keys(functions[n.funzione]['up'].params)
            .forEach(p => n['parametri'][p] = <number>c.parametri[p]);
    }

    if (n.tipo === 'T') n['voci'] = <number[]> c.voci
    else n['peso'] = <number> c.peso;
    return n;
}

function clean_bando(bando) {
    let cleaned = {};

    if (bando === undefined)
        return cleaned;

    let fstOrderAttributes = [
        'mod_economica',
        'funzione_economica',
        // `base_asta` is mandatory only if mod_economica is prezzo.
        // Since many sim. consist in switching modes, we keep it always.
        'base_asta',
        'riparametrizzazione1',
        'riparametrizzazione2',
    ];
    fstOrderAttributes.forEach(f => cleaned[f] = bando[f]);

    // 'parametri_economica' depends on 'funzione_economica' and 'mod_economica'
    cleaned['parametri_economica'] = {};
    let m = eco_mode(bando);
    Object.keys(functions[cleaned['funzione_economica']][m].params)
        .forEach(p => cleaned['parametri_economica'][p] = bando.parametri_economica[p]);

    // Criteri must be recursive
    cleaned['criteri'] = bando.criteri.map(clean_criterion);

    // Data, just copy
    cleaned['offerte'] = copy(bando.offerte);

    return cleaned;
}


function check_criterion(c, prefix) {
    let errors = [];

    if (c.subcriteri !== undefined && c.subcriteri.length > 0) {
        return errors.concat(...c.subcriteri.map((s, i) => check_criterion(s, prefix + '.' + (i+1))));
    }

    if (['Q','D','T'].indexOf(c.tipo) < 0) {
        errors.push('[C ' + prefix + '] ' + c.tipo +
            ' non e\' un valore valido per \'tipo\'. ' +
            'I vaolori possibili sono \'D\', \'T\' \'Q\'.');
    }

    if (c.tipo !== 'T' && (typeof c.peso !== 'number' || c.peso < 0 || c.peso > 100)) {
        errors.push('[C ' + prefix + '] ' + c.peso +
            ' non e\' un valore valido per il peso. ' +
            'Deve essere un numero tra 0 e 100,');
    }

    if (c.tipo === 'Q') {
        if (functions[c.funzione] === undefined) {
            errors.push('[C ' + prefix + '] ' + c.funzione +
                ' non e\' supportata. Le funzioni disponibili sono le seguenti: ' +
                Object.keys(functions).join(',') + '.');
        } else {
            Object.keys(functions[c.funzione]['up'].params).forEach(p => {
                errors = errors.concat(check_parameter('C ' + prefix, c.funzione, 'up',
                    c.parametri, p));
            });


            if (functions[c.funzione]['up'].validators) {
                errors = errors.concat(functions[c.funzione]['up'].validators
                    .map(v => v(c.parametri))
                    .filter(r => !r[0])
                    .map(r => '[C ' + prefix + '] parameteri: ' + r[1]));
            }

        }
    }

    if (c.tipo === 'T') {
        if (c.voci === undefined || !Array.isArray(c.voci)) {
            errors.push('[C ' + prefix + '] Quando il tipo e Tabellare (T),' +
                ' `voci` deve essere un vettore di numeri.');
        } else {
            c.voci.forEach((v, vi) => {
                if (typeof v !== 'number' || v < 0 || v > 100) {
                    errors.push('[C ' + prefix + '] Il valore ' + v + ' per ' +
                        'la voce ' + (vi+1) + ' non e\' valido. ' +
                        'Deve essere un numero tra 0 e 100');
                }
            })
        }
    }

    // Add check for mod_soglia
    if (['punti', 'valore'].indexOf(c.mod_soglia) < 0) {
            errors.push('[C ' + prefix + '] ' + c.mod_soglia + ' non e\' un valore ' +
                'valido come mod_soglia. Le opzioni valide sono `punti` e `valore`.');
    }

    if ((c.mod_soglia === 'punti' || c.tipo === 'D') &&
            (isNaN(parseFloat(c.soglia)) || c.soglia < 0 || c.soglia > 1))
    {
            // 'D' e punti devono essere tra 0 e 1
            errors.push('[C ' + prefix + '] ' + c.soglia + ' non e\' un valore ' +
                'valido come soglia. Deve essere un numero tra 0 e 1.');
    } else if (isNaN(parseFloat(c.soglia)) || c.soglia < 0) {
        errors.push('[C ' + prefix + '] ' + c.soglia + ' non e\' un valore ' +
            'valido come soglia. Deve essere un numero maggiore o uguale a 0.');
    }
    return errors;
}

function check_parameter(field, func, m, params, p) {
    let dom = functions[func][m].params[p].domain,
        req = functions[func][m].params[p].required;

    if (((typeof params[p] === 'number') &&
            ((dom.start !== null && params[p] < dom.start) ||
                (dom.end !== null && params[p] > dom.end))) ||
        (req && isNaN(parseFloat(params[p])))) {

        return ['[' + field + '] Parametro ' + p + ': ' +
            params[p] + ' non e\' un valore valido. ' +
            (dom.required ? 'Se specificato d' : 'D') +
            'eve essere un numero maggiore di ' + dom.start + '' +
            (dom.end !== '' ? (' e minore di ' + dom.end) : '') + '.'];
    }
    return [];
}


// TODO: PUT this as precontion for rendering "rank" and maybe also "points"
function check_bando(bando, fix?:boolean):[boolean,string[]] {
    /* Check the bando consistency and returns
     * [fatal:boolean, [...error_messages:string]]
     *
     * If the `fix` is true,
     * then all reasonable fix are applied,
     * and a third item is returned: the fixed bando.
     *
     * FIXME: for now it just returns errors.
     */

    // OPT: try also to recover if possible

    if (bando === undefined)
        return [false, []];

    let fatal = false;
    let errors = [];

    if (['prezzo', 'ribasso'].indexOf(bando.mod_economica) < 0) {
        errors.push('[mod_economica] ' + bando.mod_economica +
            'non e\' un valore valido. I vaolori possibili sono "prezzo" e "ribasso".');
    }

    if (functions[bando.funzione_economica] === undefined) {
        errors.push('[funzione_economica] ' + bando.funzione_economica +
            ' non e\' supportata. Le funzioni disponibili sono le seguenti: ' +
            Object.keys(functions).join(',') + '.');
    }

    // Sum must be 100
    // TODO: consider issue warning if ew not in reasonale range.. [10-50] ?
    let ew = economic_weight(bando);
    if (ew < 0 || ew > 100) {
        errors.push('[punti] la somma totale dei punti deve fare 100. ' +
            'Al momento e\' ' + (100 - ew) + '.');
    }

    if (typeof bando.base_asta === 'number' && bando.base_asta <= 0){
        errors.push('[base_asta] ' + bando.base_asta +
            ' non e\' un valore valido. Se specificato deve essere un numero maggiore di 0.');
    }

    if (functions[bando.funzione_economica][eco_mode(bando)].base_asta === true &&
        (isNaN(parseFloat(bando.base_asta)) || bando.base_asta <= 0)) {
        errors.push('[base_asta] ' + bando.base_asta +
            ' non e\' un valore valido. Il campo e\' richiesto per la funzione scelta.');
    }

    if (typeof bando.riparametrizzazione1 !== 'boolean') {
        errors.push('[riparametrizzazione1 ] ' + bando.riparametrizzazione1 +
            ' non e\' un valore valido. Deve essere un boolean (true, false).');
    }

    if (typeof bando.riparametrizzazione2 !== 'boolean') {
        errors.push('[riparametrizzazione2 ] ' + bando.riparametrizzazione2 +
            ' non e\' un valore valido. Deve essere un boolean (true, false).');
    }

    // 'parametri_economica' depends on 'funzione_economica' and 'mod_economica'
    let m = eco_mode(bando);
    Object.keys(functions[bando.funzione_economica][m].params).forEach(p => {
        errors = errors.concat(check_parameter('funzione_economica',
            bando.funzione_economica, m, bando.parametri_economica, p));
    });

    if (functions[bando.funzione_economica][m].validators) {
        errors = errors.concat(functions[bando.funzione_economica][m].validators
            .map(v => v(bando.parametri_economica))
            .filter(r => !r[0])
            .map(r => '[funzione_economica] parameteri: ' + r[1]));
    }



    // Criteri must be recursive
    errors = errors.concat(...bando.criteri.map((s, si) => check_criterion(s, '' + (si+1))));

    // Data
    let ll = leafs_lst(bando.criteri);
    let name_unique = {};
    bando.offerte.forEach((o, i) => {
        name_unique[o.nome] = true;
        if (o.nome === undefined) {
            fatal = true;
            errors.push('[O ' + (i+1) + '] il campo nome e\' mancante.')
        }

        if (isNaN(parseFloat(o.economica))) {
            fatal = true;
            errors.push('[O ' + (i+1) + '] il campo economica deve essere un numero.');
        }

        if (o.tecnica === undefined || !Array.isArray(o.tecnica) ||
            o.tecnica.length != ll.length) {
            fatal = true;
            errors.push('[O ' + (i+1) + '] il campo tecnica deve essere un array di dimensione ' + ll.length + '.');
        }

        o.tecnica.forEach((t, ti) => {
            if (ll[ti].tipo === 'T') {
                if (!Array.isArray(t) || t.length != ll[ti].voci.length) {
                    fatal = true;
                    errors.push('[O ' + (i+1) + '] tecnica, valore ' + (ti+1) +
                        ' deve essere un array di ' + ll[ti].voci.length +
                        ' booleani.');
                } else {
                    t.forEach((x, xi) => {
                        if (typeof x !== 'boolean') {
                            errors.push('[O ' + (i+1) + '] tecnica, valore ' + (ti+1) +
                                ', voce ' + xi + 'deve essere un booleano.');
                        }
                    });
                }
            } else if (ll[ti].tipo === 'D') {
                if (typeof t !== 'number' || t < 0 || t > 1) {
                    errors.push('[O ' + (i+1) + '] tecnica, valore ' + (ti+1) +
                        ' deve essere un numero tra 0 e 1.');
                }
            } else {
                if (typeof t !== 'number' || t < 0) {
                    errors.push('[O ' + (i+1) + '] tecnica, valore ' + (ti+1) +
                        ' deve essere un numero maggiore di 0.');
                }
            }
        });
    });

    if (Object.keys(name_unique).length !== bando.offerte.length) {
        errors.push('[Offerte] I nomi delle offerte devono essere unici.');
        fatal = true;
    }

    return [fatal, errors];
}

// ============================================================================
// Init gui elements

function refresh_popover() {
    $('#ctree [data-toggle="popover"]:not([data-original-title]), '+
      '#lab [data-toggle="popover"]:not([data-original-title]), '+
      '#data [data-toggle="popover"]:not([data-original-title])').each((i, o) => {

        let content = $(o).next('.popper-content');
          $(o).popover({
            html:true,
              content: content[0],
            template: '' +
                '<div class="popover" role="tooltip">'+
                '<div class="arrow"></div>' +
                '<h3 class="popover-header">Nome x</h3>' +
                '<div class="popover-body"></div></div>',
        }).on('show.bs.popover', function() {
            $('.popover.show').removeClass('show'); // hide open ones.
            content.removeClass('hide').addClass('show');
        }).on('hide.bs.popover', function() {
            content.addClass('hide');
        }).on('inserted.bs.popover', function(o) {
            let xo = o;
            return () => {
                if (xo.dataset.force_status === 'hide')
                    $('.popover').addClass('super-hide');
                else
                    $('.popover').removeClass('super-hide');
            };
        }(o));
    });
}

function hide_all_popover() {
    $('[data-toggle="popover"]').popover('hide');
}

function bootstrap_popover() {
    refresh_popover();

    $('body').click(function(ev) {
        // Hide popover when click on something else.
        if (!$(ev.target).closest('.popover, [data-toggle="popover"]').length)
            $('[data-toggle="popover"]').popover('hide');
    });
}

/* ========================================================================== */
// Import - Export
let import_export = {
    open: (path, force: boolean=false) => {
        if(!deepEqual(clean_bando(current), current_org) && force !== true) {
            if (dialog.showMessageBox({
                type: 'question',
                buttons: ['Annulla', 'Continua'],
                defaultId: 0,
                title: 'Bando modificato',
                message: 'Il bando e\' stato modificato. Continuare senza salvare?',
                cancelId: 0,
            }) === 0) return;
        }

        if (!path) {
            let paths = dialog.showOpenDialog({
                title: 'Apri Bando',
                filters: [{name: 'Bandi', extensions: ['json']}],
                properties: ['openFile', 'treatPackageAsDirectory'],
            });
            if (!paths) return;
            path = paths[0];
        }

        load_bando({fpath: path});
    },
    save: () => {
        import_export.save_as(vm_app_status.read_only ? undefined : vm_app_status.fpath);
        // TODO: maybe pass a message to show to save_as
    },
    save_as: (path) => {
        if (path === undefined) {
            path = dialog.showSaveDialog({
                title: 'Salva Bando',
                defaultPath: 'bando_' + (new Date().getTime()) + '.json',
            });
            if (path === undefined)
                return;
        }

        try {
            // TODO: check for error before save.
            // if corrupt rise error message asking if to continue.
            if (check_bando(current)[1].length) {
                if (dialog.showMessageBox({
                    type: 'question',
                    buttons: ['Annulla', 'Continua'],
                    defaultId: 0,
                    title: 'Bando corrotto',
                    message: 'Il bando contiene errori che possono corrompere il salvataggio. Continuare?',
                    cancelId: 0,
                }) === 0) return;
            }

            let cleaned = clean_bando(current);
            fs.writeFileSync(path, JSON.stringify(cleaned), {encoding:'utf8', mode: 0o664, flag:'w+'});
            current_org = cleaned;
            Vue.set(vm_app_status, 'org', cleaned);
            Vue.set(vm_app_status, 'fpath', path);
        } catch(err) {
            dialog.showErrorBox('Errore nel salvataggio',
                'Si e\' verificatio un errore salvando ' + path + ' .\n' +
                err.name + ': ' + err.message + '.');
        }
    },
    clear (force) {
        import_export.open(F_EMPTY_BANDO, force === true);
    }
}

/* ========================================================================== */
// Menu mappings

function switch_view(view) {
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

    hide_all_popover();
}

ipcRenderer.on('load_bando', (event , args) => import_export.open(args.fpath));
ipcRenderer.on('view', (event , args) => switch_view(args));
ipcRenderer.on('cmd', (event , cmd) => import_export[cmd]());



/* ========================================================================== */
/* Main                                                                       */
/* ========================================================================== */
$(function () {
    refresh_gui();
    switch_view('structure');
    // switch_view('simulation');

    // TODO: wrap into div, and show loading icon instead.
    $('body').removeClass('hide');

    bootstrap_popover();

    // TODO: only for dev
    // import_export.open(path.join(EXAMPLES_DIR, 'Pulizie.json'));
});
