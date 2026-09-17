import Fastify from 'fastify';
import cors from '@fastify/cors';
import { User, API_URL } from '@erp-360/shared';

// Inicializa o Fastify com logs ativados no ambiente de desenvolvimento
const fastify = Fastify({
  logger: true
});

// Registra o plugin de CORS
fastify.register(cors, {
  origin: '*' // Em produção, mude para a URL do seu Frontend
});

// Declara a rota usando a tipagem do pacote compartilhado
fastify.get('/user', async (request, reply) => {
  const user: User = { 
    id: '777', 
    name: 'Lucas do Fastify', 
    email: 'lucas@fastify.com' 
  };
  
  return user; // O Fastify serializa objetos para JSON automaticamente
});

// Inicia o servidor
const start = async () => {
  try {
    // O Fastify escuta na porta 3000
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log(`🚀 Servidor Fastify pronto em ${API_URL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
