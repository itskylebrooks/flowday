import type { Entry } from '@shared/lib/types/global';
import ConstellationsExperience from '../components/ConstellationsExperience';

export default function ConstellationsPageLegacy({ entries, yearKey }: { entries: Entry[]; yearKey?: string }) {
  return <ConstellationsExperience entries={entries} yearKey={yearKey} layout="compact" />;
}
