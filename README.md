# CLIC

Software per il confronto dei metodi di aggiudicazione dell'offerta economicamente più vantaggiosa, quali Aggregativo-Compensatore, Electre e Topsis.
Il software permette di simulare gare di appalto, variando sia i meta-parametri dei metodi, che il numero di partecipanti, nonchè i valori attribuiti ad ognuno dei partecipanti.
Mostra inoltre il risultato sia in forma tabellare che grafica.


## Implementation notes
- Electre

  > Per definire una classifica, è necessario ripetere la procedura cancellando di volta in volta l’offerta risultata vincitrice nella tornata precedente.
  > Per le ragioni indicate il metodo Electre può risultare non adeguato quando il numero delle offerte presentate è inferiore a tre, perché causa effetti distorsivi nel processo di valutazione.  
  > - 'FILE 1_ ESTRATTO 02_OEPV E METODI MULTICRITERI.pdf'

  - L'algoritmo e' eseguito `numero_di_offerte - 2` volte per definire la classifica, alle restanti due e' assegnato l'ultimo posto a pari merito.
  - Nel calcolo degli indici di concordanza e di discordanza (`c_ij`, `d_ij`) un criterio (`k`) viene ignorato se il relativo massimo scarto (`s_k`) e' 0.
  - Quando un offerta (`j`) e' dominata da un altra (`i`), l'intera iterazione e' ricalcolata senza la prima (`j`).
  - Quando due o meno offerte sono disponibili l'algoritmo assegna lo stesso rank;
    questo e' vero anche quando il numero di offerte e' maggiore di 3 (`2+x`)
    ma alcune vengono escluse perche' dominate (`x`).

- Topsis
  - Durante la normalizzazione dei valori in input (`x_ij`), se la media geometrica per un criterio e' 0 i valori d'offerta per quel criterio non vanno normalizzati (visto che sono zero).

- Riparametrazione 
<!-- Discuss first and then implement.
  - A tutti i criteri di tipo discrezionale (D), cioe' quelli dove il punteggio viene
    assegnato da una commisione o tramite confronto a coppie, viene applicata la
    funzione "proporzionalita' inversa" per garantire che l'offerta migliore 
    abbia il punteggio di 1.
-->

  - Le riparametrazioni di primo e secondo livello vengono applicate solo
    quando si utilizza l'aggregativo compensatore (electre e topsis gia' la prevedono nel loro algoritmo).

  - La riparametrazione di primo livello viene applicata solo alle foglie.
  - La riparametrazioni di secondo livello solo a valore finale di offerta tecnica,
    i.e. non tra i subcriteri intermedi.  
    __DOMANDA:__ E'corretto?

  - __DOMANDA:__ I criteri tabellari (T) devono essere sempre riscalati?   
    Al momento lo sono solo se rip. di livello 1 e' richiesta.
    (just divide by max indeax of weight in apply_functions).

- Soglie:
    - _NOTA:_ non ancora implementate per offerta tecnica.

- Parte economica
  - Si prevede la possibilia' di specificare un solo criterio per la parte economica,
    i.e. un solo valore per il prezzo o/ il ribasso. Non sono previsti subcriteri.

## Cose interessanti
  - Comportamento di Electre quando esistono offerte identiche: una domina l'altra perche' `d_ij` risulta 0... peccato non si tenga conto di `c_ij`.

## Extra
- `git grep IMP` per filtrare una serie di possibili miglioramenti/ottimizzazioni.

Author: @MartinBrugnara  
Copyright (C) 2018 Martin Brugnara - Università degli Studi di Trento  
License: [GNU General Public License v3.0](LICENSE)
