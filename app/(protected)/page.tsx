import { redirect } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'

/**
 * Componente React `Home`.
 * @returns {Promise<void>} Retorna uma Promise resolvida sem valor.
 */
export default async function Home() {
    // “Padrão ouro” pós-deploy: se o instalador estiver habilitado,
    // a página raiz deve levar o usuário diretamente para o fluxo de instalação.
    // Isso elimina erro humano (não depender de acessar /install manualmente).
    if (process.env.INSTALLER_ENABLED !== 'false') {
        redirect('/install')
    }

    // Após um reset do banco, a instância ainda não está inicializada.
    // Nessa fase, a página inicial deve levar o usuário para o setup.
    try {
        const supabase = await createClient()
        const { data, error } = await supabase.rpc('is_instance_initialized')
        if (!error && data === false) {
            redirect('/setup')
        }
    } catch {
        // Se houver qualquer problema ao checar init, não bloqueia.
    }

    redirect('/dashboard')
}
