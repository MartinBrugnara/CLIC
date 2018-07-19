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

import {FuncNames} from './functions.ts';


export interface Call {
    riparametra_1_criteri: boolean;
    riparametra_2_parti: boolean;

    criteri: [Criterion_N<Eco>,Criterion_N<Tech>];
    offerte: Bid[];
}

export type Tech = TechCriterion_D|TechCriterion_Q|TechCriterion_T;
export type Eco = EcoCriterion;

export interface CNode {
    criteri: CNode[];
}

export const enum ModSoglia {Points="punti", Value="valore"}
export const enum CriterionKind {D='D', Q='Q', T='T'}

export interface Criterion {
    nome: string;
    mod_soglia: ModSoglia;
    soglia: number;
}

export interface Criterion_N<T> extends Criterion {
    criteri: (T|Criterion_N<T>)[];
}

export interface Leaf extends Criterion {
    tipo: CriterionKind;
}

export interface TechCriterion_D extends Leaf {
    tipo: CriterionKind.D;
    peso: number;
}

export interface TechCriterion_Q extends Leaf {
    tipo: CriterionKind.Q;
    peso: number;
    funzione: FuncNames;
    parametri: {[key:string]:number};
}

export interface TechCriterion_T extends Leaf {
    tipo: CriterionKind.T;
    voci: {nome:string, punti:number}[];
}

export const enum EcoMode {Price="prezzo", Discount="ribasso"}
interface EcoCriterion extends Leaf {
    peso: number;
    modo: EcoMode;
    funzione: FuncNames;
    parametri: {[key:string]:number};

    // Let's see if we can make this work,
    // would be kind of an hack.
    // CONSIDER type E
    tipo: CriterionKind.Q;
}

export interface Bid {
    nome: string;
    valori: number[];
}
