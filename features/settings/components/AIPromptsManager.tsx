'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PROMPT_CATALOG, type PromptCatalogItem } from '@/lib/ai/prompts/catalog';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { ChevronDown, ChevronUp, Copy, Loader2, Pencil, RotateCcw, Search, ShieldAlert, SlidersHorizontal, Sparkles } from 'lucide-react';

type ActiveByKey = Record<string, { version: number; updatedAt: string }>;

type Props = {
  isAdmin: boolean;
};

type PromptGroup = 'Inbox' | 'Deals' | 'Boards' | 'Agente' | 'Outros';

function getGroupFromTitle(title: string): PromptGroup {
  const t = (title || '').toLowerCase();
  if (t.startsWith('inbox')) return 'Inbox';
  if (t.startsWith('deals')) return 'Deals';
  if (t.startsWith('boards')) return 'Boards';
  if (t.startsWith('agente')) return 'Agente';
  return 'Outros';
}

function extractVariablesFromNotes(notes?: string): string[] {
  if (!notes) return [];
  const idx = notes.toLowerCase().indexOf('variáveis:');
  if (idx === -1) return [];
  const after = notes.slice(idx + 'variáveis:'.length).trim();
  const end = after.indexOf('.');
  const segment = (end === -1 ? after : after.slice(0, end)).trim();
  if (!segment) return [];
  return segment
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Componente React `AIPromptsManager`.
 *
 * @param {Props} { isAdmin } - Parâmetro `{ isAdmin }`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export const AIPromptsManager: React.FC<Props> = ({ isAdmin }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeByKey, setActiveByKey] = useState<ActiveByKey>({});

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PromptCatalogItem | null>(null);
  const [contentDraft, setContentDraft] = useState('');
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<PromptGroup | 'Todos'>('Todos');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const catalog = useMemo(() => PROMPT_CATALOG, []);

  const fetchActive = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/ai-prompts', {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao carregar prompts (HTTP ${res.status})`);
      setActiveByKey((data?.activeByKey as ActiveByKey) || {});
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Falha ao carregar prompts', 'error');
      setActiveByKey({});
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetchActive();
  }, [fetchActive, isAdmin]);

  const openEditor = async (item: PromptCatalogItem) => {
    setEditing(item);
    setEditorOpen(true);
    setEditorLoading(true);
    try {
      const res = await fetch(`/api/settings/ai-prompts/${encodeURIComponent(item.key)}`, {
        method: 'GET',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao carregar prompt (HTTP ${res.status})`);

      const activeContent = data?.active?.content as string | undefined;
      setContentDraft(activeContent && activeContent.trim().length > 0 ? activeContent : item.defaultTemplate);
    } catch (err: any) {
      console.error(err);
      setContentDraft(item.defaultTemplate);
      showToast(err?.message || 'Falha ao carregar prompt; usando o padrão', 'error');
    } finally {
      setEditorLoading(false);
    }
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditing(null);
    setContentDraft('');
  };

  const save = async () => {
    if (!editing) return;
    const key = editing.key;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/ai-prompts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key, content: contentDraft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao salvar prompt (HTTP ${res.status})`);
      showToast('Prompt salvo! (override ativo)', 'success');
      await fetchActive();
      closeEditor();
    } catch (err: any) {
      showToast(err?.message || 'Falha ao salvar prompt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = async (item: PromptCatalogItem) => {
    setResetting(true);
    try {
      const res = await fetch(`/api/settings/ai-prompts/${encodeURIComponent(item.key)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
        credentials: 'include',
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `Falha ao resetar prompt (HTTP ${res.status})`);
      showToast('Prompt resetado para o padrão', 'success');
      await fetchActive();
    } catch (err: any) {
      showToast(err?.message || 'Falha ao resetar prompt', 'error');
    } finally {
      setResetting(false);
    }
  };

  const groups: Array<PromptGroup | 'Todos'> = useMemo(
    () => ['Todos', 'Inbox', 'Deals', 'Boards', 'Agente', 'Outros'],
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .map((p) => ({ ...p, group: getGroupFromTitle(p.title) as PromptGroup }))
      .filter((p) => (activeGroup === 'Todos' ? true : p.group === activeGroup))
      .filter((p) => {
        if (!q) return true;
        const hay = [
          p.title,
          p.key,
          p.usedBy.join(' '),
          p.notes || '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
  }, [catalog, query, activeGroup]);

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-lg text-amber-700 dark:text-amber-300">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Prompts do sistema</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Apenas administradores podem editar prompts (impacta toda a organização).
            </p>
          </div>
        </div>
      </div>
    );
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copiado!', 'success');
    } catch {
      showToast('Falha ao copiar', 'error');
    }
  };

  const goToFeatures = () => {
    if (typeof window === 'undefined') return;
    const el = document.getElementById('ai-features');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="ai-prompts" className="scroll-mt-8">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white font-display">Prompts do sistema</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Edite prompts por organização. Mudanças impactam toda a empresa — menos é mais.
          </p>
        </div>
        <button
          type="button"
          onClick={goToFeatures}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/70 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50/70 dark:hover:bg-white/[0.06] transition-colors"
          title="Ir para Funções de IA"
        >
          <SlidersHorizontal size={16} />
          Funções de IA
        </button>
      </div>

      {/* Controls (Jobs-style: simples e direto) */}
      <div className="bg-white/70 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 rounded-2xl shadow-sm p-4 mb-3 backdrop-blur">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, key ou uso…"
                className="w-full bg-slate-100/80 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-colors"
              />
            </div>
          </div>

          {/* Segmented control (iOS-like) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goToFeatures}
              className="h-9 w-9 rounded-xl bg-slate-100/80 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.10] transition-colors inline-flex items-center justify-center"
              title="Ir para Funções de IA"
              aria-label="Ir para Funções de IA"
            >
              <SlidersHorizontal size={18} />
            </button>

            <div className="inline-flex items-center rounded-xl p-1 bg-slate-100/80 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10">
            {groups.map((g) => {
              const isActive = activeGroup === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setActiveGroup(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
          </div>
        </div>
      </div>

      {/* List (iOS Settings-like grouped list) */}
      <div className="bg-white/70 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden backdrop-blur">
        {loading ? (
          <div className="p-6 flex items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando prompts...
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-white/10">
            {filtered.length === 0 ? (
              <div className="p-10 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-100 dark:bg-white/5 mb-3">
                  <Sparkles className="h-5 w-5 text-slate-500 dark:text-slate-300" />
                </div>
                <div className="text-slate-900 dark:text-white font-semibold">Nada encontrado</div>
                <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Tente outra busca ou volte para “Todos”.
                </div>
              </div>
            ) : filtered.map((p) => {
              const active = activeByKey[p.key];
              const isExpanded = expandedKey === p.key;
              const variables = extractVariablesFromNotes(p.notes);
              return (
                <div key={p.key} className="px-4 py-3 group hover:bg-slate-50/70 dark:hover:bg-white/[0.04] transition-colors">
                  {/* Table-like row (Jobs): colunas alinhadas e ações em uma “rail” fixa */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">{p.title}</div>
                        {active ? (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            override v{active.version}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-white/5 dark:text-slate-300">
                            padrão
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {getGroupFromTitle(p.title)} · {p.usedBy.length} usos
                      </div>
                    </div>

                    {/* Actions: icons only */}
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => openEditor(p)}
                        className="h-9 w-9 rounded-full text-primary-600 dark:text-primary-400 hover:bg-slate-100/80 dark:hover:bg-white/[0.08] transition-colors inline-flex items-center justify-center"
                        title="Editar"
                        aria-label="Editar"
                      >
                        <Pencil size={18} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setExpandedKey(isExpanded ? null : p.key)}
                        className="h-9 w-9 rounded-full text-slate-500 dark:text-slate-300 hover:bg-slate-100/80 dark:hover:bg-white/[0.08] transition-colors inline-flex items-center justify-center"
                        title={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                        aria-label={isExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>

                      {active ? (
                        <button
                          type="button"
                          onClick={() => resetToDefault(p)}
                          disabled={resetting}
                          className={`h-9 w-9 rounded-full transition-all inline-flex items-center justify-center ${
                            resetting
                              ? 'text-slate-400 cursor-not-allowed opacity-100'
                              : 'text-red-500 hover:bg-red-50/70 dark:hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100'
                          }`}
                          title="Resetar para o padrão"
                          aria-label="Resetar para o padrão"
                        >
                          {resetting ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 bg-slate-100/60 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/10 rounded-2xl p-3 text-xs text-slate-600 dark:text-slate-300 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {p.key}
                          {active?.updatedAt ? ` · atualizado ${new Date(active.updatedAt).toLocaleDateString('pt-BR')}` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(p.key)}
                          className="h-9 w-9 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.08] inline-flex items-center justify-center transition-colors"
                          title="Copiar key"
                        >
                          <Copy size={16} />
                        </button>
                      </div>

                      {variables.length > 0 ? (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100">Variáveis</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {variables.map((v) => (
                              <span
                                key={v}
                                className="px-2 py-1 rounded-full bg-white/70 dark:bg-slate-950/60 border border-slate-200/70 dark:border-white/10 text-[11px] font-mono text-slate-700 dark:text-slate-200"
                              >
                                {v}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <div className="font-semibold text-slate-800 dark:text-slate-100">Onde é usado</div>
                        <div className="mt-1 space-y-1">
                          {p.usedBy.map((u) => (
                            <div key={u} className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                              {u}
                            </div>
                          ))}
                        </div>
                      </div>
                      {p.notes ? (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100">Observações</div>
                          <div className="mt-1 text-slate-600 dark:text-slate-300">{p.notes}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={editorOpen}
        onClose={() => (saving ? null : closeEditor())}
        title={editing ? `Editar prompt: ${editing.title}` : 'Editar prompt'}
        size="xl"
        bodyClassName="space-y-4"
      >
        {editing ? (
          <>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center justify-between gap-2">
                <div className="font-mono">key: {editing.key}</div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(editing.key)}
                  className="h-8 w-8 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 inline-flex items-center justify-center"
                  title="Copiar key"
                >
                  <Copy size={16} />
                </button>
              </div>
              <div className="mt-1">
                Variáveis no formato: <span className="font-mono">{'{{var}}'}</span>
              </div>
            </div>

            {editorLoading ? (
              <div className="min-h-[320px] flex items-center justify-center text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando prompt...
                </div>
              </div>
            ) : (
              <textarea
                value={contentDraft}
                onChange={(e) => setContentDraft(e.target.value)}
                className="w-full min-h-[320px] resize-y bg-white dark:bg-slate-950 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
              />
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={closeEditor}
                disabled={saving || editorLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || editorLoading || !contentDraft.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 ${
                  saving || editorLoading || !contentDraft.trim()
                    ? 'bg-slate-300 dark:bg-white/10 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700'
                }`}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : null}
                Salvar override
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
};

