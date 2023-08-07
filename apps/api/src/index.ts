import { createApp } from './app';
import { getConfig } from './config';

const { PORT } = getConfig();

createApp().listen(PORT, () => {
  console.log(`[api] listening on :${PORT}`);
});
