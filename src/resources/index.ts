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
 *     but for complex types you can use only ptrs (thus copy its address).
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

import {functions, FuncNames} from './functions.ts'
import {ModSoglia, CNode, Leaf, EcoMode, Bid, Call, Criterion, Criterion_N, Eco, Tech, CriterionKind, TechCriterion_T, TechCriterion_Q,TechCriterion_D} from './call.ts';

const EXAMPLES_DIR = path.normalize(path.join(app.getAppPath(), 'src/assets/examples')),
      F_EMPTY_BANDO = path.normalize(path.join(EXAMPLES_DIR, 'Nuovo.json'));

let vm_app_status,
    vm_errors,
    vm_structure,
    vm_data,
    vm_rank,
    vm_lab;


// ============================================================================
// Configuration

// Criterion component
let pad = false,
    pad_structure = false,
    char_width = 8,
    indent = 20; // must be the same as padding-left for ul.


// ============================================================================
// Global objects
let current: Call,            // Reference to the `bando` currently dislpayed.
    current_org: Call;        // Reference to a copy of the bando as parsed from JSON.

let app_status = {      // Applicatin status, used for info and save().
    fpath: '',
    data: <Call>current,
    org: <Call>current_org,
}

vm_app_status = new Vue({
    el: '#app_status',
    data: app_status,
    updated () {
        document.title = 'CLIC: What if? ' + path.basename(this.fpath);
    },
    computed: {
        rpath () {
            let abp_idx = this.fpath.indexOf(EXAMPLES_DIR),
                rp      = this.fpath.replace(EXAMPLES_DIR + path.sep, '');
            return abp_idx === 0 ? rp : this.fpath;
        },
        read_only () {
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
            "identita": "identità",
            "proporzionalita inversa": "proporzionalità inversa",
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
let sum = (a: number, b: number):number => a + b;
let concat = (a:string, b:string): string => a + b;
let copy = o => JSON.parse(JSON.stringify(o));
let rnd = (min:number, max:number): number => Math.floor((Math.random() * (max - min) + min) * 100)/100;

let func_mode = (modo) => modo && modo === EcoMode.Price? 'down': 'up';

let prefix_2_ids = function(bando: Call, prefix: string) {
    let p = '' + prefix,
        ll = leafs_lst(bando);

    // Search boundaries to delete
    return ll.map((c, i) => <[string, number]>[c.env_name, i])
        .filter(x => x[0].indexOf(p + '.') === 0 || x[0] === p)
        .map(x => x[1])
        // Should be already sorted. But better safe than sorry.
        // Btw, if not function is supplied id uses alphabetical asc order.
        .sort((a,b) => a-b);
}

let env_depth = 0;
let update_env_depth = function(bando) {
    let f = (b) => {
        if (!b.criteri) return 1;
        return Math.max.apply(Math, b.criteri.map(f)) + 1;
    }
    env_depth = Math.max.apply(Math, bando.criteri.map(f));
    return env_depth;
}

let do_pad = (depth:number) => {
    if (!pad) return '0';
    if (!env_depth) update_env_depth(current);
    let label = ((env_depth * 2 - 1) * char_width);
    if (!pad_structure) return label + 'px';
    return (env_depth - depth - 1) * indent + label  + 'px';
}

let criterion_weight = function(c: Criterion|{criteri: Criterion[]}): number {
    if ('criteri' in c && c.criteri.length > 0)
        return c.criteri.map(criterion_weight).reduce(sum, 0);
    else if ((<Tech>c).tipo === CriterionKind.T)
        return amax((<TechCriterion_T>c).voci.map(x => x.punti));
    return (<TechCriterion_Q|TechCriterion_D|Eco>c).peso || 0;
}

interface AnnotatedLeaf extends Leaf {env_name:string};
let leafs_lst = function(bando: Call): AnnotatedLeaf[] {
    let rec_list = (prefix, clst) => {
        return clst.map((c, i) => {
            let name = prefix + (i + 1);
            if (!(c.criteri && c.criteri.length)) {
                c.env_name = name; // Inject computed name
                return [c];
            }
            return [].concat(...rec_list(name + '.', c.criteri));
        });
    };

    return [].concat(
        ...rec_list('E.', bando.criteri[0].criteri),
        ...(rec_list('C.', bando.criteri[1].criteri)));
}

// EX tech_weights
let weights = function(ll) {
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
        model: Object,   // The actual criterion data.
        name: String,    // The computed name, in the form '1.3.2'.
        depth: Number,   // Depth in three of this criterion (use for padding).
        is_eco: Boolean,
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
        func_mode () {
            return func_mode(this.model.modo);
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
            return this.is_leaf && this.model.tipo !== CriterionKind.T;
        },
        is_leaf () {
            return !(this.model.criteri && this.model.criteri.length);
        },
        padding () {return do_pad(this.depth)},
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
            if (this.model.tipo === CriterionKind.Q || this.is_eco) {
                // Be sure at least one is selected and parameters are initialized
                if (!(this.model.funzione && functions[this.model.funzione][this.func_mode]))
                    Vue.set(this.model, 'funzione', 'identita');

                // Be sure parameters are populated.
                for (let pname in functions[this.model.funzione][this.func_mode].params) {
                    let p = functions[this.model.funzione][this.func_mode].params[pname];
                    if (!this.model.parametri)
                        Vue.set(this.model, "parametri", {});
                    if (this.model.parametri[pname] === undefined) {
                        let v = 0;
                        if (p.domain && p.domain.start) v = p.domain.start;
                        Vue.set(this.model.parametri, pname, v);
                    }
                }
            } else if (this.model.tipo  === CriterionKind.T) {
                if (this.model.voci === undefined || this.model.voci.length === 0)
                    Vue.set(this.model, 'voci', [{nome:'v1', punti: this.model.peso || 0}]);
            }

            // Avoid messing with the data if the kind of function is not changed.
            let old_type = this.env_last_tipo;
            if (this.env_last_tipo && this.env_last_tipo === this.model.tipo)
                return
            this.env_last_tipo = this.model.tipo;

            // Data
            let r = current.offerte.length,
                pi = prefix_2_ids(current, this.name)[0];

            if (r >0) {
                if (vm_data.env_rnd) {
                    if (this.model.tipo === CriterionKind.T) {
                        // Scale current value to the new domain (#voice num)
                        let M = amax(current.offerte.map(o => o.valori[pi])) || 1;
                        for (let i=0; i<current.offerte.length; i++)
                            Vue.set(current.offerte[i].valori, pi,
                                Math.round(current.offerte[i].valori[pi] / M)
                                    * (this.model.voci.length-1));
                    } else if (!(this.model.tipo === CriterionKind.Q || this.is_eco)) {
                        // Scale current values between 0-1
                        let dom = amax(current.offerte.map(o => o.valori[pi])) || 1;
                        for (let i=0; i<current.offerte.length; i++)
                            Vue.set(current.offerte[i].valori, pi,
                                current.offerte[i].valori[pi] / dom);
                    }
                } else {
                    // Put everything to 0
                    for (let i=0; i<current.offerte.length; i++)
                        Vue.set(current.offerte[i].valori, pi, 0);
                }
            }

            // Update lab
            if (old_type === CriterionKind.Q)
                vm_lab.release_by_prefix(this.name);
        },
        remove () {
            // Prepare to adapt data
            let x = prefix_2_ids(current, this.name),
                start = x[0],
                cnt = x.length;

            // Adapt data
            let r = current.offerte.length;
            for (let i=0; i<r; i++)                                 // bids
                for (let j=0; j<cnt; j++)                           // delete #cnt
                    Vue.delete(current.offerte[i].valori, start);   // actually delete

            // Actualli delete
            let key = this.name.toString()
                    .replace('E', '1').replace('C', '2')
                    .split('.').map(i => parseInt(''+i)-1),
                ptr:CNode[] = <CNode[]>(<CNode>current).criteri;

            // Visiting children
            let ptrs = [];
            for (let i=0; i < key.length; i++) {
                ptrs.push(ptr);
                ptr = ptr[key[i]]['criteri'];
            }

            // Finding the greates anchestor which has got
            // no other children other than us, and deleting it.
            // K > 1 (preserve root)
            let k;
            for (k=ptrs.length-1; k > 1 && ptrs[k].length === 1; k--);

            // Actually delete sub-tree
            Vue.delete(ptrs[k], key[k]);

            // Update stats abouth depth
            update_env_depth(current);

            // Clean up lab
            vm_lab.release_by_prefix(this.name);
        },
        sub () {
            let key = this.name.toString()
                .replace('E', '1').replace('C', '2')
                .split('.').map(i => parseInt(''+i)-1);

            let ptr:CNode[] = <CNode[]>(<CNode>current).criteri;
            for (let i=1; i<key.length; i++)
                ptr = ptr[key[i-1]]['criteri'];

            let raw = ptr;
            ptr = (copy(ptr[key[key.length-1]]));
            ptr['criteri'] = [copy(ptr)];
            ptr['peso'] = undefined;
            ptr['soglia'] = 0;
            ptr['mod_soglia'] = 'punti';

            ptr['criteri'][0]['nome'] = '';

            Vue.set(raw, key[key.length-1], ptr)

            // There is no need to modify the data.
            // To add a sublevel we add column (1.1) but remove (1).
            // We may then reuse info from 1 to populare 1.1.

            // Update stats abouth depth
            update_env_depth(current);

            // Update lab
            if (ptr['criteri'][0].tipo === CriterionKind.Q || this.is_eco)
                vm_lab.update_name(this.name, this.name + '.1');

            Vue.nextTick(refresh_popover);
        },
        add () {
            add_criterion(this.name, this.is_eco);
        },
        add_voce () {
            // Add to the tree and add default entry in data (false)
            this.model.voci.push({nome:'', punti:0});
            // Non need to updata data.
        },
        remove_voce (vi) {
            // Add to the tree and delete proper value
            this.model.voci.splice(vi, 1);

            // Update data (if usign the one deleted or later)
            let pi = prefix_2_ids(current, this.name)[0];
            for (let i=0; i<current.offerte.length; i++) {
                let s = current.offerte[i].valori[pi];
                if (s >= vi)
                    Vue.set(current.offerte[i].valori, pi, s - 1);
            }
        },
    },
    filters: common_filters,
});

let add_criterion = function (name:string, is_eco:boolean) {
    // Get a ptr to criteri list
    let key = name
        .replace('E', '1').replace('C', '2')
        .split('.').map(i => parseInt(''+i)-1);
    let ptr:CNode[] = <CNode[]>(<CNode>current).criteri;
    for (let i=1; i<key.length; i++)
        ptr = ptr[key[i-1]].criteri;
    ptr = ptr[key[key.length - 1]].criteri;

    // Create a new one.
    let newc:(TechCriterion_D|Eco) = {peso:0, tipo:CriterionKind.D, soglia:0, mod_soglia: ModSoglia.Points, nome:''};
    if (is_eco) {
        newc = <Eco><any>newc;
        newc.tipo = CriterionKind.Q;
        newc.funzione = FuncNames.identita;
        newc.parametri = {};
        newc.modo = EcoMode.Price;
    }

    (<any[]>ptr).push(newc);

    // Adapt the data.
    let x = prefix_2_ids(current, name),
        pi = x[0] + x.length,
        r = current.offerte.length,
        default_value = 0;
    for (let i=0; i<r; i++)                                      // bids
        current.offerte[i].valori.splice(pi, 0, default_value);  // actually delete

    // Update stats abouth depth
    env_depth = update_env_depth(current);
    Vue.nextTick(refresh_popover);

    // Since we appending by the end, no need to update lab
}



// ============================================================================
// Generic functions

/* args: {fpath, read_only} */
function load_bando(args) {
    console.log('Loading scenario:' + args.fpath);

    try {
        let raw_content = fs.readFileSync(args.fpath, "utf8");
        let bando_data = JSON.parse(raw_content);
        current_org = clean_bando(bando_data);
        current = copy(current_org);
        let patch = {
            fpath: path.normalize(args.fpath),
            data: current,
            org: current_org,
        };

        Object.keys(patch).forEach((key) => {
            Vue.set(vm_app_status, key, patch[key]);
        });

        refresh_gui();
    } catch(err) {
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

    if (!vm_errors) {
        vm_errors = new Vue({
            el: '#errors',
            data: {
                bando: current,
            },
            computed: {
                errors: function() {
                    return check_bando(this.bando);
                }
            },
        });
    }


    if (!vm_structure) {
        vm_structure = new Vue({
            el: '#structure',
            data: {bando: current},
            methods: {add_criterion: add_criterion},
            filters: common_filters,
        });
    }


    // Uset to init and refresh
    const vm_data_defaults = {
        env_data_mode: 'raw',
        env_name_show: 'hide',
        env_frozen: {},
        env_rnd: 1,
    };
    if (!vm_data) {
        vm_data = new Vue({
            el: '#data-container',
            data: {
                env_data_mode: vm_data_defaults.env_data_mode,
                env_name_show: vm_data_defaults.env_name_show,
                env_frozen: copy(vm_data_defaults.env_frozen),
                env_rnd: vm_data_defaults.env_rnd,
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
                    let c = leafs_lst(this.bando);
                    let offerta;
                    if (this.env_rnd) {
                        offerta = {
                            nome: nome,
                            valori: c.map((c, i) => {
                                if (c.tipo === CriterionKind.T)
                                    return Math.round(rnd(0, 1) * ((<TechCriterion_T><any>c).voci.length-1));
                                else if (c.tipo == CriterionKind.D)
                                    return rnd(0,1);
                                else
                                    return this.bando.offerte.length < 2 ? rnd(0,1) : rnd(
                                        amin(this.bando.offerte.map(o => o.valori[i])),
                                        amax(this.bando.offerte.map(o => o.valori[i]))
                                    );
                            }),
                        }
                    } else {
                        offerta = {
                            nome: nome,
                            valori:  c.map(c => 0),
                        }
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
                        points: this.points[i].points[col_id],
                        raw: this.bando.offerte[i].valori[col_id],
                    }));

                    Vue.set(this.env_frozen, c_env_name, frozen_col);
                },
                unfreeze (c_env_name) {
                    Vue.delete(this.env_frozen, c_env_name);
                },
                update_frozen_name(old, actual) {
                    Vue.set(this.env_frozen, actual, this.env_frozen[old]);
                    Vue.delete(this.env_frozen, old);
                }
            },
            computed: {
                fatal_errors () {
                    // OPT: should return true, only when the errors are fatal,
                    // i.e. when we can not compute the ranks.
                    // Now, it returns true if there is any error.

                    return check_bando(this.bando).length > 0;
                },
                enable_names () {
                    return this.env_name_show === 'show' &&
                        this.bando.criteri.concat(leafs_lst(this.bando))
                        .map(c => c.nome || '')
                        .filter(n => n.length)
                        .length > 0;
                },
                fst_lvl_names () {
                    let ll = leafs_lst(this.bando);
                    let extractor = (prefix) => {
                        return (c, i) => {
                            let y = prefix_2_ids(this.bando, prefix + '.' + (i + 1))
                                .map(i => this.env_frozen[ll[i].env_name] ? 2 : 1)
                                .reduce(sum, 0);

                            return {
                                nome: c.nome,
                                size: y,
                            };
                        };
                    };
                    return this.bando.criteri[0].criteri.map(extractor('E'))
                        .concat(this.bando.criteri[1].criteri.map(extractor('C')));
                },
                weights () {
                    return weights(leafs_lst(this.bando));
                },
                cols () {
                    return leafs_lst(this.bando);
                },
                points () {
                    return compute_points(this.bando);
                },
                thresholds () {
                    return enum_thresholds(this.bando)
                        .map(s => [s[0], 'impostata a', s[1], s[2], '(' + s[3] + ')'].join(' '))
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
                    // OPT: should return true, only when the errors are fatal,
                    // i.e. when we can not compute the ranks.
                    // Now, it returns true if there is any error.
                    return check_bando(this.bando).length > 0;
                },
                scoreboard () {
                    if (this.fatalErrors)
                        return [];

                    let offerte = compute_points(this.bando);

                    let excluded = offerte
                        .filter(o => o.excluded)
                        .map(o => [o.nome, '(' + o.excluded_short.join(', ') + ')'].join(' '))
                    offerte = offerte.filter(o => !o.excluded);

                    let agg = aggregativo_compensatore(this.bando, offerte)
                        .sort((a, b) => b.agg - a.agg);
                    let ele = electre(this.bando, offerte);
                    let tops = topsis(this.bando, offerte)
                        .sort((a, b) => b.topsis - a.topsis);

                    let board = {};
                    offerte.forEach(o => board[o.nome] = {nome: o.nome});

                    agg.sort((a, b) => b.agg - a.agg).forEach((e, i, arr) => {
                        board[e.nome].agg = e.agg;
                        if (i === 0 || arr[i-1].agg > e.agg)
                            board[e.nome].agg_rank = i+1;
                        else
                            board[e.nome].agg_rank = board[arr[i-1].nome].agg_rank;
                    });

                    ele.forEach((e) => board[e.nome].electre = e.electre);

                    tops.forEach((e, i, arr) => {
                        board[e.nome].topsis = e.topsis;
                        if (i === 0 || arr[i-1].topsis > e.topsis)
                            board[e.nome].topsis_rank = i + 1;
                        else
                            board[e.nome].topsis_rank = board[arr[i-1].nome].topsis_rank;
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


    let vm_lab_defaults = {
        env_frozen: {},
        env_selected_criteria: [],
        env_new_criteria: '-1',
    };
    if (!vm_lab) {
        // Init
        vm_lab = new Vue({
            el: '#lab',
            data: {
                env_frozen: copy(vm_lab_defaults.env_frozen),
                env_selected_criteria: copy(vm_lab_defaults.env_selected_criteria),
                env_new_criteria: vm_lab_defaults.env_new_criteria,
                bando: current,
            },
            computed: {
                criteria () {
                    return leafs_lst(this.bando)
                        .filter(c => c.tipo === CriterionKind.Q || 'modo' in c)
                        .filter(c => this.env_selected_criteria
                            .filter(s => s.env_name === c.env_name)
                            .length === 0);
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
                padding () {return do_pad(this.depth)},
            },
            methods: {
                amin: amin,
                amax: amax,
                done (i) {
                    this.unfreeze(this.env_selected_criteria[i].env_name);
                    Vue.delete(this.env_selected_criteria, i);
                },
                manage () {
                    if (!this.criteria[this.env_new_criteria]) return;
                    this.env_selected_criteria.push(this.criteria[this.env_new_criteria]);
                    Vue.nextTick(refresh_popover);
                },
                func_mode: func_mode,
                function_change (i) {
                    let model = this.env_selected_criteria[i],
                        fm    = this.func_mode(model.modo);

                    // Be sure parameters are populated.
                    for (let pname in functions[model.funzione][fm].params) {
                        let p = functions[model.funzione][fm].params[pname];
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

                    for (let pname in this.funcs[c.funzione][this.func_mode(c.modo)].params) {
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
                    let match = this.env_selected_criteria
                        .map((c, i) => ({k:c.env_name, i:i}))
                        .filter(x => x.k === old)

                    if (match.length === 0) {
                        // Nothing to update.
                        return
                    } else if (match.length !== 1) {
                        // More than one to update.. what???
                        console.error(old, "matched wrong # of records (1)", old, actual, match);
                        return
                    }

                    // Replace reference
                    let old_id = match[0].i;
                    Vue.set(this.env_selected_criteria, old_id,
                        this.criteria.filter(x => x.env_name === actual)[0]);


                    // === update name in env_freezed (if), and propagate to vm_data
                    if (!this.env_frozen[old])
                        return;
                    Vue.set(this.env_frozen, actual, this.env_frozen[old])
                    Vue.delete(this.env_frozen, old);
                    vm_data.update_frozen_name(old, actual);
                },
                is_leaf (c) {
                    return !(c.criteri && c.criteri.length);
                },
            },
            filters: common_filters,
        });
    }

    // Refresh
    Vue.set(vm_errors, 'bando', current);
    Vue.set(vm_structure, 'bando', current);
    Vue.set(vm_data, 'bando', current);
    Vue.set(vm_rank, 'bando', current);
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

type BidPoints = {nome:string, points: number[]};
interface FilteredBidPoints extends BidPoints {
    excluded_short: string[];
    excluded_for:{[id: number]:boolean};
    excluded:boolean;
};


// TODO: double check me
function compute_points(bando:Call): FilteredBidPoints[] {
    let ll = leafs_lst(bando),
        eco_cnt = ll.filter(x => x.env_name[0] === 'E').length,
        scale = bando.riparametra_1_criteri;

    // Compute T points
    let points = apply_functions(ll, bando.offerte, scale);

    // Apply T thresholds
    let tech_fails_map = {};
    apply_thresholds(bando, bando.offerte, points)
        .filter(x => x.excluded && x.excluded_short.filter(x => x[0] === 'C').length)
        .forEach(x => tech_fails_map[x.nome] = true)

    // Update E points without tech_fails
    let org_id = {};
    bando.offerte.forEach((x, xi) => org_id[x.nome] = xi)
    let points_delta = apply_functions(ll, bando.offerte.filter(x => !tech_fails_map[x.nome]), scale)

    // Set all eco points to 0
    for (let i=0; i<points.length; i++)
        for (let j=0; j<eco_cnt; j++)
            points[i].points[j] = 0;

    // Inject actual points
    points_delta.forEach(x => {
        for (let j=0; j<eco_cnt; j++)
            points[org_id[x.nome]].points[j] = x.points[j]
    })

    // Apply thresholds (E for first time and T again)
    return apply_thresholds(bando, bando.offerte, points)
}

function apply_functions(ll: AnnotatedLeaf[], bids:Bid[], scale:boolean): BidPoints[] {
    // Given a bando, applies functions to the bids values and, if required,
    // scales the results. Produces a list of bids to be used with ranking
    // algorithms.

    let points = bids.map((o, oi) => {
        let res = {
            nome: o.nome,
            points: [],
        }

        res.points = o.valori.map((t, ti) => {
            if (ll[ti].tipo === CriterionKind.T) {          // Is tabular -> bool to int
                // weight of selected one / max weight
                // so then we can multiply safely for weight
                let c = <TechCriterion_T><any>ll[ti];
                return c.voci[t].punti / amax(c.voci.map(x => x.punti));
            } else if (ll[ti].tipo === CriterionKind.Q || 'modo' in ll[ti]) {
                let c = <Eco><any>ll[ti];
                let mode = func_mode(c.modo);
                return functions[c.funzione][mode].f(
                    t,                          // Current bid
                    c.parametri,           // Parameters
                    bids.map(o => o.valori[ti]));
            } else {
                return t;
            }
        });

        return res;
    });

    if (scale) points = apply_scale(ll, points);
    return points;
}

function apply_scale(ll: AnnotatedLeaf[], offerte: BidPoints[]): BidPoints[]{
    // RIPARAMETRAZIONE 1
    // Scale each leaf
    let maxs = ll.map((_, i) => amax(offerte.map(o => o.points[i])));
    return  offerte.map(o => {
        return {
            nome: o.nome,
            // this guarnatees [0-1]
            points: o.points.map((t, i) => maxs[i] ? t/maxs[i] : 0),
        }
    });
}

function enum_thresholds(bando:Call): [string,string,number, number][] {
    let rec = (name: string, node: Criterion|Criterion_N<Criterion>): [string,string,number, number][] => {
        if (!('criteri' in node && node.criteri.length)) {
            if (node.soglia)
                return [[name, node.mod_soglia, node.soglia, node.soglia * criterion_weight(node)]]
            return []
        }

        let th = [];
        if (node.soglia)
            th.push([name, ModSoglia.Points, node.soglia, node.soglia * criterion_weight(node)])

        node.criteri.forEach((node, i) => {
            th = th.concat(rec(name + '.' + (i+1), node))
        });

        return th;
    }
    return rec('E', bando.criteri[0]).concat(rec('C', bando.criteri[1]));
}

function apply_thresholds(bando:Call, bids: Bid[], pts: BidPoints[]): FilteredBidPoints[] {
    // Return prefixes for which it fails.
    let rec_threshold = (
        name: string, next_leaf_id: number, node: Criterion|Criterion_N<Criterion>,
        raw: number[], points: number[]
    ): [number, number, string[]] =>
    {
        // returns: [leafs_cnt, points, prefixes]
        // Current criterion is leaf.
        if (!('criteri' in node && node.criteri.length)) {
            // THIS IS LEAF
            // Check raw
            let r = raw[next_leaf_id],
                p = points[next_leaf_id];
            if (node.soglia && (
                    (node.mod_soglia === ModSoglia.Value && r < node.soglia) ||
                    (node.mod_soglia === ModSoglia.Points && p < node.soglia)))
                return [next_leaf_id + 1, p, [name]];
            return [next_leaf_id + 1, p, []]
        }

        // Apply on children
        let fails = [], tot_points = 0, tot_w = 0;
        node.criteri.forEach((node, i) => {
            let res = rec_threshold(name + '.' + (i+1), next_leaf_id, node, raw, points),
                c_w = criterion_weight(node);

            next_leaf_id = res[0];
            tot_points += res[1] * c_w;
            tot_w += c_w;
            fails = fails.concat(res[2]);
        });

        // Always nomalize between 0 and 1
        tot_points /= tot_w;

        // Apply check on points for this node
        if (node.soglia && tot_points < node.soglia)
            return [next_leaf_id, tot_points, fails.concat([name])]

        return [next_leaf_id, tot_points, fails]
    }

    let threshold = (node: Call, raw: number[], points: number[]): string[] => {
        let res_e = rec_threshold('E', 0, bando.criteri[0], raw, points);
        let res_t = rec_threshold('C', res_e[0], bando.criteri[1], raw, points);
        return res_e[2].concat(res_t[2]);
    }

    // Apply to bids
    return pts.map((b, i) => {
        let smap = threshold(bando, bids[i].valori, b.points)
            .sort()
            .reduce((a, v) => a.length && v.indexOf(a[a.length-1] + '.') === 0 ? a: a.concat([v]), [])

        let fmap = {};
        smap.forEach(f => prefix_2_ids(bando, f).forEach(i => fmap[i] = true));
        return {
            nome: b.nome,
            points: b.points,
            excluded_short: smap,
            excluded_for: fmap,
            excluded: Object.keys(fmap).length > 0,
        }
    });
}

// Checked *
function aggregativo_compensatore(bando:Call, offerte:BidPoints[]) {
   let ll     = leafs_lst(bando),
       w      = weights(ll),
       w_eco  = criterion_weight(bando.criteri[0]);

    // OPT: we may remove this (double check).
    if (bando.riparametra_1_criteri)
        offerte = apply_scale(ll, offerte);

    // Compute and then rescale tecnica and economica to give 1 to the best.
    if (bando.riparametra_2_parti) {
        let elimit = amax(prefix_2_ids(bando, 'E'));
        let ev = offerte.map(o =>
            o.points.map((v, vi) => w[vi] * v).reduce((acc, v, vi) =>
                vi <= elimit ? [acc[0] + v, acc[1]] : [acc[0], acc[1] + v],
                [0,0])
        );

        let meco  = amax(ev.map(x => x[0])),
            mtech = amax(ev.map(x => x[1]));
        return offerte.map((o, i) => ({
            nome: o.nome,
            agg: ev[i][0] / meco * w_eco + ev[i][1] / mtech * (100-w_eco),
        }));
    }

    return offerte.map(o => ({
        nome: o.nome,
        agg: o.points
            .map((v, vi) => w[vi] * v)
            .reduce(sum, 0)
    }));
};

// Checked *
function electre(bando:Call, bids:BidPoints[]) {
    // ANAC Linee Guida 2.pdf
    // http://www.bosettiegatti.eu/info/norme/statali/2010_0207.htm#ALLEGATO_G
    //
    // From: FILE 1_ ESTRATTO 02_OEPV E METODI MULTICRITERI.pdf
    // Per definire una classifica, è necessario ripetere la procedura cancellando di volta in volta l’offerta risultata vincitrice nella tornata precedente.

    // Prepare set of real `offerte`
    let ll = leafs_lst(bando);
    const w= weights(ll);

    let rank = {}, i = 1;
    while (i <= bids.length) {
        let iter_bids = bids.filter(o => rank[o.nome] === undefined);
        let winners = electre_iteration(w, iter_bids);
        for (let j in winners)
            rank[winners[j]] = i;
        i += winners.length;
    }

    return Object.keys(rank).map(k => {
        return {nome: k, electre: rank[k]};
    });
}

// Checked *
function electre_iteration(w: number[], bids:BidPoints[]): string[] {
    // w: weights
    //  bids: flat `offerte` to be considered in this iteration.
    //  returns: `nome` of the winner.

    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    if (r === 1) {
        return [bids[0].nome];
    }

    // Step B
    let f = nmatrix([n,r,r]),
        g = nmatrix([n,r,r]);

    // Abstract internal structure and match paper algorithm.
    const a = (k, i) => bids[i].points[k];

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

                csum += f[k][i][j] / s[k] * w[k];
                dsum += g[k][i][j] / s[k] * w[k];
            }
            c[i][j] = csum;
            d[i][j] = dsum;

            if (dsum == 0) { // Then j is dominated by i. Re-run without j.
                let rec = electre_iteration(w, bids.filter((_, idx) => idx != j));

                // was tied -> assign same score.
                // ONLY if `i` wins obviously
                if (csum === 0 && rec.indexOf(bids[i].nome) !== -1)
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
    return bids.filter((_, idx) => Pa[idx] === Pa_max).map(b => b.nome);
}


// Checked *
function topsis(bando:Call, bids:BidPoints[]) {
    // ANAC Linee Guida 2.pdf
    // https://en.wikipedia.org/wiki/TOPSIS

    // Prepare set of real `offerte`
    let ll = leafs_lst(bando);
    const w = weights(ll);


    let n = w.length,    // 'criteri' to evaluate.
        r = bids.length; // number of offers

    // Abstract internal structure and match paper algorithm.
    const m = (i, k) => bids[i].points[k];

    // Normalization {i, k}[]
    let x = nmatrix([r,n]);
    for (let k=0; k < n; k++) {
        // Compute geometric mean for this K
        let gm = 0;
        for (let i=0; i < r; i++)
            gm += Math.pow(m(i, k), 2);
        gm = Math.sqrt(gm);

        // Nomralize values
        if (gm == 0) // they are all 0, nothing to do
            continue
        for (let i=0; i < r; i++)
            x[i][k] = m(i,k) / gm;

    }

    // NOTE: wikipedia dictate to normalize the weight between [0-1]
    //       ANAC says nothig. Looks like nothing changes... so, we do.
    let wtot = w.reduce(sum, 0),
        wn = w.map(x => x / wtot);

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

    let n = {
            nome: name,
            soglia: <number>c['soglia'] || 0,
            mod_soglia: c['mod_soglia'] || 'punti',
    };

    if (('criteri' in c && c.criteri.length > 0) || (this && this.force_node)) {
        n['criteri'] = c.criteri.map(clean_criterion);
        return n;
    }

    n['tipo'] = <string>c.tipo || CriterionKind.Q;

    if ('modo' in c)  // Economica
        n['modo'] = c.modo;

    if ((<Leaf>n).tipo === CriterionKind.Q || 'modo' in c) { // Q or Economica
        n['funzione']  = <string>c.funzione;
        n['parametri'] = {};
        Object.keys(functions[n['funzione']][func_mode(n['modo'])].params)
            .forEach(p => n['parametri'][p] = <number>c.parametri[p]);
        // Try always to copy base_asta
        if (c.parametri.base_asta)
            n['parametri']['base_asta'] = c.parametri.base_asta;
    }

    if ((<Leaf>n).tipo === CriterionKind.T)
        n['voci'] = <{nome:string, peso:number}[]> c.voci
            .map(v => ({nome: v.nome, punti: v.punti}))
    else
        n['peso'] = <number> c.peso;
    return n;
}

function clean_bando(bando):Call {
    let cleaned = {
        riparametra_1_criteri: false,
        riparametra_2_parti: false,
        criteri: <[Criterion_N<Eco>, Criterion_N<Tech>]>[{
            "nome": "Economica",
            "mod_soglia": "punti",
            "soglia": 0,
            "criteri": []
        }, {
            "nome": "Tecnica",
            "mod_soglia": "punti",
            "soglia": 0,
            "criteri": []
        }],
        offerte: <Bid[]>[],
    }
    if (bando === undefined)
        return cleaned;

    let fstOrderAttributes = [
        'riparametra_1_criteri',
        'riparametra_2_parti',
    ];
    fstOrderAttributes.forEach(f => cleaned[f] = bando[f]);
    // Criteri must be recursive
    if (bando.criteri)
        cleaned['criteri'] = bando.criteri.map(clean_criterion, {force_node:true});

    // Data, just copy
    if (bando.offerte)
        cleaned['offerte'] = copy(bando.offerte);
    return cleaned;
}


function check_criterion(c, prefix:string): string[] {
    let errors = [];

    // check if it is points
    if ([ModSoglia.Points, ModSoglia.Value].indexOf(c.mod_soglia) < 0) {
        errors.push('[' + prefix + '] ' + c.mod_soglia +
            ' non è un valore valido per `mod_soglia`. I valori ammessi sono ' +
            ModSoglia.Points + ' e ' + ModSoglia.Value + '.');
    } else if (c.mod_soglia !== ModSoglia.Points
        && (c.criteri !== undefined && c.criteri.length > 0))
    {
        errors.push('[' + prefix + '] Criteri con sub-criteri ' +
            'possono avere la soglia definita solo sui punti.');
    } else if ((c.mod_soglia === ModSoglia.Points || c.tipo === CriterionKind.D) &&
        (isNaN(parseFloat(c.soglia)) || c.soglia < 0 || c.soglia > 1))
    {
        errors.push('[' + prefix + '] ' + c.soglia + ' non e\' un valore ' +
            'valido come soglia. Deve essere un numero tra 0 e 1.');
    }


    // -- GOING RECURSIVE --

    if (c.criteri !== undefined && c.criteri.length > 0) {
        return errors.concat(...c.criteri.map((s, i) => check_criterion(s, prefix + '.' + (i+1))));
    }


    // -- ONLY FOR LEAFs --

    if ([CriterionKind.Q,CriterionKind.D,CriterionKind.T].indexOf(c.tipo) < 0) {
        errors.push('[' + prefix + '] ' + c.tipo +
            ' non e\' un valore valido per \'tipo\'. ' +
            'I vaolori possibili sono \'D\', \'T\' \'Q\'.');
    }

    if (c.tipo !== CriterionKind.T && (isNaN(parseFloat(c.peso)) || c.peso < 0 || c.peso > 100)) {
        errors.push('[' + prefix + '] ' + c.peso +
            ' non e\' un valore valido per il peso. ' +
            'Deve essere un numero tra 0 e 100.');
    }

    let is_eco = prefix[0] === 'E';
    if (c.modo && [EcoMode.Price, EcoMode.Discount].indexOf(c.modo) < 0) {
        errors.push('[' + prefix + '] ' + c.modo +
            ' non è un valore valido per `modo` funzione. ' +
            'I valori validi sono ' + EcoMode.Price + ' e ' + EcoMode.Discount + '.');
    }


    if (!is_eco && c.modo && c.modo !== EcoMode.Price) {
        errors.push('[' + prefix + '] I criteri tecnici possono essere valutati' +
            ' solo al rialzo; `modo`, se specificato, deve quindi essere ' +
            EcoMode.Price + '.');
    }

    if (c.tipo === CriterionKind.Q) {
        if (functions[c.funzione] === undefined) {
            errors.push('[' + prefix + '] ' + c.funzione +
                ' non e\' supportata. Le funzioni disponibili sono le seguenti: ' +
                Object.keys(functions).join(',') + '.');
        } else {

            Object.keys(functions[c.funzione][func_mode(c.modo)].params).forEach(p => {
                errors = errors.concat(check_parameter('C ' + prefix, c.funzione, func_mode(c.modo),
                    c.parametri, p));
            });


            if (functions[c.funzione][func_mode(c.modo)].validators) {
                errors = errors.concat(functions[c.funzione][func_mode(c.modo)].validators
                    .map(v => v(c.parametri))
                    .filter(r => !r[0])
                    .map(r => '[' + prefix + '] parameteri: ' + r[1]));
            }
        }
    }

    if (c.tipo === CriterionKind.T) {
        if (c.voci === undefined || !Array.isArray(c.voci)) {
            errors.push('[' + prefix + '] Quando il tipo e Tabellare (T),' +
                ' `voci` deve essere un vettore di voci ({nome:string, punti:number}).');
        } else {
            c.voci.forEach((v, vi) => {
                if (typeof v.nome !== 'string') {
                    errors.push('[' + prefix + '] Il nome ' + v['nome'] + ' per ' +
                        'la voce ' + (vi+1) + ' non e\' valido. ' +
                        'Deve essere una stringa.');
                }

                if (isNaN(parseFloat(v.punti)) || v.punti < 0 || v.punti > 100) {
                    errors.push('[' + prefix + '] `punti`, ' + v.punti + ' per ' +
                        'la voce ' + (vi+1) + ' non e\' valido. ' +
                        'Deve essere un numero tra 0 e 100.');
                }
            })
        }
    }

    if (c.mod_soglia === ModSoglia.Value && c.tipo === CriterionKind.T) {
        let M = amax(c.voci.map(x => x.punti));
        if (isNaN(parseFloat(c.soglia)) || c.soglia < 0 || c.soglia > M)
            errors.push('[' + prefix + '] ' + c.soglia + ' non e\' un valore ' +
                'valido come soglia. Deve essere un numero tra 0 e ' + M + '.');
    }

    if (c.mod_soglia === ModSoglia.Value && isNaN(parseFloat(c.soglia)) || c.soglia < 0) {
        errors.push('[' + prefix + '] ' + c.soglia + ' non e\' un valore ' +
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
            (dom.required ? 'Se specificato d' : CriterionKind.D) +
            'eve essere un numero maggiore di ' + dom.start + '' +
            (dom.end !== '' ? (' e minore di ' + dom.end) : '') + '.'];
    }
    return [];
}



// OPT: Make distinction between fatal and non-fatal errors.
// OPT: Try to fix the errors if possible (and not already done by clean_bando).
function check_bando(bando): string[] {
    // Probably ain't loaded yet.
    if (bando === undefined)
        return [];

    let errors = [];

    if (typeof bando.riparametra_1_criteri !== 'boolean') {
        errors.push('[riparametra_1_criteri ] ' + bando.riparametra_1_criteri +
            ' non e\' un valore valido. Deve essere un boolean (true, false).');
    }

    if (typeof bando.riparametra_2_parti !== 'boolean') {
        errors.push('[riparametra_2_parti ] ' + bando.riparametra_2_parti +
            ' non e\' un valore valido. Deve essere un boolean (true, false).');
    }

    // Criteri [eco, tech]
    errors = errors.concat(...check_criterion(bando.criteri[0], 'E'),
                           ...check_criterion(bando.criteri[1], 'C'));

    let tot_points = criterion_weight(bando.criteri[0]) + criterion_weight(bando.criteri[1]);
    if (tot_points !== 100) {
        errors.push('[punti] La somma dei pesi/punti deve essere 100. Ora è ' + tot_points + '.');
    }

    // Data
    let ll = leafs_lst(bando);
    let name_unique = {};
    bando.offerte.forEach((o, i) => {
        name_unique[o.nome] = true;
        if (o.nome === undefined) {
            errors.push('[O ' + (i+1) + '] il campo `nome` e\' mancante.')
        }

        if (o.valori === undefined || !Array.isArray(o.valori) || o.valori.length != ll.length) {
            errors.push('[O ' + (i+1) + '] il campo `valori` deve essere un array di dimensione ' + ll.length + '.');
        }

        o.valori.forEach((t, ti) => {
            if (ll[ti].tipo === CriterionKind.T) {
                if (isNaN(parseFloat(t)) || t < 0 || t >= ll[ti]['voci'].length) {
                    errors.push('[O ' + (i+1) + '] valore ' + (ti+1) +
                        ' deve essere un numero tra 0 e ' + (ll[ti]['voci'].length - 1) + '.');
                }
            } else if (ll[ti].tipo === CriterionKind.D) {
                if (isNaN(parseFloat(t)) || t < 0 || t > 1) {
                    errors.push('[O ' + (i+1) + '] valore ' + (ti+1) +
                        ' deve essere un numero tra 0 e 1.');
                }
            } else {
                if (isNaN(parseFloat(t)) || t < 0) {
                    errors.push('[O ' + (i+1) + '] valore ' + (ti+1) +
                        ' deve essere un numero maggiore di 0.');
                }
            }
        });
    });

    if (Object.keys(name_unique).length !== bando.offerte.length) {
        errors.push('[Offerte] I nomi delle offerte devono essere unici.');
    }

    return errors;
}

// ============================================================================
// Init gui elements

function refresh_popover() {
    $('[data-toggle="popover"]:not([data-original-title])').each((i, o) => {
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
            if (check_bando(current).length) {
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

    $('body').removeClass('loading');

    bootstrap_popover();
});
