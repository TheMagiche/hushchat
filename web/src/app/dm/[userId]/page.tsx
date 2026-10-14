import DMClient from './DMClient';

export function generateStaticParams() {
  return [{ userId: 'welcome' }];
}

export default function DMPage() {
  return <DMClient />;
}
