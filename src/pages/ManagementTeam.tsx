import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ShieldCheck, Users } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import { readJsonSafe } from '../lib/http';

interface TeamMember {
  id: number;
  name: string;
  branch: string;
  year: string;
  roles: string[];
  fields: string;
  profile_image: string;
  whatsapp_number: string;
}

function whatsappLink(phone: string) {
  return `https://wa.me/91${phone}`;
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'TM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function ManagementTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch('/api/management-team');
        const data = await readJsonSafe<TeamMember[]>(res);
        setMembers(Array.isArray(data) ? data : []);
      } catch {
        setMembers([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMembers();
  }, []);

  return (
    <div className="min-h-screen text-slate-900 pt-24 pb-20">
      <div className="max-w-7xl mx-auto px-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <span className="liquid-glass-pill inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sky-800 text-xs font-semibold tracking-wider uppercase mb-4">
            <ShieldCheck size={14} className="text-sky-600" /> Ignite 2.O Operations
          </span>
          <h1 className="text-4xl sm:text-5xl font-black mb-3 bg-gradient-to-r from-slate-900 via-sky-700 to-violet-700 bg-clip-text text-transparent">
            Management and Coordination Team
          </h1>
          <p className="text-slate-600">Connect with the right team member for your query in one click.</p>
        </motion.div>

        {loading ? (
          <LoadingSpinner text="Loading team members..." />
        ) : members.length === 0 ? (
          <div className="liquid-glass-card rounded-3xl max-w-md mx-auto text-center py-14 px-8">
            <div className="liquid-icon-bubble w-16 h-16 mx-auto mb-4 text-sky-600">
              <Users size={30} />
            </div>
            <p className="text-slate-600">Team details will be announced soon.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {members.map((member, index) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="liquid-glass-card rounded-3xl p-6 hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-3.5 mb-5">
                    <div className="w-13 h-13 rounded-full overflow-hidden bg-gradient-to-br from-cyan-500 via-blue-600 to-violet-600 text-white font-bold flex items-center justify-center ring-2 ring-white shadow-md shrink-0">
                      {member.profile_image ? (
                        <img src={member.profile_image} alt={member.name} className="w-full h-full object-cover" />
                      ) : (
                        getInitials(member.name)
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-slate-900 truncate">{member.name}</h2>
                      <p className="text-xs text-sky-700 font-medium truncate">
                        {member.branch} | {member.year}
                      </p>
                    </div>
                  </div>

                  <div className="mb-4">
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.12em] mb-2">Roles</p>
                    <div className="flex flex-wrap gap-2">
                      {(member.roles.length ? member.roles : ['Unassigned']).map(role => (
                        <span key={role} className="liquid-glass-pill px-3 py-1 rounded-full text-xs text-sky-800 font-medium">
                          {role}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-[11px] text-slate-500 uppercase tracking-[0.12em] mb-1.5">Fields</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{member.fields || 'Not specified'}</p>
                  </div>
                </div>

                <a
                  href={whatsappLink(member.whatsapp_number)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/12 border border-emerald-500/35 backdrop-blur-md text-emerald-700 hover:bg-emerald-500/20 hover:border-emerald-500/55 shadow-sm transition-all font-semibold text-sm"
                >
                  <MessageCircle size={16} /> Open WhatsApp Chat
                </a>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

