import { css } from '../../styled-system/css';

export default function Home() {
  return (
    <main className={css({ maxWidth: '48rem', margin: '0 auto', padding: '2rem' })}>
      <h1 className={css({ fontSize: '2rem', fontWeight: 'bold' })}>Doc-home</h1>
      <p>Framework setup is in place. Project details and assets are the next delivery step.</p>
      <p>
        <a href="/api/health">Check API and database connection</a>
      </p>
    </main>
  );
}
