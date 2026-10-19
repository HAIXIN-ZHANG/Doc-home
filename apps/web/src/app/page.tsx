import { css } from '../../styled-system/css';
import { button } from '../../styled-system/recipes';

export default function Home() {
  return (
    <main
      className={css({
        width: 'full',
        maxWidth: 'page',
        mx: 'auto',
        px: { mobile: '5', tablet: '8' },
        py: '8',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4',
      })}
    >
      <h1 className={css({ textStyle: 'pageTitle' })}>Doc-home</h1>
      <p>Framework setup is in place. Photo management is the next delivery step.</p>
      <a href="/api/health" className={button({ visual: 'secondary' })}>
        Check API and storage connection
      </a>
    </main>
  );
}
