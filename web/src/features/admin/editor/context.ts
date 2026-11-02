import { createContext, useContext } from 'react';
import type { Mission } from '@shared/missions';
import type { CampaignStatus, CampaignType } from '@shared/types';
import type { AdminTool, CustomItem, DraftSchedule, EditorDraft, EditorFile, EditorTool, Explainer, MissionDraft } from './model';
import type { NewAttachment } from '../../../components/Editor';

/** 모든 유형의 설정 키를 담은 느슨한 모양(섹션에서 부분 수정할 때). */
export type AnySettingsPatch = Record<string, unknown>;

export interface EditorApi {
  id: string | null;
  status: CampaignStatus | null;
  /** 공개한 적 있는 캠페인(유형을 바꿀 수 없다) */
  live: boolean;
  draft: EditorDraft;
  set(patch: Partial<EditorDraft>): void;
  setS(patch: AnySettingsPatch): void;
  setSchedule(patch: Partial<DraftSchedule>): void;
  requestType(t: CampaignType): void;
  /** 주최 모임 연결을 고른 상태(모임은 아직 안 골랐을 수도 있다) */
  hostLinked: boolean;
  setHostLinked(v: boolean): void;

  missions: Mission[];
  saveMissions(list: MissionDraft[]): Promise<boolean>;
  importBundle(bundleId: string): Promise<boolean>;
  saveBundle(): Promise<void>;

  custom: CustomItem[];
  saveCustom(list: CustomItem[]): Promise<boolean>;

  files: EditorFile[];
  addFile(f: File): Promise<void>;
  removeFile(id: string): Promise<void>;
  toggleFileExclusive(id: string): Promise<void>;
  linkedTools: EditorTool[];
  saveTools(list: EditorTool[]): Promise<boolean>;
  toolList: AdminTool[];
  toolName(id: string | null | undefined): string;

  explainer: Explainer | null;
  saveExplainer(v: { title: string; body: string; attachments: NewAttachment[] }): Promise<void>;

  uploadImage(f: File): Promise<void>;
  ensureId(): Promise<string | null>;
}

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor(): EditorApi {
  const v = useContext(EditorContext);
  if (!v) throw new Error('EditorContext missing');
  return v;
}
