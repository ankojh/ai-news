import { redirect, notFound } from 'next/navigation';
import Newsren from '@/components/Newsren';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  if (!slug) redirect('/technology');
  const [section, id] = slug;
  if (
    !['technology', 'paper', 'briefing', 'review', 'runs', 'metrics', 'settings', 'about'].includes(
      section,
    ) ||
    slug.length > 2 ||
    (!['paper', 'briefing', 'runs'].includes(section) && id) ||
    (section === 'paper' && (!id || !/^\d{4}\.\d{4,5}$/.test(id)))
  )
    notFound();
  return <Newsren />;
}
