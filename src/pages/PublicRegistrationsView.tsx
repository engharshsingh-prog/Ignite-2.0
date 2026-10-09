import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Users, ShieldAlert, Filter, Plus, X, QrCode } from 'lucide-react';
import { getErrorMessage, readJsonSafe } from '../lib/http';
import LoadingSpinner from '../components/LoadingSpinner';

interface Participant {
  id: number;
  full_name: string;
  roll_number: string;
  branch: string;
  email: string;
  year: string;
  whatsapp_number: string;
  skills: string[];
  payment_id: string;
  payment_verified: boolean;
  check_in_status: boolean;
  check_in_time: string | null;
  registered_at: string;
}

type FilterField =
  | 'id'
  | 'full_name'
  | 'roll_number'
  | 'branch'
  | 'email'
  | 'year'
  | 'whatsapp_number'
  | 'skills'
  | 'payment_id'
  | 'payment_verified'
  | 'check_in_status'
  | 'check_in_time'
  | 'registered_at';

type TextOperator = 'contains' | 'equals' | 'starts_with' | 'ends_with' | 'not_contains';
type BoolOperator = 'is_true' | 'is_false';
type Operator = TextOperator | BoolOperator;

interface FilterCondition {
  id: number;
  field: FilterField;
  operator: Operator;
  value: string;
}

const FIELD_OPTIONS: Array<{ key: FilterField; label: string; kind: 'text' | 'bool' }> = [
  { key: 'id', label: 'ID', kind: 'text' },
  { key: 'full_name', label: 'Name', kind: 'text' },
  { key: 'roll_number', label: 'Roll No', kind: 'text' },
  { key: 'branch', label: 'Branch', kind: 'text' },
  { key: 'email', label: 'Email', kind: 'text' },
  { key: 'year', label: 'Year', kind: 'text' },
  { key: 'whatsapp_number', label: 'WhatsApp', kind: 'text' },
  { key: 'skills', label: 'Skills', kind: 'text' },
  { key: 'payment_id', label: 'Payment ID', kind: 'text' },
  { key: 'payment_verified', label: 'Payment Verified', kind: 'bool' },
  { key: 'check_in_status', label: 'Check-in Status', kind: 'bool' },
  { key: 'check_in_time', label: 'Check-in Time', kind: 'text' },
  { key: 'registered_at', label: 'Registered At', kind: 'text' },
];

const TEXT_OPERATORS: Array<{ key: TextOperator; label: string }> = [
  { key: 'contains', label: 'contains' },
  { key: 'equals', label: 'equals' },
  { key: 'starts_with', label: 'starts with' },
  { key: 'ends_with', label: 'ends with' },
  { key: 'not_contains', label: 'does not contain' },
];

const BOOL_OPERATORS: Array<{ key: BoolOperator; label: string }> = [
  { key: 'is_true', label: 'is true' },
  { key: 'is_false', label: 'is false' },
];

