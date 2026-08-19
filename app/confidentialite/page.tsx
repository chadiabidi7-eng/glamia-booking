import PageLegale from '@/components/PageLegale';

export default async function ConfidentialitePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <PageLegale bloc="confidentialite" lang={lang} />;
}
