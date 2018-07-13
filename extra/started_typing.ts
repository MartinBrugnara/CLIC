interface MiddleCriterion {
    nome: string,
    subcriteri: Criterion[],
}

enum ModSoglia {weight = 'peso', raw = 'valore'}
interface GenericLeafCriterion {
    nome: string,
    funzione: string,
    soglia: number,
    mod_soglia: ModSoglia,
}
enum CriterionTypeW {D = 'D', Q = 'Q'}
enum CriterionTypeT {T = 'T'}
interface LeafCriterionW extends GenericLeafCriterion {
    tipo: CriterionTypeW,
    peso: number,
}
interface LeafCriterionT extends GenericLeafCriterion {
    tipo: CriterionTypeT,
    voci: number[],
}
type Criterion = MiddleCriterion |  LeafCriterionW | LeafCriterionT;


