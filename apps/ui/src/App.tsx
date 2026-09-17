import type { User } from '@erp-360/shared';
import { API_URL } from '@erp-360/shared';

function App() {
  const user: User = { id: '1', name: 'Dev Turbo', email: 'turbo@teste.com' };

  return (
    <div>
      <h1>Frontend com pnpm e Turbo</h1>
      <p>URL: {API_URL}</p>
      <p>Usuário: {user.name}</p>
    </div>
  );
}

export default App;