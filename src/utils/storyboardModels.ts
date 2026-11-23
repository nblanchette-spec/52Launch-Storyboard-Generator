import type { StoryboardImageModel } from '../types/pipeline';

export type ImageModelFamily = 'nanobanana' | 'flux' | 'chatgpt';

export interface StoryboardImageModelSpec {
  id: StoryboardImageModel;
  family: ImageModelFamily;
  familyLabel: string;
  label: string;
  shortLabel: string;
  note: string;
  supportsMultiRef: boolean;
}

export const STORYBOARD_IMAGE_MODELS: StoryboardImageModelSpec[] = [
  {
    id: 'nano-banana-2',
    family: 'nanobanana',
    familyLabel: 'NanoBanana (Google)',
    label: 'Nano Banana 2',
    shortLabel: 'Nano Banana 2',
    note: 'Fast multi-reference consistency (up to 14 refs)',
    supportsMultiRef: true,
  },
  {
    id: 'nano-banana-pro',
    family: 'nanobanana',
    familyLabel: 'NanoBanana (Google)',
    label: 'Nano Banana Pro',
    shortLabel: 'Nano Banana Pro',
    note: 'Highest detail & crisp product branding fidelity',
    supportsMultiRef: true,
  },
  {
    id: 'nano-banana',
    family: 'nanobanana',
    familyLabel: 'NanoBanana (Google)',
    label: 'Nano Banana Standard',
    shortLabel: 'Nano Banana',
    note: 'Lightweight quick storyboard iteration',
    supportsMultiRef: true,
  },
  {
    id: 'flux-2-pro',
    family: 'flux',
    familyLabel: 'Flux Image (Black Forest Labs)',
    label: 'Flux 2 Pro',
    shortLabel: 'Flux 2 Pro',
    note: 'Production photorealism & multi-reference compositing',
    supportsMultiRef: true,
  },
  {
    id: 'flux-2',
    family: 'flux',
    familyLabel: 'Flux Image (Black Forest Labs)',
    label: 'Flux 2 Dev',
    shortLabel: 'Flux 2 Dev',
    note: 'Fast cinematic framing & multi-reference edits',
    supportsMultiRef: true,
  },
  {
    id: 'flux-pro-1.1',
    family: 'flux',
    familyLabel: 'Flux Image (Black Forest Labs)',
    label: 'Flux 1.1 Pro',
    shortLabel: 'Flux 1.1 Pro',
    note: 'High-adherence single-frame editorial cinema stills',
    supportsMultiRef: false,
  },
  {
    id: 'gpt-image-1.5',
    family: 'chatgpt',
    familyLabel: 'ChatGPT Image (OpenAI)',
    label: 'ChatGPT Image 1.5 (GPT Image 1.5)',
    shortLabel: 'ChatGPT Image 1.5',
    note: 'Latest OpenAI multimodal generation & reference editing',
    supportsMultiRef: true,
  },
  {
    id: 'gpt-image-1',
    family: 'chatgpt',
    familyLabel: 'ChatGPT Image (OpenAI)',
    label: 'ChatGPT Image 1 (GPT Image 1)',
    shortLabel: 'ChatGPT Image 1',
    note: 'Classic OpenAI instruction-following & image editing',
    supportsMultiRef: true,
  },
];

export function getStoryboardImageModelSpec(
  modelId: StoryboardImageModel | string | undefined
): StoryboardImageModelSpec {
  return (
    STORYBOARD_IMAGE_MODELS.find((m) => m.id === modelId) ||
    STORYBOARD_IMAGE_MODELS[0]
  );
}
