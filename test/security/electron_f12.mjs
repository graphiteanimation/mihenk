import { _electron as electron } from 'playwright';
const app = await electron.launch({ args: ['/tmp/aud/app2', '--no-sandbox'] });
const page = await app.firstWindow(); await page.waitForTimeout(3000);
const r = await app.evaluate(async ({ BrowserWindow }) => { const wc = BrowserWindow.getAllWindows()[0].webContents; wc.sendInputEvent({ type: 'keyDown', keyCode: 'F12' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'F12' }); await new Promise(r => setTimeout(r, 1500)); return wc.isDevToolsOpened(); });
console.log('F12 sonrası DevTools açık:', r); await app.close(); process.exit(0);
