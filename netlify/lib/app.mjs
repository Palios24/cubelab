// API de CubeLab : comptes + méthodes. `S` = un store Netlify Blobs (get / setJSON / set / delete / list).
import crypto from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(crypto.scrypt);
const MASKS = ['full', 'daisy', 'cross', 'crown', 'dcrown', 'ycross', 'edges', 'oll'];
const PSEUDO = /^[A-Za-z0-9_.-]{3,20}$/, TOK = /^[RLUDFBrludfbMESxyz](2'?|')?$/, DAY = 864e5;
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const hashPw = async (pw, salt) => (await scrypt(pw, salt, 64)).toString('hex');
const str = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const okMoves = (s, min) => { if (typeof s !== 'string' || s.length > 800) return false; const t = s.replace(/\([^)]*\)/g, ' ').replace(/[’‘`]/g, "'").trim().split(/\s+/).filter(Boolean); return t.length >= min && t.length <= 300 && t.every(x => TOK.test(x)); };
const reply = (o, s = 200, cookies = []) => { const h = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); cookies.forEach(c => h.append('Set-Cookie', c)); return new Response(JSON.stringify(o), { status: s, headers: h }); };
const bad = (m, s = 400) => reply({ error: m }, s);
const J = (S, k) => S.get(k, { type: 'json' });

async function listAll(S, prefix) { const keys = []; for await (const page of S.list({ prefix, paginate: true })) page.blobs.forEach(b => keys.push(b.key)); return keys; }
async function checkPw(S, uid, pw) { const u = await J(S, 'user/' + uid); if (!u || typeof pw !== 'string') return false; return crypto.timingSafeEqual(Buffer.from(await hashPw(pw, u.salt), 'hex'), Buffer.from(u.hash, 'hex')); }
async function limited(S, ctx) { const k = 'rl/' + sha(ctx?.ip || 'x'), now = Date.now(), h = ((await J(S, k)) || []).filter(t => now - t < 9e5); if (h.length >= 15) return true; h.push(now); await S.setJSON(k, h); return false; }

export async function handle(req, ctx, S) {
  const url = new URL(req.url), p = url.pathname.replace(/^\/api/, '') || '/', m = req.method, secure = url.protocol === 'https:' ? '; Secure' : '';
  const ck = (t, age) => `cl_s=${t}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure}`;
  let body = {};
  if (m !== 'GET') {
    if (!(req.headers.get('content-type') || '').includes('application/json')) return bad('JSON requis', 415);
    const raw = await req.text(); if (raw.length > 3e5) return bad('Trop volumineux', 413);
    try { body = raw ? JSON.parse(raw) : {}; } catch { return bad('JSON invalide'); }
  }
  const tok = ((req.headers.get('cookie') || '').match(/(?:^|;\s*)cl_s=([a-f0-9]{64})/) || [])[1];
  let user = null;
  if (tok) { const s = await J(S, 'sess/' + sha(tok)); if (s && s.expires > Date.now()) { const u = await J(S, 'user/' + s.uid); if (u) user = { id: u.id, pseudo: u.pseudo }; } }
  const login = async uid => { const t = crypto.randomBytes(32).toString('hex'); await S.setJSON('sess/' + sha(t), { uid, expires: Date.now() + 30 * DAY }); return ck(t, 30 * 86400); };
  const need = () => user ? null : bad('Connexion requise', 401);

  if (p === '/me' && m === 'GET') return reply(user ? { id: user.id, pseudo: user.pseudo } : { id: null });

  if (p === '/register' && m === 'POST') {
    if (await limited(S, ctx)) return bad('Trop de tentatives, réessaie dans quelques minutes.', 429);
    const { pseudo, password } = body;
    if (!PSEUDO.test(pseudo || '')) return bad('Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -)');
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) return bad('Mot de passe : 8 caractères minimum');
    const id = crypto.randomBytes(12).toString('hex'), salt = crypto.randomBytes(16).toString('hex'), hash = await hashPw(password, salt);
    const r = await S.set('name/' + pseudo.toLowerCase(), id, { onlyIfNew: true });
    if (!r.modified) return bad('Ce pseudo est déjà pris.', 409);
    await S.setJSON('user/' + id, { id, pseudo, salt, hash, created: Date.now() });
    return reply({ id, pseudo }, 200, [await login(id)]);
  }
  if (p === '/login' && m === 'POST') {
    if (await limited(S, ctx)) return bad('Trop de tentatives, réessaie dans quelques minutes.', 429);
    const { pseudo, password } = body, id = typeof pseudo === 'string' && PSEUDO.test(pseudo) ? await S.get('name/' + pseudo.toLowerCase()) : null;
    const ok = id ? await checkPw(S, id, password) : (await hashPw(String(password), '0'.repeat(32)), false);
    if (!ok) return bad('Pseudo ou mot de passe incorrect.', 401);
    const u = await J(S, 'user/' + id); return reply({ id, pseudo: u.pseudo }, 200, [await login(id)]);
  }
  if (p === '/logout' && m === 'POST') { if (tok) await S.delete('sess/' + sha(tok)); return reply({ ok: true }, 200, [ck('', 0)]); }

  if (p === '/me/pseudo' && m === 'PUT') {
    if (need()) return need();
    const np = body.pseudo; if (!PSEUDO.test(np || '')) return bad('Pseudo : 3 à 20 caractères (lettres, chiffres, _ . -)');
    const u = await J(S, 'user/' + user.id), low = np.toLowerCase();
    if (low !== u.pseudo.toLowerCase()) { const r = await S.set('name/' + low, user.id, { onlyIfNew: true }); if (!r.modified) return bad('Ce pseudo est déjà pris.', 409); await S.delete('name/' + u.pseudo.toLowerCase()); }
    await S.setJSON('user/' + user.id, { ...u, pseudo: np });
    const pub = await J(S, 'pub/' + user.id); if (pub) await S.setJSON('pub/' + user.id, { ...pub, pseudo: np });
    return reply({ pseudo: np });
  }
  if (p === '/me' && m === 'DELETE') {
    if (need()) return need();
    if (!await checkPw(S, user.id, body.password)) return bad('Mot de passe incorrect.', 401);
    await Promise.all(['name/' + user.pseudo.toLowerCase(), 'user/' + user.id, 'algos/' + user.id, 'pub/' + user.id, 'sess/' + sha(tok)].map(k => S.delete(k)));
    return reply({ ok: true }, 200, [ck('', 0)]);
  }

  if (p === '/algos' && m === 'GET') {
    const mine = user ? (await J(S, 'algos/' + user.id)) || [] : [], pubs = [];
    const docs = await Promise.all((await listAll(S, 'pub/')).map(async k => [k.slice(4), await J(S, k)]));
    for (const [uid, d] of docs) if (d && uid !== user?.id) for (const a of d.algos || []) pubs.push({ ...a, id: uid + '-' + a.id, by: d.pseudo });
    return reply({ mine, pubs: pubs.slice(0, 1000) });
  }
  if (p === '/algos' && m === 'PUT') {
    if (need()) return need();
    const L = body.algos, ids = new Set(), clean = [];
    if (!Array.isArray(L) || L.length > 500) return bad('Liste invalide');
    for (const a of L) {
      if (!a || typeof a.id !== 'string' || !/^[a-z0-9]{1,20}$/.test(a.id) || ids.has(a.id)) return bad('Méthode invalide');
      ids.add(a.id);
      const name = str(a.name, 60), cat = str(a.cat, 40);
      if (!name || !cat || !okMoves(a.moves, 1) || !okMoves(a.setup || '', 0)) return bad('Méthode invalide : ' + (name || 'sans nom'));
      clean.push({ id: a.id, name, cat, moves: a.moves.trim(), setup: (a.setup || '').trim(), note: str(a.note, 500), pub: !!a.pub, mask: MASKS.includes(a.mask) ? a.mask : 'full' });
    }
    await S.setJSON('algos/' + user.id, clean);
    const pubs = clean.filter(a => a.pub).map(({ pub, ...a }) => a);
    if (pubs.length) await S.setJSON('pub/' + user.id, { pseudo: user.pseudo, algos: pubs }); else await S.delete('pub/' + user.id);
    return reply({ ok: true });
  }
  return bad('Introuvable', 404);
}
