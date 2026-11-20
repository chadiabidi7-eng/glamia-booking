import PageLegale from '@/components/PageLegale';

// LES CONDITIONS ÉCRITES POUR LES CLIENTES (Chadi, 20 nov. 2026) : qui vend, qui
// encaisse, qui rembourse, à qui s'adresser. La page de réservation y renvoie au
// moment de payer (avant, elle renvoyait vers les conditions des pros).
export default async function ConditionsClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <PageLegale bloc="conditionsClientes" lang={lang} />;
}
