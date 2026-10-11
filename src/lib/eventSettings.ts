import { readJsonSafe } from './http';

export interface EventFlowItem {
  time: string;
  title: string;
  desc: string;
}

export interface EventSettings {
  title: string;
  dateLabel: string;
  timeLabel: string;
  venue: string;
  dressCodeMale: string;
  dressCodeFemale: string;
  countdownIso: string;
  flow: EventFlowItem[];
  supportNote: string;
  updatedAt: string | null;
}

export const defaultEventSettings: EventSettings = {
  title: 'Ignite 2.O',
  dateLabel: '',
  timeLabel: '',
  venue: '',
  dressCodeMale: 'Formals',
  dressCodeFemale: 'Western Wear',
  countdownIso: '',
  flow: [],
  supportNote: 'Payment verification may take 2-3 days. Please wait for confirmation from the support team.',
  updatedAt: null,
};

const normalizeFlow = (value: unknown): EventFlowItem[] => {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .map((item) => ({
      time: typeof item?.time === 'string' ? item.time.trim() : '',
      title: typeof item?.title === 'string' ? item.title.trim() : '',
      desc: typeof item?.desc === 'string' ? item.desc.trim() : '',
    }))
    .filter((item) => item.time || item.title || item.desc);
  return cleaned;
};

export function normalizeEventSettings(payload: any): EventSettings {
  return {
    title: typeof payload?.title === 'string' ? payload.title : defaultEventSettings.title,
    dateLabel: typeof payload?.date_label === 'string' ? payload.date_label : defaultEventSettings.dateLabel,
    timeLabel: typeof payload?.time_label === 'string' ? payload.time_label : defaultEventSettings.timeLabel,
    venue: typeof payload?.venue === 'string' ? payload.venue : defaultEventSettings.venue,
    dressCodeMale: typeof payload?.dress_code_male === 'string' ? payload.dress_code_male : defaultEventSettings.dressCodeMale,
    dressCodeFemale: typeof payload?.dress_code_female === 'string' ? payload.dress_code_female : defaultEventSettings.dressCodeFemale,
    countdownIso: typeof payload?.countdown_iso === 'string' ? payload.countdown_iso : defaultEventSettings.countdownIso,
    flow: normalizeFlow(payload?.flow),
    supportNote: typeof payload?.support_note === 'string' ? payload.support_note : defaultEventSettings.supportNote,
    updatedAt: typeof payload?.updated_at === 'string' ? payload.updated_at : null,
  };
}

export async function fetchEventSettings(): Promise<EventSettings> {
  const res = await fetch('/api/event-settings');
  const data = await readJsonSafe<any>(res);
  if (!res.ok || !data) {
    throw new Error('Failed to load event settings');
  }
  return normalizeEventSettings(data);
}