function fieldKind(field: FilterField): 'text' | 'bool' {
  return FIELD_OPTIONS.find((f) => f.key === field)?.kind || 'text';
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function participantFieldValue(p: Participant, field: FilterField): string | number | boolean {
  if (field === 'skills') return (p.skills || []).join(', ');
  if (field === 'payment_verified') return Boolean(p.payment_verified);
  if (field === 'check_in_status') return Boolean(p.check_in_status);
  return p[field] ?? '';
}

function conditionMatches(p: Participant, condition: FilterCondition): boolean {
  const kind = fieldKind(condition.field);
  const raw = participantFieldValue(p, condition.field);

  if (kind === 'bool') {
    if (condition.operator === 'is_true') return Boolean(raw) === true;
    if (condition.operator === 'is_false') return Boolean(raw) === false;
    return true;
  }

  const target = normalizeText(raw);
  const query = normalizeText(condition.value);
  if (!query) return true;

  if (condition.operator === 'equals') return target === query;
  if (condition.operator === 'starts_with') return target.startsWith(query);
  if (condition.operator === 'ends_with') return target.endsWith(query);
  if (condition.operator === 'not_contains') return !target.includes(query);
  return target.includes(query);
}

export default function PublicRegistrationsView() {
  const { token = '' } = useParams();
  const [rows, setRows] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [qrModal, setQrModal] = useState<{ title: string; value: string } | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/public-participants?token=${encodeURIComponent(token)}`);
        const data = await readJsonSafe<Participant[] | { error?: string }>(res);
        if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to load records'));
        setRows(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load records');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  const filteredRows = useMemo(() => {
    if (!filters.length) return rows;
    return rows.filter((row) => filters.every((condition) => conditionMatches(row, condition)));
  }, [rows, filters]);

  const addFilter = () => {
    setFilters((prev) => {
      const nextId = prev.length ? Math.max(...prev.map((f) => f.id)) + 1 : 1;
      return [...prev, { id: nextId, field: 'full_name', operator: 'contains', value: '' }];
    });
  };

  const removeFilter = (id: number) => {
    setFilters((prev) => prev.filter((f) => f.id !== id));
  };

  const updateFilter = (id: number, patch: Partial<FilterCondition>) => {
    setFilters((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = { ...f, ...patch };
        if (patch.field) {
          const kind = fieldKind(patch.field);
          next.operator = kind === 'bool' ? 'is_true' : 'contains';
          next.value = '';
        }
        return next;
      })
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg text-white pt-24 px-4">
        <LoadingSpinner text="Loading shared registrations..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#111411] grid-bg text-white pt-24 px-4">
        <div className="max-w-3xl mx-auto p-6 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-200">
          <p className="font-semibold flex items-center gap-2"><ShieldAlert size={18} /> Access unavailable</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-24 pb-16 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-black">Registration Records (View Only)</h1>
          <p className="text-gray-400 text-sm mt-1">Private shared page. No edit actions are available.</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 mb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-gray-300 flex items-center gap-2">
              <Filter size={15} className="text-blue-300" /> Filters (AND conditions)
            </p>
            <div className="flex items-center gap-2">
              {!!filters.length && (
                <button
                  type="button"
                  onClick={() => setFilters([])}
                  className="px-3 py-1.5 text-xs rounded-lg border border-white/15 text-gray-300 hover:bg-white/10"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={addFilter}
                className="px-3 py-1.5 text-xs rounded-lg border border-blue-400/40 text-blue-200 hover:bg-blue-400/10 inline-flex items-center gap-1.5"
              >
                <Plus size={13} /> Add filter
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filters.map((f) => {
              const kind = fieldKind(f.field);
              return (
                <div key={f.id} className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1.3fr_auto] gap-2">
                  <select
                    value={f.field}
                    onChange={(e) => updateFilter(f.id, { field: e.target.value as FilterField })}
                    className="bg-[#15152a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={f.operator}
                    onChange={(e) => updateFilter(f.id, { operator: e.target.value as Operator })}
                    className="bg-[#15152a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-400/50"
                  >
                    {(kind === 'bool' ? BOOL_OPERATORS : TEXT_OPERATORS).map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  {kind === 'bool' ? (
                    <div className="bg-[#15152a] border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-400">
                      No value needed
                    </div>
                  ) : (
                    <input
                      value={f.value}
                      onChange={(e) => updateFilter(f.id, { value: e.target.value })}
                      placeholder="Value"
                      className="bg-[#15152a] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-400/50"
                    />
                  )}

                  <button
                    type="button"
                    onClick={() => removeFilter(f.id)}
                    className="px-3 py-2 text-sm rounded-lg border border-red-400/30 text-red-200 hover:bg-red-500/10 inline-flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5 border-b border-white/10">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Roll No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Branch</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Year</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">WhatsApp</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Skills</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Payment</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Check-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((p) => (
                  <tr key={p.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{p.full_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-300 font-mono">{p.roll_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.branch}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.year}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.whatsapp_number}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.skills.join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-300">{p.payment_id}</td>
                    <td className="px-4 py-3 text-sm">{p.payment_verified ? <span className="text-emerald-300">Verified</span> : <span className="text-olive-300">Pending</span>}</td>
                    <td className="px-4 py-3 text-sm">{p.check_in_status ? <span className="text-emerald-300">Checked In</span> : <span className="text-gray-400">Pending</span>}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() =>
                          setQrModal({
                            title: `QR - ${p.full_name}`,
                            value: JSON.stringify({
                              id: p.id,
                              roll_number: p.roll_number,
                              payment_id: p.payment_id,
                              email: p.email,
                              whatsapp_number: p.whatsapp_number,
                            }),
                          })
                        }
                        className="px-2.5 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20 inline-flex items-center gap-1.5 text-xs"
                      >
                        <QrCode size={13} /> QR
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Users size={32} className="mx-auto mb-3 opacity-40" />
              <p>{rows.length === 0 ? 'No registrations found.' : 'No records match current filters.'}</p>
            </div>
          )}
        </div>
      </div>

      {qrModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#171127] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <h3 className="text-base font-bold text-white">{qrModal.title}</h3>
              <button onClick={() => setQrModal(null)} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrModal.value)}`}
                alt="QR Code"
                className="w-64 h-64 mx-auto rounded-lg bg-white p-2"
              />
              <p className="mt-3 text-xs text-gray-400 break-all">{qrModal.value}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
