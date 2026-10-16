import dotenv from 'dotenv';

dotenv.config();

// Настройка прокси для встроенного fetch в Node.js (при наличии HTTP(S)_PROXY или ALL_PROXY)
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY) {
  try {
    const { EnvHttpProxyAgent, setGlobalDispatcher } = await import('undici');
    setGlobalDispatcher(new EnvHttpProxyAgent());
  } catch (err) {
    console.warn('Could not initialize proxy dispatcher:', err);
  }
}
