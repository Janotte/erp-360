import { buildApp } from './app.ts';
import { env } from './config/index.ts';

const fastify = buildApp();

const start = async () => {
  try {
    await fastify.listen({ port: env.app.port, host: env.app.host });
    const publicUrl = env.app.baseUrl ?? `http://localhost:${env.app.port}`;
    console.log(`🚀 Servidor Fastify pronto em ${publicUrl}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
