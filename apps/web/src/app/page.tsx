import { redirect } from 'next/navigation';
import { DEMO_PROJECT_ID, projectPhotosPath } from '@/features/photos/photo-urls';

export default function Home() {
  // The demo has one seeded project; avoid adding an unimplemented project dashboard.
  redirect(projectPhotosPath(DEMO_PROJECT_ID));
}
