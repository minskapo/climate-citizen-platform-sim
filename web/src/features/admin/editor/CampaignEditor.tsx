import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Mission } from '@shared/missions';
import { defaultSettings, emptySchedule } from '@shared/campaignSettings';
import type { CampaignStatus, CampaignType, PublishMode } from '@shared/types';
import { api, ApiError } from '../../../lib/api';
import { blobToBase64, MAX_BYTES, shrinkImage } from '../../../lib/image';
import { useSim } from '../../../lib/sim';
import { showToast } from '../../../components/Toast';
import { Modal } from '../../../components/Modal';
import { Button, LoadError, Spinner } from '../../../components/ui';
import { FILE_TOO_BIG } from '../../../components/Editor';
import type { CampaignDetail } from '../../campaigns/types';
import { TYPE_LABEL } from '../../campaigns/types';
import { useAdminCrumbs } from '../AdminLayout';
import { PublishConfirm } from '../modals/PublishConfirm';
import { BasicSection } from './BasicSection';
import { BlockAndMaterials } from './BlockAndMaterials';
import { EditorContext, type AnySettingsPatch, type EditorApi } from './context';
import {
  CALCULATOR_TOOL, md, newDraft, switchType, typeSpecificEdited,
  type AdminTool, type CampaignSettings, type CustomItem, type EditorDraft, type EditorFile, type EditorTool, type Explainer, type MissionDraft,
} from './model';
import { OfflineSections } from './OfflineSections';
import { ErrorsContext } from './parts';
import { PracticeSections } from './PracticeSections';
import { PublishSection } from './PublishSection';
import { ScheduleSection } from './ScheduleSection';
import { SidePreview } from './SidePreview';
import { SignatureSections } from './SignatureSections';
import '../admin.css';

const TYPES: CampaignType[] = ['practice', 'signature', 'offline'];

const LEAD: Record<CampaignType, string> = {
  practice: '여기서 정한 설정에 따라 신청 창, 시작 전 체크리스트, 진행 화면이 자동으로 만들어져요.',
  signature: '서명 캠페인은 이 설정에 따라 서명 창, 서명 완료 화면, 마감 후 전달 결과 공지가 자동으로 만들어져요.',
  offline: '오프라인 모임 캠페인은 이 설정에 따라 신청 창, 모임 전 안내, 당일 출석 확인, 끝난 뒤 후기 요청이 자동으로 만들어져요.',
};

type Detail = CampaignDetail;

