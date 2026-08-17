import { Head, Html, Main, NextScript } from 'next/document';

// Applies saved accessibility preferences (font scale, high contrast)
// before first paint so pages don't flash unstyled defaults.
const A11Y_INIT = `try{var p=JSON.parse(localStorage.getItem('playdata-a11y')||'{}');if(p.fontScale&&p.fontScale!=='md')document.documentElement.setAttribute('data-font-scale',p.fontScale);if(p.highContrast===true)document.documentElement.setAttribute('data-contrast','high');}catch(e){}`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <script dangerouslySetInnerHTML={{ __html: A11Y_INIT }} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
