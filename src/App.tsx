import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, Printer, LayoutList, Clapperboard, RefreshCw } from 'lucide-react';
import {
  PipelineProject,
  PipelineStepNumber,
  ProjectSummary,
} from './types/pipeline';
import { Step4ShotBoard } from './components/pipeline/Step4ShotBoard';
import { Step5StoryboardFrames } from './components/pipeline/Step5StoryboardFrames';
import { PrintableStoryboardView } from './components/pipeline/PrintableStoryboardView';
import {
  getLlmRoutingStatus,
  LlmRoutingMode,
  LlmRoutingStatus,
  setLlmRoutingMode,
} from './utils/googleDriveSync';
import { parseJsonResponse } from './utils/safeFetch';

export default function App() {
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>([]);
  const [activeProject, setActiveProject] = useState<PipelineProject | null>(null);
  const [activeTab, setActiveTab] = useState<'shot_board' | 'storyboard_studio'>('shot_board');
  const [showPrintableStoryboard, setShowPrintableStoryboard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [llmStatus, setLlmStatus] = useState<LlmRoutingStatus | null>(null);
  const [isCreatingDefault, setIsCreatingDefault] = useState(false);

  const showStudioNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => {
      setNotice((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const fetchProjectsAndLoad = async (selectId?: string) => {
    try {
      const resp = await fetch('/api/projects');
      const data = await parseJsonResponse<{ projects?: ProjectSummary[]; error?: string }>(
        resp,
        'Could not load projects.'
      );
      const list = data.projects || [];
      setProjectSummaries(list);

      const targetId = selectId || activeProject?.id || list[0]?.id;
      if (targetId) {
        await loadProject(targetId);
      } else {
        await createDefaultProject(true);
      }
    } catch (err) {
      showStudioNotice(err instanceof Error ? err.message : 'Could not load studio projects.');
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultProject = async (silent = false) => {
    setIsCreatingDefault(true);
    try {
      const resp = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client: 'New Production',
          product: {
            name: 'Untitled Storyboard',
            description: '',
            provableClaims: [],
          },
          intake: {
            audience: '',
            tone: '',
            clientMarketingIdeas: '',
            videosWanted: '',
            shootLocationDatesBudgetNotes: '',
          },
          initialPhotoDataUrls: [],
        }),
      });
      const data = await parseJsonResponse<{ project: PipelineProject; error?: string }>(
        resp,
        'Could not create project.'
      );
      if (!resp.ok) throw new Error(data.error || 'Could not create project.');
      setActiveProject(data.project);
      setActiveTab('shot_board');
      setShowPrintableStoryboard(false);
      await fetch('/api/projects')
        .then((r) => r.json())
        .then((d) => setProjectSummaries(d.projects || []))
        .catch(() => {});
      if (!silent) {
        showStudioNotice('Started a clean new project.');
      }
    } catch (err) {
      showStudioNotice(err instanceof Error ? err.message : 'Could not initialize project.');
    } finally {
      setIsCreatingDefault(false);
    }
  };

  const loadProject = async (id: string) => {
    try {
      const resp = await fetch(`/api/projects/${id}`);
      const data = await parseJsonResponse<{ project: PipelineProject; error?: string }>(
        resp,
        'Could not load project.'
      );
      if (!resp.ok) throw new Error(data.error || 'Could not load project.');
      setActiveProject(data.project);
    } catch (err) {
      showStudioNotice(err instanceof Error ? err.message : 'Could not load project.');
    }
  };

  useEffect(() => {
    void fetchProjectsAndLoad();
    void getLlmRoutingStatus()
      .then((status) => setLlmStatus(status))
      .catch(() => {});
  }, []);

  const handleUpdateProject = async (updated: PipelineProject) => {
    setActiveProject(updated);
    try {
      const resp = await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: updated }),
      });
      const data = await parseJsonResponse<{ project?: PipelineProject; error?: string }>(
        resp,
        'Could not save project.'
      );
      if (resp.ok && data.project) {
        setActiveProject(data.project);
        setProjectSummaries((prev) =>
          prev.map((s) =>
            s.id === data.project!.id
              ? {
                  ...s,
                  client: data.project!.client,
                  productName: data.project!.product.name,
                  updatedAt: data.project!.updatedAt,
                  shotCount: data.project!.shots.length,
                }
              : s
          )
        );
      }
    } catch {
      // Background save error ignored for smooth typing
    }
  };

  const handleGenerateShotList = async (sourceNotesOverride?: string) => {
    if (!activeProject) return;
    const resp = await fetch('/api/pipeline/shot-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: activeProject.id,
        sourceNotesOverride,
      }),
    });
    const data = await parseJsonResponse<{ project: PipelineProject; error?: string }>(
      resp,
      'Could not generate Shot List.'
    );
    if (!resp.ok) throw new Error(data.error || 'Could not generate Shot List.');
    setActiveProject(data.project);
    setProjectSummaries((prev) =>
      prev.map((s) =>
        s.id === data.project.id
          ? {
              ...s,
              client: data.project.client,
              productName: data.project.product.name,
              updatedAt: data.project.updatedAt,
              shotCount: data.project.shots.length,
            }
          : s
      )
    );
    showStudioNotice(`Generated ${data.project.shots.length} shots from source material.`);
  };

  const handleChangeLlmMode = async (mode: LlmRoutingMode) => {
    try {
      const updated = await setLlmRoutingMode(mode);
      setLlmStatus(updated);
      showStudioNotice(`AI Engine mode updated to ${mode}.`);
    } catch (err) {
      showStudioNotice(err instanceof Error ? err.message : 'Could not update AI mode.');
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F6F7] text-[#111114] flex flex-col">
      {/* Top 52Launch Brand Header */}
      <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E2E2E6]">
        <div className="h-[3px] w-full bg-gradient-to-r from-[#C6202F] via-[#891A23] to-[#C6202F]" />
        
        <div className="max-w-[1360px] mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src="/brand/wordmark-color.png"
              alt="52Launch"
              className="h-6 w-auto object-contain"
            />
            <span className="h-4 w-[1.5px] bg-[#891A23]/30" aria-hidden="true" />
            <div>
              <h1 className="text-sm font-bold text-[#111114] font-display">
                Standalone Shot List & Storyboard Generator
              </h1>
              <p className="text-[11px] text-[#5A5A66]">
                Nano Banana · Flux · ChatGPT &amp; Gemini AI Production Studio
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {llmStatus && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg text-xs">
                <span className="text-[#5A5A66]">AI Model:</span>
                <select
                  value={llmStatus.mode}
                  onChange={(e) => void handleChangeLlmMode(e.target.value as LlmRoutingMode)}
                  className="bg-transparent font-semibold text-[#111114] focus:outline-none cursor-pointer"
                >
                  <option value="auto">Auto (Gemini + Fal)</option>
                  <option value="fal_gemini">Gemini via Fal</option>
                  <option value="google_direct">Gemini Direct</option>
                </select>
              </div>
            )}

            {projectSummaries.length > 1 && (
              <select
                aria-label="Select active project"
                value={activeProject?.id || ''}
                onChange={(e) => void loadProject(e.target.value)}
                className="bg-[#F6F6F7] border border-[#E2E2E6] text-xs font-medium rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C6202F] cursor-pointer"
              >
                {projectSummaries.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.client} — {p.productName}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              disabled={isCreatingDefault}
              onClick={() => void createDefaultProject()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#111114] bg-white border border-[#E2E2E6] hover:border-[#C6202F] rounded-lg cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#C6202F] ${isCreatingDefault ? 'animate-spin' : ''}`} />
              New Project
            </button>

            {activeProject && activeProject.shots.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPrintableStoryboard((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  showPrintableStoryboard
                    ? 'bg-[#C6202F] text-white border-[#C6202F]'
                    : 'bg-white text-[#111114] border-[#E2E2E6] hover:border-[#891A23]'
                }`}
              >
                <Printer className="w-3.5 h-3.5" />
                {showPrintableStoryboard ? 'Back to Editor' : 'Printable Storyboard PDF'}
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        {!showPrintableStoryboard && (
          <div className="max-w-[1360px] mx-auto px-6 pb-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('shot_board')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'shot_board'
                  ? 'bg-[#C6202F] text-white shadow-xs'
                  : 'bg-[#F6F6F7] text-[#3A3A44] hover:bg-[#EAEAEF]'
              }`}
            >
              <LayoutList className="w-4 h-4" />
              Shot List &amp; Shot Board
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('storyboard_studio')}
              className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                activeTab === 'storyboard_studio'
                  ? 'bg-[#C6202F] text-white shadow-xs'
                  : 'bg-[#F6F6F7] text-[#3A3A44] hover:bg-[#EAEAEF]'
              }`}
            >
              <Clapperboard className="w-4 h-4" />
              Storyboard Studio (NanoBanana, Flux &amp; ChatGPT)
            </button>
          </div>
        )}
      </header>

      {notice && (
        <div className="no-print fixed bottom-5 right-5 z-50 bg-[#111114] border border-[#C6202F] text-xs text-white px-4 py-2.5 brand-corner-sm shadow-xl">
          {notice}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {isLoading || isCreatingDefault || !activeProject ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3 text-sm text-[#5A5A66]">
            <Loader2 className="w-6 h-6 animate-spin text-[#C6202F]" />
            Initializing 52Launch Standalone Storyboard Studio...
          </div>
        ) : showPrintableStoryboard ? (
          <PrintableStoryboardView
            project={activeProject}
            onBack={() => setShowPrintableStoryboard(false)}
          />
        ) : activeTab === 'shot_board' ? (
          <Step4ShotBoard
            key={activeProject.id}
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            onGenerateShotList={handleGenerateShotList}
            onApproveShotList={async () => {
              setActiveTab('storyboard_studio');
              showStudioNotice('Shot list approved! Switched to Storyboard Studio (NanoBanana, Flux & ChatGPT).');
            }}
            onOpenPrintable={() => setShowPrintableStoryboard(true)}
          />
        ) : (
          <Step5StoryboardFrames
            key={activeProject.id}
            project={activeProject}
            onUpdateProject={handleUpdateProject}
            onGoToFrameSuggestions={() => {
              showStudioNotice('Storyboard frames ready for production review.');
            }}
            onPreviewPdf={() => setShowPrintableStoryboard(true)}
            onApproveAndGoToVideo={async () => {
              showStudioNotice('All storyboard frames approved!');
            }}
          />
        )}
      </main>
    </div>
  );
}
