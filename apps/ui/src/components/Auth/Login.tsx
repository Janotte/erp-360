import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { enviarLoginAPI } from '../../services/auth';
import { authStorage } from '../../utils/auth';

interface LoginProps {
  onLoginSuccess: () => void;
  onAlternarParaRegistro: () => void;
}

export function Login({ onLoginSuccess, onAlternarParaRegistro }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate, isPending, error } = useMutation({
    mutationFn: enviarLoginAPI,
    onSuccess: (data) => {
      authStorage.setToken(data.token);
      onLoginSuccess();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    mutate({ email, password });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Acessar o Sistema
          </CardTitle>
          <CardDescription>Insira suas credenciais corporativas</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="exemplo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {error.message}
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Autenticando...' : 'Entrar'}
            </Button>
            <div className="text-sm text-center text-zinc-500">
              Não tem uma conta?{' '}
              <button
                type="button"
                onClick={onAlternarParaRegistro}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
                Cadastrar nova empresa
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
