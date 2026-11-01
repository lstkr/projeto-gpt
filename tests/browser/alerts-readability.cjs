const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../..');
const styles = fs.readFileSync(path.join(root, 'styles/globals.css'), 'utf8');
const view = fs.readFileSync(path.join(root, 'pages/index.js'), 'utf8');
const toastOpening = view.match(/<div className="toast"[^>]*>/)[0].replace('className', 'class');
const description = 'Confira a divergência antes de continuar. '.repeat(8) + 'DOCUMENTOSINTETICOSEMESPACOS'.repeat(6);

// A avaliação mantém as métricas juntas porque o Playwright a serializa para outro contexto.
function browserMetrics() {
  const luminance = (color) => {
    const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map((n) => {
      const channel = n / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const contrasts = ['.alert-strip b', '.alert-strip p', '.alert-strip > button', '.toast', '.toast button'].map((selector) => {
    const element = document.querySelector(selector);
    const foreground = luminance(getComputedStyle(element).color);
    const surface = element.closest('.toast') || element.closest('.alert-strip');
    const background = luminance(getComputedStyle(surface).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  const paragraph = document.querySelector('.alert-strip p');
  const toast = document.querySelector('.toast');
  const controls = ['.alert-strip > button', '.toast button'].map((selector) => {
    const button = document.querySelector(selector);
    button.focus();
    const rect = button.getBoundingClientRect();
    return document.activeElement === button && rect.width >= 44 && rect.height >= 44 && rect.right <= innerWidth && rect.left >= 0;
  });
  return { contrasts, controls,
    overflow: document.documentElement.scrollWidth > innerWidth,
    clipped: paragraph.scrollHeight > paragraph.clientHeight || paragraph.scrollWidth > paragraph.clientWidth,
    toastOverflow: toast.scrollWidth > toast.clientWidth,
    status: toast.getAttribute('role'), live: toast.getAttribute('aria-live'), atomic: toast.getAttribute('aria-atomic') };
}

async function checkWidth(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  try {
    await page.route('**/*', (route) => route.abort());
    await page.setContent(`<style>${styles}</style><section class="alert-strip" role="alert"><span class="alert-icon">!</span><div><b>Conferência necessária</b><p>${description}</p></div><button>Conferir agora</button></section>${toastOpening}<span>✓</span>${description}<button aria-label="Dispensar notificação">×</button></div>`);
    const readabilityMetrics = await page.evaluate(browserMetrics);
    assert.ok(readabilityMetrics.contrasts.every((ratio) => ratio >= 4.5), JSON.stringify(readabilityMetrics));
    assert.ok(readabilityMetrics.controls.every(Boolean), JSON.stringify(readabilityMetrics));
    assert.equal(readabilityMetrics.overflow || readabilityMetrics.clipped || readabilityMetrics.toastOverflow, false, JSON.stringify(readabilityMetrics));
    assert.deepEqual([readabilityMetrics.status, readabilityMetrics.live, readabilityMetrics.atomic], ['status', 'polite', 'true']);
    console.log(`PASS ${width}px: contraste mínimo ${Math.min(...readabilityMetrics.contrasts).toFixed(2)}:1; texto integral; controles 44px focáveis; status polite atomic`);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    ...(process.env.ESTOQUE_CHROME_PATH ? { executablePath: process.env.ESTOQUE_CHROME_PATH } : {}) });
  try {
    for (const width of [390, 1365]) await checkWidth(browser, width);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
