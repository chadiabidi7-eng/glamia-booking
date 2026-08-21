# Le vocabulaire de Glamia, en trois langues

Ce fichier fixe **un mot français = un mot anglais**, partout. Sans ça, la même
chose s'appelle « service » sur un écran et « treatment » sur le suivant, et la
pro croit qu'il s'agit de deux choses différentes.

L'espagnol se traduit **depuis le français**, en suivant les mêmes décisions.

## Les mots du métier

- **cliente** → *client* — jamais « customer », qui appartient au commerce.
- **rendez-vous / RDV** → *appointment* — jamais « booking », qui désigne l'acte
  de réserver, pas le rendez-vous lui-même.
- **réserver / réservation** → *to book / booking*.
- **prestation** et **technique** → *service*, les deux. En français ce sont
  deux niveaux (la catégorie et ce qu'elle contient) ; en anglais, « service »
  couvre les deux sans ambiguïté à l'écran.
- **spécialité** → *specialty*.
- **créneau** → *slot*.
- **plage horaire** → *window*.
- **horaires** → *hours* · **disponibilités** → *availability*.
- **blocage / bloquer** → *block*.
- **lapin (absence)** → *no-show* — le mot du métier en anglais, et il est plus
  dur que le français : c'est voulu.

## L'argent

- **acompte** → *deposit*.
- **caisse** → *payments* quand on parle de la fonction (« ouvrir ma caisse » →
  *open my payments*), *balance* quand on parle de la somme (« MA CAISSE » →
  *MY BALANCE*). Le mot français fait les deux, l'anglais non.
- **encaissement** → *payment* · **virement** → *payout* — c'est le mot qu'emploie
  Stripe, celui que la pro retrouvera dans ses mails de banque.
- **frais** → *fees* · **réduction** → *discount* · **remboursement** → *refund*.
- **CA (chiffre d'affaires)** → *revenue*.

## Ce qui est à elle

- **Mon activité** (l'onglet) → *My business*.
- **Ma page de réservation** → *My booking page*.
- **fidélité** → *loyalty* · **tampon** → *stamp* · **palier** → *reward tier*.
- **badge** (regrouper des clientes) → *tag* — « badge » existe en anglais mais
  désigne une récompense ; *tag* dit bien « étiquette de regroupement ».
- **offre** → *offer* · **promo** → *promo* · **pack** → *bundle*.
- **règlement** → *policy* · **formulaire** → *form*.
- **avis** → *review*.
- **message d'accueil / de rappel** → *welcome / reminder message*.

## Le ton

Le français dit **tu**. L'anglais n'a pas ce choix : on garde la même chaleur
avec du « you » direct et des phrases courtes, sans familiarité forcée et sans
formules de politesse commerciales (« kindly », « we apologise for »).

## Ce qui attend l'action « heures et dates »

Quatre phrases anglaises portent encore un format d'heure français, parce que
la saisie, elle, n'est pas encore passée en 12 h. Elles seront à revoir en même
temps que le format :

- `horaires.formatHeure` — « Expected format: HH:mm »
- `nouveauRdv.heureInvalideDetail` — « Use the HH:MM format (e.g. 14:30) »
- `rdv.heureInvalideDetail` — « (HH:MM) »
- `presentationCalendrier.exempleDetail` — « 1h30 »

Les exemples d'horaires **dans les textes d'explication** sont déjà en 12 h
(« 6 PM », « 9 AM–12 PM »), eux : ils ne dépendent d'aucune saisie.

## Les exemples et les adresses

Une adresse d'exemple parisienne ne parle pas à une pro de Manchester. Les
exemples sont donc localisés, pas traduits :

- `adresse.villeExemple` — Lyon 3e → *Shoreditch — London*
- `adresse.accesExemple` — Métro B → *Northern line, Old Street station*
- `adresse.exacteExemple` — rue des Faussets → *Rivington Street*

Pour l'espagnol, prendre des repères de Madrid ou de Mexico, pas de Londres.
