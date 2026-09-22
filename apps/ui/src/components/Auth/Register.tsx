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

import { enviarRegistrarAPI } from '../../services/auth';

interface RegisterProps {
  onRegisterSuccess: () => void;
}

export function Register({ onRegisterSuccess }: RegisterProps) {
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [nomeUsuario, setNomeUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const { mutate, isPending, error, isSuccess } = useMutation({
    mutationFn: enviarRegistrarAPI,
    onSuccess: () => {
      setTimeout(() => {
        onRegisterSuccess();
      }, 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({ nomeEmpresa, nomeUsuario, email, senha });
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-50 px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Criar Conta Corporativa
          </CardTitle>
          <CardDescription>
            Abra o ambiente Multi-Tenant para a sua empresa
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nomeEmpresa">Nome da Empresa</Label>
              <Input
                id="nomeEmpresa"
                placeholder="Minha Empresa LTDA"
                value={nomeEmpresa}
                onChange={(e) => setNomeEmpresa(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nomeUsuario">Seu Nome completo</Label>
              <Input
                id="nomeUsuario"
                placeholder="João Silva"
                value={nomeUsuario}
                onChange={(e) => setNomeUsuario(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail Corporativo</Label>
              <Input
                id="email"
                type="email"
                placeholder="adm@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="senha">Senha de Acesso</Label>
              <Input
                id="senha"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-md">
                {error.message}
              </p>
            )}
            {isSuccess && (
              <p className="text-sm font-medium text-emerald-600 bg-emerald-50 p-3 rounded-md">
                Empresa cadastrada com sucesso! Redirecionando...
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={isPending || isSuccess}>
              {isPending ? 'Criando Ambiente...' : 'Cadastrar Empresa'}
            </Button>
            <div className="text-sm text-center text-zinc-500">
              Já possui cadastro?{' '}
              <button
                type="button"
                onClick={onRegisterSuccess}
                className="font-medium text-primary hover:underline cursor-pointer"
              >
                Voltar para o Login
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
