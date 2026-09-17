import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { UserSchema, type User, API_URL } from '@erp-360/shared';

const fastify = Fastify({
  logger: true
}).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, {
  origin: '*' // Em produção, mude para a URL do seu Frontend
});

// Estado em memória para o exemplo (POST atualiza, GET lê)
let usuarioAtual: User = {
  id: 'ea9b60ee-6c30-4e67-bb78-3db8ccda3da3',
  name: 'Usuário Inicial',
  email: 'inicial@erp360.com',
};

fastify.get('/user', {
  schema: {
    response: {
      200: UserSchema,
    },
  },
}, async () => {
  return usuarioAtual;
});

fastify.post('/user', {
  schema: {
    body: UserSchema,
    response: {
      201: UserSchema,
    },
  },
}, async (request, reply) => {
  const { id, name, email } = request.body;
  usuarioAtual = { id, name, email };
  return reply.status(201).send(usuarioAtual);
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Servidor Fastify + Zod pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
