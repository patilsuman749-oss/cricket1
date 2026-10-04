/** Shared browser launcher for the e2e tests. Needs `npm i -D puppeteer` (or set CHROME_PATH). */
import { fileURLToPath } from 'node:url';
export const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
export async function launch() {
  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({ headless: 'shell', executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
}
