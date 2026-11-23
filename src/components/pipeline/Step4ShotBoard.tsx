import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Check,
  Upload,
  Printer,
  Package,
  ClipboardPaste,
  Wand2,
  RefreshCw,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  PipelineProject,
  PipelineShot,
  ShotRoute,
  StoryboardImageModel,
  StoryboardStudioState,
  StoryboardStylePreset,
  VideoModelOption,
} from '../../types/pipeline';
import { readAndOptimizeLocalImage } from '../../utils/imageUtils';
import { parseJsonResponse } from '../../utils/safeFetch';
import {
  getStoryboardImageModelSpec,
  STORYBOARD_IMAGE_MODELS,
} from '../../utils/storyboardModels';

const NANOBANANA_MODELS = STORYBOARD_IMAGE_MODELS.filter((m) => m.family === 'nanobanana');
const FLUX_MODELS = STORYBOARD_IMAGE_MODELS.filter((m) => m.family === 'flux');
const CHATGPT_MODELS = STORYBOARD_IMAGE_MODELS.filter((m) => m.family === 'chatgpt');

const SHOT_BOARD_STYLES: Array<{ id: StoryboardStylePreset; label: string }> = [
  { id: 'sketch', label: 'Sketch' },
  { id: '3d_animation', label: '3D Animation' },
  { id: 'charcoal', label: 'Charcoal' },
  { id: 'claymation', label: 'Claymation' },
  { id: 'concept_sketch', label: 'Concept Sketch' },
  { id: 'realistic', label: 'Realistic' },
];

interface Step4ShotBoardProps {
  project: PipelineProject;
  onUpdateProject: (updated: PipelineProject) => Promise<void>;
  onGenerateShotList: (sourceNotesOverride?: string) => Promise<void>;
  onApproveShotList: () => Promise<void>;
  onOpenPrintable: () => void;
}

