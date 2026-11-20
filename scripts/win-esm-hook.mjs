// Windows: bazı testler `await import(path.join(ROOT, '...'))` ile mutlak yol (D:\...) verir; Node ESM yükleyicisi bunu
// "d:" şeması sayıp reddeder (ERR_UNSUPPORTED_ESM_URL_SCHEME). Bu kanca sürücü harfli belirleyicileri file:// URL'ye çevirir.
// Yalnız scripts/test-all.mjs, Windows'ta `node --import <bu dosya>` ile kullanır; testlerin kendisi değişmez.
import { register } from 'node:module';
register('./win-esm-loader.mjs', import.meta.url);
