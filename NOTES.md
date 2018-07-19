## Note implementative

- Electre

  > Per definire una classifica, è necessario ripetere la procedura cancellando di volta in volta l’offerta risultata vincitrice nella tornata precedente.
  > - 'FILE 1_ ESTRATTO 02_OEPV E METODI MULTICRITERI.pdf'

  - L'algoritmo e' eseguito `numero_di_offerte - 1` volte per definire la classifica,
    alla restante e' assegnato l'ultimo posto.
  - Nel calcolo degli indici di concordanza e di discordanza (`c_ij`, `d_ij`) un criterio (`k`) viene ignorato se il relativo massimo scarto (`s_k`) e' 0.
  - Quando un offerta (`j`) e' dominata da un altra (`i`), l'intera iterazione e' ricalcolata senza la prima (`j`).
  - Quando due offerte si dominano a vicenda, _e.g._ quando sono identiche, `c_ij` == `d_ij` == 0.
    Una delle due viene esclusa, il ranking calcolato senza di essa, se la restante risulta vincitrice il posto viene assegnato ad entrambe.
    Notasi che questo differisci dalla norma di legge dove si prevederebbe di scegliere a caso una delle due;
    qui, dato il contesto esplorativo, si preferisce evidenziare il fenomeno.

- Topsis
  - Durante la normalizzazione dei valori in input (`x_ij`), se la media geometrica per un criterio e' 0 i valori d'offerta per quel criterio non vanno normalizzati (visto che sono zero).

- Riparametrazione 
  - Le riparametrazioni di primo e secondo livello vengono applicate solo
    quando si utilizza l'aggregativo compensatore (electre e topsis gia' la prevedono nel loro algoritmo).

  - La riparametrazione di primo livello viene applicata solo alle foglie.
  - La riparametrazioni di secondo livello solo a valore finale di offerta tecnica,
    i.e. non tra i subcriteri intermedi.  
    __DOMANDA:__ E'corretto?

  - __DOMANDA:__ I criteri tabellari (T) devono essere sempre ri-scalati?   
    Al momento lo sono solo se rip. di livello 1 e' richiesta.
    (just divide by max indeax of weight in apply_functions).


- Anomalia:
    - Non è e non verrà implementato.
    - Se desiderato, può essere simulato aggiungendo un criterio 
      (economico o tecnico) con peso = 0 e soglia = 1. Assegnare valore = 1
      per le offerte che NON anomale.
