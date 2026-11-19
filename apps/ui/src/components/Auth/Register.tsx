import { formatCnpj, toTitleCasePtBr } from '@erp-360/shared';
import { useMutation } from '@tanstack/react-query';
import React, { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { FloatingInput } from '@/components/ui/FloatingField';

import { sendRegisterAPI } from '../../services/auth';

export function Register() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { mutate, isPending, error, isSuccess } = useMutation({
    mutationFn: sendRegisterAPI,
    onSuccess: () => {
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate({ companyName, cnpj, name, email, password });
  };

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-zinc-50 px-4 py-8">
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
            <FloatingInput
              id="companyName"
              label="Razão social"
              autoComplete="organization"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onBlur={() => setCompanyName(toTitleCasePtBr(companyName))}
              required
            />
            <FloatingInput
              id="cnpj"
              label="CNPJ"
              value={cnpj}
              maxLength={18}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setCnpj(formatCnpj(e.target.value))}
              required
            />
            <FloatingInput
              id="name"
              label="Seu nome completo"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setName(toTitleCasePtBr(name))}
              required
            />
            <FloatingInput
              id="email"
              label="E-mail corporativo"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              required
            />
            <FloatingInput
              id="password"
              label="Senha de acesso"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
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
                onClick={() => navigate('/login')}
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
