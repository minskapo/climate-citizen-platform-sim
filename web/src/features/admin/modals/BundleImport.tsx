import { useEffect, useState } from 'react';
import type { MissionCycle, RecordCycle, RecordField } from '@shared/types';
import { Modal } from '../../../components/Modal';
import { Button, Spinner } from '../../../components/ui';
import { api } from '../../../lib/api';
import { useEditor } from '../editor/context';
import { MISSION_CYCLE_LABEL } from '../editor/model';
import { FieldError } from '../editor/parts';
import { PickList } from './PickList';

interface Bundle {
  id: string; name: string; ownerName: string; cycle: MissionCycle; recordCycle: RecordCycle; recordFields: RecordField[];
  numberUnit: string | null; missionCount: number; categories: string[];
}

const REC: Record<RecordCycle, string> = { daily: '매일 기록', thrice_weekly: '주 3회 기록', weekly: '주 1회 기록', once_end: '한 번 기록' };

function describe(b: Bundle): string {
  const extra = b.recordFields.includes('number') && b.numberUnit ? `숫자(${b.numberUnit})` : b.recordFields.includes('photo') ? '사진' : `미션 ${b.missionCount}개`;
  return [MISSION_CYCLE_LABEL[b.cycle], REC[b.recordCycle], extra, b.ownerName].join(' · ');
}

/** 미션 묶음 불러오기 */
export function BundleImportModal({ onClose }: { onClose(): void }) {
  const ed = useEditor();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Bundle[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      api<{ items: Bundle[] }>(`/api/mission-bundles${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, { quiet: true })
        .then((r) => alive && setItems(r.items ?? []))
        .catch(() => alive && setItems([]));
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <Modal
      open onClose={onClose} title="미션 묶음 불러오기" description="다른 캠페인에서 저장한 미션 묶음을 가져와요."
      footer={<>
        <Button variant="ghost" onClick={onClose}>취소</Button>
        <Button disabled={!sel || busy} onClick={async () => {
          setBusy(true);
          const ok = await ed.importBundle(sel!);
          setBusy(false);
          if (ok) onClose();
        }}>불러오기</Button>
      </>}
    >
      <div className="picker">
        <input className="input" placeholder="⌕  묶음 이름 · 분류 검색" aria-label="묶음 이름 · 분류 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        {items === null ? <Spinner /> : (
          <PickList
            label="미션 묶음" selected={sel ? [sel] : []} onSelect={setSel}
            empty={<p className="picker-note">아직 저장한 미션 묶음이 없어요. 미션 목록 아래 「이 목록을 미션 묶음으로 저장」으로 만들어요.</p>}
            items={items.map((b) => ({ id: b.id, name: b.name, sub: describe(b) }))}
          />
        )}
        <FieldError name={['missions', 'schedule.runStart']} />
        <p className="picker-note">불러오면 미션 목록과 함께 미션 주기 · 기록 주기 · 기록 항목도 묶음 설정으로 바뀌어요. 회차와 날짜는 이 캠페인 일정에 맞춰 다시 계산돼요.</p>
      </div>
    </Modal>
  );
}
