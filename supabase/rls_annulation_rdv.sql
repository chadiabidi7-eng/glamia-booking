-- Policy RLS : autoriser les utilisateurs anonymes à annuler un rendez-vous
-- (passer statut → 'annule')
--
-- À exécuter dans Supabase > SQL Editor
--
-- Si une policy UPDATE anon existe déjà, la supprimer d'abord :
-- DROP POLICY IF EXISTS "anon peut annuler rdv" ON rendez_vous;

CREATE POLICY "anon peut annuler rdv"
ON rendez_vous
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);
