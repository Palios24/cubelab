import { getStore } from '@netlify/blobs';
import { handle } from '../lib/app.mjs';
// Base de données : Netlify Blobs (incluse dans Netlify, aucune configuration)
export default async (req, ctx) => handle(req, ctx, getStore({ name: 'cubelab', consistency: 'strong' }));
export const config = { path: '/api/*' };
