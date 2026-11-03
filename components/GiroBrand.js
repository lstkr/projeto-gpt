/** Marca Giro provisória: a órbita mantém o estoque como origem e sugere movimento. */
export default function GiroBrand() {
  return <span className="giro-brand">
    <svg aria-hidden="true" width="42" height="42" viewBox="0 0 64 64" fill="none">
      <rect width="64" height="64" rx="18" fill="currentColor"/>
      <g stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="m32 21 10 5v12l-10 5-10-5V26l10-5Zm0 11 10-6M32 32v11M22 26l10 6"/>
        <path d="M13 28a20 20 0 0 1 33-12m5 20a20 20 0 0 1-33 12M46 9v8h-8M18 55v-8h8"/>
      </g>
    </svg>
    <span className="giro-wordmark">giro<span>.</span><small>Seu negócio em movimento.</small></span>
  </span>;
}
