/*
CLIC what if?
Esplora i metodi di aggiudicazione dell'offerta economicamente piu' vantaggiosa
Copyright (C) 2018 Martin Brugnara - Università degli Studi di Trento

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
e
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

interface ParamDict {
        [propName: string]: {
            domain: {start:number, end:number | null, step:number},
            required: boolean,
        }
}

interface FuncObj {
    f (P: number, x, bando, all_bids: number[]): number;
    readonly base_asta?: boolean;
    readonly params: ParamDict;
    readonly validators?: {(p: object): [boolean, string]}[];
}

let amax = (x:number[]):number => Math.max.apply(Math, x);
let amin = (x:number[]):number => Math.min.apply(Math, x);
let sum = (a:number, b:number):number => a + b;

// Score to be assigned when all the offers are winning/losing.
// Used in handling corner cases, like divisions by 0.
const ALL_WIN_SCORE = 1;

// NOTE: each * means "checked +1 times"
// up => ribasso | tecnica, down => prezzo
// Remember that js works only with float (ain't no int division =));
let functions: {[funcName:string]:{up?:FuncObj, down?:FuncObj}} = {
    "identita": {
        // This shall be used only with the ELECTRE method,
        // when the user whant to use the raw values instead of the scaled one.
        up: {
            f: (P, x, bando, all_bids) => P,
            params: {}
        },
        down: {
            f: (P, x, bando, all_bids) => P,
            params: {}
        }
    },
    "proporzionalita_inversa": {
        // **
        // Bozen 1
        // This covers 92.49% of Bozen runs.
        up: {
            f: (P, x, bando, all_bids) => {
                let M = amax(all_bids);
                if (M === 0) return ALL_WIN_SCORE;
                return P / M;
            },
            params: {}
        },
        down: {
            f: (P, x, bando, all_bids) => {
                let m = amin(all_bids);
                if (m === 0) return ALL_WIN_SCORE;
                if (P === 0) return 0;
                return m / P;
            },
            params: {}
        }
    },
    /* // Removed because WTF?
     * 1) negative scores
     * 2) not 0-1
     * 3) no sense
    "riduzione_percentuale_del_prezzo": {
        // *
        // Bozen 2
        // This covers 1.06% of Bozen runs.
        down: {
            f: (P, x, bando, all_bids) => 1 - ((P - amin(all_bids)) * 1.0 / amin(all_bids)) * 100 / x.c,
            params: {c: {domain:{start:0.01, end:100, step:0.01}, required: true}}
        },
    },
     */
    "spezzata_gausiana": {
        // **
        // Bozen 4
        down: {
            f: (P, x, bando, all_bids) => {
                let mean = all_bids.reduce(sum, 0) * 1.0 / all_bids.length,
                    a = mean * 0.5, b = mean * 0.7,
                    d = mean * 1.3, e = mean * 1.5,
                    s = b/d * 1;

                if (mean === 0)
                    return ALL_WIN_SCORE;

                if (a <= P && P < b)
                    return (P-a)/(b-a);
                if (b <= P && P < d)
                    return (1 - (P - b)/(d-b)) * (1-s) + s;
                if (d <= P && P <= e)
                    return s/(d-e)*(P-e);
                return 0;
            },
            params: {},
        }
    },
    "retta_base_valore_fisso": {
        // **
        // Bozen 5
        down: {
            f: (P, x, bando, all_bids) => {
                let m = amin(all_bids);
                if (m === bando.base_asta) return ALL_WIN_SCORE;
                return 1 - ((1-x.c)/(m - bando.base_asta)*(m - P))
            },
            params:{c: {domain:{start:0.00, end:1, step:0.01}, required: true}},
            base_asta: true,
        }
    },
    "retta_base_prezzo_minimo": {
        // May merge up with retta_base_valore_fisso (with c=0)
        // **
        // Bozen 6
        down:{
            f: (P, x, bando, all_bids) => {
                let m = amin(all_bids);
                if (m === bando.base_asta) return ALL_WIN_SCORE;
                return (P-bando.base_asta) / (m - bando.base_asta)}
            ,
            params:{},
            base_asta: true,
        }
    },
    "retta_base_zero": {
        // **
        // Bozen 7
        down:{
            f: (P, x, bando, all_bids) => {
                if (bando.base_asta === 0) // WAT ??
                    return ALL_WIN_SCORE;
                return (bando.base_asta - P) / bando.base_asta;
            },
            params:{},
            base_asta: true,
        }
    },
    "retta_prezzo_minimo": {
        // **
        // Bozen 8
        down:{
            f: (P, x, bando, all_bids) => {
                let M = amax(all_bids);
                if (M === 0) return ALL_WIN_SCORE;
                return (M + amin(all_bids) - P) / M;
            },
            params:{},
        }
    },
    "allegato_g": {
        // **
        // Bozen 9 - 0.64%
        // Allegato G, Contratti relativi a lavori
        // !!! There is an error in the documentation Omax -> Omin.
        down:{
            f: (P, x, bando, all_bids) => {
                let div = bando.base_asta - amin(all_bids);
                if (div === 0) return ALL_WIN_SCORE;
                return (bando.base_asta - P)/div;
            },
            params:{},
            base_asta: true,
        }
    },
    "allegato_m": {
        // **
        // Bozen 10 - 0.79%
        // Allegato M, Contratti relativi a servizi attinenti all'archiettura e all'ingegneria
        // Consip: "lineare_spezzata_sulla media"
        up: {
            f: (P, x, bando, all_bids) => {
                let mean = all_bids.reduce(sum, 0) / all_bids.length;

                // NOTE: if max == mean || max == 0
                //  -> everyone made same offer
                //  => this explode, same score for all (1).
                if (amax(all_bids) === mean)
                    return ALL_WIN_SCORE;

                if (P <= mean)
                    return x.x * P / mean;
                else
                    return x.x + (1-x.x) * (P - mean) / (amax(all_bids) - mean);
            },
            params:{x: {domain:{start:0.80, end:0.90, step:0.05}, required: true}},
        }
    },
    "allegato_p": {
        // **
        // Bozen 11 - 2.53%
        // TODO: consider merge up
        // Allegato P, Contratti relativi a forniture e altri servizi
        up: {
            f: (P, x, bando, all_bids) => {
                let mean = all_bids.reduce(sum, 0) / all_bids.length;

                // NOTE: if max == mean || max == 0
                //  -> everyone made same offer
                //  => this explode, same score for all (1).
                if (amax(all_bids) === mean)
                    return ALL_WIN_SCORE;

                if (P <= mean)
                    return x.x * P / mean;
                else
                    return x.x + (1-x.x) * (P - mean) / (amax(all_bids) - mean);
            },
            params:{x: {domain:{start:0.80, end:0.90, step:0.05}, required: true}},
        }
    },
    "alleagato_p_lineare_semplice": {
        // **
        // Bozen 11b - 1.77%
        // TODO: consider merge_down (soglia = undefined)
        up: {
            f: (P, x, bando, all_bids) => {
                if (amax(all_bids) === 0)
                    return ALL_WIN_SCORE;
                return P / amax(all_bids);
            },
            params: {}
        },
    },
    "consip_lineare_semplice": {
        // **
        up: {
            f: (P, x, bando, all_bids) => {
                // NOTE: we consider soglia === 0 and '' as not defined.
                let soglia = amax(all_bids);
                if (x.soglia) soglia = x.soglia;
                if (P >= soglia) return 1;
                if (P <= x.soglia_min) return 0;
                return (P - x.soglia_min)/(soglia - x.soglia_min)
            },
            params: {
                soglia:     {domain:{start:0, end:null, step:0.01}, required: false},
                soglia_min: {domain:{start:0, end:null, step:0.01}, required: true},
            },
            validators: [
                (p: object) => ([
                    !p['soglia'] || p['soglia'] > p['soglia_min'],
                    "soglia deve essere maggiore di soglia_min."
                ]),
            ]
        },
        down: {
            f: (P, x, bando, all_bids) => {
                if (P <= x.soglia) return 1;
                if (bando.base_asta === x.soglia) // WAT?
                    return ALL_WIN_SCORE;
                return (bando.base_asta - P)/(bando.base_asta - x.soglia)
            },
            params: {soglia: {domain:{start:0, end:null, step:0.01}, required: true}},
            base_asta: true,
        }

    },
    "concava_alla_migliore_offerta": {
        // *
        // This covers:
        // * DECRETO DEL PRESIDENTE DELLA PROVINCIA 21 ottobre 2016, n. 16- 50/Leg
        //      https://didatticaonline.unitn.it/ricerca/course/view.php?id=65
        //      alpha in (0.1, 0.2, 0.3)
        // * Concava alla migliore offerta
        //      Consip: alpha in (0.5, 0.6, 0.7)
        // * Lineare alla migliore offerta (alpha = 1)
        up: {
            f: (P, x, bando, all_bids) => {
                if (amax(all_bids) === 0) return ALL_WIN_SCORE;
                return Math.pow(P / amax(all_bids), x.alfa)
            },
            params: {alfa: {domain:{start:0, end:null, step:0.05}, required: true}}

        },
        down: {
            f: (P, x, bando, all_bids) => {
                let BA = bando.base_asta;
                if (BA === amin(all_bids)) return ALL_WIN_SCORE;
                return Math.pow((BA - P) / (BA - amin(all_bids)), x.alfa)
            },
            params: {alfa: {domain:{start:0, end:null, step:0.05}, required: true}},
            base_asta: true,
        }
    },
    "non_lineare_concava": {
        // *
        // Consip
        up: {
            f: (P, x, bando, all_bids) => 1 - Math.pow((1 - P), x.n),
            params: {n: {domain:{start:0, end:null, step:0.01}, required: true}}
        },
        down: {
            f: (P, x, bando, all_bids) => 1 - Math.pow((P/bando.base_asta), x.n),
            params: {n: {domain:{start:0, end:null, step:0.01}, required: true}},
            base_asta: true,
        }
    },
    "lineare_spezzata_sulla_media": {
        // *
        // Bozen 10 - 0.79%
        // Consip: "lineare_spezzata_sulla media"
        up: {
            // Allegato M, Contratti relativi a servizi attinenti all'archiettura e all'ingegneria
            f: (P, x, bando, all_bids) => {
                let mean = all_bids.reduce(sum, 0) / all_bids.length;
                if (amax(all_bids) === mean) return ALL_WIN_SCORE;
                if (P <= mean)
                    return x.x * P / mean;
                else
                    return x.x + (1-x.x) * (P - mean) / (amax(all_bids) - mean);
            },
            params:{x: {domain:{start:0.80, end:0.90, step:0.05}, required: true}},
        },
        down: {
            f: (P, x, bando, all_bids) => {
                let mean = all_bids.reduce(sum, 0) / all_bids.length;
                if (bando.base_asta === mean || mean === amin(all_bids))
                    return ALL_WIN_SCORE;

                if (P >= mean)
                    return x.x * (bando.base_asta - P) * (bando.base_asta - mean);
                else
                    return x.x + (1-x.x) * (mean-P) * (mean-amin(all_bids));

            },
            params:{x: {domain:{start:0.80, end:0.90, step:0.05}, required: true}},
            base_asta: true,
        }
    },
    "lineare_min_max": {
        // *
        // Consip
        // Bozen 3 (incremento_lineare)
        // This covers 0.45% of Bozen runs.
        up: {
            f: (P, x, bando, all_bids) => {
                if (amax(all_bids) === amin(all_bids)) return ALL_WIN_SCORE;
                return 1 - (amax(all_bids) - P) / (amax(all_bids) - amin(all_bids));
            },
            params:{}
        },
        down: {
            f: (P, x, bando, all_bids) => {
                if (amax(all_bids) === amin(all_bids)) return ALL_WIN_SCORE;
                return 1 - (P - amin(all_bids)) / (amax(all_bids) - amin(all_bids));
            },
            params:{}
        },
    }
}

export default functions;
