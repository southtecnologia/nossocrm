import { z } from 'zod';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';
import { runSchemaMigration } from '@/lib/installer/migrations';
import { bootstrapInstance } from '@/lib/installer/supabase';
import { triggerProjectRedeploy, upsertProjectEnvs } from '@/lib/installer/vercel';
import {
  deployAllSupabaseEdgeFunctions,
  extractProjectRefFromSupabaseUrl,
  listEdgeFunctionSlugs,
  resolveSupabaseApiKeys,
  resolveSupabaseDbUrlViaCliLoginRole,
  setSupabaseEdgeFunctionSecrets,
  waitForSupabaseProjectReady,
  type SupabaseFunctionDeployResult,
} from '@/lib/installer/edgeFunctions';

export const maxDuration = 300;
export const runtime = 'nodejs';

const RunSchema = z
  .object({
    installerToken: z.string().optional(),
    vercel: z.object({
      token: z.string().min(1),
      teamId: z.string().optional(),
      projectId: z.string().min(1),
      targets: z.array(z.enum(['production', 'preview'])).min(1),
    }),
    supabase: z.object({
      url: z.string().url(),
      anonKey: z.string().min(1).optional(),
      serviceRoleKey: z.string().min(1).optional(),
      dbUrl: z.string().min(1).optional(),
      accessToken: z.string().optional(),
      projectRef: z.string().optional(),
      deployEdgeFunctions: z.boolean().default(true),
    }),
    admin: z.object({
      companyName: z.string().min(1).max(200),
      email: z.string().email(),
      password: z.string().min(6),
    }),
    // Health check result to skip unnecessary steps
    healthCheck: z.object({
      skipWaitProject: z.boolean().default(false),
      skipWaitStorage: z.boolean().default(false),
      skipMigrations: z.boolean().default(false),
      skipBootstrap: z.boolean().default(false),
      estimatedSeconds: z.number().default(120),
    }).optional(),
  })
  .strict();

// Mapeamento cinematográfico Interstellar
// Função para criar fases com nome personalizado
function createCinemaPhases(firstName: string) {
  return {
    coordinates: {
      id: 'coordinates',
      title: 'Calibrando coordenadas',
      subtitle: 'Definindo rota para o destino...',
    },
    signal: {
      id: 'signal',
      title: 'Aguardando sinal',
      subtitle: 'Confirmando conexão com o destino...',
    },
    station: {
      id: 'station',
      title: 'Construindo a estação',
      subtitle: 'Preparando infraestrutura...',
    },
    comms: {
      id: 'comms',
      title: 'Ativando comunicadores',
      subtitle: 'Estabelecendo canais de comunicação...',
    },
    contact: {
      id: 'contact',
      title: 'Primeiro contato',
      subtitle: 'Criando sua identidade no novo mundo...',
    },
    landing: {
      id: 'landing',
      title: 'Preparando pouso',
      subtitle: 'Finalizando a jornada...',
    },
    complete: {
      id: 'complete',
      title: `Missão cumprida, ${firstName}!`,
      subtitle: 'Bem-vindo ao novo mundo.',
    },
  } as const;
}

type PhaseId = 'coordinates' | 'signal' | 'station' | 'comms' | 'contact' | 'landing' | 'complete';