export const Step4ShotBoard: React.FC<Step4ShotBoardProps> = ({
  project,
  onUpdateProject,
  onGenerateShotList,
  onApproveShotList,
  onOpenPrintable,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [isDraggingPdf, setIsDraggingPdf] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(() => project.shots.length === 0);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadingShotId, setUploadingShotId] = useState<string | null>(null);
  const [generatingShotIds, setGeneratingShotIds] = useState<Record<string, boolean>>({});
  const [isBatchGeneratingFrames, setIsBatchGeneratingFrames] = useState(false);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);
  const [pasteNoticeShotId, setPasteNoticeShotId] = useState<string | null>(null);
  const frameInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const frameBoxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const pdfInputRef = useRef<HTMLInputElement | null>(null);

  const attachedPdfs = project.brandGuideDocuments || [];
  const sourceNotes = project.intake?.clientMarketingIdeas || '';
  const hasAnySource =
    attachedPdfs.length > 0 ||
    Boolean(sourceNotes.trim()) ||
    Boolean((project.product?.description || '').trim()) ||
    Boolean((project.creativeBrief?.objective || '').trim());

  const activeImageModel: StoryboardImageModel =
    project.storyboardStudio?.model || 'nano-banana-2';
  const activeStyle: StoryboardStylePreset =
    project.storyboardStudio?.style || 'sketch';
  const activeAspectRatio: StoryboardStudioState['aspectRatio'] =
    project.storyboardStudio?.aspectRatio || '16:9';
  const activeModelMeta = getStoryboardImageModelSpec(activeImageModel);

  const totalDuration = project.shots.reduce(
    (sum, s) => sum + (Number(s.durationSec) || 0),
    0
  );
  const missingFrameCount = project.shots.filter((s) => !s.frameImageUrl).length;

  const updateStudioPrefs = (patch: Partial<StoryboardStudioState>) => {
    const baseStudio: StoryboardStudioState = project.storyboardStudio || {
      style: 'sketch',
      customStyleNote: '',
      model: 'nano-banana-2',
      aspectRatio: '16:9',
      resolution: '1K',
      assets: [],
      hasSeededAssets: false,
    };
    void onUpdateProject({
      ...project,
      storyboardStudio: {
        ...baseStudio,
        ...patch,
      },
    });
  };

  const commitShots = (nextShots: PipelineShot[]) => {
    const nextProject: PipelineProject = {
      ...project,
      shots: nextShots,
      shotListManuallyEdited: true,
      approvals: {
        ...project.approvals,
        shotListApproved: false,
        storyboardApproved: false,
        videoPromptsApproved: false,
        voApproved: false,
        shootPlanApproved: false,
      },
    };
    void onUpdateProject(nextProject);
  };

  const updateShot = (shotId: string, patch: Partial<PipelineShot>) => {
    const nextShots = project.shots.map((s) =>
      s.id === shotId ? { ...s, ...patch } : s
    );
    commitShots(nextShots);
  };

  const handleRouteChange = (shot: PipelineShot, nextRoute: ShotRoute) => {
    const nextModel: VideoModelOption =
      nextRoute === 'live'
        ? 'none'
        : shot.model === 'none'
          ? 'seedance'
          : shot.model;
    updateShot(shot.id, {
      route: nextRoute,
      model: nextModel,
      shootDirection:
        nextRoute === 'ai_video'
          ? ''
          : shot.shootDirection ||
            'Camera position, lens focal length, lighting setup, talent and product handling notes...',
    });
  };

  const addShot = () => {
    const nextNum = project.shots.length + 1;
    const newId = `S${String(nextNum).padStart(2, '0')}`;
    const newShot: PipelineShot = {
      id: newId,
      deliverable: project.creativeBrief?.deliverables?.[0] || 'Hero Spot',
      durationSec: 4,
      scene: '',
      route: 'live',
      model: 'none',
      productInFrame: true,
      framePrompt: '',
      shootDirection: '',
      voLine: '',
      continuityNotes: '',
      chainFrom: 'none',
      frameImageUrl: null,
      frameCheck: null,
      productFrameApproved: false,
      videoPrompt: '',
      negativePrompt: '',
      videoUrl: null,
      videoSeed: null,
      status: 'Draft',
    };
    commitShots([...project.shots, newShot]);
  };

  const moveShot = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= project.shots.length) return;
    const copy = [...project.shots];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    commitShots(copy);
  };

  const deleteShot = (shotId: string) => {
    commitShots(project.shots.filter((s) => s.id !== shotId));
  };

  const handleUploadFrame = async (shotId: string, file: File) => {
    setErrorMsg(null);
    setUploadingShotId(shotId);
    try {
      const dataUrl = await readAndOptimizeLocalImage(file, 1400);
      const resp = await fetch(`/api/projects/${project.id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, prefix: 'frame' }),
      });
      const data = await parseJsonResponse<{ url: string }>(
        resp,
        'Could not upload frame.'
      );

      updateShot(shotId, {
        frameImageUrl: data.url,
        status: 'Frame Uploaded',
        frameCheck: null,
        productFrameApproved: false,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Frame upload failed.');
    } finally {
      setUploadingShotId(null);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const extractClipboardImageFile = (clipboardData: DataTransfer | null): File | null => {
    if (!clipboardData) return null;
    const items = Array.from(clipboardData.items || []);
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) return file;
      }
    }
    const files = Array.from(clipboardData.files || []);
    return files.find((f) => f.type.startsWith('image/')) || null;
  };

  const handlePasteFromClipboardButton = async (shotId: string) => {
    setErrorMsg(null);
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const ext = imgType.includes('jpeg') ? 'jpg' : imgType.includes('webp') ? 'webp' : 'png';
            const file = new File([blob], `pasted-${shotId}.${ext}`, { type: imgType });
            await handleUploadFrame(shotId, file);
            return;
          }
        }
        setPasteNoticeShotId(shotId);
        frameBoxRefs.current[shotId]?.focus();
        setErrorMsg('No image found on clipboard. Copy an image first, or press Ctrl+V / Cmd+V in the box.');
        return;
      }
    } catch {
      // Clipboard.read fallback
    }
    setPasteNoticeShotId(shotId);
    frameBoxRefs.current[shotId]?.focus();
  };

  const readFileAsDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
      reader.readAsDataURL(file);
    });

  const handleUploadSourcePdfs = async (fileList: FileList | File[]) => {
    const pdfs = Array.from(fileList || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (pdfs.length === 0) {
      setErrorMsg('Please select a PDF file (.pdf).');
      return;
    }

    setErrorMsg(null);
    setStatusNote(null);
    setIsParsingPdf(true);
    try {
      const payloadFiles = await Promise.all(
        pdfs.slice(0, 4).map(async (f) => ({
          name: f.name,
          dataUrl: await readFileAsDataUrl(f),
        }))
      );

      const resp = await fetch('/api/pipeline/shot-list/parse-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          files: payloadFiles,
        }),
      });
      const data = await parseJsonResponse<{
        project: PipelineProject;
        warnings?: string[];
      }>(resp, 'Could not parse uploaded PDF.');
      await onUpdateProject(data.project);

      if (data.warnings?.length) {
        setErrorMsg(data.warnings.join(' '));
      }

      if (data.project.shots.length === 0) {
        setStatusNote('PDF parsed! Determining shots needed from your document...');
        setIsGenerating(true);
        try {
          await onGenerateShotList(data.project.intake?.clientMarketingIdeas || '');
          setStatusNote(
            `Parsed ${pdfs.map((p) => p.name).join(', ')} and generated your shot list.`
          );
        } finally {
          setIsGenerating(false);
        }
      } else {
        setStatusNote(
          `Parsed and attached ${pdfs.map((p) => p.name).join(', ')}. Click "Re-run shot list with AI" to regenerate shots from all attached sources.`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF upload and parsing failed.');
    } finally {
      setIsParsingPdf(false);
    }
  };

  const handleRemovePdf = async (docId: string) => {
    const nextDocs = attachedPdfs.filter((d) => d.id !== docId);
    await onUpdateProject({
      ...project,
      brandGuideDocuments: nextDocs,
    });
  };

  const triggerGenerate = async (force = false) => {
    if (!hasAnySource) {
      setShowSourcePanel(true);
      setErrorMsg(
        'Upload a source PDF (brief, script, or deck) or enter production notes below so AI has source material to generate shots from.'
      );
      return;
    }
    if (project.shotListHasGenerated && project.shotListManuallyEdited && !force) {
      setConfirmOverwrite(true);
      return;
    }
    setConfirmOverwrite(false);
    setErrorMsg(null);
    setStatusNote(null);
    setIsGenerating(true);
    try {
      await onGenerateShotList(sourceNotes);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not generate Shot List.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateShotFrame = async (
    shot: PipelineShot,
    latestProject?: PipelineProject
  ): Promise<PipelineProject | null> => {
    const targetProject = latestProject || project;
    const modelToUse = targetProject.storyboardStudio?.model || activeImageModel;
    const styleToUse = targetProject.storyboardStudio?.style || activeStyle;
    const aspectToUse = targetProject.storyboardStudio?.aspectRatio || activeAspectRatio;
    const resolutionToUse = targetProject.storyboardStudio?.resolution || '1K';
    const modelMeta = getStoryboardImageModelSpec(modelToUse);

    setErrorMsg(null);
    setStatusNote(null);
    setGeneratingShotIds((prev) => ({ ...prev, [shot.id]: true }));
    try {
      const resp = await fetch('/api/pipeline/storyboard-studio/generate-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: targetProject.id,
          shotId: shot.id,
          framePromptOverride: shot.framePrompt,
          includeRealProductPhotos: shot.productInFrame,
          modelOverride: modelToUse,
          styleOverride: styleToUse,
          aspectRatioOverride: aspectToUse,
          resolutionOverride: resolutionToUse,
        }),
      });
      const data = await parseJsonResponse<{
        project: PipelineProject;
        endpointUsed?: string;
      }>(resp, `Could not generate frame for ${shot.id}.`);
      await onUpdateProject(data.project);
      setStatusNote(
        `Generated ${shot.id} frame in-app using ${modelMeta.shortLabel}.`
      );
      return data.project;
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : `Failed to generate frame for ${shot.id}.`
      );
      return null;
    } finally {
      setGeneratingShotIds((prev) => ({ ...prev, [shot.id]: false }));
    }
  };

  const handleGenerateMissingFrames = async () => {
    const targets = project.shots.filter((s) => !s.frameImageUrl);
    if (targets.length === 0) return;

    setErrorMsg(null);
    setStatusNote(null);
    setIsBatchGeneratingFrames(true);

    let currentProj = project;
    let completed = 0;
    for (let i = 0; i < targets.length; i++) {
      const shot = currentProj.shots.find((s) => s.id === targets[i].id) || targets[i];
      setBatchProgress(`Generating ${shot.id} (${i + 1}/${targets.length})...`);
      const updated = await handleGenerateShotFrame(shot, currentProj);
      if (updated) {
        currentProj = updated;
        completed++;
      } else {
        break;
      }
    }

    setBatchProgress(null);
    setIsBatchGeneratingFrames(false);
    if (completed > 0) {
      setStatusNote(
        `Generated ${completed} storyboard frame(s) in-app via ${activeModelMeta.shortLabel}.`
      );
    }
  };

  return (
    <div className="max-w-[1360px] mx-auto px-6 py-7 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-5 border-b border-[#E2E2E6]">
        <div>
          <div className="text-xs font-medium text-[#C6202F]">
            Shot List &amp; Shot Board (NanoBanana, Flux &amp; ChatGPT)
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#111114] mt-1">
            Master Shot Board — Live Shoot, Hybrid &amp; AI Together
          </h1>
          <p className="text-sm text-[#5A5A66] mt-1">
            Every shot in sequence. Generate storyboard frames directly in-app with NanoBanana,
            Flux, or ChatGPT, or upload/paste reference frames onto any card.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={isParsingPdf || isGenerating}
            onClick={() => pdfInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111114] bg-white border border-[#E2E2E6] hover:border-[#C6202F] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isParsingPdf ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#C6202F]" />
            ) : (
              <FileText className="w-4 h-4 text-[#C6202F]" />
            )}
            {isParsingPdf ? 'Parsing PDF...' : 'Upload Source PDF'}
          </button>

          <button
            type="button"
            disabled={isGenerating || isParsingPdf}
            onClick={() => void triggerGenerate(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111114] bg-white border border-[#E2E2E6] hover:border-[#C6202F] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#C6202F]" />
            ) : (
              <Sparkles className="w-4 h-4 text-[#C6202F]" />
            )}
            {isGenerating
              ? 'Building Shot List...'
              : project.shotListHasGenerated || project.shots.length > 0
                ? 'Re-run shot list with AI'
                : 'Generate shot list with AI'}
          </button>

          <button
            type="button"
            onClick={addShot}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111114] bg-white border border-[#E2E2E6] hover:border-[#891A23] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add shot
          </button>

          {project.shots.length > 0 && (
            <button
              type="button"
              onClick={onOpenPrintable}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#111114] bg-white border border-[#E2E2E6] hover:border-[#891A23] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Printable storyboard
            </button>
          )}

          {project.approvals.shotListApproved ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#15803D] rounded-lg whitespace-nowrap shrink-0">
              <CheckCircle2 className="w-4 h-4" />
              Shot list approved
            </span>
          ) : (
            <button
              type="button"
              disabled={project.shots.length === 0}
              onClick={() => void onApproveShotList()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Approve shot list &amp; go to Storyboard Studio
            </button>
          )}
        </div>
      </div>

      {/* Hidden PDF File Input */}
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleUploadSourcePdfs(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Source PDF & Brief Panel */}
      <div className="bg-white border border-[#E2E2E6] rounded-xl overflow-hidden">
        <div className="px-4 py-3 bg-[#FBFBFC] border-b border-[#E2E2E6] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <FileText className="w-4 h-4 text-[#C6202F]" />
            <span className="font-bold text-[#111114]">
              Source PDF &amp; Production Brief
            </span>
            <span className="text-[#8A8A96]">·</span>
            <span className="text-[#5A5A66]">
              {attachedPdfs.length > 0
                ? `${attachedPdfs.length} PDF${attachedPdfs.length === 1 ? '' : 's'} attached`
                : 'No PDF uploaded yet'}
            </span>
            {attachedPdfs.map((doc) => (
              <span
                key={doc.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-[#FDF4F5] border border-[#EABAC0] text-[11px] font-medium text-[#891A23]"
              >
                <FileText className="w-3 h-3" />
                <span className="max-w-[180px] truncate">{doc.name}</span>
                <button
                  type="button"
                  onClick={() => void handleRemovePdf(doc.id)}
                  title="Remove PDF source"
                  className="hover:text-[#111114] cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowSourcePanel((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#5A5A66] hover:text-[#111114] cursor-pointer"
          >
            {showSourcePanel ? (
              <>
                Hide source details
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Edit source / upload PDF
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {showSourcePanel && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#5A5A66] mb-1">
                  Project / Spot Name
                </label>
                <input
                  type="text"
                  value={project.product?.name || ''}
                  onChange={(e) =>
                    void onUpdateProject({
                      ...project,
                      product: { ...project.product, name: e.target.value },
                    })
                  }
                  placeholder="Untitled Storyboard"
                  className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#5A5A66] mb-1">
                  Client / Brand
                </label>
                <input
                  type="text"
                  value={project.client || ''}
                  onChange={(e) =>
                    void onUpdateProject({
                      ...project,
                      client: e.target.value,
                    })
                  }
                  placeholder="Client or Brand Name"
                  className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => pdfInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    pdfInputRef.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingPdf(true);
                }}
                onDragLeave={() => setIsDraggingPdf(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingPdf(false);
                  if (e.dataTransfer.files?.length) {
                    void handleUploadSourcePdfs(e.dataTransfer.files);
                  }
                }}
                className={`border border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[120px] ${
                  isDraggingPdf
                    ? 'bg-[#FDF4F5] border-[#C6202F]'
                    : 'bg-[#F6F6F7] border-[#D5D5DC] hover:border-[#C6202F]'
                }`}
              >
                {isParsingPdf ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin text-[#C6202F] mb-2" />
                    <div className="text-xs font-semibold text-[#111114]">
                      Parsing PDF &amp; extracting details...
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-[#C6202F] mb-1.5" />
                    <div className="text-xs font-semibold text-[#111114]">
                      Drop PDF brief, script, or deck here
                    </div>
                    <div className="text-[11px] text-[#5A5A66] mt-0.5">
                      AI parses the PDF to determine all shots needed (up to 20 MB)
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col justify-between space-y-2">
                <div>
                  <label className="block text-[11px] font-semibold text-[#5A5A66] mb-1">
                    Script / Production Notes (parsed from PDF or typed manually)
                  </label>
                  <textarea
                    rows={4}
                    value={sourceNotes}
                    onChange={(e) =>
                      void onUpdateProject({
                        ...project,
                        intake: {
                          ...project.intake,
                          clientMarketingIdeas: e.target.value,
                        },
                      })
                    }
                    placeholder="Upload a PDF on the left, or paste your script, scene outline, deliverables, and specific shot requirements here..."
                    className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F] leading-relaxed"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[#6E6E7A]">
                    {attachedPdfs.length > 0
                      ? 'Uploaded PDFs are read directly whenever you generate or re-run the shot list.'
                      : 'Upload a PDF or write brief notes to unlock AI shot list generation.'}
                  </span>
                  <button
                    type="button"
                    disabled={isGenerating || isParsingPdf}
                    onClick={() => void triggerGenerate(false)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-50 rounded-lg cursor-pointer transition-colors"
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {isGenerating
                      ? 'Determining shots...'
                      : project.shots.length > 0
                        ? 'Re-run shot list from source'
                        : 'Generate shot list from source'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* In-App Image Engine Toolbar */}
      <div className="bg-white border border-[#E2E2E6] rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-[#111114]">Image Model:</span>
            <select
              aria-label="In-app image generation model"
              value={activeImageModel}
              onChange={(e) =>
                updateStudioPrefs({ model: e.target.value as StoryboardImageModel })
              }
              className="bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#111114] focus:outline-none focus:border-[#C6202F] cursor-pointer"
            >
              <optgroup label="NanoBanana (Google)">
                {NANOBANANA_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Flux Image (Black Forest Labs)">
                {FLUX_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="ChatGPT Image (OpenAI)">
                {CHATGPT_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#5A5A66]">Style:</span>
            <select
              aria-label="Storyboard style"
              value={activeStyle}
              onChange={(e) =>
                updateStudioPrefs({ style: e.target.value as StoryboardStylePreset })
              }
              className="bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F] cursor-pointer"
            >
              {SHOT_BOARD_STYLES.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-[#5A5A66]">Aspect:</span>
            <select
              aria-label="Frame aspect ratio"
              value={activeAspectRatio}
              onChange={(e) =>
                updateStudioPrefs({
                  aspectRatio: e.target.value as StoryboardStudioState['aspectRatio'],
                })
              }
              className="bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F] cursor-pointer"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="4:5">4:5</option>
              <option value="1:1">1:1</option>
              <option value="21:9">21:9</option>
            </select>
          </div>
        </div>

        {project.shots.length > 0 && missingFrameCount > 0 && (
          <button
            type="button"
            disabled={isBatchGeneratingFrames}
            onClick={() => void handleGenerateMissingFrames()}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-60 rounded-lg cursor-pointer transition-colors"
          >
            {isBatchGeneratingFrames ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isBatchGeneratingFrames
              ? batchProgress || 'Generating frames...'
              : `Generate ${missingFrameCount} Missing Frame${missingFrameCount > 1 ? 's' : ''} (${activeModelMeta.shortLabel})`}
          </button>
        )}
      </div>

      {/* Summary Bar */}
      {project.shots.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-[#5A5A66] font-mono tabular-nums">
          <span>{project.shots.length} total shots</span>
          <span aria-hidden="true">·</span>
          <span>{totalDuration}s total runtime</span>
          <span aria-hidden="true">·</span>
          <span>
            {project.shots.filter((s) => s.route === 'live').length} live /{' '}
            {project.shots.filter((s) => s.route === 'hybrid').length} hybrid /{' '}
            {project.shots.filter((s) => s.route === 'ai_video').length} AI
          </span>
          <span aria-hidden="true">·</span>
          <span className="text-[#891A23]">
            {project.shots.filter((s) => s.productInFrame).length} with product in frame
          </span>
        </div>
      )}

      {confirmOverwrite && (
        <div className="p-4 rounded-xl bg-[#FDF4F5] border border-[#EABAC0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-[#891A23]">
            You have manually edited shots in this Shot Board. Re-running AI generation will replace
            your current shots. Continue?
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmOverwrite(false)}
              className="px-3 py-1.5 text-xs font-medium text-[#24242B] bg-white border border-[#E2E2E6] rounded-lg cursor-pointer"
            >
              Keep my edits
            </button>
            <button
              type="button"
              onClick={() => void triggerGenerate(true)}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] rounded-lg cursor-pointer"
            >
              Replace &amp; re-run
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-300 text-xs text-[#891A23]">
          {errorMsg}
        </div>
      )}

      {statusNote && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900">
          {statusNote}
        </div>
      )}

      {/* Shot Cards */}
      {project.shots.length === 0 ? (
        <div className="bg-white border border-dashed border-[#E2E2E6] rounded-xl p-10 text-center space-y-3">
          <FileText className="w-8 h-8 text-[#C6202F] mx-auto" />
          <div className="text-base font-semibold text-[#111114]">
            Clean Project — Ready for Your PDF or Custom Shots
          </div>
          <p className="text-xs text-[#5A5A66] max-w-md mx-auto">
            Upload a PDF creative brief, script, or brand deck above to let AI parse it and build
            your shot list automatically, or click &ldquo;Add shot&rdquo; to create shots manually.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              disabled={isParsingPdf || isGenerating}
              onClick={() => pdfInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-55 rounded-lg cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Source PDF
            </button>
            <button
              type="button"
              onClick={addShot}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[#111114] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#891A23] rounded-lg cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Shot Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {project.shots.map((shot, idx) => {
            const isUploading = uploadingShotId === shot.id;
            const isGeneratingShot = Boolean(generatingShotIds[shot.id]);
            const showShootDirection = shot.route === 'live' || shot.route === 'hybrid';
            const earlierShots = project.shots.slice(0, idx);

            return (
              <div
                key={`${shot.id}-${idx}`}
                className="bg-white border border-[#E2E2E6] rounded-xl overflow-hidden"
              >
                {/* Shot Card Header */}
                <div className="px-5 py-3 bg-[#FBFBFC] border-b border-[#E2E2E6] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      value={shot.id}
                      onChange={(e) => updateShot(shot.id, { id: e.target.value })}
                      aria-label="Shot number"
                      className="w-16 bg-[#F6F6F7] border border-[#E2E2E6] rounded px-2 py-1 text-xs font-mono font-bold text-[#C6202F] text-center focus:outline-none focus:border-[#C6202F]"
                    />

                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-[#6E6E7A]">Duration:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={shot.durationSec}
                        onChange={(e) =>
                          updateShot(shot.id, {
                            durationSec: Number(e.target.value) || 1,
                          })
                        }
                        className="w-14 bg-[#F6F6F7] border border-[#E2E2E6] rounded px-2 py-1 text-xs font-mono tabular-nums text-[#111114] text-right focus:outline-none focus:border-[#C6202F]"
                      />
                      <span className="text-[#6E6E7A]">sec</span>
                    </div>

                    <span className="text-xs text-[#5A5A66]">
                      Status: <span className="text-[#24242B] font-medium">{shot.status}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        updateShot(shot.id, { productInFrame: !shot.productInFrame })
                      }
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                        shot.productInFrame
                          ? 'bg-[#FDF2F3] border-[#C6202F] text-[#891A23]'
                          : 'bg-[#F6F6F7] border-[#E2E2E6] text-[#5A5A66] hover:text-[#24242B]'
                      }`}
                    >
                      <Package className="w-3.5 h-3.5" />
                      {shot.productInFrame ? 'Product in frame' : 'No product in frame'}
                    </button>
                  </div>

                  {/* Order & Delete Controls */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveShot(idx, -1)}
                      title="Move shot up"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#3A3A44] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#891A23] disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      Up
                    </button>
                    <button
                      type="button"
                      disabled={idx === project.shots.length - 1}
                      onClick={() => moveShot(idx, 1)}
                      title="Move shot down"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-[#3A3A44] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#891A23] disabled:opacity-30 rounded cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      Down
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteShot(shot.id)}
                      title="Remove shot"
                      className="p-1.5 text-[#6E6E7A] hover:text-[#C6202F] rounded cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-5 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
                  {/* Left Column: Click-to-upload Frame Image + Route / Model */}
                  <div className="space-y-3">
                    <input
                      ref={(el) => {
                        frameInputRefs.current[shot.id] = el;
                      }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadFrame(shot.id, file);
                        e.target.value = '';
                      }}
                    />
                    <div
                      ref={(el) => {
                        frameBoxRefs.current[shot.id] = el;
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Upload or paste frame for ${shot.id}`}
                      onClick={() => frameInputRefs.current[shot.id]?.click()}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          frameInputRefs.current[shot.id]?.click();
                        }
                      }}
                      onPaste={(e) => {
                        const imgFile = extractClipboardImageFile(e.clipboardData);
                        if (imgFile) {
                          e.preventDefault();
                          setPasteNoticeShotId(null);
                          void handleUploadFrame(shot.id, imgFile);
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const dropped = Array.from(e.dataTransfer.files || []).find((f) =>
                          f.type.startsWith('image/')
                        );
                        if (dropped) void handleUploadFrame(shot.id, dropped);
                      }}
                      className={`aspect-video bg-[#F6F6F7] border border-dashed rounded-lg overflow-hidden relative flex items-center justify-center cursor-pointer transition-colors focus:outline-none ${
                        pasteNoticeShotId === shot.id
                          ? 'border-[#C6202F] ring-2 ring-[#C6202F]/35'
                          : 'border-[#E2E2E6] hover:border-[#C6202F]/70 focus:border-[#C6202F]'
                      }`}
                    >
                      {isGeneratingShot ? (
                        <div className="text-center p-4 space-y-1.5 text-[#111114]">
                          <Loader2 className="w-5 h-5 animate-spin text-[#C6202F] mx-auto" />
                          <div className="text-xs font-semibold">
                            Generating via {activeModelMeta.shortLabel}...
                          </div>
                        </div>
                      ) : shot.frameImageUrl ? (
                        <>
                          <img
                            src={shot.frameImageUrl}
                            alt={`Shot ${shot.id} frame`}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/55 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center text-xs font-medium text-white px-3 text-center">
                            Click to replace or paste (Ctrl+V / Cmd+V)
                          </div>
                        </>
                      ) : (
                        <div className="text-center p-4 space-y-1.5 text-[#6E6E7A]">
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-[#C6202F] mx-auto" />
                          ) : (
                            <Upload className="w-5 h-5 mx-auto" />
                          )}
                          <div className="text-xs font-medium text-[#3A3A44]">
                            {isUploading
                              ? 'Uploading frame...'
                              : shot.route === 'live'
                                ? 'Generate or upload crew reference frame'
                                : `Generate with ${activeModelMeta.shortLabel} or upload frame`}
                          </div>
                          <div className="text-[11px] text-[#6E6E7A]">
                            Generate below, drop file, or press Ctrl+V / Cmd+V
                          </div>
                        </div>
                      )}
                    </div>

                    {pasteNoticeShotId === shot.id && (
                      <div className="text-[11px] text-[#891A23] bg-[#FDF4F5] border border-[#EABAC0] rounded px-2.5 py-1">
                        Frame box focused — press Ctrl+V (or Cmd+V) to paste your copied image.
                      </div>
                    )}

                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={isGeneratingShot || isBatchGeneratingFrames || isUploading}
                        onClick={() => void handleGenerateShotFrame(shot)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[#C6202F] hover:bg-[#AD1A27] disabled:opacity-55 rounded-lg cursor-pointer transition-colors"
                      >
                        {isGeneratingShot ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : shot.frameImageUrl ? (
                          <RefreshCw className="w-3.5 h-3.5" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5" />
                        )}
                        {isGeneratingShot
                          ? `Generating (${activeModelMeta.shortLabel})...`
                          : shot.frameImageUrl
                            ? `Regenerate (${activeModelMeta.shortLabel})`
                            : `Generate Frame (${activeModelMeta.shortLabel})`}
                      </button>

                      <button
                        type="button"
                        disabled={isUploading || isGeneratingShot}
                        onClick={() => void handlePasteFromClipboardButton(shot.id)}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#24242B] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#C6202F] rounded-lg cursor-pointer transition-colors"
                        title="Paste image from clipboard"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5 text-[#C6202F]" />
                        Paste image from clipboard
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-[#5A5A66] mb-1">
                          Route
                        </label>
                        <select
                          value={shot.route}
                          onChange={(e) =>
                            handleRouteChange(shot, e.target.value as ShotRoute)
                          }
                          className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F]"
                        >
                          <option value="ai_video">AI video</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="live">Live shoot</option>
                        </select>
                      </div>

                      {shot.route !== 'live' ? (
                        <div>
                          <label className="block text-[11px] text-[#5A5A66] mb-1">
                            Model
                          </label>
                          <select
                            value={shot.model}
                            onChange={(e) =>
                              updateShot(shot.id, {
                                model: e.target.value as VideoModelOption,
                              })
                            }
                            className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#111114] focus:outline-none focus:border-[#C6202F]"
                          >
                            <option value="flux3">Flux 3</option>
                            <option value="seedance">Seedance</option>
                            <option value="veo">Google Veo 3.1</option>
                            <option value="omni">Google Gemini Omni Flash</option>
                            <option value="kling">Kling 4.0</option>
                            <option value="wan">Wan 3.0 Prime</option>
                            <option value="luma">Luma Ray 3.2</option>
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[11px] text-[#5A5A66] mb-1">
                            Deliverable
                          </label>
                          <input
                            type="text"
                            value={shot.deliverable}
                            onChange={(e) =>
                              updateShot(shot.id, { deliverable: e.target.value })
                            }
                            className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs text-[#24242B] focus:outline-none focus:border-[#C6202F]"
                          />
                        </div>
                      )}
                    </div>

                    {shot.route !== 'live' && (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-[#5A5A66] mb-1">
                            Deliverable
                          </label>
                          <input
                            type="text"
                            value={shot.deliverable}
                            onChange={(e) =>
                              updateShot(shot.id, { deliverable: e.target.value })
                            }
                            className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs text-[#24242B] focus:outline-none focus:border-[#C6202F]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#5A5A66] mb-1">
                            Chain from
                          </label>
                          <select
                            value={shot.chainFrom}
                            onChange={(e) =>
                              updateShot(shot.id, { chainFrom: e.target.value })
                            }
                            className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-2.5 py-1.5 text-xs text-[#24242B] focus:outline-none focus:border-[#C6202F]"
                          >
                            <option value="none">None</option>
                            {earlierShots.map((es) => (
                              <option key={es.id} value={es.id}>
                                {es.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Editable Plain-Text Fields */}
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-medium text-[#3A3A44] mb-1">
                        What happens
                      </label>
                      <textarea
                        rows={2}
                        value={shot.scene}
                        onChange={(e) => updateShot(shot.id, { scene: e.target.value })}
                        placeholder="Describe the single clear action in plain English..."
                        className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-sm text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
                      />
                    </div>

                    {showShootDirection && (
                      <div>
                        <label className="block text-xs font-medium text-emerald-800 mb-1">
                          Shoot direction (camera, lens, lighting, talent and product handling)
                        </label>
                        <textarea
                          rows={2}
                          value={shot.shootDirection}
                          onChange={(e) =>
                            updateShot(shot.id, { shootDirection: e.target.value })
                          }
                          placeholder="Camera placement, lens, lighting ratio, talent action, and how the product is held..."
                          className="w-full bg-[#F6F6F7] border border-emerald-300 rounded-lg px-3 py-2 text-xs text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-emerald-600"
                        />
                      </div>
                    )}

                    {/* Frame Prompt with Copy Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-[#3A3A44]">
                          Frame prompt
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(`frame-${shot.id}`, shot.framePrompt)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#891A23] bg-[#FDF4F5] border border-[#EABAC0] hover:bg-[#FCE8EA] rounded transition-colors cursor-pointer"
                        >
                          {copiedKey === `frame-${shot.id}` ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        rows={3}
                        value={shot.framePrompt}
                        onChange={(e) =>
                          updateShot(shot.id, { framePrompt: e.target.value })
                        }
                        placeholder="Still image prompt with fixed character descriptors and [PRODUCT PLACEHOLDER: composite real product here]..."
                        className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#24242B] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F] leading-relaxed"
                      />
                    </div>

                    {/* Video Prompt with Copy Button */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-[#3A3A44]">
                          Video prompt
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(`video-${shot.id}`, shot.videoPrompt)
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-[#24242B] bg-[#F6F6F7] border border-[#E2E2E6] hover:border-[#891A23] rounded transition-colors cursor-pointer"
                        >
                          {copiedKey === `video-${shot.id}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-700" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                      <textarea
                        rows={2}
                        value={shot.videoPrompt}
                        onChange={(e) =>
                          updateShot(shot.id, { videoPrompt: e.target.value })
                        }
                        placeholder="Motion, camera, and timing prompt..."
                        className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#24242B] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
                      />
                    </div>

                    {/* VO Line & Continuity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-[#3A3A44] mb-1">
                          VO line
                        </label>
                        <input
                          type="text"
                          value={shot.voLine}
                          onChange={(e) =>
                            updateShot(shot.id, { voLine: e.target.value })
                          }
                          placeholder="Spoken voiceover line (or leave empty)..."
                          className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#111114] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-[#3A3A44] mb-1">
                          Continuity notes
                        </label>
                        <input
                          type="text"
                          value={shot.continuityNotes}
                          onChange={(e) =>
                            updateShot(shot.id, { continuityNotes: e.target.value })
                          }
                          placeholder="Light direction, wardrobe, eye-line notes..."
                          className="w-full bg-[#F6F6F7] border border-[#E2E2E6] rounded-lg px-3 py-2 text-xs text-[#24242B] placeholder:text-[#8A8A96] focus:outline-none focus:border-[#C6202F]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
