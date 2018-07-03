# CLIC

Software per il confronto dei metodi di aggiudicazione dell'offerta economicamente più vantaggiosa, quali Aggregativo-Compensatore, Electre e Topsis.
Il software permette di simulare gare di appalto, variando sia i meta-parametri dei metodi, che il numero di partecipanti, nonchè i valori attribuiti ad ognuno dei partecipanti.
Mostra inoltre il risultato sia in forma tabellare che grafica.


## Design decisions
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


Author: @MartinBrugnara  
Copyright (C) 2018 Martin Brugnara - Università degli Studi di Trento  
License: [GNU General Public License v3.0](LICENSE)
