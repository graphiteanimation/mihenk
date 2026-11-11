// CAM cekirdegi hata turu: KErr ile ayni {code, params} sozlesmesi; kodlar 'cam.' onekli.
// Metinler src/i18n/cam-core-{tr,en}.js taslaklarinda ('err.' + kod); arayuz t('err.' + code, params) ile cevirir.
import { KErr } from '../../shared/errors.js';
export class CamErr extends KErr { constructor(code, params = {}) { super(code, params); this.name = 'CamErr'; } }
export const cerr = (code, params = {}) => new CamErr(code, params);
// uyari/kapi sonucu nesnesi
export const issue = (code, params = {}, extra) => ({ code, params, ...(extra || {}) });
