import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { UserSchema, API_URL } from '@erp-360/shared';
import { db } from './db/index.ts';
import { users } from './db/schema.ts';

const fastify = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);
fastify.register(cors, { origin: '*' });

// Rota POST modificada para salvar no Banco de Dados Real
fastify.post(
  '/user',
  {
    schema: { body: UserSchema },
  },
  async (request, reply) => {
    const { name, email } = request.body;

    // Insere no Postgres usando Drizzle e retorna o item criado
    const [novoUsuario] = await db.insert(users).values({ name, email }).returning();

    return reply.status(201).send(novoUsuario);
  },
);

// Rota GET para listar os usuários do banco
fastify.get('/user', async () => {
  const todosUsuarios = await db.select().from(users);
  // Retorna o primeiro ou um objeto fake caso esteja vazio
  return (
    todosUsuarios[0] || {
      id: '00000000-0000-0000-0000-000000000000',
      name: 'Nenhum',
      email: 'vazio@db.com',
    }
  );
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
