import Fastify from 'fastify';
import cors from '@fastify/cors';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { UserSchema, API_URL } from '@erp-360/shared';

// Inicializa o Fastify com logs ativados no ambiente de desenvolvimento
const fastify = Fastify({
  logger: true
}).withTypeProvider<ZodTypeProvider>();

// Configura os compiladores de validação e serialização do Zod
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Registra o plugin de CORS
fastify.register(cors, {
  origin: '*' // Em produção, mude para a URL do seu Frontend
});

// Rota POST validando o corpo (Body) da requisição com o Schema Compartilhado
fastify.post('/user', {
  schema: {
    body: UserSchema, // Valida o input que vem do Frontend
    response: {
      201: UserSchema // Garante que a resposta da API também segue o Schema
    }
  }
}, async (request, reply) => {
  // Aqui dentro, o TS já sabe perfeitamente que request.body é do tipo User!
  const { id, name, email } = request.body;

  // Lógica de banco/negócio fictícia...
  return reply.status(201).send({ id, name, email });
});


// Inicia o servidor
const start = async () => {
  try {
    // O Fastify escuta na porta 3000
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Servidor Fastify + Zod pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