interface StreamEvent {
  type: 'phase' | 'progress' | 'error' | 'complete';
  phase?: PhaseId;
  title?: string;
  subtitle?: string;
  progress?: number; // 0-100
  error?: string;
  ok?: boolean;
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  if (process.env.INSTALLER_ENABLED === 'false') {
    return new Response(JSON.stringify({ error: 'Installer disabled' }), { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = RunSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', details: parsed.error.flatten() }), { status: 400 });
  }

  const expectedToken = process.env.INSTALLER_TOKEN;
  if (expectedToken && parsed.data.installerToken !== expectedToken) {
    return new Response(JSON.stringify({ error: 'Invalid installer token' }), { status: 403 });
  }

  const { vercel, supabase, admin, healthCheck } = parsed.data;
  
  // Determine which steps to skip based on health check
  const skippedSteps: string[] = [];
  if (healthCheck?.skipWaitProject) skippedSteps.push('wait_project');
  if (healthCheck?.skipWaitStorage) skippedSteps.push('wait_storage');
  if (healthCheck?.skipMigrations) skippedSteps.push('migrations');
  if (healthCheck?.skipBootstrap) skippedSteps.push('bootstrap');
  
  if (skippedSteps.length > 0) {
    console.log('[run-stream] Skipping steps based on health check:', skippedSteps);
  }
  const envTargets = vercel.targets;
  
  // Extrai primeiro nome para personalização
  const firstName = admin.companyName.split(' ')[0] || 'você';
  const PHASES = createCinemaPhases(firstName);

  // Create SSE stream
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const sendEvent = async (event: StreamEvent) => {
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  };

  const sendPhase = async (phase: PhaseId, progress: number) => {
    const p = PHASES[phase];
    await sendEvent({ type: 'phase', phase, title: p.title, subtitle: p.subtitle, progress });
  };

  // Run installation in background
  (async () => {
    let functions: SupabaseFunctionDeployResult[] | undefined;
    const startTime = Date.now();
    const log = (step: string, detail?: string) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[run-stream] [${elapsed}s] ${step}${detail ? ': ' + detail : ''}`);
    };
    
    log('🚀 INÍCIO', `skippedSteps=${JSON.stringify(skippedSteps)}`);

    try {
      const resolvedProjectRef =
        supabase.projectRef?.trim() ||
        extractProjectRefFromSupabaseUrl(supabase.url) ||
        '';
      const resolvedAccessToken = supabase.accessToken?.trim() || '';

      let resolvedAnonKey = supabase.anonKey?.trim() || '';
      let resolvedServiceRoleKey = supabase.serviceRoleKey?.trim() || '';
      let resolvedDbUrl = supabase.dbUrl?.trim() || '';

      const needsKeys = !resolvedAnonKey || !resolvedServiceRoleKey;
      const needsDb = !resolvedDbUrl;

      const localEdgeFunctionSlugs = supabase.deployEdgeFunctions
        ? await listEdgeFunctionSlugs()
        : [];
      const hasLocalEdgeFunctions = localEdgeFunctionSlugs.length > 0;

      const needsManagementApi =
        needsKeys || needsDb || (supabase.deployEdgeFunctions && hasLocalEdgeFunctions);

      if (needsManagementApi && (!resolvedAccessToken || !resolvedProjectRef)) {
        const message = !resolvedAccessToken
          ? 'Token de acesso Supabase não fornecido.'
          : 'Referência do projeto Supabase não encontrada.';
        await sendEvent({ type: 'error', error: message });
        await writer.close();
        return;
      }

      // Phase 1: Coordinates (Vercel envs + resolve keys)
      log('📍 PHASE 1: Calibrando coordenadas');
      await sendPhase('coordinates', 5);

      log('🔑 Resolvendo chaves', `needsKeys=${needsKeys}`);
      if (needsKeys) {
        const keys = await resolveSupabaseApiKeys({
          projectRef: resolvedProjectRef,
          accessToken: resolvedAccessToken,
        });
        if (!keys.ok) {
          await sendEvent({ type: 'error', error: 'Falha ao obter chaves de acesso.' });
          await writer.close();
          return;
        }
        resolvedAnonKey = keys.publishableKey;
        log('✅ Chaves obtidas', `anonKey=${resolvedAnonKey.slice(0,20)}...`);
        resolvedServiceRoleKey = keys.secretKey;
      }

      await sendPhase('coordinates', 10);

      log('🗄️ Resolvendo DB URL', `needsDb=${needsDb}`);
      if (needsDb) {
        const db = await resolveSupabaseDbUrlViaCliLoginRole({
          projectRef: resolvedProjectRef,
          accessToken: resolvedAccessToken,
        });
        if (!db.ok) {
          await sendEvent({ type: 'error', error: 'Falha ao conectar com o banco de dados.' });
          await writer.close();
          return;
        }
        resolvedDbUrl = db.dbUrl;
        log('✅ DB URL obtida', `host=${new URL(resolvedDbUrl.replace('postgresql://', 'http://')).hostname}`);
      }

      await sendPhase('coordinates', 15);

      log('⚙️ Configurando variáveis de ambiente na Vercel');
      await upsertProjectEnvs(
        vercel.token,
        vercel.projectId,
        [
          { key: 'NEXT_PUBLIC_SUPABASE_URL', value: supabase.url, targets: envTargets },
          { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: resolvedAnonKey, targets: envTargets },
          { key: 'SUPABASE_SERVICE_ROLE_KEY', value: resolvedServiceRoleKey, targets: envTargets },
          { key: 'INSTALLER_ENABLED', value: 'false', targets: envTargets },
        ],
        vercel.teamId || undefined
      );

      await sendPhase('coordinates', 20);

      log('📡 PHASE 2: Aguardando sinal');
      // Phase 2: Signal (wait for project ready) - skippable
      if (!skippedSteps.includes('wait_project')) {
        await sendPhase('signal', 25);

        if (resolvedAccessToken && resolvedProjectRef) {
          const ready = await waitForSupabaseProjectReady({
            accessToken: resolvedAccessToken,
            projectRef: resolvedProjectRef,
            timeoutMs: 210_000,
            pollMs: 4_000,
          });
          if (!ready.ok) {
            await sendEvent({ type: 'error', error: 'Destino não respondeu a tempo.' });
            await writer.close();
            return;
          }
        }

        await sendPhase('signal', 35);
      } else {
        console.log('[run-stream] Skipping wait_project - project already ready');
      }

      log('🏗️ PHASE 3: Construindo estação');
      // Phase 3: Station (migrations) - skippable
      if (!skippedSteps.includes('migrations')) {
        await sendPhase('station', 40);

        log('📦 Executando migrations...');
        await runSchemaMigration(resolvedDbUrl);
        log('✅ Migrations concluídas');

        await sendPhase('station', 55);
      } else {
        console.log('[run-stream] Skipping migrations - schema already applied');
      }

      log('📻 PHASE 4: Ativando comunicadores');
      // Phase 4: Comms (edge functions)
      await sendPhase('comms', 60);

      if (supabase.deployEdgeFunctions && hasLocalEdgeFunctions) {
        log('🔐 Configurando secrets das Edge Functions');
        const secrets = await setSupabaseEdgeFunctionSecrets({
          projectRef: resolvedProjectRef,
          accessToken: resolvedAccessToken,
          supabaseUrl: supabase.url,
          anonKey: resolvedAnonKey,
          serviceRoleKey: resolvedServiceRoleKey,
        });

        if (!secrets.ok) {
          await sendEvent({ type: 'error', error: 'Falha ao configurar comunicadores.' });
          await writer.close();
          return;
        }

        await sendPhase('comms', 65);

        log('🚀 Deployando Edge Functions...');
        functions = await deployAllSupabaseEdgeFunctions({
          projectRef: resolvedProjectRef,
          accessToken: resolvedAccessToken,
        });
      }

      await sendPhase('comms', 75);

      log('👤 PHASE 5: Primeiro contato');
      // Phase 5: Contact (bootstrap) - skippable
      if (!skippedSteps.includes('bootstrap')) {
        await sendPhase('contact', 80);

        log('🏢 Criando organização e admin...');
        const bootstrap = await bootstrapInstance({
          supabaseUrl: supabase.url,
          serviceRoleKey: resolvedServiceRoleKey,
          companyName: admin.companyName,
          email: admin.email,
          password: admin.password,
        });

        if (!bootstrap.ok) {
          await sendEvent({ type: 'error', error: 'Falha ao estabelecer primeiro contato.' });
          await writer.close();
          return;
        }

        await sendPhase('contact', 90);
      } else {
        console.log('[run-stream] Skipping bootstrap - admin already exists');
      }

      log('🛬 PHASE 6: Preparando pouso');
      // Phase 6: Landing (redeploy)
      await sendPhase('landing', 92);

      try {
        log('🔄 Disparando redeploy na Vercel...');
        await triggerProjectRedeploy(
          vercel.token,
          vercel.projectId,
          vercel.teamId || undefined
        );
      } catch {
        // Non-fatal, continue
      }

      await sendPhase('landing', 98);

      log('🎉 COMPLETE!', `totalTime=${((Date.now() - startTime) / 1000).toFixed(1)}s`);
      // Complete!
      await sendPhase('complete', 100);
      await sendEvent({ type: 'complete', ok: true });

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro durante a missão.';
      await sendEvent({ type: 'error', error: message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
