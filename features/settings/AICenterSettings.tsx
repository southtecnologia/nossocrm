'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { AIConfigSection } from './components/AIConfigSection';
import { AIPromptsManager } from './components/AIPromptsManager';

export const AICenterSettings: React.FC = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <div className="pb-10">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
          Central de I.A
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
          Configure o provedor/modelo e gerencie os prompts usados no sistema.
        </p>
      </div>

      <AIConfigSection />

      <div className="mt-10">
        <AIPromptsManager isAdmin={isAdmin} />
      </div>
    </div>
  );
};

