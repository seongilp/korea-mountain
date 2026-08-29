import { MountainExplorer } from '@/components/mountain-explorer';
import mountains from '@/public/data/mountains.json';
import type { MountainSummary } from '@/lib/mountains';

export default function Home() {
  return <MountainExplorer mountains={mountains as MountainSummary[]} />;
}
