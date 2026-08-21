import PageLegale from '@/components/PageLegale';

export default async function CGUPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  return <PageLegale bloc="cgu" lang={lang} />;
}
