-- Fermeture des écritures anonymes sur rendez_vous et fidelite_clientes
-- 30 juillet 2026
--
-- Ce fichier créait auparavant la policy « anon peut annuler rdv »
-- (UPDATE ... USING (true)), qui laissait n'importe quel porteur de la clé
-- publique modifier ou annuler le RDV de n'importe quelle cliente.
-- Il fait maintenant l'inverse : il ferme.
--
-- ⚠️ PRÉREQUIS : la page de réservation en PRODUCTION doit passer par les
-- guichets serveur (app/api/rdv/*). Sans ça, les clientes ne peuvent plus
-- ni annuler ni décaler. Vérifier avant d'exécuter.
--
-- Ce qui reste volontairement ouvert :
--   - INSERT anon sur rendez_vous  → créer une réservation est l'action
--     anonyme légitime (décision du 19 juillet 2026)
--   - SELECT anon                  → la page de résa lit les créneaux.
--     Trou connu, chantier séparé : on peut lire les RDV de toutes les pros.
--
-- Les guichets travaillent en service role et passent au-dessus des policies :
-- les supprimer ne les gêne pas.

DROP POLICY IF EXISTS "Booking public update rendez_vous" ON rendez_vous;
DROP POLICY IF EXISTS "anon peut annuler rdv"             ON rendez_vous;
DROP POLICY IF EXISTS "anon_fidelite_update"              ON fidelite_clientes;
DROP POLICY IF EXISTS "anon_fidelite_insert"              ON fidelite_clientes;


-- ----------------------------------------------------------------------------
-- RETOUR ARRIÈRE — à exécuter tel quel si les clientes ne peuvent plus annuler
-- ou décaler après la fermeture. Rouvre exactement l'état d'avant.
-- ----------------------------------------------------------------------------
--
-- CREATE POLICY "Booking public update rendez_vous" ON rendez_vous
--   FOR UPDATE TO anon WITH CHECK (true);
--
-- CREATE POLICY "anon peut annuler rdv" ON rendez_vous
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);
--
-- CREATE POLICY "anon_fidelite_update" ON fidelite_clientes
--   FOR UPDATE TO anon USING (true) WITH CHECK (true);
--
-- CREATE POLICY "anon_fidelite_insert" ON fidelite_clientes
--   FOR INSERT TO anon WITH CHECK (true);
