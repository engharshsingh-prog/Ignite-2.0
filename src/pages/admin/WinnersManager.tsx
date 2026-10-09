import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Plus, Trash2, ArrowLeft, X, Crown } from 'lucide-react';
import { authHeaders } from '../../lib/auth';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getErrorMessage, readJsonSafe } from '../../lib/http';

interface Winner {
  id: number;
  name: string;
  roll_no: string;
  branch: string;
  award_title: string;
  image_url: string;
  description: string;
}

interface Participant {
  id: number;
  full_name: string;
  roll_number: string;
  branch: string;
}

const AWARDS = ['Mr. IGNITE', 'Ms. IGNITE', 'Best Dancer', 'Best Singer', 'Most Talented', 'Mr. Personality', 'Ms. Personality', 'Best Dressed', 'Funniest Fresher', 'Custom...'];

export default function WinnersManager() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ participant_id: '', name: '', roll_no: '', branch: '', award_title: '', image_url: '', description: '' });
  const [customAward, setCustomAward] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [wRes, pRes] = await Promise.all([
        fetch('/api/winners', { headers: authHeaders() }),
        fetch('/api/participants', { headers: authHeaders() }),
      ]);
      const winnersData = await readJsonSafe<Winner[]>(wRes);
      const participantsData = await readJsonSafe<Participant[]>(pRes);
      setWinners(Array.isArray(winnersData) ? winnersData : []);
      setParticipants(Array.isArray(participantsData) ? participantsData : []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const handleParticipantSelect = (id: string) => {
    const p = participants.find(p => String(p.id) === id);
    if (p) setForm(f => ({ ...f, participant_id: id, name: p.full_name, roll_no: p.roll_number, branch: p.branch }));
    else setForm(f => ({ ...f, participant_id: id }));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const awardTitle = form.award_title === 'Custom...' ? customAward : form.award_title;
    if (!form.name || !awardTitle) { setError('Name and award title are required'); return; }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/winners', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ...form, award_title: awardTitle }),
      });
      const data = await readJsonSafe<{ error?: string }>(res);
      if (!res.ok) throw new Error(getErrorMessage(data, 'Failed to add winner'));
      setForm({ participant_id: '', name: '', roll_no: '', branch: '', award_title: '', image_url: '', description: '' });
      setShowForm(false);
      fetchData();
    } catch (err: any) { setError(err.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch('/api/winners', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ id }) });
      fetchData();
    } catch (err) { console.error(err); }
    finally { setDeleting(null); }
  };

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></Link>
            <div>
              <h1 className="text-3xl font-black">Winners Manager</h1>
              <p className="text-gray-400 text-sm">Manage Hall of Fame entries</p>
            </div>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-olive-500 text-black font-bold hover:bg-olive-400 transition-colors">
            {showForm ? <X size={16} /> : <Plus size={16} />}
            {showForm ? 'Cancel' : 'Add Winner'}
          </button>
        </div>

        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-6 mb-8">
            <h2 className="font-bold text-lg mb-5 flex items-center gap-2"><Crown size={18} className="text-olive-400" /> Add New Winner</h2>
            <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Select Participant (optional)</label>
                <select value={form.participant_id} onChange={e => handleParticipantSelect(e.target.value)}
                  className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-olive-500">
                  <option value="">-- Select participant --</option>
                  {participants.map(p => <option key={p.id} value={p.id}>{p.full_name} ({p.roll_number})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Award Title *</label>
                <select value={form.award_title} onChange={e => setForm(f => ({ ...f, award_title: e.target.value }))}
                  className="w-full bg-[#222923] border border-[#303a32] rounded-xl px-4 py-3 text-white focus:outline-none focus:border-olive-500">
                  <option value="">-- Select award --</option>
                  {AWARDS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                {form.award_title === 'Custom...' && (
                  <input value={customAward} onChange={e => setCustomAward(e.target.value)}
                    placeholder="Enter custom award name" className="mt-2 w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500" />
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Winner's full name"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Roll No</label>
                <input value={form.roll_no} onChange={e => setForm(f => ({ ...f, roll_no: e.target.value }))}
                  placeholder="e.g., 24-CS-01"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Branch</label>
                <input value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                  placeholder="e.g., CSE"
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Photo URL</label>
                <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-gray-400 mb-1.5">Description</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Why they won this award..." rows={2}
                  className="w-full bg-[#191e1b]/90 border border-[#303a32] rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-olive-500 resize-none" />
              </div>
              {error && <p className="md:col-span-2 text-red-400 text-sm">{error}</p>}
              <div className="md:col-span-2">
                <button type="submit" disabled={submitting}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-olive-500 to-olive-400 text-black font-bold hover:opacity-90 transition-opacity disabled:opacity-50">
                  {submitting ? 'Adding...' : 'Add to Hall of Fame'}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {loading ? <LoadingSpinner text="Loading winners..." /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {winners.map(w => (
              <motion.div key={w.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-[#191e1b]/90 border border-[#303a32] rounded-2xl p-5 relative group">
                <button onClick={() => handleDelete(w.id)} disabled={deleting === w.id}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20">
                  {deleting === w.id ? '...' : <Trash2 size={14} />}
                </button>
                <div className="flex items-center gap-3 mb-3">
                  {w.image_url ? (
                    <img src={w.image_url} alt={w.name} className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#3b82f6] to-[#718044] flex items-center justify-center font-bold">
                      {w.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="font-bold text-white">{w.name}</h3>
                    <p className="text-gray-500 text-xs">{w.roll_no} &bull; {w.branch}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={14} className="text-olive-400" />
                  <span className="text-olive-300 text-sm font-semibold">{w.award_title}</span>
                </div>
                {w.description && <p className="text-gray-400 text-xs leading-relaxed">{w.description}</p>}
              </motion.div>
            ))}
            {winners.length === 0 && (
              <div className="col-span-full text-center py-16">
                <Trophy size={40} className="mx-auto text-gray-700 mb-3" />
                <p className="text-gray-500">No winners added yet.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

