import '../styles/globals.css';
import '../styles/giro.css';
import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return <><Head><title>Giro · Seu negócio em movimento</title><meta name="description" content="Estoque, compras e caixa no ritmo do seu negócio."/><link rel="icon" href="/giro.svg" type="image/svg+xml"/></Head><Component {...pageProps} /></>;
}
