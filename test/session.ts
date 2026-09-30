// Ouvre une session par l'API (inscription) et rend le cookie à renvoyer.
import request from 'supertest';

import type { TestApp } from './test-app.ts';

export async function signedIn(t: TestApp, email = `u${Math.random().toString(36).slice(2, 8)}@exemple.fr`): Promise<string> {
  const r = await request(t.app.getHttpServer())
    .post('/api/auth/signup')
    .set('X-Forwarded-For', `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`)
    .send({ email, name: 'Géomètre Test', password: 'cheval pomme agrafe' });
  const raw = r.headers['set-cookie'] as unknown as string[] | undefined;
  const cookie = raw?.find((l) => l.startsWith(`${t.config.SESSION_COOKIE_NAME}=`));
  if (!cookie) throw new Error(`inscription impossible : ${r.status} ${JSON.stringify(r.body)}`);
  return cookie.split(';')[0]!;
}
