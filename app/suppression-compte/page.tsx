import PageLegale from '@/components/PageLegale';

// ─────────────────────────────────────────────────────────────────────────────
// LA PAGE QUE GOOGLE EXIGE POUR SUPPRIMER SON COMPTE.
//
// Le Play Store refuse une app qui permet de créer un compte sans donner, sur
// le web et SANS connexion, la marche à suivre pour le supprimer. La page doit
// nommer l'app, décrire les gestes, et dire ce qui part et ce qui reste.
//
// Elle vit dans le même moule que les CGU et la confidentialité : le texte est
// dans locales/*.json, donc les trois langues suivent toutes seules.
// ─────────────────────────────────────────────────────────────────────────────
export default async function SuppressionComptePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <PageLegale bloc="suppression" lang={lang} />;
}
