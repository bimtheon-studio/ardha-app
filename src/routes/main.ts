import { createApp } from './app.ts';
import { CONFIG, type Config } from '../config/config.ts';

const app = await createApp();
const config = app.get<Config>(CONFIG);
await app.listen(config.API_PORT, config.API_HOST);