/** 캠페인 만들기 · 설정(실천 · 서명 · 오프라인 모임). 유형 칩으로 유형별 섹션이 바뀐다. */
export function CampaignEditor() {
  const { id: paramId } = useParams();
  const [sp] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const sim = useSim();
  const queryType = sp.get('type') as CampaignType | null;
  const [isNew] = useState(() => !paramId);
  const [draft, setDraft] = useState<EditorDraft>(() => newDraft(queryType && TYPES.includes(queryType) ? queryType : 'practice'));
  const idRef = useRef<string | null>(paramId ?? null);
  const [id, setId] = useState<string | null>(paramId ?? null);
  const [loading, setLoading] = useState(!!paramId);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [live, setLive] = useState(false);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [custom, setCustom] = useState<CustomItem[]>([]);
  const [files, setFiles] = useState<EditorFile[]>([]);
  const [linkedTools, setLinkedTools] = useState<EditorTool[]>([]);
  const [explainer, setExplainer] = useState<Explainer | null>(null);
  const [toolList, setToolList] = useState<AdminTool[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hostLinked, setHostLinkedState] = useState(false);
  const [pendingType, setPendingType] = useState<CampaignType | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const clonedFrom = (location.state as { clonedFrom?: string } | null)?.clonedFrom ?? null;

  useAdminCrumbs(['캠페인', `${isNew ? '새 캠페인 만들기' : '캠페인 설정'} · ${TYPE_LABEL[draft.type]}`]);

  const fromDetail = useCallback((d: Detail) => {
    const c = d.campaign;
    setDraft({
      type: c.type, title: c.title, summary: c.summary, imageFileId: c.imageFileId, hostGroupId: c.hostGroupId,
      hostName: c.host.type === 'group' ? c.host.name : null,
      schedule: { ...emptySchedule(), ...(c.schedule as object) } as EditorDraft['schedule'],
      settings: { ...defaultSettings(c.type), ...(c.settings as object) } as CampaignSettings,
      publishMode: c.publish === 'draft' ? 'scheduled' : c.publish, showUpcoming: c.showUpcoming,
    });
    setHostLinkedState(!!c.hostGroupId);
    setStatus(d.status);
    setLive(c.publish !== 'draft');
    setMissions(d.missions);
    setCustom(d.checklist.filter((x) => x.kind === 'custom').map((x) => ({ label: x.label, linkType: x.linkType ?? 'url', target: x.target ?? '' })));
    setFiles(d.files);
    setLinkedTools(d.tools);
    setExplainer((d.explainer as Explainer | null) ?? null);
  }, []);

  const load = useCallback(async () => {
    if (!paramId) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      fromDetail(await api<Detail>(`/api/campaigns/${paramId}`));
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [paramId, fromDetail]);

  useEffect(() => {
    // 새로 만든 초안의 주소로 바뀐 것뿐이면 다시 불러오지 않는다.
    if (paramId && paramId === idRef.current && !loading) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramId]);

  useEffect(() => {
    api<{ items: AdminTool[] }>('/api/tools', { quiet: true })
      .then((r) => setToolList(r.items ?? []))
      .catch(() => setToolList([]));
  }, []);

  const payload = () => {
    const settings: Record<string, unknown> = { ...draft.settings, hostLink: draft.hostGroupId ? 'linked' : 'none' };
    // 지운 선택 항목은 null로 보내야 서버에서도 지워진다.
    const optional = draft.type === 'practice' ? ['numberUnit', 'numberGoal'] : draft.type === 'offline' ? ['customQuestion'] : [];
    for (const k of optional) if (settings[k] === undefined) settings[k] = null;
    return { type: draft.type, title: draft.title.trim(), summary: draft.summary.trim(), hostGroupId: draft.hostGroupId, schedule: draft.schedule, settings };
  };

  const handleError = (e: unknown) => {
    if (e instanceof ApiError && e.field) {
      setErrors({ [e.field]: e.message });
      showToast('확인할 항목이 있어요');
      requestAnimationFrame(() => document.querySelector('.ed .field-error')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
    } else if (e instanceof ApiError && e.status > 0 && e.status < 500) {
      showToast(e.message);
    }
  };

  /** 임시 저장(PUT). 처음이면 초안을 만든다. */
  const save = async (toast = false): Promise<boolean> => {
    setErrors({});
    try {
      if (!idRef.current) {
        const d = await api<Detail>('/api/campaigns', { body: payload() });
        idRef.current = d.campaign.id;
        setId(d.campaign.id);
        setStatus(d.status);
        navigate(`/admin/campaigns/${d.campaign.id}/edit`, { replace: true, state: location.state });
      } else {
        const d = await api<Detail>(`/api/campaigns/${idRef.current}`, { method: 'PUT', body: payload() });
        setStatus(d.status);
      }
      if (toast) showToast(`임시 저장했어요 · ${md(sim.today)} ${sim.nowTime}`);
      return true;
    } catch (e) {
      handleError(e);
      return false;
    }
  };

  const ensureId = async () => (idRef.current ? idRef.current : (await save()) ? idRef.current : null);

  const withSaved = async <T,>(fn: (id: string) => Promise<T>): Promise<T | null> => {
    if (!(await save())) return null;
    try {
      return await fn(idRef.current!);
    } catch (e) {
      handleError(e);
      return null;
    }
  };

  const applyType = (t: CampaignType) => {
    setDraft((d) => switchType(d, t));
    setErrors({});
  };

  const editor: EditorApi = {
    id, status, live, draft, hostLinked,
    set: (patch) => setDraft((d) => ({ ...d, ...patch })),
    setS: (patch: AnySettingsPatch) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...patch } as CampaignSettings })),
    setSchedule: (patch) => setDraft((d) => ({ ...d, schedule: { ...d.schedule, ...patch } })),
    requestType: (t) => {
      if (t === draft.type) return;
      if (live) { showToast('공개한 캠페인은 유형을 바꿀 수 없어요'); return; }
      if (typeSpecificEdited(draft) || (draft.type === 'practice' && missions.length > 0) || (draft.type === 'signature' && explainer)) setPendingType(t);
      else applyType(t);
    },
    setHostLinked: (v) => {
      setHostLinkedState(v);
      if (!v) setDraft((d) => ({ ...d, hostGroupId: null, hostName: null }));
    },

    missions,
    saveMissions: async (list: MissionDraft[]) => {
      const r = await withSaved((cid) => api<{ missions: Mission[] }>(`/api/campaigns/${cid}/missions`, { method: 'PUT', body: list }));
      if (!r) return false;
      setMissions(r.missions);
      return true;
    },
    importBundle: async (bundleId) => {
      const r = await withSaved((cid) => api<{ missions: Mission[]; settings: CampaignSettings }>(`/api/campaigns/${cid}/missions/from-bundle/${bundleId}`, { method: 'POST' }));
      if (!r) return false;
      setMissions(r.missions);
      const s = r.settings as unknown as Record<string, unknown>;
      setDraft((d) => {
        const next = { ...d.settings, missionCycle: s.missionCycle, recordCycle: s.recordCycle, recordFields: s.recordFields } as Record<string, unknown>;
        delete next.numberUnit;
        delete next.numberGoal;
        if (s.numberUnit !== undefined) next.numberUnit = s.numberUnit;
        if (s.numberGoal !== undefined) next.numberGoal = s.numberGoal;
        return { ...d, settings: next as unknown as CampaignSettings };
      });
      showToast('미션 묶음을 불러왔어요');
      return true;
    },
    saveBundle: async () => {
      const name = [...(draft.title.trim() || '이름 없는 캠페인')].slice(0, 40).join('');
      const r = await withSaved((cid) => api(`/api/mission-bundles`, { body: { name, campaignId: cid } }));
      if (r) showToast(`「${name}」 미션 묶음으로 저장했어요`);
    },

    custom,
    saveCustom: async (list) => {
      const cid = await ensureId();
      if (!cid) return false;
      try {
        await api(`/api/campaigns/${cid}/checklist`, { method: 'PUT', body: list.map(({ label, linkType, target }) => ({ label, linkType, target })) });
        setCustom(list);
        return true;
      } catch (e) {
        handleError(e);
        return false;
      }
    },

    files,
    addFile: async (f) => {
      if (f.size > MAX_BYTES) { showToast(FILE_TOO_BIG); return; }
      const cid = await ensureId();
      if (!cid) return;
      try {
        const dataBase64 = await blobToBase64(f);
        const r = await api<EditorFile>(`/api/campaigns/${cid}/files`, { body: { name: f.name, mime: f.type || 'application/octet-stream', dataBase64, exclusive: false } });
        setFiles((l) => [...l, r]);
        showToast('자료를 올렸어요');
      } catch (e) {
        if (e instanceof ApiError && e.status === 413) showToast(FILE_TOO_BIG);
        else handleError(e);
      }
    },
    removeFile: async (fid) => {
      try {
        await api(`/api/campaigns/${idRef.current}/files/${fid}`, { method: 'DELETE' });
        setFiles((l) => l.filter((f) => f.id !== fid));
      } catch (e) { handleError(e); }
    },
    toggleFileExclusive: async (fid) => {
      const f = files.find((x) => x.id === fid);
      if (!f) return;
      try {
        await api(`/api/campaigns/${idRef.current}/files/${fid}`, { method: 'PATCH', body: { exclusive: !f.exclusive } });
        setFiles((l) => l.map((x) => (x.id === fid ? { ...x, exclusive: !x.exclusive } : x)));
      } catch (e) { handleError(e); }
    },
    linkedTools,
    saveTools: async (list) => {
      const cid = await ensureId();
      if (!cid) return false;
      try {
        const r = await api<{ tools: EditorTool[] }>(`/api/campaigns/${cid}/tools`, { method: 'PUT', body: list.map((t) => ({ toolId: t.toolId, exclusive: t.exclusive })) });
        setLinkedTools(r.tools);
        return true;
      } catch (e) {
        handleError(e);
        return false;
      }
    },
    toolList,
    toolName: (tid) => (!tid ? '' : tid === CALCULATOR_TOOL.id ? CALCULATOR_TOOL.name : toolList.find((t) => t.id === tid)?.name ?? '웹 도구'),

    explainer,
    saveExplainer: async (v) => {
      const cid = await ensureId();
      if (!cid) return;
      try {
        const r = await api<{ explainer: Explainer }>(`/api/campaigns/${cid}/explainer`, {
          method: 'PUT',
          body: { title: v.title, body: v.body, attachments: v.attachments.map((a) => (a.dataBase64 ? { name: a.name, mime: a.mime, dataBase64: a.dataBase64 } : { id: a.id })) },
        });
        setExplainer(r.explainer);
        showToast('설명 글을 저장했어요');
      } catch (e) {
        handleError(e);
        throw e;
      }
    },

    uploadImage: async (f) => {
      let img: Awaited<ReturnType<typeof shrinkImage>>;
      try {
        img = await shrinkImage(f);
      } catch (e) {
        showToast((e as Error).message || '이미지를 올리지 못했어요');
        return;
      }
      const cid = await ensureId();
      if (!cid) return;
      try {
        const d = await api<Detail>(`/api/campaigns/${cid}/image`, { method: 'PUT', body: { mime: img.mime, dataBase64: img.dataBase64 } });
        setDraft((x) => ({ ...x, imageFileId: d.campaign.imageFileId }));
        showToast('대표 이미지를 바꿨어요');
      } catch (e) {
        handleError(e);
      }
    },
    ensureId,
  };

  const doPublish = async (mode: PublishMode) => {
    if (!idRef.current) return;
    setBusy(true);
    try {
      const d = await api<Detail>(`/api/campaigns/${idRef.current}/publish`, {
        body: { mode, showUpcoming: draft.showUpcoming, ...(mode === 'draft' ? {} : { hero: draft.settings.heroEnabled }) },
      });
      setStatus(d.status);
      setLive(mode !== 'draft');
      setConfirmOpen(false);
      if (mode === 'draft') {
        showToast('초안으로 저장했어요');
      } else {
        showToast(mode === 'now' ? '캠페인을 공개했어요' : '공개를 예약했어요');
        navigate('/admin/campaigns');
      }
    } catch (e) {
      setConfirmOpen(false);
      handleError(e);
    } finally {
      setBusy(false);
    }
  };

  const onPublish = async () => {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (!ok) return;
    if (draft.publishMode === 'scheduled') setConfirmOpen(true);
    else await doPublish(draft.publishMode);
  };

  const onPreview = async () => {
    if (!(await save())) return;
    const base = window.location.href.split('#')[0];
    window.open(`${base}#/campaigns/${idRef.current}`, '_blank', 'noopener');
  };

  const sections = useMemo(() => {
    if (draft.type === 'practice') return <PracticeSections />;
    if (draft.type === 'signature') return <SignatureSections />;
    return <OfflineSections />;
  }, [draft.type]);

  if (loading) return <Spinner />;
  if (loadFailed) return <LoadError onRetry={load} />;

  return (
    <EditorContext.Provider value={editor}>
      <ErrorsContext.Provider value={errors}>
        <div className="ed">
          <div className="ed-head">
            <div>
              <h1 className="adm-title">{isNew ? '새 캠페인 만들기' : '캠페인 설정'}</h1>
              <p className="adm-lead">{LEAD[draft.type]}</p>
            </div>
            <div className="ed-head-actions">
              <Button variant="outline" pill onClick={onPreview}>사용자 화면 미리보기</Button>
              <Button variant="outline" pill onClick={() => void save(true)}>임시 저장</Button>
            </div>
          </div>
          <div className="ed-grid">
            <div className="ed-main">
              <BasicSection />
              <ScheduleSection />
              {sections}
              <BlockAndMaterials />
              <PublishSection busy={busy} errors={errors} onPublish={onPublish} onCancel={() => navigate('/admin/campaigns')} />
            </div>
            <SidePreview clonedFrom={clonedFrom} />
          </div>
        </div>
        <Modal
          open={!!pendingType} onClose={() => setPendingType(null)} title="유형을 바꿀까요?"
          description="이름 · 설명 · 대표 이미지 · 주최 모임 · 일정 · 맞춤 영역은 그대로 두고, 지금 유형에서 바꾼 설정은 기본값으로 돌아가요."
          footer={<>
            <Button variant="ghost" onClick={() => setPendingType(null)}>취소</Button>
            <Button onClick={() => { applyType(pendingType!); setPendingType(null); }}>바꾸기</Button>
          </>}
        />
        {confirmOpen && (
          <PublishConfirm draft={draft} campaignId={id} busy={busy} onClose={() => setConfirmOpen(false)} onConfirm={() => void doPublish('scheduled')} />
        )}
      </ErrorsContext.Provider>
    </EditorContext.Provider>
  );
}
