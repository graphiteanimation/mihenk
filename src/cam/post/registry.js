// Post kayit defteri: makine profilindeki control kimligi -> post. Kullanici post betigi yuklenmez (bu surumde).
import { perr } from './engine.js';
import { createFanucPost } from './fanuc-base.js';
import { createM80VPost } from './mitsubishi-m80v.js';

const POSTS = new Map();
export function registerPost(post) { POSTS.set(post.id, post); return post; }
export function listPosts() { return [...POSTS.keys()]; }
export function getPost(control) {
  const p = POSTS.get(control);
  if (!p) throw perr('cam.post.unknown_control', { control: String(control) });
  return p;
}
registerPost(createFanucPost());
registerPost(createM80VPost());
